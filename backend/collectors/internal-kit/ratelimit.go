package collectorkit

import (
	"net/http"

	"golang.org/x/time/rate"
)

// RateLimit bounds total request throughput to this collector process —
// defense-in-depth against a runaway or abusive caller (even one holding a
// valid X-Internal-Secret) hammering the collector, not a limit tuned to
// reject legitimate traffic. A real inventory refresh can legitimately fire
// several concurrent /instances calls to the same collector (one per
// connection using that provider), so callers should size the limiter's
// burst generously.
func RateLimit(limiter *rate.Limiter, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			WriteJSON(w, http.StatusTooManyRequests, ErrorResponse{
				Error: ErrorBody{Code: "RATE_LIMITED", Message: "collector is receiving requests too fast, try again shortly"},
			})
			return
		}
		h.ServeHTTP(w, r)
	})
}
