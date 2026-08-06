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
  launched: string;
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

export type Screen = 'login' | 'inventory' | 'connections' | 'wizard' | 'users';

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
}

export type WizardResult = 'success' | 'failure' | null;

export interface WizardFormValues {
  [key: string]: string;
}

/** `Provider` plus the wizard/edit-drawer content the backend now serves
 * alongside it (`GET /api/providers?includeFieldDefs=true`). */
export interface ProviderWithFieldDefs extends Provider {
  fieldDefs: FieldDef[];
  checklist: string[];
  failureMessage: string;
}

/** One provider/connection's fetch failure, from `GET /api/vms`'s `errors` array. */
export interface VmFetchError {
  provider: ProviderId;
  connectionId: string;
  message: string;
}

/** `GET /auth/me` response — the logged-in user's identity + permission scope. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  accounts: string[];
  connectionIds: string[];
}
