package internal

import "cirrus/collectorkit"

var fleetConfig = collectorkit.FleetConfig{
	Regions: []string{"us-east-1", "ap-southeast-1", "ap-southeast-3"},
	Types: []collectorkit.InstanceTypeSpec{
		{Name: "t3.medium", CPU: 2, MemGB: 4},
		{Name: "m5.large", CPU: 2, MemGB: 8},
		{Name: "c5.xlarge", CPU: 4, MemGB: 8},
		{Name: "r5.large", CPU: 2, MemGB: 16},
	},
	AppNames: []string{"checkout-api", "auth-svc", "billing-worker", "frontend-web", "data-pipeline", "search-idx", "notif-svc", "cache-proxy"},
	Envs:     []string{"prod", "staging", "dev"},
	IDPrefix: "i-",
	MinCount: 3,
	MaxCount: 14,
}

// GenerateInstances returns a deterministic (seeded by connectionID) stub
// fleet shaped like a plausible AWS EC2 inventory.
func GenerateInstances(connectionID string) []collectorkit.Instance {
	return collectorkit.GenerateFleet(connectionID, fleetConfig)
}
