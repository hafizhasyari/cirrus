package internal

import (
	"fmt"

	ecs20140526 "github.com/alibabacloud-go/ecs-20140526/v7/client"
	"github.com/alibabacloud-go/tea/tea"
	"cirrus/collectorkit"
)

// mapStatus maps Alibaba ECS's status vocabulary onto our 3-bucket one.
// "Starting"/"Pending" are judgment-called to "running" (symmetric with the
// AWS collector's "pending" -> "running" call).
func mapStatus(status string) string {
	switch status {
	case "Running", "Starting", "Pending":
		return "running"
	default:
		return "stopped"
	}
}

// mapInstance maps one ECS DescribeInstances result. CPU/Memory/IPs/creation
// time all come directly off the instance (unlike AWS, no extra
// DescribeInstanceTypes call needed); disk info comes from a separate
// region-wide DescribeDisks call (see describeAllDisks/groupDisksByInstance
// in instances.go), grouped by InstanceId and passed in by the caller.
func mapInstance(inst *ecs20140526.DescribeInstancesResponseBodyInstancesInstance, region string, disks []collectorkit.Disk) collectorkit.Instance {
	id := tea.StringValue(inst.InstanceId)
	name := tea.StringValue(inst.InstanceName)
	if name == "" {
		name = id
	}

	privateIP := ""
	if inst.VpcAttributes != nil && inst.VpcAttributes.PrivateIpAddress != nil {
		ips := inst.VpcAttributes.PrivateIpAddress.IpAddress
		if len(ips) > 0 {
			privateIP = tea.StringValue(ips[0])
		}
	}

	var publicIP *string
	if inst.PublicIpAddress != nil && len(inst.PublicIpAddress.IpAddress) > 0 {
		if ip := tea.StringValue(inst.PublicIpAddress.IpAddress[0]); ip != "" {
			publicIP = &ip
		}
	} else if inst.EipAddress != nil {
		if ip := tea.StringValue(inst.EipAddress.IpAddress); ip != "" {
			publicIP = &ip
		}
	}

	if disks == nil {
		disks = []collectorkit.Disk{}
	}

	return collectorkit.Instance{
		ID:           id,
		Name:         name,
		Region:       region,
		Status:       mapStatus(tea.StringValue(inst.Status)),
		InstanceType: tea.StringValue(inst.InstanceType),
		CPU:          int(tea.Int32Value(inst.Cpu)),
		MemoryGB:     float64(tea.Int32Value(inst.Memory)) / 1024,
		Disks:        disks,
		PrivateIP:    privateIP,
		PublicIP:     publicIP,
		LaunchedAt:   tea.StringValue(inst.CreationTime),
	}
}

// groupDisksByInstance turns a region's flat DescribeDisks result into a
// per-instance, role-ordered disk list. Two passes (system disks first,
// then data disks) give a deterministic Root-before-Data-N order per
// instance regardless of DescribeDisks' own (unspecified) return order.
// Unlike AWS/GCP, which infer the boot disk from index/a boot flag,
// Alibaba's own API directly reports each disk's Type ("system"/"data") —
// no positional guessing needed.
func groupDisksByInstance(disks []*ecs20140526.DescribeDisksResponseBodyDisksDisk) map[string][]collectorkit.Disk {
	result := make(map[string][]collectorkit.Disk)

	for _, d := range disks {
		if tea.StringValue(d.Type) != "system" {
			continue
		}
		instanceID := tea.StringValue(d.InstanceId)
		if instanceID == "" {
			continue
		}
		result[instanceID] = append(result[instanceID], collectorkit.Disk{
			Label:  diskLabel("Root", diskIdentifier(d)),
			SizeGB: int(tea.Int32Value(d.Size)),
		})
	}

	dataIndex := make(map[string]int)
	for _, d := range disks {
		if tea.StringValue(d.Type) == "system" {
			continue
		}
		instanceID := tea.StringValue(d.InstanceId)
		if instanceID == "" {
			continue
		}
		dataIndex[instanceID]++
		result[instanceID] = append(result[instanceID], collectorkit.Disk{
			Label:  diskLabel(fmt.Sprintf("Data %d", dataIndex[instanceID]), diskIdentifier(d)),
			SizeGB: int(tea.Int32Value(d.Size)),
		})
	}

	return result
}

// diskIdentifier prefers the user-assigned DiskName (often blank) over the
// OS device path (e.g. /dev/xvda), which is always present.
func diskIdentifier(d *ecs20140526.DescribeDisksResponseBodyDisksDisk) string {
	if name := tea.StringValue(d.DiskName); name != "" {
		return name
	}
	return tea.StringValue(d.Device)
}

// diskLabel appends a provider-native identifier to a disk's role label,
// e.g. "Root (/dev/xvda)" — falling back to the bare role when no
// identifier is available, never emitting empty parens.
func diskLabel(role, identifier string) string {
	if identifier == "" {
		return role
	}
	return fmt.Sprintf("%s (%s)", role, identifier)
}
