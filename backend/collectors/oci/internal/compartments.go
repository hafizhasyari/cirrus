package internal

import (
	"context"

	"github.com/oracle/oci-go-sdk/v65/common"
	"github.com/oracle/oci-go-sdk/v65/identity"
)

// listScanCompartments enumerates every compartment in the tenancy
// (ListInstances itself has no subtree-recursion field — the tenancy is
// simply the root compartment, and recursing the compartment hierarchy is
// the only way to see every instance tenancy-wide) and returns
// [tenancyOCID] + every child compartment OCID as the scan list.
func listScanCompartments(ctx context.Context, client identity.IdentityClient, tenancyOCID string) ([]string, error) {
	compartments := []string{tenancyOCID}

	var page *string
	for {
		resp, err := client.ListCompartments(ctx, identity.ListCompartmentsRequest{
			CompartmentId:          common.String(tenancyOCID),
			CompartmentIdInSubtree: common.Bool(true),
			AccessLevel:            identity.ListCompartmentsAccessLevelAccessible,
			LifecycleState:         identity.CompartmentLifecycleStateActive,
			Page:                   page,
		})
		if err != nil {
			return nil, classifyOCIErr(err)
		}
		for _, c := range resp.Items {
			if c.Id != nil {
				compartments = append(compartments, *c.Id)
			}
		}
		if resp.OpcNextPage == nil {
			break
		}
		page = resp.OpcNextPage
	}

	return compartments, nil
}
