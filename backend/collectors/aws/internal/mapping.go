package internal

import (
	"fmt"

	"cirrus/collectorkit"

	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
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

func volumeLabel(index int) string {
	if index == 0 {
		return "Root"
	}
	return fmt.Sprintf("Data %d", index)
}
