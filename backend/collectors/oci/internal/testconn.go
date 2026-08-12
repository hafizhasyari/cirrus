package internal

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/oracle/oci-go-sdk/v65/common"
	"github.com/oracle/oci-go-sdk/v65/core"
	"github.com/oracle/oci-go-sdk/v65/identity"
)

// TestConnection performs the cheapest authenticated calls per PRD §7.3's
// OCI checklist — validate the signing config, identity.list_region_subscriptions
// (tenancy-scoped, confirms the signing key itself and reports how many
// regions this tenancy — not OCI globally — actually subscribes to), then
// compute.list_instances with limit=1 scoped only to the root tenancy
// compartment on the connection's bootstrap region (not the full
// compartment-tree/multi-region recursion the real fetch does) to confirm
// the read-only policy is attached without paying for a full scan.
func TestConnection(ctx context.Context, raw json.RawMessage) (string, error) {
	var cfg ociConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return "", fmt.Errorf("%w: invalid connection config", ErrAuthFailed)
	}

	provider, err := buildConfigProvider(cfg)
	if err != nil {
		return "", err
	}

	identityClient, err := identity.NewIdentityClientWithConfigurationProvider(provider)
	if err != nil {
		return "", fmt.Errorf("%w: building identity client: %v", ErrUpstream, err)
	}
	regions, err := discoverRegions(ctx, identityClient, cfg.TenancyOCID)
	if err != nil {
		return "", err
	}

	computeClient, err := core.NewComputeClientWithConfigurationProvider(provider)
	if err != nil {
		return "", fmt.Errorf("%w: building compute client: %v", ErrUpstream, err)
	}
	_, err = computeClient.ListInstances(ctx, core.ListInstancesRequest{
		CompartmentId: common.String(cfg.TenancyOCID),
		Limit:         common.Int(1),
	})
	if err != nil {
		return "", classifyOCIErr(err)
	}

	return fmt.Sprintf("Signing key valid; %d region(s) subscribed; compute read-only policy confirmed on tenancy root", len(regions)), nil
}
