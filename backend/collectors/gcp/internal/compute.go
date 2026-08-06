package internal

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	compute "cloud.google.com/go/compute/apiv1"
	computepb "cloud.google.com/go/compute/apiv1/computepb"
	"cirrus/collectorkit"
	"golang.org/x/oauth2"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

// fetchInstances lists every instance in the project (all zones, via
// AggregatedList — no per-region scoping since FIELD_DEFS.gcp has no region
// field and PRD calls for project-level aggregation for GCP), then resolves
// CPU/memory for every distinct (zone, machineType) pair seen via a
// deduped, parallel machineTypes.get lookup.
func fetchInstances(ctx context.Context, ts oauth2.TokenSource, projectID string) ([]collectorkit.Instance, error) {
	instancesClient, err := compute.NewInstancesRESTClient(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, fmt.Errorf("%w: building instances client: %v", ErrUpstream, err)
	}
	defer instancesClient.Close()

	var raw []*computepb.Instance
	it := instancesClient.AggregatedList(ctx, &computepb.AggregatedListInstancesRequest{Project: projectID})
	for {
		pair, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, classifyGCPErr(err)
		}
		if pair.Value == nil {
			continue
		}
		raw = append(raw, pair.Value.GetInstances()...)
	}

	machineTypesClient, err := compute.NewMachineTypesRESTClient(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, fmt.Errorf("%w: building machine types client: %v", ErrUpstream, err)
	}
	defer machineTypesClient.Close()

	specs, err := lookupMachineSpecs(ctx, machineTypesClient, projectID, raw)
	if err != nil {
		return nil, classifyGCPErr(err)
	}

	result := make([]collectorkit.Instance, 0, len(raw))
	for _, inst := range raw {
		result = append(result, mapInstance(inst, specs))
	}
	return result, nil
}

// lookupMachineSpecs resolves CPU/memory for every distinct (zone,
// machineType) pair seen in one fetch — a handful of extra calls in
// practice since real fleets reuse a small number of types, deduped so the
// same pair is never looked up twice.
func lookupMachineSpecs(ctx context.Context, client *compute.MachineTypesClient, projectID string, instances []*computepb.Instance) (map[string]machineSpec, error) {
	result := make(map[string]machineSpec)
	seen := make(map[string]bool)

	for _, inst := range instances {
		zone := lastPathSegment(inst.GetZone())
		machineType := lastPathSegment(inst.GetMachineType())
		key := zone + "/" + machineType
		if seen[key] {
			continue
		}
		seen[key] = true

		mt, err := client.Get(ctx, &computepb.GetMachineTypeRequest{
			Project:     projectID,
			Zone:        zone,
			MachineType: machineType,
		})
		if err != nil {
			return nil, err
		}
		result[key] = machineSpec{CPU: int(mt.GetGuestCpus()), MemoryGB: float64(mt.GetMemoryMb()) / 1024}
	}
	return result, nil
}

// classifyGCPErr distinguishes access-denied-shaped failures (AUTH_FAILED)
// from everything else (UPSTREAM_ERROR) using googleapi's own HTTP status.
func classifyGCPErr(err error) error {
	var apiErr *googleapi.Error
	if errors.As(err, &apiErr) && (apiErr.Code == http.StatusForbidden || apiErr.Code == http.StatusUnauthorized) {
		return fmt.Errorf("%w: %v", ErrAuthFailed, err)
	}
	return fmt.Errorf("%w: %v", ErrUpstream, err)
}
