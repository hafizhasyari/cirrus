// Mirrors frontend/src/types.ts exactly for the public (BFF-facing) shapes.
// Do not let this drift from frontend/src/types.ts — it is the contract the
// later frontend-wiring step will fetch against.

export type ProviderId = 'aws' | 'gcp' | 'alibaba' | 'oci' | 'biznet';

export interface Provider {
  id: ProviderId;
  name: string;
  mono: string;
  color: string;
  bg: string;
  authLabel: string;
}

export interface Disk {
  label: string;
  sizeGB: number;
}

export type VmStatus = 'running' | 'stopped';

export interface Vm {
  id: string;
  name: string;
  provider: ProviderId;
  account: string;
  region: string;
  status: VmStatus;
  type: string;
  cpu: number;
  memory: number;
  disks: Disk[];
  privateIp: string;
  publicIp: string | null;
  launched: string; // "YYYY-MM-DD"
  /** True when this record is a last-known-good cache fallback served because
   * the provider's live fetch just failed (collector down/timed out/etc.). */
  stale?: boolean;
}

/** One provider/connection's fetch failure, from `GET /api/vms`'s `errors` array. */
export interface VmFetchError {
  provider: ProviderId;
  connectionId: string;
  message: string;
  code: string;
}

/** One frame of the NDJSON stream `GET /api/vms` and `POST /api/vms/refresh`
 * send, so the Inventory screen can render each connection's VMs as soon as
 * that connection's fetch settles instead of waiting for every provider. */
export type VmStreamFrame =
  | { type: 'start'; connectionIds: string[] }
  | { type: 'connection'; provider: ProviderId; connectionId: string; vms: Vm[]; error?: VmFetchError }
  | { type: 'done'; refreshedAt: string }
  // Sent periodically while a fetch is still in flight — no state to apply,
  // just proof the connection is alive (helps any idle-timeout-based
  // buffering intermediary between the server and the client flush sooner).
  | { type: 'ping' };

export type ConnectionStatus = 'active' | 'error' | 'expired' | 'pending';

export interface Connection {
  id: string;
  provider: ProviderId;
  account: string;
  identifier: string;
  status: ConnectionStatus;
  lastChecked: string; // ISO timestamp (frontend formats to relative time)
  addedBy: string;
  /** Non-secret field values only — secret fields (FieldDef.secret) live in Vault and are never sent to the client. */
  config: Record<string, unknown>;
}

export type Role = 'admin' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  accounts: string[];
  /** Connection ids backing `accounts` ([] for admin, meaning "all"). */
  connectionIds: string[];
  lastLogin: string; // ISO timestamp or "Never"
  status?: 'pending';
}

export type FieldKind = 'text' | 'textarea' | 'generated';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  value?: string;
  caption?: string;
  /** True for fields that must be routed to Vault (not Postgres) on the
   * backend — e.g. OCI's privateKey/passphrase, Biznet's xToken, AWS's
   * secretAccessKey. Absent or false for non-secret identifiers (accessKeyId,
   * projectId, etc.). */
  secret?: boolean;
}

// ---------------------------------------------------------------------------
// Internal wire formats — NOT part of the frontend contract above.
// Collector <-> Aggregator, and RBAC's internal-only endpoints.
// ---------------------------------------------------------------------------

/** Raw per-instance shape returned by a Go Provider Collector's GET /instances. */
export interface CollectorInstance {
  id: string;
  name: string;
  region: string;
  status: 'running' | 'stopped' | 'terminated';
  instanceType: string;
  cpu: number;
  memoryGB: number;
  disks: Disk[];
  privateIp: string;
  publicIp: string | null;
  launchedAt: string; // ISO datetime
  tags: Record<string, string>;
}

export interface CollectorInstancesResponse {
  connectionId: string;
  provider: ProviderId;
  fetchedAt: string; // ISO datetime
  instances: CollectorInstance[];
}

/** RBAC's internal-only "who do we need to fetch inventory for" listing. */
export interface ActiveConnection {
  connectionId: string;
  provider: ProviderId;
  account: string;
}

/** RBAC's internal-only single-connection lookup — a collector's only path
 * to a connection's provider-specific config (accessKeyId/secretAccessKey,
 * projectId/poolId/providerId/saEmail, ...). Never routed
 * through the Aggregator. */
export interface ConnectionConfigResponse {
  connectionId: string;
  provider: ProviderId;
  account: string;
  identifier: string;
  status: ConnectionStatus;
  config: Record<string, unknown>;
}

/** Identity claims carried by the internal session JWT minted by the Auth Service. */
export interface SessionClaims {
  sub: string; // == oid
  oid: string;
  tid: string;
  name: string;
  preferred_username: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Display labels, e.g. "AWS – prod-infra-01" (or ["All accounts"] for admin). */
  accounts: string[];
  /** Permission scope for filtering: connection ids this user can see ([] for admin, meaning "all"). */
  connectionIds: string[];
}
