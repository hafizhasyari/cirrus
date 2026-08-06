package internal

import "cirrus/collectorkit"

var fleetConfig = collectorkit.FleetConfig{
	Regions: []string{"ap-jakarta-1", "us-ashburn-1"},
	Types: []collectorkit.InstanceTypeSpec{
		{Name: "VM.Standard2.4", CPU: 4, MemGB: 60},
		{Name: "VM.Standard.E4.Flex", CPU: 4, MemGB: 16},
	},
	AppNames: []string{"checkout-api", "auth-svc", "billing-worker", "frontend-web", "data-pipeline", "search-idx", "notif-svc", "cache-proxy"},
	Envs:     []string{"prod", "staging", "dev"},
	IDPrefix: "oci-",
	MinCount: 2,
	MaxCount: 10,
}

// GenerateInstances returns a deterministic (seeded by connectionID) stub
// fleet shaped like a plausible OCI Core Compute inventory.
func GenerateInstances(connectionID string) []collectorkit.Instance {
	return collectorkit.GenerateFleet(connectionID, fleetConfig)
}
