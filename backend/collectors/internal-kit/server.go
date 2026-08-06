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

// HealthHandler backs GET /healthz for container/orchestrator health checks.
func HealthHandler(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// WithTimeout enforces a hard upper bound on every request, independent of
// whatever deadline the Aggregator sets on its own outgoing call — PRD §6.3
// graceful degradation requires a collector to never hang, even if called
// without a client-supplied deadline.
func WithTimeout(h http.Handler, d time.Duration) http.Handler {
	return http.TimeoutHandler(h, d, `{"error":{"code":"TIMEOUT","message":"collector exceeded its own response deadline"}}`)
}
