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

export type VmSortColumn = 'name' | 'provider' | 'account' | 'region' | 'status' | 'type' | 'cpu' | 'memory' | 'disk' | 'ip';

export type UserColumnKey = 'user' | 'role' | 'lastLogin';

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
  launched: string;
  /** True when this record is a last-known-good cache fallback served because
   * the provider's live fetch just failed (collector down/timed out/etc.). */
  stale?: boolean;
  /** Sub-service within `provider` — e.g. AWS's `'lightsail'` vs. plain EC2
   * (omitted). Omitted for every other case today. */
  service?: string;
}

export type ConnectionStatus = 'active' | 'error' | 'expired' | 'pending';

export interface Connection {
  id: string;
  provider: ProviderId;
  account: string;
  identifier: string;
  status: ConnectionStatus;
  lastChecked: string;
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
  lastLogin: string;
  status?: 'pending';
}

export type Theme = 'light' | 'dark';

export type FieldKind = 'text' | 'textarea' | 'generated';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  value?: string;
  caption?: string;
  /** True for fields routed to Vault (not Postgres) on the backend. Purely
   * informational on the frontend — `kind: 'textarea'` already drives the
   * masked-input rendering these fields need. */
  secret?: boolean;
  /** True if the field may be left blank — e.g. OCI's passphrase. Absent or
   * false means the field is required. */
  optional?: boolean;
}

export type WizardResult = 'success' | 'failure' | null;

export interface WizardFormValues {
  [key: string]: string;
}

/** `Provider` plus the wizard/edit-drawer content the backend now serves
 * alongside it (`GET /api/providers?includeFieldDefs=true`). */
export interface ProviderWithFieldDefs extends Provider {
  fieldDefs: FieldDef[];
  setupGuide: string[];
  failureMessage: string;
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

/** `GET /auth/me` response — the logged-in user's identity + permission scope. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  accounts: string[];
  connectionIds: string[];
}

/** Small global app config the frontend needs to render accurately — e.g. the
 * Connections screen's "re-validated automatically" copy. */
export interface AppConfig {
  healthCheckIntervalSeconds: number;
}
