import client from 'prom-client';

// One process-wide registry, scraped via GET /metrics (server.ts). Includes
// prom-client's own default Node process metrics (CPU/memory/event-loop lag)
// plus a generic HTTP counter/histogram populated by server.ts's onResponse
// hook — the same shape duplicated across bff/auth/rbac's own
// lib/metrics.ts rather than shared as a package, matching this codebase's
// existing per-service bootstrap-duplication convention.
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled, labeled by route pattern (not resolved path params) and status code.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds, labeled by route pattern.',
  labelNames: ['method', 'route'] as const,
  registers: [register],
});
