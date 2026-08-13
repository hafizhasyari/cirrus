import { env } from '../env.js';
import { requestIdStorage } from './requestContext.js';

// Plain fetch against Vault's KV v2 HTTP API — no client library, matching
// this codebase's existing pattern of plain fetch for all inter-service
// calls. RBAC is the sole Vault client in this stack; collectors never talk
// to Vault directly (see routes/internal.ts, which merges secrets in
// transparently before returning a connection's config).

function headers(): Record<string, string> {
  const reqId = requestIdStorage.getStore();
  return {
    'X-Vault-Token': env.vaultToken,
    'Content-Type': 'application/json',
    ...(reqId ? { 'x-request-id': reqId } : {}),
  };
}

/** Writes (fully replaces) the secret at `path` under the default `secret/` KV v2 mount. */
export async function writeSecret(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${env.vaultAddr}/v1/secret/data/${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`vault: writing secret at ${path} failed (${res.status}): ${body}`);
  }
}

/** Reads the secret at `path`, or returns null if it doesn't exist. */
export async function readSecret(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${env.vaultAddr}/v1/secret/data/${path}`, {
    method: 'GET',
    headers: headers(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`vault: reading secret at ${path} failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { data?: { data?: Record<string, unknown> } };
  return json.data?.data ?? null;
}

/** Permanently destroys the secret (all versions + metadata) at `path`. */
export async function deleteSecret(path: string): Promise<void> {
  const res = await fetch(`${env.vaultAddr}/v1/secret/metadata/${path}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`vault: deleting secret at ${path} failed (${res.status}): ${body}`);
  }
}
