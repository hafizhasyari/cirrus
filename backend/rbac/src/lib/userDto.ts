import type { AuthenticatedUser, User } from '@cirrus/shared-types';
import { PROVIDERS } from '../data/providers.js';
import type { cloudConnections, users } from '../db/schema.js';

type UserRow = typeof users.$inferSelect;
type ConnectionRow = typeof cloudConnections.$inferSelect;

function accountLabel(conn: ConnectionRow): string {
  const provider = PROVIDERS.find((p) => p.id === conn.provider);
  return `${provider?.name ?? conn.provider} – ${conn.account}`;
}

export function toUserDto(user: UserRow, assignedConnections: ConnectionRow[]): User {
  const accounts = user.role === 'admin' ? ['All accounts'] : assignedConnections.map(accountLabel);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    accounts,
    lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString() : 'Never',
    ...(user.status === 'pending' ? { status: 'pending' as const } : {}),
  };
}

export function toAuthenticatedUser(user: UserRow, assignedConnections: ConnectionRow[]): AuthenticatedUser {
  const accounts = user.role === 'admin' ? ['All accounts'] : assignedConnections.map(accountLabel);
  const connectionIds = user.role === 'admin' ? [] : assignedConnections.map((c) => c.id);
  return { id: user.id, name: user.name, email: user.email, role: user.role, accounts, connectionIds };
}
