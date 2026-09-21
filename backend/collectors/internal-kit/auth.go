package collectorkit

import "net/http"

// RequireInternalSecret rejects any request whose X-Internal-Secret header
// doesn't match secret — the collector-side counterpart of every Node
// service's internalAuth.ts onRequest hook. Collectors previously had no
// equivalent check at all, so anything reachable on the Docker network could
// call /instances or /test directly, bypassing bff's session check and
// rbac's per-user connection scoping entirely.
func RequireInternalSecret(secret string, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Secret") != secret {
			WriteJSON(w, http.StatusUnauthorized, ErrorResponse{
				Error: ErrorBody{Code: "UNAUTHORIZED", Message: "missing or invalid X-Internal-Secret"},
			})
			return
		}
		h.ServeHTTP(w, r)
	})
}
