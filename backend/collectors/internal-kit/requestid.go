package collectorkit

import (
	"context"
	"net/http"
)

type requestIDKey struct{}

// WithRequestID returns ctx carrying the request id from the incoming
// request's X-Request-Id header (set at the edge by nginx and forwarded
// through bff/rbac), if present. Used by GetConnectionConfig to forward the
// same id on its own outbound call to RBAC, closing that leg of the trace —
// collectors otherwise have no per-request logging of their own to attach
// it to.
func WithRequestID(ctx context.Context, r *http.Request) context.Context {
	if id := r.Header.Get("X-Request-Id"); id != "" {
		return context.WithValue(ctx, requestIDKey{}, id)
	}
	return ctx
}

func requestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}
