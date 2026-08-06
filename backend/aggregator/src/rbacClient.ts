import type { ActiveConnection } from '@cirrus/shared-types';
import { env } from './env.js';

export async function getActiveConnections(): Promise<ActiveConnection[]> {
  const res = await fetch(`${env.rbacUrl}/internal/connections?status=active`, {
    headers: { 'x-internal-secret': env.internalSharedSecret },
  });
  if (!res.ok) throw new Error(`RBAC internal/connections responded ${res.status}`);
  return (await res.json()) as ActiveConnection[];
}
