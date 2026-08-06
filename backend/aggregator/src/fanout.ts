import type { ProviderId } from '@cirrus/shared-types';
import { fetchInstancesCached } from './cache/lock.js';
import { normalizeInstance, type VmWithConnection } from './normalize.js';
import { getActiveConnections } from './rbacClient.js';

export interface FetchError {
  provider: ProviderId;
  connectionId: string;
  message: string;
}

export interface FetchAllResult {
  vms: VmWithConnection[];
  errors: FetchError[];
}

/**
 * Fans out to every active connection across all 5 providers in parallel —
 * the Node-side equivalent of the Go collectors' errgroup.WithContext pattern
 * (PRD §6.3 graceful degradation): one connection/provider failing never
 * blanks out the rest.
 */
export async function fetchAllVms(opts: { forceRefresh?: boolean } = {}): Promise<FetchAllResult> {
  const connections = await getActiveConnections();

  const settled = await Promise.allSettled(
    connections.map((conn) => fetchInstancesCached(conn, opts.forceRefresh ?? false)),
  );

  const vms: VmWithConnection[] = [];
  const errors: FetchError[] = [];

  settled.forEach((result, index) => {
    const conn = connections[index];
    if (!conn) return;
    if (result.status === 'fulfilled') {
      vms.push(...result.value.instances.map((instance) => normalizeInstance(instance, conn)));
    } else {
      errors.push({ provider: conn.provider, connectionId: conn.connectionId, message: String(result.reason) });
    }
  });

  return { vms, errors };
}
