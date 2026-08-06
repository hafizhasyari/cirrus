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
  lastLogin: string;
  status?: 'pending';
}

export type Theme = 'light' | 'dark';

export type Screen = 'login' | 'inventory' | 'connections' | 'wizard' | 'users';

export type InventoryView = 'default' | 'loading' | 'empty' | 'outage';

export type ConnectionsView = 'default' | 'empty';

export type FieldKind = 'text' | 'textarea' | 'generated';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  value?: string;
  caption?: string;
}

export type WizardResult = 'success' | 'failure' | null;

export interface WizardFormValues {
  [key: string]: string;
}
