package internal

import (
	"fmt"

	"cirrus/collectorkit"

	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	lightsailtypes "github.com/aws/aws-sdk-go-v2/service/lightsail/types"
)

// mapStatus maps AWS's instance-state vocabulary onto our 3-bucket one.
// "pending" is judgment-called to "running" (billing/becoming-running, not
// idle); "shutting-down" is judgment-called to "terminated" (on its way out).
func mapStatus(name ec2types.InstanceStateName) string {
	switch name {
	case ec2types.InstanceStateNameRunning, ec2types.InstanceStateNamePending:
		return "running"
	case ec2types.InstanceStateNameStopped, ec2types.InstanceStateNameStopping:
		return "stopped"
	case ec2types.InstanceStateNameTerminated, ec2types.InstanceStateNameShuttingDown:
		return "terminated"
	default:
		return "stopped"
	}
}

func instanceName(inst ec2types.Instance) string {
	for _, tag := range inst.Tags {
		if tag.Key != nil && *tag.Key == "Name" && tag.Value != nil && *tag.Value != "" {
			return *tag.Value
		}
	}
	if inst.InstanceId != nil {
		return *inst.InstanceId
	}
	return "unnamed"
}

func mapInstance(
	inst ec2types.Instance,
	region string,
	memoryMiBByType map[string]int32,
	disks []collectorkit.Disk,
) collectorkit.Instance {
	id := ""
	if inst.InstanceId != nil {
		id = *inst.InstanceId
	}

	instanceType := string(inst.InstanceType)

	cpu := 0
	if inst.CpuOptions != nil && inst.CpuOptions.CoreCount != nil && inst.CpuOptions.ThreadsPerCore != nil {
		cpu = int(*inst.CpuOptions.CoreCount) * int(*inst.CpuOptions.ThreadsPerCore)
	}

	memoryGB := 0.0
	if mib, ok := memoryMiBByType[instanceType]; ok {
		memoryGB = float64(mib) / 1024
	}

	privateIP := ""
	if inst.PrivateIpAddress != nil {
		privateIP = *inst.PrivateIpAddress
	}
	var publicIP *string
	if inst.PublicIpAddress != nil {
		publicIP = inst.PublicIpAddress
	}

	launchedAt := ""
	if inst.LaunchTime != nil {
		launchedAt = inst.LaunchTime.UTC().Format("2006-01-02T15:04:05Z")
	}

	status := "stopped"
	if inst.State != nil {
		status = mapStatus(inst.State.Name)
	}

	if len(disks) == 0 {
		disks = []collectorkit.Disk{}
	}

	return collectorkit.Instance{
		ID:           id,
		Name:         instanceName(inst),
		Region:       region,
		Status:       status,
		InstanceType: instanceType,
		CPU:          cpu,
		MemoryGB:     memoryGB,
		Disks:        disks,
		PrivateIP:    privateIP,
		PublicIP:     publicIP,
		LaunchedAt:   launchedAt,
	}
}

func volumeLabel(isRoot bool, dataIndex int, device string) string {
	role := "Root"
	if !isRoot {
		role = fmt.Sprintf("Data %d", dataIndex)
	}
	if device == "" {
		return role
	}
	return fmt.Sprintf("%s (%s)", role, device)
}

// mapLightsailInstance maps a Lightsail instance into our shared shape.
// Unlike EC2, Lightsail's own response already embeds hardware/disk info —
// no separate volumes lookup needed. Lightsail reuses EC2's exact
// pending/running/shutting-down/stopped/stopping/terminated state
// vocabulary (it runs on EC2 infrastructure under the hood), so mapStatus is
// reused directly rather than duplicated.
func mapLightsailInstance(inst lightsailtypes.Instance, region string) collectorkit.Instance {
	id := ""
	if inst.Arn != nil {
		id = *inst.Arn
	}

	name := "unnamed"
	if inst.Name != nil && *inst.Name != "" {
		name = *inst.Name
	}

	instanceType := ""
	if inst.BundleId != nil {
		instanceType = *inst.BundleId
	}

	cpu := 0
	memoryGB := 0.0
	var disks []collectorkit.Disk
	if inst.Hardware != nil {
		if inst.Hardware.CpuCount != nil {
			cpu = int(*inst.Hardware.CpuCount)
		}
		if inst.Hardware.RamSizeInGb != nil {
			memoryGB = float64(*inst.Hardware.RamSizeInGb)
		}
		for _, d := range inst.Hardware.Disks {
			label := "Disk"
			if d.Name != nil && *d.Name != "" {
				label = *d.Name
			}
			size := 0
			if d.SizeInGb != nil {
				size = int(*d.SizeInGb)
			}
			disks = append(disks, collectorkit.Disk{Label: label, SizeGB: size})
		}
	}
	if len(disks) == 0 {
		disks = []collectorkit.Disk{}
	}

	privateIP := ""
	if inst.PrivateIpAddress != nil {
		privateIP = *inst.PrivateIpAddress
	}
	var publicIP *string
	if inst.PublicIpAddress != nil {
		publicIP = inst.PublicIpAddress
	}

	launchedAt := ""
	if inst.CreatedAt != nil {
		launchedAt = inst.CreatedAt.UTC().Format("2006-01-02T15:04:05Z")
	}

	status := "stopped"
	if inst.State != nil && inst.State.Name != nil {
		status = mapStatus(ec2types.InstanceStateName(*inst.State.Name))
	}

	return collectorkit.Instance{
		ID:           id,
		Name:         name,
		Region:       region,
		Status:       status,
		InstanceType: instanceType,
		CPU:          cpu,
		MemoryGB:     memoryGB,
		Disks:        disks,
		PrivateIP:    privateIP,
		PublicIP:     publicIP,
		LaunchedAt:   launchedAt,
		Service:      "lightsail",
	}
}
