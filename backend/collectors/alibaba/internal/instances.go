package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"

	"cirrus/collectorkit"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	ecs20140526 "github.com/alibabacloud-go/ecs-20140526/v7/client"
	"github.com/alibabacloud-go/tea/tea"
	"github.com/aliyun/credentials-go/credentials"
	"golang.org/x/sync/errgroup"
)

// defaultBootstrapRegion is only used to resolve the initial client used for
// DescribeRegions — that call isn't truly region-scoped, this just needs to
// be a valid region to construct an SDK client with (mirrors the AWS
// collector's own defaultBootstrapRegion).
const defaultBootstrapRegion = "cn-hangzhou"

// regionFetchTimeoutMs bounds each region's DescribeInstances calls. Alibaba's
// tea-generated SDK methods don't accept a Go context at all, so a
// context.WithTimeout around a call has no effect on the underlying HTTP
// request — the only real way to bound one is the SDK's own ReadTimeout/
// ConnectTimeout config fields (milliseconds), set per-client in
// newECSClient. Kept smaller than AWS's 20s per-region budget since Alibaba
// only makes one paginated DescribeInstances call per region, no extra
// DescribeVolumes/DescribeInstanceTypes round-trips.
const regionFetchTimeoutMs = 15000

type connectionConfig struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
}

// buildAlibabaCredential builds a static RAM User AccessKey/Secret credential
// straight from the connection's own config — no hub identity, no role
// assumption, built fresh per request, mirroring the AWS collector's
// buildAWSConfig pattern — shared by the full inventory fetch and the
// lightweight connection-test path.
func buildAlibabaCredential(cc connectionConfig) (credentials.Credential, error) {
	credCfg := new(credentials.Config).
		SetType("access_key").
		SetAccessKeyId(cc.AccessKeyID).
		SetAccessKeySecret(cc.SecretAccessKey)
	cred, err := credentials.NewCredential(credCfg)
	if err != nil {
		return nil, fmt.Errorf("%w: building credential: %v", ErrAuthFailed, err)
	}
	return cred, nil
}

// newECSClient builds an ECS client scoped to a single region's endpoint,
// with a read/connect timeout so one slow/unreachable region can't hang
// indefinitely (see regionFetchTimeoutMs).
func newECSClient(cred credentials.Credential, region string) (*ecs20140526.Client, error) {
	client, err := ecs20140526.NewClient(&openapi.Config{
		Credential:     cred,
		RegionId:       tea.String(region),
		Endpoint:       tea.String(fmt.Sprintf("ecs.%s.aliyuncs.com", region)),
		ReadTimeout:    tea.Int(regionFetchTimeoutMs),
		ConnectTimeout: tea.Int(regionFetchTimeoutMs),
	})
	if err != nil {
		return nil, fmt.Errorf("%w: building ECS client: %v", ErrUpstream, err)
	}
	return client, nil
}

// describeAllInstances pages through DescribeInstances for one region,
// returning the raw error unclassified so the caller can tell a timeout
// (skip this region gracefully) apart from a real failure (classify and
// propagate) — see the timeout check in FetchInstances below.
func describeAllInstances(client *ecs20140526.Client, region string) ([]*ecs20140526.DescribeInstancesResponseBodyInstancesInstance, error) {
	var all []*ecs20140526.DescribeInstancesResponseBodyInstancesInstance
	for page := int32(1); ; page++ {
		resp, err := client.DescribeInstances(&ecs20140526.DescribeInstancesRequest{
			RegionId:   tea.String(region),
			PageSize:   tea.Int32(100),
			PageNumber: tea.Int32(page),
		})
		if err != nil {
			return nil, err
		}
		if resp.Body == nil || resp.Body.Instances == nil {
			break
		}
		insts := resp.Body.Instances.Instance
		all = append(all, insts...)
		if len(insts) < 100 {
			break
		}
	}
	return all, nil
}

// describeAllDisks pages through DescribeDisks for one region, region-wide
// (no per-instance filter) — each returned disk carries its own InstanceId,
// joined back to instances by the caller, mirroring how describeAllInstances
// itself is grouped by region.
func describeAllDisks(client *ecs20140526.Client, region string) ([]*ecs20140526.DescribeDisksResponseBodyDisksDisk, error) {
	var all []*ecs20140526.DescribeDisksResponseBodyDisksDisk
	for page := int32(1); ; page++ {
		resp, err := client.DescribeDisks(&ecs20140526.DescribeDisksRequest{
			RegionId:   tea.String(region),
			PageSize:   tea.Int32(100),
			PageNumber: tea.Int32(page),
		})
		if err != nil {
			return nil, err
		}
		if resp.Body == nil || resp.Body.Disks == nil {
			break
		}
		disks := resp.Body.Disks.Disk
		all = append(all, disks...)
		if len(disks) < 100 {
			break
		}
	}
	return all, nil
}

// FetchInstances resolves a connection's own static AccessKey/Secret,
// discovers every region the account can access, and returns a real ECS
// inventory across every enabled region (or a classified error —
// ErrAuthFailed / ErrUpstream, see errors.go).
func FetchInstances(ctx context.Context, raw json.RawMessage) ([]collectorkit.Instance, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.AccessKeyID == "" || cc.SecretAccessKey == "" {
		return nil, fmt.Errorf("%w: missing/invalid accessKeyId or secretAccessKey in connection config", ErrAuthFailed)
	}

	cred, err := buildAlibabaCredential(cc)
	if err != nil {
		return nil, err
	}

	bootstrapClient, err := newECSClient(cred, defaultBootstrapRegion)
	if err != nil {
		return nil, err
	}

	// DescribeRegions doubles as the earliest possible credential-rejection
	// signal — mirrors the AWS collector's own DescribeRegions bootstrap call.
	regionsResp, err := bootstrapClient.DescribeRegions(&ecs20140526.DescribeRegionsRequest{})
	if err != nil {
		return nil, classifyAlibabaErr(err)
	}

	var regions []string
	if regionsResp.Body != nil && regionsResp.Body.Regions != nil {
		for _, r := range regionsResp.Body.Regions.Region {
			if r.RegionId != nil {
				regions = append(regions, *r.RegionId)
			}
		}
	}

	var mu sync.Mutex
	var all []*ecs20140526.DescribeInstancesResponseBodyInstancesInstance
	regionByInstance := make(map[string]string)
	disksByInstance := make(map[string][]collectorkit.Disk)

	var g errgroup.Group
	for _, region := range regions {
		region := region
		g.Go(func() error {
			client, err := newECSClient(cred, region)
			if err != nil {
				return err
			}

			insts, err := describeAllInstances(client, region)
			if err != nil {
				var netErr net.Error
				if errors.As(err, &netErr) && netErr.Timeout() {
					log.Printf("alibaba collector: region %s timed out, skipping", region)
					return nil
				}
				return classifyAlibabaErr(err)
			}

			// A DescribeDisks failure — timeout or anything else — only
			// costs disk info for this region; the instances themselves
			// were already found and must not be dropped. This differs
			// from describeAllInstances' own error handling just above
			// (which still fails the whole fetch on a non-timeout error)
			// because DescribeDisks is a brand-new call this pass adds: an
			// existing connection's RAM policy predates it, so a fresh
			// AccessDenied here is the expected first-contact experience
			// for every existing connection until its policy is updated,
			// not a signal worth failing the whole region over.
			disks, err := describeAllDisks(client, region)
			if err != nil {
				log.Printf("alibaba collector: region %s disk lookup failed, keeping instances without disk info: %v", region, err)
				disks = nil
			}
			byInstance := groupDisksByInstance(disks)

			mu.Lock()
			for _, inst := range insts {
				if inst.InstanceId != nil {
					regionByInstance[*inst.InstanceId] = region
				}
			}
			all = append(all, insts...)
			for id, d := range byInstance {
				disksByInstance[id] = d
			}
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}

	result := make([]collectorkit.Instance, 0, len(all))
	for _, inst := range all {
		region := ""
		id := ""
		if inst.InstanceId != nil {
			id = *inst.InstanceId
			region = regionByInstance[id]
		}
		result = append(result, mapInstance(inst, region, disksByInstance[id]))
	}
	return result, nil
}

// classifyAlibabaErr distinguishes credential/permission failures (AUTH_FAILED)
// from everything else (UPSTREAM_ERROR). Alibaba's tea-generated clients
// surface API errors as *tea.SDKError with a Code string — InvalidAccessKeyId
// covers an unknown Access Key ID, SignatureDoesNotMatch a wrong secret for a
// valid ID (mirrors AWS's classifyAWSErr code list for the same static-key
// failure modes).
func classifyAlibabaErr(err error) error {
	if sdkErr, ok := err.(*tea.SDKError); ok && sdkErr.Code != nil {
		code := *sdkErr.Code
		if strings.Contains(code, "Forbidden") || strings.Contains(code, "Unauthorized") ||
			strings.Contains(code, "InvalidAccessKeyId") || code == "AccessDenied" || code == "SignatureDoesNotMatch" {
			return fmt.Errorf("%w: %v", ErrAuthFailed, err)
		}
	}
	return fmt.Errorf("%w: %v", ErrUpstream, err)
}
