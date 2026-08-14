// Package collectorkit holds the pure HTTP-envelope boilerplate shared by
// every Provider Collector: the wire-format types, JSON helpers, health
// check, and timeout middleware. It deliberately carries zero provider-
// specific logic — that stays fully isolated per collector (PRD §7.1's
// "kegagalan satu provider terisolasi" goal is a deployment/runtime concern,
// not a reason to duplicate this boilerplate five times).
package collectorkit

// Disk mirrors the frontend's Disk shape (label + sizeGB).
type Disk struct {
	Label  string `json:"label"`
	SizeGB int    `json:"sizeGB"`
}

// Instance is the raw, provider-shaped per-VM record a collector returns.
// Field names intentionally differ from the frontend's Vm type (instanceType
// vs type, memoryGB vs memory, launchedAt ISO datetime vs launched date) —
// the Aggregator normalizes between the two; collectors stay provider-raw.
type Instance struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Region       string  `json:"region"`
	Status       string  `json:"status"` // "running" | "stopped" | "terminated"
	InstanceType string  `json:"instanceType"`
	CPU          int     `json:"cpu"`
	MemoryGB     float64 `json:"memoryGB"`
	Disks        []Disk  `json:"disks"`
	PrivateIP    string  `json:"privateIp"`
	PublicIP     *string `json:"publicIp"`
	LaunchedAt   string  `json:"launchedAt"`
	// Service distinguishes a sub-service within one provider — e.g. AWS
	// Lightsail vs. EC2. Omitted for every other case (EC2, and every other
	// provider) today.
	Service string `json:"service,omitempty"`
}

// InstancesResponse is the GET /instances success envelope.
type InstancesResponse struct {
	ConnectionID string     `json:"connectionId"`
	Provider     string     `json:"provider"`
	FetchedAt    string     `json:"fetchedAt"`
	Instances    []Instance `json:"instances"`
}

// TestResult is the lightweight GET /test success envelope — no instances
// array, since this only proves auth/scope, never fetches real inventory.
type TestResult struct {
	ConnectionID string `json:"connectionId"`
	Provider     string `json:"provider"`
	CheckedAt    string `json:"checkedAt"` // RFC3339
	Message      string `json:"message"`
}

// ErrorBody/ErrorResponse is the GET /instances failure envelope.
type ErrorBody struct {
	Code    string `json:"code"` // "TIMEOUT" | "UPSTREAM_ERROR" | "AUTH_FAILED"
	Message string `json:"message"`
}

type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}
