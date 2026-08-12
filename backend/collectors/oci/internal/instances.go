package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"cirrus/collectorkit"

	"github.com/oracle/oci-go-sdk/v65/common"
	"github.com/oracle/oci-go-sdk/v65/core"
	"github.com/oracle/oci-go-sdk/v65/identity"
	"golang.org/x/sync/errgroup"
)

// GenerateInstances resolves a connection's OCI signing key config, builds
// the API clients, discovers every region the tenancy is subscribed to, and
// fans out the per-compartment inventory pipeline across each of them —
// returning a real Core Compute inventory (or a classified error —
// ErrAuthFailed / ErrUpstream).
func GenerateInstances(ctx context.Context, raw json.RawMessage) ([]collectorkit.Instance, error) {
	var cfg ociConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("%w: invalid OCI connection config", ErrAuthFailed)
	}

	provider, err := buildConfigProvider(cfg)
	if err != nil {
		return nil, err
	}

	identityClient, err := identity.NewIdentityClientWithConfigurationProvider(provider)
	if err != nil {
		return nil, fmt.Errorf("%w: building identity client: %v", ErrUpstream, err)
	}

	regions, err := discoverRegions(ctx, identityClient, cfg.TenancyOCID)
	if err != nil {
		return nil, err
	}

	compartments, err := listScanCompartments(ctx, identityClient, cfg.TenancyOCID)
	if err != nil {
		return nil, err
	}

	var mu sync.Mutex
	var allInstances []core.Instance
	disksByInstance := make(map[string][]collectorkit.Disk)
	specs := make(map[string]shapeSpec)
	privateIPs := make(map[string]string)
	publicIPs := make(map[string]*string)

	rg, rgctx := errgroup.WithContext(ctx)
	rg.SetLimit(4)
	for _, region := range regions {
		region := region
		rg.Go(func() error {
			res, err := fetchRegionInstances(rgctx, provider, compartments, region)
			if err != nil {
				log.Printf("oci collector: region %s failed, skipping: %v", region, err)
				return nil
			}

			mu.Lock()
			allInstances = append(allInstances, res.instances...)
			for id, d := range res.disks {
				disksByInstance[id] = d
			}
			for k, s := range res.specs {
				specs[k] = s
			}
			for id, ip := range res.privateIPs {
				privateIPs[id] = ip
			}
			for id, ip := range res.publicIPs {
				publicIPs[id] = ip
			}
			mu.Unlock()
			return nil
		})
	}
	if err := rg.Wait(); err != nil {
		return nil, err
	}

	result := make([]collectorkit.Instance, 0, len(allInstances))
	for _, inst := range allInstances {
		id := ""
		if inst.Id != nil {
			id = *inst.Id
		}
		spec, ok := specFromShapeConfig(inst.ShapeConfig)
		if !ok {
			spec = specs[shapeKey(inst)]
		}
		result = append(result, mapInstance(inst, spec, disksByInstance[id], privateIPs[id], publicIPs[id]))
	}
	return result, nil
}

// regionFetchResult holds one region's contribution to the tenancy-wide
// inventory, merged by the caller into the shared maps.
type regionFetchResult struct {
	instances  []core.Instance
	disks      map[string][]collectorkit.Disk
	specs      map[string]shapeSpec
	privateIPs map[string]string
	publicIPs  map[string]*string
}

// fetchRegionInstances builds fresh, region-scoped Compute/Blockstorage/VNIC
// clients from the shared provider — SetRegion mutates a client's Host in
// place, so each region needs its own client rather than sharing one across
// concurrent goroutines — and runs the per-compartment pipeline against
// them. Instances, disks, shapes, and VNICs/IPs are all region-scoped OCI
// resources, so all of it has to run per-region, not once globally.
func fetchRegionInstances(ctx context.Context, provider common.ConfigurationProvider, compartments []string, region string) (regionFetchResult, error) {
	computeClient, err := core.NewComputeClientWithConfigurationProvider(provider)
	if err != nil {
		return regionFetchResult{}, fmt.Errorf("%w: building compute client: %v", ErrUpstream, err)
	}
	computeClient.SetRegion(region)
	blockstorageClient, err := core.NewBlockstorageClientWithConfigurationProvider(provider)
	if err != nil {
		return regionFetchResult{}, fmt.Errorf("%w: building block storage client: %v", ErrUpstream, err)
	}
	blockstorageClient.SetRegion(region)
	vcnClient, err := core.NewVirtualNetworkClientWithConfigurationProvider(provider)
	if err != nil {
		return regionFetchResult{}, fmt.Errorf("%w: building virtual network client: %v", ErrUpstream, err)
	}
	vcnClient.SetRegion(region)

	var mu sync.Mutex
	var instances []core.Instance
	disksByInstance := make(map[string][]collectorkit.Disk)

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(8)
	for _, compartmentID := range compartments {
		compartmentID := compartmentID
		g.Go(func() error {
			compInstances, err := listCompartmentInstances(gctx, computeClient, compartmentID)
			if err != nil {
				return err
			}
			if len(compInstances) == 0 {
				return nil
			}

			disks, err := listCompartmentDisks(gctx, blockstorageClient, computeClient, compartmentID, compInstances)
			if err != nil {
				log.Printf("oci collector: region %s compartment %s disk lookup failed, keeping instances without disk info: %v", region, compartmentID, err)
				disks = nil
			}

			mu.Lock()
			instances = append(instances, compInstances...)
			for id, d := range disks {
				disksByInstance[id] = d
			}
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return regionFetchResult{}, err
	}
	if len(instances) == 0 {
		return regionFetchResult{}, nil
	}

	specs, err := lookupShapeSpecs(ctx, computeClient, instances)
	if err != nil {
		log.Printf("oci collector: region %s shape lookup failed, keeping instances without full specs: %v", region, err)
		specs = nil
	}

	privateIPs, publicIPs, err := lookupInstanceIPs(ctx, computeClient, vcnClient, instances)
	if err != nil {
		log.Printf("oci collector: region %s IP lookup failed, keeping instances without IPs: %v", region, err)
		privateIPs, publicIPs = nil, nil
	}

	return regionFetchResult{
		instances:  instances,
		disks:      disksByInstance,
		specs:      specs,
		privateIPs: privateIPs,
		publicIPs:  publicIPs,
	}, nil
}

// discoverRegions returns every region the tenancy actually subscribes to
// (READY only — IN_PROGRESS subscriptions aren't queryable yet), the
// tenant-scoped equivalent of AWS's DescribeRegions/Alibaba's
// ecs:DescribeRegions. Unlike identity.ListRegions (OCI's entire global
// region catalog, subscribed or not), this reflects what this tenancy can
// actually reach — and works from any region in the tenancy's realm, not
// just its home region, so the connection's own Region field only ever
// needs to be a valid bootstrap seed.
func discoverRegions(ctx context.Context, client identity.IdentityClient, tenancyOCID string) ([]string, error) {
	resp, err := client.ListRegionSubscriptions(ctx, identity.ListRegionSubscriptionsRequest{
		TenancyId: common.String(tenancyOCID),
	})
	if err != nil {
		return nil, classifyOCIErr(err)
	}
	var regions []string
	for _, sub := range resp.Items {
		if sub.Status != identity.RegionSubscriptionStatusReady || sub.RegionName == nil {
			continue
		}
		regions = append(regions, *sub.RegionName)
	}
	return regions, nil
}

func listCompartmentInstances(ctx context.Context, client core.ComputeClient, compartmentID string) ([]core.Instance, error) {
	var out []core.Instance
	var page *string
	for {
		resp, err := client.ListInstances(ctx, core.ListInstancesRequest{
			CompartmentId: common.String(compartmentID),
			Page:          page,
		})
		if err != nil {
			return nil, classifyOCIErr(err)
		}
		out = append(out, resp.Items...)
		if resp.OpcNextPage == nil {
			break
		}
		page = resp.OpcNextPage
	}
	return out, nil
}

// listCompartmentDisks resolves real disk sizes for every instance in a
// compartment via a small number of batched, compartment-wide calls
// (boot + block volume attachments, then the volumes themselves) rather
// than a per-instance lookup.
func listCompartmentDisks(ctx context.Context, bsClient core.BlockstorageClient, computeClient core.ComputeClient, compartmentID string, instances []core.Instance) (map[string][]collectorkit.Disk, error) {
	result := make(map[string][]collectorkit.Disk)

	// ListBootVolumeAttachments/ListVolumeAttachments both mandate
	// availabilityDomain alongside compartmentId — scan once per distinct AD
	// actually present among this compartment's instances rather than every
	// AD in the region.
	var bootAttachments []core.BootVolumeAttachment
	var volAttachments []core.VolumeAttachment
	for _, ad := range distinctADs(instances) {
		bAtt, err := listAllBootVolumeAttachments(ctx, computeClient, compartmentID, ad)
		if err != nil {
			return nil, err
		}
		bootAttachments = append(bootAttachments, bAtt...)

		vAtt, err := listAllVolumeAttachments(ctx, computeClient, compartmentID, ad)
		if err != nil {
			return nil, err
		}
		volAttachments = append(volAttachments, vAtt...)
	}

	bootSizeByID, err := bootVolumeSizes(ctx, bsClient, compartmentID)
	if err != nil {
		return nil, err
	}
	volSizeByID, err := volumeSizes(ctx, bsClient, compartmentID)
	if err != nil {
		return nil, err
	}

	for _, att := range bootAttachments {
		if att.InstanceId == nil || att.BootVolumeId == nil {
			continue
		}
		size := bootSizeByID[*att.BootVolumeId]
		result[*att.InstanceId] = append(result[*att.InstanceId], collectorkit.Disk{Label: "Boot", SizeGB: size})
	}
	dataIndex := map[string]int{}
	for _, att := range volAttachments {
		if att.GetInstanceId() == nil || att.GetVolumeId() == nil {
			continue
		}
		instanceID := *att.GetInstanceId()
		dataIndex[instanceID]++
		size := volSizeByID[*att.GetVolumeId()]
		result[instanceID] = append(result[instanceID], collectorkit.Disk{Label: fmt.Sprintf("Data %d", dataIndex[instanceID]), SizeGB: size})
	}

	return result, nil
}

// distinctADs returns the distinct, non-empty availability domains present
// among the given instances (order not significant).
func distinctADs(instances []core.Instance) []string {
	seen := make(map[string]bool)
	var out []string
	for _, inst := range instances {
		if inst.AvailabilityDomain == nil || *inst.AvailabilityDomain == "" {
			continue
		}
		ad := *inst.AvailabilityDomain
		if seen[ad] {
			continue
		}
		seen[ad] = true
		out = append(out, ad)
	}
	return out
}

func listAllBootVolumeAttachments(ctx context.Context, client core.ComputeClient, compartmentID string, availabilityDomain string) ([]core.BootVolumeAttachment, error) {
	var out []core.BootVolumeAttachment
	var page *string
	for {
		resp, err := client.ListBootVolumeAttachments(ctx, core.ListBootVolumeAttachmentsRequest{
			CompartmentId:      common.String(compartmentID),
			AvailabilityDomain: common.String(availabilityDomain),
			Page:               page,
		})
		if err != nil {
			return nil, classifyOCIErr(err)
		}
		out = append(out, resp.Items...)
		if resp.OpcNextPage == nil {
			break
		}
		page = resp.OpcNextPage
	}
	return out, nil
}

func listAllVolumeAttachments(ctx context.Context, client core.ComputeClient, compartmentID string, availabilityDomain string) ([]core.VolumeAttachment, error) {
	var out []core.VolumeAttachment
	var page *string
	for {
		resp, err := client.ListVolumeAttachments(ctx, core.ListVolumeAttachmentsRequest{
			CompartmentId:      common.String(compartmentID),
			AvailabilityDomain: common.String(availabilityDomain),
			Page:               page,
		})
		if err != nil {
			return nil, classifyOCIErr(err)
		}
		out = append(out, resp.Items...)
		if resp.OpcNextPage == nil {
			break
		}
		page = resp.OpcNextPage
	}
	return out, nil
}

func bootVolumeSizes(ctx context.Context, client core.BlockstorageClient, compartmentID string) (map[string]int, error) {
	result := make(map[string]int)
	var page *string
	for {
		resp, err := client.ListBootVolumes(ctx, core.ListBootVolumesRequest{
			CompartmentId: common.String(compartmentID),
			Page:          page,
		})
		if err != nil {
			return nil, classifyOCIErr(err)
		}
		for _, v := range resp.Items {
			if v.Id != nil && v.SizeInGBs != nil {
				result[*v.Id] = int(*v.SizeInGBs)
			}
		}
		if resp.OpcNextPage == nil {
			break
		}
		page = resp.OpcNextPage
	}
	return result, nil
}

func volumeSizes(ctx context.Context, client core.BlockstorageClient, compartmentID string) (map[string]int, error) {
	result := make(map[string]int)
	var page *string
	for {
		resp, err := client.ListVolumes(ctx, core.ListVolumesRequest{
			CompartmentId: common.String(compartmentID),
			Page:          page,
		})
		if err != nil {
			return nil, classifyOCIErr(err)
		}
		for _, v := range resp.Items {
			if v.Id != nil && v.SizeInGBs != nil {
				result[*v.Id] = int(*v.SizeInGBs)
			}
		}
		if resp.OpcNextPage == nil {
			break
		}
		page = resp.OpcNextPage
	}
	return result, nil
}

func shapeKey(inst core.Instance) string {
	ad := ""
	if inst.AvailabilityDomain != nil {
		ad = *inst.AvailabilityDomain
	}
	shape := ""
	if inst.Shape != nil {
		shape = *inst.Shape
	}
	return ad + "/" + shape
}

// lookupShapeSpecs resolves CPU/memory for every distinct (availability
// domain, shape) pair seen among instances whose inline ShapeConfig didn't
// populate it (fixed, non-Flex shapes) — live lookup over a static table,
// same precedent as AWS's DescribeInstanceTypes / GCP's machineTypes.get.
func lookupShapeSpecs(ctx context.Context, client core.ComputeClient, instances []core.Instance) (map[string]shapeSpec, error) {
	result := make(map[string]shapeSpec)
	seen := make(map[string]bool)

	for _, inst := range instances {
		if _, ok := specFromShapeConfig(inst.ShapeConfig); ok {
			continue // already resolved inline, no lookup needed
		}
		key := shapeKey(inst)
		if seen[key] || inst.CompartmentId == nil || inst.AvailabilityDomain == nil || inst.Shape == nil {
			continue
		}
		seen[key] = true

		resp, err := client.ListShapes(ctx, core.ListShapesRequest{
			CompartmentId:      inst.CompartmentId,
			AvailabilityDomain: inst.AvailabilityDomain,
		})
		if err != nil {
			return nil, classifyOCIErr(err)
		}
		for _, s := range resp.Items {
			if s.Shape == nil || *s.Shape != *inst.Shape {
				continue
			}
			spec := shapeSpec{}
			if s.Ocpus != nil {
				spec.CPU = int(*s.Ocpus * 2)
			}
			if s.MemoryInGBs != nil {
				spec.MemoryGB = float64(*s.MemoryInGBs)
			}
			result[key] = spec
			break
		}
	}
	return result, nil
}

// lookupInstanceIPs resolves private/public IPs — ListVnicAttachments gives
// VnicId per instance (batchable per compartment), but the actual IPs only
// exist on the Vnic object itself, fetched one GetVnic call per instance
// (bounded, parallel) since no bulk "get many VNICs" call exists.
func lookupInstanceIPs(ctx context.Context, computeClient core.ComputeClient, vcnClient core.VirtualNetworkClient, instances []core.Instance) (map[string]string, map[string]*string, error) {
	vnicByInstance := make(map[string]string)
	for _, inst := range instances {
		if inst.Id == nil || inst.CompartmentId == nil {
			continue
		}
		var page *string
		for {
			resp, err := computeClient.ListVnicAttachments(ctx, core.ListVnicAttachmentsRequest{
				CompartmentId: inst.CompartmentId,
				InstanceId:    inst.Id,
				Page:          page,
			})
			if err != nil {
				return nil, nil, classifyOCIErr(err)
			}
			for _, att := range resp.Items {
				if att.VnicId != nil {
					vnicByInstance[*inst.Id] = *att.VnicId
				}
			}
			if resp.OpcNextPage == nil {
				break
			}
			page = resp.OpcNextPage
		}
	}

	privateIPs := make(map[string]string)
	publicIPs := make(map[string]*string)
	var mu sync.Mutex

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(8)
	for instanceID, vnicID := range vnicByInstance {
		instanceID, vnicID := instanceID, vnicID
		g.Go(func() error {
			resp, err := vcnClient.GetVnic(gctx, core.GetVnicRequest{VnicId: common.String(vnicID)})
			if err != nil {
				return classifyOCIErr(err)
			}
			mu.Lock()
			if resp.PrivateIp != nil {
				privateIPs[instanceID] = *resp.PrivateIp
			}
			if resp.PublicIp != nil {
				publicIPs[instanceID] = resp.PublicIp
			}
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, nil, err
	}

	return privateIPs, publicIPs, nil
}
