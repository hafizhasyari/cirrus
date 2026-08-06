package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"cirrus/collectorkit"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	smithy "github.com/aws/smithy-go"
	"golang.org/x/sync/errgroup"
)

type connectionConfig struct {
	RoleArn    string `json:"roleArn"`
	ExternalID string `json:"externalId"`
}

// assumeConnectionRole assumes the connection's roleArn via Cirrus's own hub
// credential, returning an aws.Config whose Credentials resolve to that
// assumed role — shared by the full inventory fetch and the lightweight
// connection-test path so the AssumeRole logic itself lives in one place.
func assumeConnectionRole(ctx context.Context, cc connectionConfig) (aws.Config, error) {
	base, err := hubAWSConfig(ctx)
	if err != nil {
		return aws.Config{}, fmt.Errorf("%w: hub credentials: %v", ErrUpstream, err)
	}

	stsClient := sts.NewFromConfig(base)
	provider := stscreds.NewAssumeRoleProvider(stsClient, cc.RoleArn, func(o *stscreds.AssumeRoleOptions) {
		o.RoleSessionName = "cirrus-collector"
		if cc.ExternalID != "" {
			o.ExternalID = aws.String(cc.ExternalID)
		}
	})

	assumed := base.Copy()
	assumed.Credentials = aws.NewCredentialsCache(provider)
	return assumed, nil
}

// FetchInstances resolves a connection's roleArn/externalId, assumes the
// role via Cirrus's own hub credential, and returns a real EC2 inventory
// across every enabled region (or a classified error — ErrAuthFailed /
// ErrUpstream, see errors.go).
func FetchInstances(ctx context.Context, raw json.RawMessage) ([]collectorkit.Instance, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.RoleArn == "" {
		return nil, fmt.Errorf("%w: missing/invalid roleArn in connection config", ErrAuthFailed)
	}

	assumed, err := assumeConnectionRole(ctx, cc)
	if err != nil {
		return nil, err
	}
	ec2Base := ec2.NewFromConfig(assumed)

	// DescribeRegions doubles as the earliest possible AssumeRole failure
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
	g.SetLimit(8)
	for _, region := range regions {
		region := region
		g.Go(func() error {
			regionalCfg := assumed.Copy()
			regionalCfg.Region = region
			client := ec2.NewFromConfig(regionalCfg)

			instances, err := describeAllInstances(gctx, client)
			if err != nil {
				return err
			}
			if len(instances) == 0 {
				return nil
			}

			disks, err := describeVolumesByInstance(gctx, client, instanceIDs(instances))
			if err != nil {
				return err
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

// classifyAWSErr distinguishes access/trust-policy failures (AUTH_FAILED)
// from everything else (UPSTREAM_ERROR) using the AWS API's own error codes.
func classifyAWSErr(err error) error {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "AccessDenied", "AccessDeniedException", "UnauthorizedOperation", "AuthFailure":
			return fmt.Errorf("%w: %v", ErrAuthFailed, err)
		}
	}
	return fmt.Errorf("%w: %v", ErrUpstream, err)
}
