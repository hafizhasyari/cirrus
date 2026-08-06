package internal

// gcpConfig mirrors FIELD_DEFS.gcp's per-connection fields. ProjectNumber is
// keyed "projectId" in the stored config for historical/UI reasons, but
// WIF's audience format requires the numeric Project Number, not the
// project ID string — the field's label/caption were corrected on the RBAC
// side to make this clear to whoever fills the form in.
type gcpConfig struct {
	ProjectNumber string `json:"projectId"`
	PoolID        string `json:"poolId"`
	ProviderID    string `json:"providerId"`
	SAEmail       string `json:"saEmail"`
}
