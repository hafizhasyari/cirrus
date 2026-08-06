package internal

import "errors"

// Sentinel errors cmd/main.go classifies into the collector's ErrorBody.Code
// vocabulary ("AUTH_FAILED" | "UPSTREAM_ERROR").
var (
	ErrAuthFailed = errors.New("gcp collector: authentication/authorization failed")
	ErrUpstream   = errors.New("gcp collector: upstream error")
)
