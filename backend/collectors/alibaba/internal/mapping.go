package internal

import (
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
// DescribeInstanceTypes/DescribeVolumes calls needed) — disk sizes are not
// returned by DescribeInstances at all; a real per-disk size would need a
// separate DescribeDisks call, left as a known follow-up (flagged, not
// silently guessed) rather than adding an extra API round-trip in this pass.
func mapInstance(inst *ecs20140526.DescribeInstancesResponseBodyInstancesInstance, region string) collectorkit.Instance {
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

	return collectorkit.Instance{
		ID:           id,
		Name:         name,
		Region:       region,
		Status:       mapStatus(tea.StringValue(inst.Status)),
		InstanceType: tea.StringValue(inst.InstanceType),
		CPU:          int(tea.Int32Value(inst.Cpu)),
		MemoryGB:     float64(tea.Int32Value(inst.Memory)) / 1024,
		Disks:        []collectorkit.Disk{},
		PrivateIP:    privateIP,
		PublicIP:     publicIP,
		LaunchedAt:   tea.StringValue(inst.CreationTime),
	}
}
