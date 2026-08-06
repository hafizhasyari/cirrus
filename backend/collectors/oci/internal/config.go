package internal

// ociConfig mirrors FIELD_DEFS.oci exactly. PrivateKey/Passphrase are
// secret fields already Vault-merged by RBAC by the time this collector
// sees them — never a file path, always the raw PEM/passphrase text.
type ociConfig struct {
	TenancyOCID string `json:"tenancyOcid"`
	UserOCID    string `json:"userOcid"`
	Fingerprint string `json:"fingerprint"`
	PrivateKey  string `json:"privateKey"`
	Region      string `json:"region"`
	Passphrase  string `json:"passphrase"` // optional
}
