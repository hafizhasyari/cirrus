import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startInfra, stopInfra, TEST_INTERNAL_SHARED_SECRET, type Infra } from './setup.js';

let infra: Infra;
let app: FastifyInstance;
let readSecret: (path: string) => Promise<Record<string, unknown> | null>;
let pool: { end: () => Promise<void> };

const HEADERS = { 'x-internal-secret': TEST_INTERNAL_SHARED_SECRET };
// GET /internal/connections/:id additionally requires the calling
// collector's own identity since the F2 pentest fix (routes/internal.ts) —
// matches setup.ts's dummy COLLECTOR_SECRET_AWS.
const AWS_COLLECTOR_HEADERS = { ...HEADERS, 'x-collector-provider': 'aws', 'x-collector-secret': 'test-collector-secret-aws' };

beforeAll(async () => {
  infra = await startInfra();
  // Dynamic imports, deliberately after startInfra() has set DATABASE_URL/
  // VAULT_ADDR/VAULT_TOKEN — env.ts throws synchronously at import time if
  // these aren't set yet, and db/client.ts's pool is a module-level
  // singleton built from env.databaseUrl at that same import time.
  ({ readSecret } = await import('../src/lib/vault.js'));
  ({ pool } = await import('../src/db/client.js'));
  const { buildApp } = await import('../src/server.js');
  app = await buildApp();
}, 120_000);

afterAll(async () => {
  await app.close();
  await pool.end();
  await stopInfra(infra);
}, 120_000);

describe('connection CRUD + Postgres/Vault config split', () => {
  it('splits secret fields into Vault and keeps only non-secret fields in the Postgres-backed response', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/connections',
      headers: HEADERS,
      payload: {
        provider: 'aws',
        account: 'test-account',
        identifier: 'test-identifier',
        config: { accessKeyId: 'AKIAFAKEEXAMPLE', secretAccessKey: 'shh-its-a-secret' },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.config).toEqual({ accessKeyId: 'AKIAFAKEEXAMPLE' });
    expect(created.config.secretAccessKey).toBeUndefined();

    // Vault holds the secret field, keyed by the connection's own id.
    const secret = await readSecret(`cirrus/connections/${created.id}`);
    expect(secret).toEqual({ secretAccessKey: 'shh-its-a-secret' });

    // The collector-facing internal endpoint transparently merges Vault's
    // secret back into config — this is the one place the full credential
    // set is ever reassembled.
    const internalRes = await app.inject({ method: 'GET', url: `/internal/connections/${created.id}`, headers: AWS_COLLECTOR_HEADERS });
    expect(internalRes.statusCode).toBe(200);
    expect(internalRes.json().config).toEqual({ accessKeyId: 'AKIAFAKEEXAMPLE', secretAccessKey: 'shh-its-a-secret' });

    // F2 pentest fix: a different provider's collector — even with a valid
    // X-Internal-Secret — can't read this (aws) connection's config.
    const wrongProviderRes = await app.inject({
      method: 'GET',
      url: `/internal/connections/${created.id}`,
      headers: { ...HEADERS, 'x-collector-provider': 'gcp', 'x-collector-secret': 'test-collector-secret-gcp' },
    });
    expect(wrongProviderRes.statusCode).toBe(403);
    expect(wrongProviderRes.json().error.code).toBe('PROVIDER_MISMATCH');

    // A valid X-Internal-Secret alone, with no collector identity at all,
    // is no longer sufficient for this specific route.
    const noCollectorHeadersRes = await app.inject({ method: 'GET', url: `/internal/connections/${created.id}`, headers: HEADERS });
    expect(noCollectorHeadersRes.statusCode).toBe(401);

    // The plain (non-internal) list/get response never leaks the secret.
    const listRes = await app.inject({ method: 'GET', url: '/connections', headers: HEADERS });
    const listed = listRes.json().find((c: { id: string }) => c.id === created.id);
    expect(listed.config).toEqual({ accessKeyId: 'AKIAFAKEEXAMPLE' });

    // Update re-applies the same split against the new value.
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/connections/${created.id}`,
      headers: HEADERS,
      payload: { config: { accessKeyId: 'AKIAFAKEEXAMPLE', secretAccessKey: 'a-different-secret' } },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().config).toEqual({ accessKeyId: 'AKIAFAKEEXAMPLE' });
    expect(await readSecret(`cirrus/connections/${created.id}`)).toEqual({ secretAccessKey: 'a-different-secret' });

    // Delete cleans up the Vault secret, not just the Postgres row.
    const deleteRes = await app.inject({ method: 'DELETE', url: `/connections/${created.id}`, headers: HEADERS });
    expect(deleteRes.statusCode).toBe(204);
    expect(await readSecret(`cirrus/connections/${created.id}`)).toBeNull();

    const afterDeleteInternalRes = await app.inject({ method: 'GET', url: `/internal/connections/${created.id}`, headers: AWS_COLLECTOR_HEADERS });
    expect(afterDeleteInternalRes.statusCode).toBe(404);
  });

  it('requires the internal shared secret header', async () => {
    const res = await app.inject({ method: 'GET', url: '/connections' });
    expect(res.statusCode).toBe(401);
  });
});
