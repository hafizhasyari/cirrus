import type {
  AuthenticatedUser,
  Connection,
  ProviderId,
  ProviderWithFieldDefs,
  Role,
  User,
  Vm,
  VmFetchError,
} from '../types';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only set content-type when there's an actual body — Fastify's JSON body
  // parser 400s on an empty body when this header is present (affects the
  // no-body POSTs like /api/vms/refresh and /auth/logout).
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body !== undefined && headers['content-type'] === undefined) {
    headers['content-type'] = 'application/json';
  }

  const res = await fetch(path, { ...init, credentials: 'same-origin', headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface VmsResponse {
  vms: Vm[];
  errors: VmFetchError[];
}

export const getMe = () => request<AuthenticatedUser>('/auth/me');
export const logout = () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' });

export const getVms = () => request<VmsResponse>('/api/vms');
export const refreshVms = () => request<VmsResponse & { refreshedAt: string }>('/api/vms/refresh', { method: 'POST' });

export const getProviders = (includeFieldDefs = true) =>
  request<ProviderWithFieldDefs[]>(`/api/providers?includeFieldDefs=${includeFieldDefs}`);

export const getConnections = () => request<Connection[]>('/api/connections');

export const createConnection = (body: {
  provider: ProviderId;
  account: string;
  identifier: string;
  config?: Record<string, unknown>;
}) => request<Connection>('/api/connections', { method: 'POST', body: JSON.stringify(body) });

export const updateConnection = (
  id: string,
  body: Partial<{ account: string; identifier: string; config: Record<string, unknown> }>,
) => request<Connection>(`/api/connections/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteConnection = (id: string) => request<void>(`/api/connections/${id}`, { method: 'DELETE' });

export const testConnection = (id: string) =>
  request<{ result: 'success' } | { result: 'failure'; message: string }>(`/api/connections/${id}/test`, {
    method: 'POST',
  });

export const getUsers = () => request<User[]>('/api/users');

export const createUser = (body: { name: string; email: string; role: Role; accountConnectionIds?: string[] }) =>
  request<User>('/api/users', { method: 'POST', body: JSON.stringify(body) });

export const updateUser = (
  id: string,
  body: Partial<{ name: string; email: string; role: Role; accountConnectionIds: string[] }>,
) => request<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteUser = (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' });
