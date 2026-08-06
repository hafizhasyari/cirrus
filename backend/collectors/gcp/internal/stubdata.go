package internal

import "cirrus/collectorkit"

var fleetConfig = collectorkit.FleetConfig{
	Regions: []string{"asia-southeast2", "us-central1"},
	Types: []collectorkit.InstanceTypeSpec{
		{Name: "e2-medium", CPU: 2, MemGB: 4},
		{Name: "n2-standard-4", CPU: 4, MemGB: 16},
		{Name: "n1-standard-2", CPU: 2, MemGB: 7.5},
	},
	AppNames: []string{"checkout-api", "auth-svc", "billing-worker", "frontend-web", "data-pipeline", "search-idx", "notif-svc", "cache-proxy"},
	Envs:     []string{"prod", "staging", "dev"},
	IDPrefix: "gce-",
	MinCount: 3,
	MaxCount: 14,
}

// GenerateInstances returns a deterministic (seeded by connectionID) stub
// fleet shaped like a plausible GCP Compute Engine inventory.
func GenerateInstances(connectionID string) []collectorkit.Instance {
	return collectorkit.GenerateFleet(connectionID, fleetConfig)
}
