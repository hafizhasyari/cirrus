package internal

import "cirrus/collectorkit"

var fleetConfig = collectorkit.FleetConfig{
	Regions: []string{"ap-southeast-5", "cn-hangzhou"},
	Types: []collectorkit.InstanceTypeSpec{
		{Name: "ecs.g6.large", CPU: 2, MemGB: 8},
		{Name: "ecs.c6.xlarge", CPU: 4, MemGB: 8},
	},
	AppNames: []string{"checkout-api", "auth-svc", "billing-worker", "frontend-web", "data-pipeline", "search-idx", "notif-svc", "cache-proxy"},
	Envs:     []string{"prod", "staging", "dev"},
	IDPrefix: "ecs-",
	MinCount: 2,
	MaxCount: 10,
}

// GenerateInstances returns a deterministic (seeded by connectionID) stub
// fleet shaped like a plausible Alibaba Cloud ECS inventory.
func GenerateInstances(connectionID string) []collectorkit.Instance {
	return collectorkit.GenerateFleet(connectionID, fleetConfig)
}
