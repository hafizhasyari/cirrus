package internal

import "errors"

// Sentinel errors cmd/main.go classifies into the collector's ErrorBody.Code
// vocabulary ("AUTH_FAILED" | "UPSTREAM_ERROR").
var (
	ErrAuthFailed = errors.New("oci collector: authentication/authorization failed")
	ErrUpstream   = errors.New("oci collector: upstream error")
)
