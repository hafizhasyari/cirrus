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

// hasSpecFields reports whether a list item already carries usable
// cpu/memory data, deciding whether the vm-details fallback call is needed.
func hasSpecFields(raw json.RawMessage) bool {
	return extractField(raw, "cpu", "vcpu") != "" || extractField(raw, "memory", "ram") != ""
}

func instanceID(raw json.RawMessage) string {
	return extractField(raw, "id", "account_id", "vm_id")
}

// mapInstance builds a collectorkit.Instance from whichever source has data
// — prefers detail (if fetched) over the thinner list item — prefixing
// InstanceType with productLabel ("NEO Lite "/"NEO Lite Pro ") so the merge
// across both product lines stays visually distinguishable, matching the
// stub's existing convention.
func mapInstance(listRaw, detailRaw json.RawMessage, productLabel string) collectorkit.Instance {
	source := listRaw
	if detailRaw != nil {
		source = detailRaw
	}

	id := instanceID(source)
	name := extractField(source, "name", "hostname", "vm_name", "display_name")
	if name == "" {
		name = id
	}

	cpu, _ := strconv.Atoi(extractField(source, "cpu", "vcpu"))
	memGB, _ := strconv.ParseFloat(extractField(source, "memory", "ram"), 64)
	diskGB, _ := strconv.Atoi(extractField(source, "disk", "storage", "disk_size"))

	disks := []collectorkit.Disk{}
	if diskGB > 0 {
		disks = append(disks, collectorkit.Disk{Label: "Root", SizeGB: diskGB})
	}

	var publicIP *string
	if ip := extractField(source, "public_ip", "ip_public", "external_ip"); ip != "" {
		publicIP = &ip
	}

	return collectorkit.Instance{
		ID:           id,
		Name:         name,
		Region:       extractField(source, "region", "location", "datacenter", "dc"),
		Status:       mapStatus(extractField(source, "status", "state")),
		InstanceType: productLabel,
		CPU:          cpu,
		MemoryGB:     memGB,
		Disks:        disks,
		PrivateIP:    extractField(source, "private_ip", "ip_private", "internal_ip"),
		PublicIP:     publicIP,
		LaunchedAt:   extractField(source, "created_at", "createdat", "created", "order_date"),
		Tags:         map[string]string{},
	}
}
