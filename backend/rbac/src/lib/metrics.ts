import client from 'prom-client';

// One process-wide registry, scraped via GET /metrics (server.ts). Includes
// prom-client's own default Node process metrics (CPU/memory/event-loop lag),
// a generic HTTP counter/histogram populated by server.ts's onResponse hook
// (same shape duplicated across bff/auth/aggregator's own lib/metrics.ts),
// plus two RBAC-specific gauges/counters below — these are the metrics that
// actually deliver PRD/TODO's "connection uptime visibility" ask, not just
// generic HTTP traffic shape.
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

// Set wholesale at the end of every health-check pass (scheduler.ts) from a
// fresh group-by over that pass's rows — a Gauge, not a Counter, since this
// represents current state ("how many connections are broken right now"),
// not a running total.
export const connectionsByStatus = new client.Gauge({
  name: 'cirrus_connections_by_status',
  help: 'Current count of stored cloud connections, grouped by provider and status.',
  labelNames: ['provider', 'status'] as const,
  registers: [register],
});

// Incremented inside connectionCheck.ts's runConnectionCheck — the single
// code path shared by the manual POST /connections/:id/test route and the
// scheduled pass — so this captures both trigger sources.
export const connectionCheckTotal = new client.Counter({
  name: 'cirrus_connection_check_total',
  help: 'Total connection health checks run, labeled by provider, trigger source, and result.',
  labelNames: ['provider', 'source', 'result'] as const,
  registers: [register],
});
