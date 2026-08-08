import type { ActiveConnection, VmFetchError } from '@cirrus/shared-types';
import { CollectorError, fetchInstancesCached } from './cache/lock.js';
import { normalizeInstance, type VmWithConnection } from './normalize.js';

export interface ConnectionResult {
  provider: ActiveConnection['provider'];
  connectionId: string;
  vms: VmWithConnection[];
  error?: VmFetchError;
}

/**
 * Fans out to every active connection across all 5 providers in parallel —
 * the Node-side equivalent of the Go collectors' errgroup.WithContext pattern
 * (PRD §6.3 graceful degradation): one connection/provider failing never
 * blocks the rest. Unlike the old Promise.allSettled-then-collect version,
 * each connection's result is handed to `onResult` the moment it settles
 * (success, stale-cache fallback with an error, or a hard failure) instead of
 * waiting for every connection to finish — this is what lets callers stream
 * per-connection results out to the client as they arrive.
 */
export function fanOutVms(
  connections: ActiveConnection[],
  forceRefresh: boolean,
  onResult: (result: ConnectionResult) => void,
): Promise<void> {
  return Promise.allSettled(
    connections.map(async (conn) => {
      try {
        const { instances, error } = await fetchInstancesCached(conn, forceRefresh);
        const vms = instances.map((instance) => normalizeInstance(instance, conn, Boolean(error)));
        onResult({
          provider: conn.provider,
          connectionId: conn.connectionId,
          vms,
          ...(error
            ? { error: { provider: conn.provider, connectionId: conn.connectionId, message: error.message, code: error.code } }
            : {}),
        });
      } catch (err) {
        const code = err instanceof CollectorError ? err.code : 'UPSTREAM_ERROR';
        const message = err instanceof Error ? err.message : String(err);
        onResult({
          provider: conn.provider,
          connectionId: conn.connectionId,
          vms: [],
          error: { provider: conn.provider, connectionId: conn.connectionId, message, code },
        });
      }
    }),
  ).then(() => undefined);
}
