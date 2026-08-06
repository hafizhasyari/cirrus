// Mirrors frontend/src/types.ts exactly for the public (BFF-facing) shapes.
// Do not let this drift from frontend/src/types.ts — it is the contract the
// later frontend-wiring step will fetch against.

export type ProviderId = 'aws' | 'gcp' | 'alibaba' | 'oci' | 'biznet';

export const PROVIDER_IDS: ProviderId[] = ['aws', 'gcp', 'alibaba', 'oci', 'biznet'];

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
}

export type ConnectionStatus = 'active' | 'error' | 'expired' | 'pending';

export interface Connection {
  id: string;
  provider: ProviderId;
  account: string;
  identifier: string;
  status: ConnectionStatus;
  lastChecked: string; // ISO timestamp (frontend formats to relative time)
  addedBy: string;
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
   * backend — e.g. OCI's privateKey/passphrase, Biznet's xToken. Absent or
   * false for non-secret identifiers (roleArn, projectId, etc.). */
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

export interface CollectorErrorResponse {
  error: {
    code: 'TIMEOUT' | 'UPSTREAM_ERROR' | 'AUTH_FAILED';
    message: string;
  };
}

/** RBAC's internal-only "who do we need to fetch inventory for" listing. */
export interface ActiveConnection {
  connectionId: string;
  provider: ProviderId;
  account: string;
}

/** RBAC's internal-only single-connection lookup — a collector's only path
 * to a connection's provider-specific config (roleArn/externalId,
 * roleArn/regionId, projectId/poolId/providerId/saEmail, ...). Never routed
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
