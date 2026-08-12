import type {
  AppConfig,
  AuthenticatedUser,
  Connection,
  ProviderId,
  ProviderWithFieldDefs,
  Role,
  User,
  VmStreamFrame,
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

export const getMe = () => request<AuthenticatedUser>('/auth/me');
export const logout = () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' });

/** Reads the BFF's NDJSON stream (one JSON frame per line) and invokes
 * `onFrame` for each as it arrives, instead of buffering the whole body —
 * lets the Inventory screen render each connection's VMs as soon as that
 * connection's fetch settles rather than waiting for every provider. */
async function streamVms(
  path: '/api/vms' | '/api/vms/refresh',
  onFrame: (frame: VmStreamFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, { method: path.endsWith('/refresh') ? 'POST' : 'GET', credentials: 'same-origin', signal });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onFrame(JSON.parse(line) as VmStreamFrame);
    }
  }
  const rest = buffer.trim();
  if (rest) onFrame(JSON.parse(rest) as VmStreamFrame);
}

export const getVmsStream = (onFrame: (frame: VmStreamFrame) => void, signal?: AbortSignal) =>
  streamVms('/api/vms', onFrame, signal);
export const refreshVmsStream = (onFrame: (frame: VmStreamFrame) => void) => streamVms('/api/vms/refresh', onFrame);

export const getProviders = (includeFieldDefs = true) =>
  request<ProviderWithFieldDefs[]>(`/api/providers?includeFieldDefs=${includeFieldDefs}`);

export const getConfig = () => request<AppConfig>('/api/config');

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
