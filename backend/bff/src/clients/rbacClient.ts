import type { AuthenticatedUser, Connection, Provider, User } from '@cirrus/shared-types';
import { env } from '../env.js';

async function rbacFetch(path: string, init?: RequestInit & { actorUserId?: string | null }): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-internal-secret': env.internalSharedSecret,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.actorUserId) headers['x-actor-user-id'] = init.actorUserId;

  return fetch(`${env.rbacUrl}${path}`, { ...init, headers });
}

export async function whoami(oid: string, tid: string): Promise<AuthenticatedUser | null> {
  const res = await rbacFetch(`/internal/whoami?oid=${encodeURIComponent(oid)}&tid=${encodeURIComponent(tid)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RBAC whoami responded ${res.status}`);
  return (await res.json()) as AuthenticatedUser;
}

export async function listUsers(): Promise<User[]> {
  const res = await rbacFetch('/users');
  if (!res.ok) throw new Error(`RBAC list users responded ${res.status}`);
  return (await res.json()) as User[];
}

export async function inviteUser(body: unknown, actorUserId: string): Promise<Response> {
  return rbacFetch('/users', { method: 'POST', body: JSON.stringify(body), actorUserId });
}

export async function updateUser(id: string, body: unknown, actorUserId: string): Promise<Response> {
  return rbacFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body), actorUserId });
}

export async function deleteUser(id: string, actorUserId: string): Promise<Response> {
  return rbacFetch(`/users/${id}`, { method: 'DELETE', actorUserId });
}

export async function listConnections(): Promise<Connection[]> {
  const res = await rbacFetch('/connections');
  if (!res.ok) throw new Error(`RBAC list connections responded ${res.status}`);
  return (await res.json()) as Connection[];
}

export async function createConnection(body: unknown, actorUserId: string): Promise<Response> {
  return rbacFetch('/connections', { method: 'POST', body: JSON.stringify(body), actorUserId });
}

export async function updateConnection(id: string, body: unknown, actorUserId: string): Promise<Response> {
  return rbacFetch(`/connections/${id}`, { method: 'PATCH', body: JSON.stringify(body), actorUserId });
}

export async function deleteConnection(id: string, actorUserId: string): Promise<Response> {
  return rbacFetch(`/connections/${id}`, { method: 'DELETE', actorUserId });
}

export async function testConnection(id: string, body: unknown, actorUserId: string): Promise<Response> {
  return rbacFetch(`/connections/${id}/test`, { method: 'POST', body: JSON.stringify(body ?? {}), actorUserId });
}

export async function listProviders(includeFieldDefs: boolean): Promise<Provider[]> {
  const res = await rbacFetch(`/providers${includeFieldDefs ? '?includeFieldDefs=true' : ''}`);
  if (!res.ok) throw new Error(`RBAC list providers responded ${res.status}`);
  return (await res.json()) as Provider[];
}
