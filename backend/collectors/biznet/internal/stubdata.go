package internal

import "cirrus/collectorkit"

// Real Biznet Gio collector fans out to two product-line endpoints
// (/neolites/accounts, /neolite-pros/accounts per PRD §7.2) and merges them
// into one list. The stub keeps that distinction visible by prefixing the
// instance type with the product line rather than actually calling anything.
var fleetConfig = collectorkit.FleetConfig{
	Regions: []string{"ID-Jakarta1", "ID-Jakarta2", "ID-Cibitung"},
	Types: []collectorkit.InstanceTypeSpec{
		{Name: "NEO Lite Small", CPU: 1, MemGB: 2},
		{Name: "NEO Lite Pro Medium", CPU: 4, MemGB: 8},
		{Name: "NEO Lite Pro Large", CPU: 8, MemGB: 16},
	},
	AppNames: []string{"checkout-api", "auth-svc", "billing-worker", "frontend-web", "data-pipeline", "search-idx", "notif-svc", "cache-proxy"},
	Envs:     []string{"prod", "staging", "dev"},
	IDPrefix: "neo-",
	MinCount: 2,
	MaxCount: 10,
}

// GenerateInstances returns a deterministic (seeded by connectionID) stub
// fleet shaped like a plausible Biznet Gio NEO Lite / NEO Lite Pro inventory.
func GenerateInstances(connectionID string) []collectorkit.Instance {
	return collectorkit.GenerateFleet(connectionID, fleetConfig)
}
