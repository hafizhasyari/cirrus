import type { VmStreamFrame } from '@cirrus/shared-types';
import { env } from '../env.js';
import { requestIdStorage } from '../lib/requestContext.js';

async function aggregatorFetch(path: string, init?: RequestInit): Promise<Response> {
  const reqId = requestIdStorage.getStore();
  return fetch(`${env.aggregatorUrl}${path}`, {
    ...init,
    headers: {
      'x-internal-secret': env.internalSharedSecret,
      ...(reqId ? { 'x-request-id': reqId } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/** Reads the Aggregator's NDJSON stream (one JSON frame per line) and invokes
 * `onFrame` for each as it arrives, instead of buffering the whole body. */
export async function streamAggregatorVms(
  path: '/vms' | '/vms/refresh',
  onFrame: (frame: VmStreamFrame) => void,
): Promise<void> {
  const res = await aggregatorFetch(path, path === '/vms/refresh' ? { method: 'POST' } : undefined);
  if (!res.ok || !res.body) throw new Error(`Aggregator ${path} responded ${res.status}`);

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
