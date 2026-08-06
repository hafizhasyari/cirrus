import type { ProviderId, Vm } from '@cirrus/shared-types';
import { env } from '../env.js';

export interface VmWithConnection extends Vm {
  connectionId: string;
}

export interface VmsResult {
  vms: VmWithConnection[];
  errors: { provider: ProviderId; connectionId: string; message: string }[];
}

async function aggregatorFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${env.aggregatorUrl}${path}`, {
    ...init,
    headers: { 'x-internal-secret': env.internalSharedSecret, ...(init?.headers as Record<string, string> | undefined) },
  });
}

export async function getVms(): Promise<VmsResult> {
  const res = await aggregatorFetch('/vms');
  if (!res.ok) throw new Error(`Aggregator /vms responded ${res.status}`);
  return (await res.json()) as VmsResult;
}

export async function refreshVms(): Promise<VmsResult & { refreshedAt: string }> {
  const res = await aggregatorFetch('/vms/refresh', { method: 'POST' });
  if (!res.ok) throw new Error(`Aggregator /vms/refresh responded ${res.status}`);
  return (await res.json()) as VmsResult & { refreshedAt: string };
}
