package internal

import "errors"

// Sentinel errors cmd/main.go classifies into the collector's ErrorBody.Code
// vocabulary ("AUTH_FAILED" | "UPSTREAM_ERROR").
var (
	ErrAuthFailed = errors.New("alibaba collector: authentication/authorization failed")
	ErrUpstream   = errors.New("alibaba collector: upstream error")
)
