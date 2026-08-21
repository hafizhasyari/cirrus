import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startRedis } from './setup.js';
import type { StartedTestContainer } from 'testcontainers';
import type { VmStreamFrame } from '@cirrus/shared-types';

let redis: StartedTestContainer;
let app: FastifyInstance;
let baseUrl: string;

const RBAC_URL = 'http://rbac.test.invalid';
const AWS_COLLECTOR_URL = 'http://collector-aws.test.invalid';
const realFetch = globalThis.fetch;

beforeAll(async () => {
  redis = await startRedis();

  process.env.RBAC_URL = RBAC_URL;
  process.env.INTERNAL_SHARED_SECRET = 'test-internal-shared-secret';
  process.env.AWS_COLLECTOR_URL = AWS_COLLECTOR_URL;
  process.env.GCP_COLLECTOR_URL = 'http://collector-gcp.test.invalid';
  process.env.ALIBABA_COLLECTOR_URL = 'http://collector-alibaba.test.invalid';
  process.env.OCI_COLLECTOR_URL = 'http://collector-oci.test.invalid';
  process.env.BIZNET_COLLECTOR_URL = 'http://collector-biznet.test.invalid';

  // globalThis.fetch is shared between the app code running in this same
  // process (rbacClient.ts/cache/lock.ts) and our own test client below —
  // so instead of a real network-layer mock, this stub inspects the target
  // URL and either returns a canned response (RBAC/collector calls) or
  // falls through to the real fetch (our own call to the real, ephemeral
  // aggregator server started further down).
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === `${RBAC_URL}/internal/connections?status=active`) {
        return new Response(
          JSON.stringify([
            { connectionId: 'conn-ok', provider: 'aws', account: 'acct-ok' },
            { connectionId: 'conn-fail', provider: 'aws', account: 'acct-fail' },
          ]),
          { status: 200 },
        );
      }
      if (url === `${AWS_COLLECTOR_URL}/instances?connectionId=conn-ok`) {
        return new Response(
          JSON.stringify({
            connectionId: 'conn-ok',
            provider: 'aws',
            fetchedAt: new Date().toISOString(),
            instances: [
              {
                id: 'i-ok',
                name: 'test-vm',
                region: 'us-east-1',
                status: 'running',
                instanceType: 't3.micro',
                cpu: 2,
                memoryGB: 4,
                disks: [],
                privateIp: '10.0.0.1',
                launchedAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === `${AWS_COLLECTOR_URL}/instances?connectionId=conn-fail`) {
        return new Response(JSON.stringify({ error: { code: 'AUTH_FAILED', message: 'invalid credentials' } }), { status: 401 });
      }

      return realFetch(input, init);
    }),
  );

  const { connectRedis } = await import('../src/cache/redisClient.js');
  await connectRedis();

  const { buildApp } = await import('../src/server.js');
  app = await buildApp();
  baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
}, 120_000);

afterAll(async () => {
  await app.close();
  const { redis: redisClient } = await import('../src/cache/redisClient.js');
  await redisClient.quit();
  await redis.stop();
  vi.unstubAllGlobals();
}, 120_000);

describe('GET /vms', () => {
  it('streams a start frame, one connection frame per connection (including a failing one), then done', async () => {
    const res = await realFetch(`${baseUrl}/vms`, { headers: { 'x-internal-secret': 'test-internal-shared-secret' } });
    expect(res.status).toBe(200);
    const text = await res.text();
    const frames = text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as VmStreamFrame)
      .filter((frame) => frame.type !== 'ping');

    expect(frames[0]).toEqual({ type: 'start', connectionIds: ['conn-ok', 'conn-fail'] });
    expect(frames[frames.length - 1].type).toBe('done');

    const connectionFrames = frames.filter((f) => f.type === 'connection');
    expect(connectionFrames).toHaveLength(2);

    const ok = connectionFrames.find((f) => f.type === 'connection' && f.connectionId === 'conn-ok');
    expect(ok).toMatchObject({ type: 'connection', connectionId: 'conn-ok', vms: [{ id: 'i-ok', name: 'test-vm' }] });

    const failed = connectionFrames.find((f) => f.type === 'connection' && f.connectionId === 'conn-fail');
    expect(failed).toMatchObject({
      type: 'connection',
      connectionId: 'conn-fail',
      vms: [],
      error: { code: 'AUTH_FAILED' },
    });
  });
});
