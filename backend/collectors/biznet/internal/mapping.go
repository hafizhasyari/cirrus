package internal

import (
	"encoding/json"
	"strconv"
	"strings"

	"cirrus/collectorkit"
)

// mapStatus maps Biznet's spec-confirmed status vocabulary (the `status`
// query param's documented default set) onto our 3-bucket one. "Pending" is
// judgment-called to "stopped" — reasoned as "ordered but not yet
// provisioned" (no running VM exists yet) rather than "mid-boot" like AWS/
// GCP/Alibaba's transitional states; easy to flip to "running" in one line
// once real data is seen.
func mapStatus(status string) string {
	switch strings.ToLower(status) {
	case "active":
		return "running"
	case "terminated":
		return "terminated"
	case "suspended", "pending":
		return "stopped"
	default:
		return "stopped"
	}
}

// decodeList handles either a bare JSON array or a `{"data": [...]}`-style
// wrapper — Biznet's real response shape isn't documented anywhere (every
// endpoint's OpenAPI schema is empty), so this can't assume one or the other.
func decodeList(body []byte) []json.RawMessage {
	var arr []json.RawMessage
	if err := json.Unmarshal(body, &arr); err == nil {
		return arr
	}
	var wrapped struct {
		Data []json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &wrapped); err == nil {
		return wrapped.Data
	}
	return nil
}

// extractField does a best-effort, case-insensitive lookup across several
// candidate key names on a raw JSON object, returning "" if none are
// present. Same reasoning as decodeList — no confirmed field names exist to
// decode into a rigid struct.
func extractField(raw json.RawMessage, candidates ...string) string {
	if raw == nil {
		return ""
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return ""
	}
	for _, candidate := range candidates {
		for key, value := range obj {
			if !strings.EqualFold(key, candidate) {
				continue
			}
			var s string
			if json.Unmarshal(value, &s) == nil && s != "" {
				return s
			}
			var n float64
			if json.Unmarshal(value, &n) == nil {
				return strconv.FormatFloat(n, 'f', -1, 64)
			}
		}
	}
	return ""
}

// extractRaw is extractField's counterpart for pulling out a nested raw
// sub-object rather than a string — confirmed live, Biznet's /accounts list
// response nests every per-VM spec field (name/region/cores/memory/
// disk_size/address) under an `extra_details` object rather than at the
// top level.
func extractRaw(raw json.RawMessage, key string) json.RawMessage {
	if raw == nil {
		return nil
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}
	for k, v := range obj {
		if strings.EqualFold(k, key) {
			return v
		}
	}
	return nil
}

// extractFieldAny checks each source in turn (e.g. extra_details, then the
// containing item) for the first candidate key with a usable value.
func extractFieldAny(candidates []string, sources ...json.RawMessage) string {
	for _, src := range sources {
		if v := extractField(src, candidates...); v != "" {
			return v
		}
	}
	return ""
}

// parseDiskSizeGB parses Biznet's Proxmox-style disk_size string (confirmed
// live, e.g. "60G") into whole GB, tolerating M/T suffixes or a bare number.
func parseDiskSizeGB(raw string) int {
	if raw == "" {
		return 0
	}
	numPart := raw
	multiplier := 1.0
	switch raw[len(raw)-1] {
	case 'G', 'g':
		numPart = raw[:len(raw)-1]
	case 'M', 'm':
		numPart = raw[:len(raw)-1]
		multiplier = 1.0 / 1024
	case 'T', 't':
		numPart = raw[:len(raw)-1]
		multiplier = 1024
	}
	n, _ := strconv.ParseFloat(numPart, 64)
	return int(n * multiplier)
}

// hasSpecFields reports whether a list item already carries usable
// cpu/memory data, deciding whether the vm-details fallback call is needed.
func hasSpecFields(raw json.RawMessage) bool {
	details := extractRaw(raw, "extra_details")
	return extractFieldAny([]string{"cores", "cpu", "vcpu"}, details, raw) != "" ||
		extractFieldAny([]string{"memory", "ram"}, details, raw) != ""
}

func instanceID(raw json.RawMessage) string {
	return extractField(raw, "id", "account_id", "vm_id")
}

// mapInstance builds a collectorkit.Instance from whichever source has data
// — prefers detail (if fetched) over the thinner list item. Confirmed live
// against a real Biznet response: name/region/cores/memory/disk_size/address
// all live nested under an `extra_details` object on the list item, not at
// the top level (only product_name/category_name sit at the top level) — so
// every per-VM spec field checks extraDetails first, falling back to the
// containing item defensively since Biznet's OpenAPI spec still declares an
// empty schema for these endpoints and NEO Lite Pro's shape is unconfirmed.
func mapInstance(listRaw, detailRaw json.RawMessage) collectorkit.Instance {
	source := listRaw
	if detailRaw != nil {
		source = detailRaw
	}
	extraDetails := extractRaw(source, "extra_details")

	id := instanceID(source)
	name := extractFieldAny([]string{"name", "hostname", "vm_name", "display_name"}, extraDetails, source)
	if name == "" {
		name = id
	}

	cpu, _ := strconv.Atoi(extractFieldAny([]string{"cores", "cpu", "vcpu"}, extraDetails, source))
	// Biznet reports memory in MB (confirmed live, e.g. 16384 == 16GB) —
	// convert to GB to match every other collector's MemoryGB convention
	// (AWS divides MiB by 1024, Alibaba divides MB by 1024).
	memMB, _ := strconv.ParseFloat(extractFieldAny([]string{"memory", "ram"}, extraDetails, source), 64)
	memGB := memMB / 1024
	diskGB := parseDiskSizeGB(extractFieldAny([]string{"disk_size", "disk", "storage"}, extraDetails, source))

	disks := []collectorkit.Disk{}
	if diskGB > 0 {
		disks = append(disks, collectorkit.Disk{Label: "Root", SizeGB: diskGB})
	}

	var publicIP *string
	// address is CIDR notation (confirmed live, e.g. "203.0.113.10/22") —
	// strip the prefix-length suffix before using it as a bare IP.
	if addr := extractFieldAny([]string{"address", "public_ip", "ip_public", "external_ip"}, extraDetails, source); addr != "" {
		ip := strings.SplitN(addr, "/", 2)[0]
		publicIP = &ip
	}

	return collectorkit.Instance{
		ID:           id,
		Name:         name,
		Region:       extractFieldAny([]string{"region", "location", "datacenter", "dc"}, extraDetails, source),
		Status:       mapStatus(extractField(source, "status", "state")),
		InstanceType: extractField(source, "product_name"),
		CPU:          cpu,
		MemoryGB:     memGB,
		Disks:        disks,
		PrivateIP:    extractFieldAny([]string{"private_ip", "ip_private", "internal_ip"}, extraDetails, source),
		PublicIP:     publicIP,
		// date_created confirmed live (e.g. "2023-06-26"), top-level like product_name/
		// category_name — not nested in extra_details like most other fields.
		LaunchedAt: extractFieldAny([]string{"date_created", "created_at", "createdat", "created", "order_date"}, extraDetails, source),
	}
}
