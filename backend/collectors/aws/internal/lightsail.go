package internal

import (
	"context"
	"log"
	"sync"
	"time"

	"cirrus/collectorkit"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/lightsail"
	lightsailtypes "github.com/aws/aws-sdk-go-v2/service/lightsail/types"
	"golang.org/x/sync/errgroup"
)

// lightsailRegionTimeout bounds each region's GetInstances call — lighter
// than EC2's per-region budget since Lightsail's own response already
// embeds hardware/disk info, no separate volumes lookup needed.
const lightsailRegionTimeout = 15 * time.Second

// fetchLightsailInstances discovers every region Lightsail is actually
// offered in (a strict subset of EC2's regions, so the EC2 region list
// can't be reused) and fans out GetInstances across them. Any failure here —
// most commonly a missing lightsail:* permission, since the setup guide's
// default AmazonEC2ReadOnlyAccess policy doesn't grant one — is logged and
// treated as "nothing to add" rather than a fetch failure, so an EC2-only
// connection keeps working exactly as it did before Lightsail support
// existed.
func fetchLightsailInstances(ctx context.Context, base aws.Config) []collectorkit.Instance {
	client := lightsail.NewFromConfig(base)

	regionsOut, err := client.GetRegions(ctx, &lightsail.GetRegionsInput{})
	if err != nil {
		log.Printf("aws collector: lightsail GetRegions failed (likely missing lightsail:* permission), skipping Lightsail: %v", err)
		return nil
	}

	var mu sync.Mutex
	var result []collectorkit.Instance

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(16)
	for _, r := range regionsOut.Regions {
		region := string(r.Name)
		if region == "" {
			continue
		}
		g.Go(func() error {
			regionCtx, cancel := context.WithTimeout(gctx, lightsailRegionTimeout)
			defer cancel()

			regionalCfg := base.Copy()
			regionalCfg.Region = region
			instances, err := describeAllLightsailInstances(regionCtx, lightsail.NewFromConfig(regionalCfg))
			if err != nil {
				log.Printf("aws collector: lightsail region %s failed, skipping: %v", region, err)
				return nil
			}

			mapped := make([]collectorkit.Instance, 0, len(instances))
			for _, inst := range instances {
				mapped = append(mapped, mapLightsailInstance(inst, region))
			}

			mu.Lock()
			result = append(result, mapped...)
			mu.Unlock()
			return nil
		})
	}
	// Every closure above already logs and swallows its own error, so
	// g.Wait() never actually returns non-nil — it just waits for all
	// regions to finish.
	_ = g.Wait()

	return result
}

// describeAllLightsailInstances hand-rolls pagination via PageToken —
// unlike EC2, the generated SDK doesn't ship a GetInstances paginator.
func describeAllLightsailInstances(ctx context.Context, client *lightsail.Client) ([]lightsailtypes.Instance, error) {
	var out []lightsailtypes.Instance
	var pageToken *string
	for {
		page, err := client.GetInstances(ctx, &lightsail.GetInstancesInput{PageToken: pageToken})
		if err != nil {
			return nil, err
		}
		out = append(out, page.Instances...)
		if page.NextPageToken == nil {
			break
		}
		pageToken = page.NextPageToken
	}
	return out, nil
}
