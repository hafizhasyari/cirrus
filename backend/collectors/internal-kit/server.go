package collectorkit

import (
	"encoding/json"
	"net/http"
	"time"
)

// WriteJSON writes a JSON body with the given status code.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// Version is stamped at build time via each collector's Dockerfile
// (-ldflags "-X cirrus/collectorkit.Version=<VERSION>", sourced from the
// repo root's VERSION file). Left as "dev" for `go run`/`go test`/any build
// that skips the ldflag, so a missing build arg fails soft — an obviously
// wrong value in /healthz — rather than crashing.
var Version = "dev"

// HealthHandler backs GET /healthz for container/orchestrator health checks.
func HealthHandler(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": Version})
}

// WithTimeout enforces a hard upper bound on every request, independent of
// whatever deadline the Aggregator sets on its own outgoing call — PRD §6.3
// graceful degradation requires a collector to never hang, even if called
// without a client-supplied deadline.
func WithTimeout(h http.Handler, d time.Duration) http.Handler {
	return http.TimeoutHandler(h, d, `{"error":{"code":"TIMEOUT","message":"collector exceeded its own response deadline"}}`)
}
