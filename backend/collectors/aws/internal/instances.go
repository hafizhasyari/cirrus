package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"cirrus/collectorkit"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	smithy "github.com/aws/smithy-go"
	"golang.org/x/sync/errgroup"
)

// defaultBootstrapRegion is only used to resolve the initial client used for
// DescribeRegions — IAM/STS calls aren't region-scoped, this just needs to be
// a valid region to construct an SDK client with.
const defaultBootstrapRegion = "us-east-1"

type connectionConfig struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
}

// buildAWSConfig builds an aws.Config directly from the connection's own
// static IAM user credentials — no hub identity, no role assumption. Built
// fresh per request, mirroring the OCI collector's buildConfigProvider.
func buildAWSConfig(ctx context.Context, cc connectionConfig) (aws.Config, error) {
	provider := credentials.NewStaticCredentialsProvider(cc.AccessKeyID, cc.SecretAccessKey, "")
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithCredentialsProvider(provider),
		config.WithRegion(defaultBootstrapRegion),
	)
	if err != nil {
		return aws.Config{}, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	return cfg, nil
}

// FetchInstances resolves a connection's accessKeyId/secretAccessKey and
// returns a real EC2 inventory across every enabled region (or a classified
// error — ErrAuthFailed / ErrUpstream, see errors.go).
func FetchInstances(ctx context.Context, raw json.RawMessage) ([]collectorkit.Instance, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.AccessKeyID == "" || cc.SecretAccessKey == "" {
		return nil, fmt.Errorf("%w: missing/invalid accessKeyId/secretAccessKey in connection config", ErrAuthFailed)
	}

	base, err := buildAWSConfig(ctx, cc)
	if err != nil {
		return nil, err
	}
	ec2Base := ec2.NewFromConfig(base)

	// Kicked off now, joined at the very end — Lightsail's own region
	// discovery + fan-out runs the entire time the EC2 sweep below runs, so
	// it doesn't add to the wall-clock budget on top of EC2's.
	lightsailCh := make(chan []collectorkit.Instance, 1)
	go func() {
		lightsailCh <- fetchLightsailInstances(ctx, base)
	}()

	// DescribeRegions doubles as the earliest possible credential-rejection
	// signal — matches RBAC's own advertised AWS test-connection checklist.
	regionsOut, err := ec2Base.DescribeRegions(ctx, &ec2.DescribeRegionsInput{})
	if err != nil {
		return nil, classifyAWSErr(err)
	}

	var regions []string
	for _, r := range regionsOut.Regions {
		if r.RegionName != nil {
			regions = append(regions, *r.RegionName)
		}
	}

	var mu sync.Mutex
	var allInstances []ec2types.Instance
	disksByInstance := make(map[string][]collectorkit.Disk)

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(16)
	for _, region := range regions {
		region := region
		g.Go(func() error {
			// Bound each region to its own sub-budget so one slow/unreachable
			// region can't burn the entire shared fetch deadline for every
			// other region — skip it gracefully instead of failing the whole
			// fetch.
			regionCtx, cancel := context.WithTimeout(gctx, 20*time.Second)
			defer cancel()

			regionalCfg := base.Copy()
			regionalCfg.Region = region
			client := ec2.NewFromConfig(regionalCfg)

			instances, err := describeAllInstances(regionCtx, client)
			if err != nil {
				if errors.Is(regionCtx.Err(), context.DeadlineExceeded) {
					log.Printf("aws collector: region %s timed out, skipping", region)
					return nil
				}
				return err
			}
			if len(instances) == 0 {
				return nil
			}

			// A timed-out volumes lookup only costs disk info for this region —
			// the instances themselves were already found and must not be
			// dropped just because their disk sizes couldn't be fetched in time.
			disks, err := describeVolumesByInstance(regionCtx, client, instanceIDs(instances))
			if err != nil {
				if errors.Is(regionCtx.Err(), context.DeadlineExceeded) {
					log.Printf("aws collector: region %s timed out fetching volumes, keeping instances without disk info", region)
					disks = nil
				} else {
					return err
				}
			}

			mu.Lock()
			allInstances = append(allInstances, instances...)
			for id, d := range disks {
				disksByInstance[id] = d
			}
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, classifyAWSErr(err)
	}

	memByType, err := lookupMemoryByType(ctx, ec2Base, uniqueTypes(allInstances))
	if err != nil {
		return nil, classifyAWSErr(err)
	}

	result := make([]collectorkit.Instance, 0, len(allInstances))
	for _, inst := range allInstances {
		region := ""
		if inst.Placement != nil && inst.Placement.AvailabilityZone != nil && len(*inst.Placement.AvailabilityZone) > 1 {
			az := *inst.Placement.AvailabilityZone
			region = az[:len(az)-1]
		}
		id := ""
		if inst.InstanceId != nil {
			id = *inst.InstanceId
		}
		result = append(result, mapInstance(inst, region, memByType, disksByInstance[id]))
	}

	result = append(result, <-lightsailCh...)

	return result, nil
}

func describeAllInstances(ctx context.Context, client *ec2.Client) ([]ec2types.Instance, error) {
	var out []ec2types.Instance
	paginator := ec2.NewDescribeInstancesPaginator(client, &ec2.DescribeInstancesInput{})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, res := range page.Reservations {
			out = append(out, res.Instances...)
		}
	}
	return out, nil
}

func describeVolumesByInstance(ctx context.Context, client *ec2.Client, ids []string) (map[string][]collectorkit.Disk, error) {
	result := make(map[string][]collectorkit.Disk)
	if len(ids) == 0 {
		return result, nil
	}

	sizesByInstance := make(map[string][]int32)
	paginator := ec2.NewDescribeVolumesPaginator(client, &ec2.DescribeVolumesInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("attachment.instance-id"), Values: ids},
		},
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, v := range page.Volumes {
			size := int32(0)
			if v.Size != nil {
				size = *v.Size
			}
			for _, att := range v.Attachments {
				if att.InstanceId == nil {
					continue
				}
				sizesByInstance[*att.InstanceId] = append(sizesByInstance[*att.InstanceId], size)
			}
		}
	}

	for id, sizes := range sizesByInstance {
		disks := make([]collectorkit.Disk, 0, len(sizes))
		for i, size := range sizes {
			disks = append(disks, collectorkit.Disk{Label: volumeLabel(i), SizeGB: int(size)})
		}
		result[id] = disks
	}
	return result, nil
}

func lookupMemoryByType(ctx context.Context, client *ec2.Client, types []string) (map[string]int32, error) {
	result := make(map[string]int32)
	if len(types) == 0 {
		return result, nil
	}

	ec2Types := make([]ec2types.InstanceType, len(types))
	for i, t := range types {
		ec2Types[i] = ec2types.InstanceType(t)
	}

	paginator := ec2.NewDescribeInstanceTypesPaginator(client, &ec2.DescribeInstanceTypesInput{
		InstanceTypes: ec2Types,
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, it := range page.InstanceTypes {
			if it.MemoryInfo == nil || it.MemoryInfo.SizeInMiB == nil {
				continue
			}
			result[string(it.InstanceType)] = int32(*it.MemoryInfo.SizeInMiB)
		}
	}
	return result, nil
}

func uniqueTypes(instances []ec2types.Instance) []string {
	seen := map[string]bool{}
	var out []string
	for _, inst := range instances {
		t := string(inst.InstanceType)
		if t != "" && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out
}

func instanceIDs(instances []ec2types.Instance) []string {
	var ids []string
	for _, inst := range instances {
		if inst.InstanceId != nil {
			ids = append(ids, *inst.InstanceId)
		}
	}
	return ids
}

// classifyAWSErr distinguishes credential/permission failures (AUTH_FAILED)
// from everything else (UPSTREAM_ERROR) using the AWS API's own error codes —
// InvalidClientTokenId/SignatureDoesNotMatch/UnrecognizedClientException for
// a rejected access key, AccessDenied/UnauthorizedOperation/AuthFailure for a
// valid key whose IAM user lacks the required read-only permissions.
func classifyAWSErr(err error) error {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "InvalidClientTokenId", "SignatureDoesNotMatch", "UnrecognizedClientException",
			"AccessDenied", "AccessDeniedException", "UnauthorizedOperation", "AuthFailure":
			return fmt.Errorf("%w: %v", ErrAuthFailed, err)
		}
	}
	return fmt.Errorf("%w: %v", ErrUpstream, err)
}
