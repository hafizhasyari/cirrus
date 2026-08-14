// Lets POST /connections/:id/test inject the currently-typed-but-unsaved
// config for the duration of exactly one collector round trip, without ever
// writing it to Postgres/Vault — only PATCH /connections/:id persists.
// Keyed by a fresh per-call token (not just connectionId) so an unrelated
// caller hitting GET /internal/connections/:id for the same connection at
// the same moment — most notably rbac's own scheduled health-check pass —
// can never pick up an override that wasn't meant for it. Set right before
// calling the collector, cleared right after; the TTL is only a
// crash-safety backstop, not the normal lifecycle.
//
// Single-instance assumption, same as scheduler.ts's already-documented
// one: rbac has exactly one container in docker-compose.yml, no
// replicas/scale anywhere, so an in-memory Map is safe here.
const TTL_MS = 15_000;

interface OverrideEntry {
  token: string;
  config: Record<string, unknown>;
  expiresAt: number;
}

const overrides = new Map<string, OverrideEntry>();

export function setTestOverride(connectionId: string, token: string, config: Record<string, unknown>) {
  overrides.set(connectionId, { token, config, expiresAt: Date.now() + TTL_MS });
}

export function getTestOverride(connectionId: string): OverrideEntry | null {
  const entry = overrides.get(connectionId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    overrides.delete(connectionId);
    return null;
  }
  return entry;
}

export function clearTestOverride(connectionId: string) {
  overrides.delete(connectionId);
}
