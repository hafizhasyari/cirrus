package collectorkit

import (
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"time"
)

// NewRand derives a PRNG deterministically seeded from a connectionId, so the
// same connection always gets the same stub fleet across requests/restarts
// without needing to persist anything server-side.
func NewRand(connectionID string) *rand.Rand {
	h := fnv.New64a()
	_, _ = h.Write([]byte(connectionID))
	seed := h.Sum64()
	return rand.New(rand.NewPCG(seed, seed^0x9E3779B97F4A7C15))
}

func Pick[T any](r *rand.Rand, items []T) T {
	return items[r.IntN(len(items))]
}

// InstanceTypeSpec is one entry in a provider's instance-type/spec pool.
type InstanceTypeSpec struct {
	Name  string
	CPU   int
	MemGB float64
}

// FleetConfig is the per-provider flavor (regions/types/naming/id style) fed
// into GenerateFleet — the only thing that actually differs between the 5
// collectors' stub data.
type FleetConfig struct {
	Regions  []string
	Types    []InstanceTypeSpec
	AppNames []string
	Envs     []string
	IDPrefix string
	MinCount int
	MaxCount int
}

// GenerateFleet deterministically builds a plausible-looking stub instance
// list for one connection, mirroring frontend/src/data/mockData.ts's
// per-provider pools of accounts/regions/types so the merged aggregator
// result still looks realistic even though nothing here is a real API call.
func GenerateFleet(connectionID string, cfg FleetConfig) []Instance {
	r := NewRand(connectionID)
	count := cfg.MinCount + r.IntN(cfg.MaxCount-cfg.MinCount+1)
	instances := make([]Instance, 0, count)

	for i := 0; i < count; i++ {
		spec := Pick(r, cfg.Types)
		region := Pick(r, cfg.Regions)
		app := Pick(r, cfg.AppNames)
		env := Pick(r, cfg.Envs)

		status := "running"
		if r.IntN(5) == 0 {
			status = "stopped"
		}

		var publicIP *string
		if r.IntN(5) < 2 {
			ip := fmt.Sprintf("203.0.113.%d", r.IntN(254)+1)
			publicIP = &ip
		}

		disks := []Disk{{Label: "Root", SizeGB: Pick(r, []int{30, 50, 100})}}
		for d := 0; d < r.IntN(3); d++ {
			disks = append(disks, Disk{Label: fmt.Sprintf("Data %d", d+1), SizeGB: Pick(r, []int{100, 250, 500})})
		}

		daysAgo := r.IntN(540)
		launched := time.Now().UTC().AddDate(0, 0, -daysAgo).Format("2006-01-02") + "T00:00:00Z"

		instances = append(instances, Instance{
			ID:           fmt.Sprintf("%s%04d", cfg.IDPrefix, r.IntN(9999)),
			Name:         fmt.Sprintf("%s-%s-%02d", app, env, r.IntN(99)),
			Region:       region,
			Status:       status,
			InstanceType: spec.Name,
			CPU:          spec.CPU,
			MemoryGB:     spec.MemGB,
			Disks:        disks,
			PrivateIP:    fmt.Sprintf("10.%d.%d.%d", r.IntN(255), r.IntN(255), r.IntN(255)),
			PublicIP:     publicIP,
			LaunchedAt:   launched,
			Tags:         map[string]string{"env": env},
		})
	}

	return instances
}
