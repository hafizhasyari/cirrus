package internal

import "errors"

// Sentinel errors cmd/main.go classifies into the collector's ErrorBody.Code
// vocabulary ("AUTH_FAILED" | "UPSTREAM_ERROR").
var (
	ErrAuthFailed = errors.New("aws collector: authentication/authorization failed")
	ErrUpstream   = errors.New("aws collector: upstream error")
)
