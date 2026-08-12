package internal

import (
	"cirrus/collectorkit"

	"github.com/oracle/oci-go-sdk/v65/common"
	"github.com/oracle/oci-go-sdk/v65/core"
)

// mapStatus maps OCI's instance lifecycle-state vocabulary onto our
// 3-bucket one. PROVISIONING/STARTING/CREATING_IMAGE/MOVING are
// judgment-called to "running" (transitioning toward or still running,
// symmetric with AWS's "pending"/GCP's "PROVISIONING"/"STAGING").
func mapStatus(state core.InstanceLifecycleStateEnum) string {
	switch state {
	case core.InstanceLifecycleStateRunning,
		core.InstanceLifecycleStateProvisioning,
		core.InstanceLifecycleStateStarting,
		core.InstanceLifecycleStateCreatingImage,
		core.InstanceLifecycleStateMoving:
		return "running"
	case core.InstanceLifecycleStateTerminating, core.InstanceLifecycleStateTerminated:
		return "terminated"
	default:
		return "stopped"
	}
}

// shapeSpec is one shape's resolved CPU-core-count/memory, whether read
// directly off the instance's inline ShapeConfig or resolved via a
// ListShapes fallback lookup for shapes that don't populate it.
type shapeSpec struct {
	CPU      int
	MemoryGB float64
}

// specFromShapeConfig reads CPU/memory directly off the instance when
// populated (confirmed reliable for Flex shapes) — CPU core count reports
// Vcpus if present, else Ocpus*2 (judgment call: 1 OCPU ~= 2 x86 vCPUs).
func specFromShapeConfig(cfg *core.InstanceShapeConfig) (shapeSpec, bool) {
	if cfg == nil {
		return shapeSpec{}, false
	}
	spec := shapeSpec{}
	switch {
	case cfg.Vcpus != nil:
		spec.CPU = *cfg.Vcpus
	case cfg.Ocpus != nil:
		spec.CPU = int(*cfg.Ocpus * 2)
	}
	if cfg.MemoryInGBs != nil {
		spec.MemoryGB = float64(*cfg.MemoryInGBs)
	}
	if spec.CPU == 0 && spec.MemoryGB == 0 {
		return shapeSpec{}, false
	}
	return spec, true
}

func mapInstance(inst core.Instance, spec shapeSpec, disks []collectorkit.Disk, privateIP string, publicIP *string) collectorkit.Instance {
	id := ""
	if inst.Id != nil {
		id = *inst.Id
	}
	name := ""
	if inst.DisplayName != nil {
		name = *inst.DisplayName
	}
	region := ""
	if inst.Region != nil {
		region = *inst.Region
	}
	instanceType := ""
	if inst.Shape != nil {
		instanceType = *inst.Shape
	}
	launchedAt := ""
	if inst.TimeCreated != nil {
		launchedAt = inst.TimeCreated.UTC().Format("2006-01-02T15:04:05Z")
	}

	if disks == nil {
		disks = []collectorkit.Disk{}
	}

	return collectorkit.Instance{
		ID:           id,
		Name:         name,
		Region:       region,
		Status:       mapStatus(inst.LifecycleState),
		InstanceType: instanceType,
		CPU:          spec.CPU,
		MemoryGB:     spec.MemoryGB,
		Disks:        disks,
		PrivateIP:    privateIP,
		PublicIP:     publicIP,
		LaunchedAt:   launchedAt,
	}
}

// classifyOCIErr distinguishes access/signing failures (AUTH_FAILED) from
// everything else (UPSTREAM_ERROR) using the OCI SDK's own service-error
// interface (mirrors AWS's smithy.APIError / GCP's googleapi.Error pattern).
func classifyOCIErr(err error) error {
	if svcErr, ok := common.IsServiceError(err); ok {
		switch svcErr.GetHTTPStatusCode() {
		case 401, 403:
			return &wrappedErr{sentinel: ErrAuthFailed, cause: err}
		}
	}
	return &wrappedErr{sentinel: ErrUpstream, cause: err}
}

// wrappedErr lets errors.Is(err, ErrAuthFailed/ErrUpstream) keep working
// while preserving the original error's message for logging.
type wrappedErr struct {
	sentinel error
	cause    error
}

func (e *wrappedErr) Error() string { return e.sentinel.Error() + ": " + e.cause.Error() }
func (e *wrappedErr) Is(target error) bool { return target == e.sentinel }
func (e *wrappedErr) Unwrap() error { return e.cause }
