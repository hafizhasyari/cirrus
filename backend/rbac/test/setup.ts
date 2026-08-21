import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Fixed test-only values (never real secrets) so the test file can reference
// them without depending on env vars this module sets as a side effect.
export const TEST_INTERNAL_SHARED_SECRET = 'test-internal-shared-secret';
export const TEST_VAULT_TOKEN = 'test-vault-root-token';

export interface Infra {
  postgres: StartedPostgreSqlContainer;
  vault: StartedTestContainer;
}

/**
 * Starts disposable Postgres + Vault (dev mode) containers matching the same
 * images `docker-compose.yml` uses in production (postgres:17-alpine,
 * hashicorp/vault:2.0.4), points this process's env vars at them, runs the
 * real migrations, and returns the containers for teardown. Deliberately
 * never touches the real running `docker-compose.yml` stack — see
 * CLAUDE.md/TODO.md's testing notes on why automated tests must use
 * disposable infra, not shared/live services.
 */
export async function startInfra(): Promise<Infra> {
  const postgres = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('cirrus_test')
    .withUsername('cirrus')
    .withPassword('test-password')
    .start();

  // Vault's official image auto-starts `vault server -dev` when
  // VAULT_DEV_ROOT_TOKEN_ID/VAULT_DEV_LISTEN_ADDRESS are set — no custom
  // entrypoint/unseal dance needed, unlike the production vault/entrypoint.sh
  // this repo uses for real deploys (KV v2 is already mounted at `secret/`
  // by default in dev mode).
  const vault = await new GenericContainer('hashicorp/vault:2.0.4')
    .withEnvironment({ VAULT_DEV_ROOT_TOKEN_ID: TEST_VAULT_TOKEN, VAULT_DEV_LISTEN_ADDRESS: '0.0.0.0:8200' })
    .withExposedPorts(8200)
    .withWaitStrategy(Wait.forLogMessage(/Development mode should NOT be used in production/))
    .start();

  const databaseUrl = postgres.getConnectionUri();
  const vaultAddr = `http://${vault.getHost()}:${vault.getMappedPort(8200)}`;

  process.env.DATABASE_URL = databaseUrl;
  process.env.VAULT_ADDR = vaultAddr;
  process.env.VAULT_TOKEN = TEST_VAULT_TOKEN;
  process.env.INTERNAL_SHARED_SECRET = TEST_INTERNAL_SHARED_SECRET;
  // Dummy — no test in this suite exercises a real collector call
  // (POST /connections/:id/test), only CRUD + the Postgres/Vault config split.
  process.env.AWS_COLLECTOR_URL ??= 'http://collector-aws.test.invalid';
  process.env.GCP_COLLECTOR_URL ??= 'http://collector-gcp.test.invalid';
  process.env.ALIBABA_COLLECTOR_URL ??= 'http://collector-alibaba.test.invalid';
  process.env.OCI_COLLECTOR_URL ??= 'http://collector-oci.test.invalid';
  process.env.BIZNET_COLLECTOR_URL ??= 'http://collector-biznet.test.invalid';

  // Run in a separate process (not a dynamic import of migrate.ts in this
  // one) — migrate.ts calls `pool.end()` on the db/client.ts singleton pool
  // when it's done, which would also kill the app's own pool if imported
  // in-process here.
  await execFileAsync('npx', ['tsx', 'src/db/migrate.ts'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  return { postgres, vault };
}

export async function stopInfra(infra: Infra): Promise<void> {
  await infra.vault.stop();
  await infra.postgres.stop();
}
