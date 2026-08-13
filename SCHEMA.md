# SCHEMA.md

Structured reference for every persisted/transmitted data shape in Cirrus — PostgreSQL, Redis, HashiCorp Vault KV v2, and the frontend/backend type contract (`shared-types`). `PRD.md` is the source of truth for product scope/architecture and `CLAUDE.md` for implementation history; this document is the data-shape reference the two don't spell out in one place.

## 1. Overview

| Store | Sole owner | Purpose |
|---|---|---|
| PostgreSQL | `rbac` | App metadata system-of-record: users, cloud connections, RBAC join table, audit log. |
| Redis | `aggregator` | VM inventory cache (per connection) + cache-stampede lock. Never touched by any other service. |
| Vault KV v2 | `rbac` (sole client) | Per-connection secret credential fields only (never the non-secret fields, which stay in Postgres). |

**VM instance data is never persisted to PostgreSQL.** It is fetched live from a Provider Collector on demand, cached transiently in Redis (§3), and streamed to the frontend (§5) — Postgres only ever stores connection *metadata* (§2).

## 2. PostgreSQL (`rbac/src/db/schema.ts`)

Relations are expressed only via `.references()` FK builders — no Drizzle `relations()` helper is used anywhere in this schema.

### Enums

```
role               = 'admin' | 'viewer'
user_status        = 'pending' | 'active' | 'disabled'
provider_id        = 'aws' | 'gcp' | 'alibaba' | 'oci' | 'biznet'
connection_status  = 'pending' | 'active' | 'error' | 'expired'
```

### `users`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `defaultRandom()` | PK |
| `oid` | text | yes | — | Entra ID object id; null until first SSO login |
| `tid` | text | yes | — | Entra ID tenant id |
| `email` | text | no | — | No DB-level unique constraint — see index below |
| `name` | text | no | `''` | |
| `role` | role | no | `'viewer'` | |
| `status` | user_status | no | `'pending'` | |
| `last_login_at` | timestamp (tz) | yes | — | |
| `created_at` | timestamp (tz) | no | `defaultNow()` | |
| `updated_at` | timestamp (tz) | no | `defaultNow()` | |

Indexes:
- `users_email_lower_idx` — unique btree on `lower(email)` (case-insensitive uniqueness; app code does case-insensitive lookups instead of using `citext`)
- `users_oid_tid_not_null_idx` — unique btree on `(oid, tid)` **partial**, `WHERE oid IS NOT NULL`

### `cloud_connections`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `defaultRandom()` | PK |
| `provider` | provider_id | no | — | |
| `account` | text | no | — | |
| `identifier` | text | no | — | Human-readable label; not the raw first config field (see `CLAUDE.md`'s GCP edit-form bug note) |
| `config` | jsonb | no | `{}` | **Non-secret** field values only |
| `secret_ref` | text | yes | — | Vault KV v2 path (`cirrus/connections/{id}`); null when provider has no secret fields (GCP, and Alibaba's non-secret fields) |
| `status` | connection_status | no | `'pending'` | |
| `last_checked_at` | timestamp (tz) | yes | — | |
| `last_check_message` | text | yes | — | |
| `added_by_user_id` | uuid | yes | — | FK → `users.id`, `ON DELETE NO ACTION` |
| `created_at` | timestamp (tz) | no | `defaultNow()` | |
| `updated_at` | timestamp (tz) | no | `defaultNow()` | |

No indexes beyond PK/FK.

### `user_cloud_accounts` (join table)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `user_id` | uuid | no | FK → `users.id`, `ON DELETE CASCADE` |
| `connection_id` | uuid | no | FK → `cloud_connections.id`, `ON DELETE CASCADE` |

Composite PK `(user_id, connection_id)` — no surrogate `id`. Scopes a Viewer to specific connections; an Admin's visibility isn't rows here, it's role-checked in app code.

### `audit_log`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `defaultRandom()` | PK |
| `actor_user_id` | uuid | yes | — | FK → `users.id`, `ON DELETE NO ACTION`; null for scheduled/system-driven entries |
| `action` | text | no | — | e.g. `connection_test` |
| `target_type` | text | no | — | |
| `target_id` | uuid | yes | — | Polymorphic — **no FK constraint** |
| `metadata` | jsonb | no | `{}` | e.g. `{ source: 'manual' | 'scheduled' }` on `connection_test` |
| `created_at` | timestamp (tz) | no | `defaultNow()` | Append-only; no `updated_at` |

### Migrations

Single migration: `backend/rbac/src/db/migrations/0000_typical_sage.sql` — matches `schema.ts` exactly (same 4 `CREATE TYPE` enums, 4 tables, all FKs, both `users` indexes reproduced verbatim). No drift, no hand-added SQL beyond Drizzle Kit's own generated output.

### Seed (`backend/rbac/src/db/seed.ts`)

Idempotently bootstraps exactly **one** Admin row on every container start:
- `adminEmail` = `SEED_ADMIN_EMAIL` env var, default `admin@example.com`
- `adminName` = `SEED_ADMIN_NAME` env var, default `Administrator`
- Looked up via `lower(email) = lower(adminEmail)` (a plain `ON CONFLICT (email)` can't target an expression index)
- If absent, inserts `{ email, name, role: 'admin', status: 'pending' }` — `oid`/`tid` left null until first real Entra login
- No other table is seeded (no sample connections)

## 3. Redis (`aggregator/src/cache/lock.ts`)

### Key schemes

```
inventory:{provider}:{connectionId}       # cache key
lock:inventory:{provider}:{connectionId}  # stampede lock key
```

### `CacheEntry` (JSON string stored under the cache key)

```ts
interface CacheEntry {
  instances: CollectorInstance[];
  fetchedAt: number;
  error?: { code: string; message: string }; // only set on stale-fallback-after-failed-refetch
}
```

Staleness is inferred by comparing `Date.now() - fetchedAt` against the TTLs below — there is no stored boolean flag in Redis itself (the frontend-facing `Vm.stale` flag, §5, is derived downstream).

### TTL / timing constants

| Constant | Value | Purpose |
|---|---|---|
| `SOFT_TTL_MS` | 3 min | Freshness window — below this, skip refetch and serve cache as-is |
| `HARD_TTL_MS` | 15 min | Actual Redis `PX` expiry on the cache key |
| `LOCK_TTL_MS` | 55 s | Redis `PX` expiry on the lock key |
| `COLD_START_POLL_MS` | 150 ms | Poll interval for a lock loser with no cache to fall back on |
| `COLD_START_MAX_WAIT_MS` | 55 s | Max wait before a cold-start waiter throws `CollectorError('TIMEOUT')` |
| `COLLECTOR_TIMEOUT_MS` | 50 s | Abort timeout for the actual collector fetch |

Invariant: `LOCK_TTL_MS`, `COLD_START_MAX_WAIT_MS`, and `COLLECTOR_TIMEOUT_MS` must all stay ≥ the real fetch time so the lock can't be considered stale while a fetch is still legitimately in flight.

### Stampede lock mechanism

1. On cache miss/stale, generate `token = randomUUID()` and attempt `SET lockKey token NX PX LOCK_TTL_MS`.
2. **Winner** (`gotLock === 'OK'`): fetches from the collector, writes the fresh `CacheEntry` via `SET cacheKey <json> PX HARD_TTL_MS`, and always releases the lock in a `finally` via a Lua compare-and-delete script so it never deletes a lock it doesn't own:
   ```lua
   if redis.call("get", KEYS[1]) == ARGV[1] then
     return redis.call("del", KEYS[1])
   else
     return 0
   end
   ```
3. **Loser**: returns existing stale cache if any exists; otherwise polls every `COLD_START_POLL_MS` until the cache key appears or the lock key disappears, up to `COLD_START_MAX_WAIT_MS`, else throws `CollectorError('TIMEOUT')`.

A genuine fetch failure by the lock winner (not just "lost the lock") also falls back to re-reading the existing Redis entry (untouched `fetchedAt`/TTL) and returns it tagged with `CacheEntry.error`, rather than dropping that connection's VMs entirely.

## 4. HashiCorp Vault KV v2 (`rbac/src/lib/vault.ts`) — sole client: `rbac`

### Path scheme

- Per-connection secret path: `cirrus/connections/{id}`, under the `secret/` KV v2 mount.
- Read/write: `secret/data/cirrus/connections/{id}`
- Delete (metadata): `secret/metadata/cirrus/connections/{id}`
- Postgres's `cloud_connections.secret_ref` stores this exact path string; null when the provider has no secret fields at all.

### `cirrus-rbac` policy (`vault/entrypoint.sh`)

```hcl
path "secret/data/cirrus/connections/*" {
  capabilities = ["create", "read", "update", "delete"]
}
path "secret/metadata/cirrus/connections/*" {
  capabilities = ["delete"]
}
```

### Mount & token provisioning

- KV v2 engine enabled at the default `secret/` mount: `vault secrets enable -path=secret kv-v2`
- RBAC's own token, minted idempotently on every boot:
  ```
  vault token create -id="$CIRRUS_RBAC_TOKEN" -orphan -policy=cirrus-rbac -no-default-policy -ttl=87600h
  ```
  (~10 years, no renewal job — `config.hcl` raises `max_lease_ttl = "87600h"` system-wide to accommodate it)
- RBAC authenticates with `VAULT_TOKEN`/`VAULT_ADDR` env vars — never the Vault root token.

### Per-provider secret fields (`rbac/src/data/providers.ts`, `FieldDef.secret`)

| Provider | Vault-backed (secret) | Postgres-backed (non-secret) |
|---|---|---|
| aws | `secretAccessKey` | `accessKeyId` |
| gcp | *(none — Workload Identity Federation)* | `projectId`, `poolId`, `providerId`, `saEmail` |
| alibaba | `secretAccessKey` | `accessKeyId` |
| oci | `privateKey`, `passphrase` | `tenancyOcid`, `userOcid`, `fingerprint`, `region` |
| biznet | `xToken` (only field) | *(none)* |

## 5. Shared type contract (`backend/shared-types/src/index.ts` ⇄ `frontend/src/types.ts`)

Both files mirror each other exactly for every shared type. The only differences are types present in one file and absent from the other — no conflicting shapes:

- **Frontend-only** (UI-local): `Theme`, `WizardResult`, `WizardFormValues`, `ProviderWithFieldDefs` (`Provider` + `fieldDefs`/`setupGuide`/`failureMessage`)
- **Backend-only/internal**: `CollectorInstance`, `CollectorInstancesResponse`, `ActiveConnection`, `ConnectionConfigResponse`, `SessionClaims`

### Core shared types

```ts
type ProviderId = 'aws' | 'gcp' | 'alibaba' | 'oci' | 'biznet';

interface Provider {
  id: ProviderId; name: string; mono: string; color: string; bg: string; authLabel: string;
}

interface FieldDef {
  key: string; label: string; placeholder?: string;
  kind: 'text' | 'textarea' | 'generated';
  value?: string; caption?: string;
  secret?: boolean; // Vault-routed field — never sent to the client as a value
}

type VmStatus = 'running' | 'stopped';

interface Disk { label: string; sizeGB: number; }

interface Vm {
  id: string; name: string; provider: ProviderId; account: string; region: string;
  status: VmStatus; type: string; cpu: number; memory: number; disks: Disk[];
  privateIp: string; publicIp: string | null; launched: string; // "YYYY-MM-DD"
  stale?: boolean; // true = last-known-good cache fallback served after a live fetch failure
}

interface VmFetchError {
  provider: ProviderId; connectionId: string; message: string; code: string;
}

// NDJSON stream frame — one per line from GET /api/vms and POST /api/vms/refresh
type VmStreamFrame =
  | { type: 'start'; connectionIds: string[] }
  | { type: 'connection'; provider: ProviderId; connectionId: string; vms: Vm[]; error?: VmFetchError }
  | { type: 'done'; refreshedAt: string }
  | { type: 'ping' };

type ConnectionStatus = 'active' | 'error' | 'expired' | 'pending';

interface Connection {
  id: string; provider: ProviderId; account: string; identifier: string;
  status: ConnectionStatus; lastChecked: string; addedBy: string;
  config: Record<string, unknown>; // non-secret fields only — secrets never leave Vault
}

type Role = 'admin' | 'viewer';

interface User {
  id: string; name: string; email: string; role: Role;
  accounts: string[];
  connectionIds: string[]; // [] for admin, meaning "all"
  lastLogin: string;
  status?: 'pending';
}

// GET /auth/me response
interface AuthenticatedUser {
  id: string; name: string; email: string; role: Role;
  accounts: string[]; connectionIds: string[];
}

interface AppConfig {
  healthCheckIntervalSeconds: number;
}
```

## 6. How the pieces fit together

- A connection's **non-secret** fields live in `cloud_connections.config` (Postgres, §2); its **secret** fields live in Vault at `secret_ref` (§4). `rbac/src/routes/internal.ts` merges both into the `ConnectionConfigResponse` a Provider Collector receives via `GET /internal/connections/:id` — a collector never knows or cares which store a field came from.
- A `Vm` returned by a collector's `GET /instances` is cached in Redis under `inventory:{provider}:{connectionId}` (§3) and streamed to the frontend as a `connection` `VmStreamFrame` (§5) via `GET /api/vms`/`POST /api/vms/refresh` — it is **never** written to Postgres.
- `Connection.status`/`lastChecked`/`lastCheckMessage` (Postgres, §2) are updated by both the manual `POST /api/connections/:id/test` route and the periodic health-check scheduler (`rbac/src/scheduler.ts`), which also writes an `audit_log` row per check with `metadata.source: 'manual' | 'scheduled'`.
- `User.connectionIds` (§5) is the frontend-facing projection of the `user_cloud_accounts` join table (§2) — empty array means Admin ("all"), non-empty means a Viewer scoped to those specific connections.
