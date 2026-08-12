package internal

import (
	"fmt"
	"strings"

	computepb "cloud.google.com/go/compute/apiv1/computepb"
	"cirrus/collectorkit"
)

// mapStatus maps GCP's instance-status vocabulary onto our 3-bucket one.
// PROVISIONING/STAGING are judgment-called to "running" (transitioning
// toward running, genuinely ambiguous). GCP's own TERMINATED means "powered
// off, resource still exists" (not deleted — a truly deleted instance just
// disappears from the list), so it maps to "stopped", not our "terminated"
// bucket; nothing legitimately maps to "terminated" for GCP.
func mapStatus(status string) string {
	switch status {
	case "RUNNING", "PROVISIONING", "STAGING":
		return "running"
	default:
		return "stopped"
	}
}

// lastPathSegment extracts the trailing segment of a GCE resource URL, e.g.
// ".../zones/us-central1-a" -> "us-central1-a", ".../machineTypes/e2-medium" -> "e2-medium".
func lastPathSegment(url string) string {
	parts := strings.Split(url, "/")
	return parts[len(parts)-1]
}

// regionFromZone trims a zone's trailing single-letter suffix to get its
// region, e.g. "us-central1-a" -> "us-central1" (mirrors the AWS collector's
// AZ->region derivation).
func regionFromZone(zone string) string {
	if idx := strings.LastIndex(zone, "-"); idx > 0 {
		return zone[:idx]
	}
	return zone
}

// machineSpec is one (zone, machineType) pair's CPU/memory, resolved via a
// deduped, parallel machineTypes.get lookup (compute.go) — live lookup over
// a static table, since a hardcoded list would silently go stale/wrong for
// custom machine types as Google adds new predefined ones.
type machineSpec struct {
	CPU      int
	MemoryGB float64
}

func mapInstance(inst *computepb.Instance, specByZoneType map[string]machineSpec) collectorkit.Instance {
	zone := lastPathSegment(inst.GetZone())
	machineType := lastPathSegment(inst.GetMachineType())

	var privateIP string
	var publicIP *string
	if ifaces := inst.GetNetworkInterfaces(); len(ifaces) > 0 {
		privateIP = ifaces[0].GetNetworkIP()
		if configs := ifaces[0].GetAccessConfigs(); len(configs) > 0 {
			if ip := configs[0].GetNatIP(); ip != "" {
				publicIP = &ip
			}
		}
	}

	disks := make([]collectorkit.Disk, 0, len(inst.GetDisks()))
	dataIndex := 0
	for _, d := range inst.GetDisks() {
		label := "Root"
		if !d.GetBoot() {
			dataIndex++
			label = fmt.Sprintf("Data %d", dataIndex)
		}
		disks = append(disks, collectorkit.Disk{Label: label, SizeGB: int(d.GetDiskSizeGb())})
	}

	spec := specByZoneType[zone+"/"+machineType]

	return collectorkit.Instance{
		ID:           fmt.Sprint(inst.GetId()),
		Name:         inst.GetName(),
		Region:       regionFromZone(zone),
		Status:       mapStatus(inst.GetStatus()),
		InstanceType: machineType,
		CPU:          spec.CPU,
		MemoryGB:     spec.MemoryGB,
		Disks:        disks,
		PrivateIP:    privateIP,
		PublicIP:     publicIP,
		LaunchedAt:   inst.GetCreationTimestamp(),
	}
}
