package internal

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"

	"github.com/oracle/oci-go-sdk/v65/common"
)

// buildConfigProvider constructs an OCI ConfigurationProvider directly from
// the connection's raw config values — never a file path, since Vault-merged
// secrets arrive as in-memory strings. Pre-validates the private key so a
// malformed key produces a clean AUTH_FAILED immediately, rather than
// falling through to a generic error when the SDK lazily fails at
// first-request signing time.
func buildConfigProvider(cfg ociConfig) (common.ConfigurationProvider, error) {
	if cfg.TenancyOCID == "" || cfg.UserOCID == "" || cfg.Fingerprint == "" || cfg.PrivateKey == "" || cfg.Region == "" {
		return nil, fmt.Errorf("%w: missing required OCI config field(s)", ErrAuthFailed)
	}

	if err := validatePEMKey(cfg.PrivateKey, cfg.Passphrase != ""); err != nil {
		return nil, fmt.Errorf("%w: invalid private key: %v", ErrAuthFailed, err)
	}

	var passphrase *string
	if cfg.Passphrase != "" {
		passphrase = &cfg.Passphrase
	}

	return common.NewRawConfigurationProvider(cfg.TenancyOCID, cfg.UserOCID, cfg.Region, cfg.Fingerprint, cfg.PrivateKey, passphrase), nil
}

// validatePEMKey does a best-effort sanity check. When the key is
// passphrase-encrypted we only confirm it's a well-formed PEM block — fully
// decrypting PKCS1/PKCS8-encrypted keys client-side to pre-validate would
// need Go's deprecated x509.DecryptPEMBlock (traditional format only, not
// PKCS8-encrypted), so an encrypted key's real validity is left to the SDK's
// own lazy signing-time check instead of a possibly-wrong pre-check here.
func validatePEMKey(key string, encrypted bool) error {
	block, _ := pem.Decode([]byte(key))
	if block == nil {
		return fmt.Errorf("not a valid PEM block")
	}
	if encrypted {
		return nil
	}
	if _, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return nil
	}
	if _, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		return nil
	}
	return fmt.Errorf("unrecognized private key format (expected PKCS1 or PKCS8)")
}
