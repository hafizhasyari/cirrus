import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { ActiveConnection, ProviderId, VmStreamFrame } from '@cirrus/shared-types';
import { startFakeCollectors } from './fakeCollector.js';

// Validates PRD.md §9's two quantitative targets end-to-end through the real
// Aggregator (fan-out + Redis cache — the layer PRD §6.1 assigns this cost
// to) against a synthetic 500-VM/5-provider fleet, since the live
// docker-compose.yml stack never has that scale of real data. Deliberately
// never touches that live stack — everything here is disposable
// (testcontainers Redis + in-process fake collector HTTP servers), matching
// this repo's existing test-infra-isolation convention (see
// backend/aggregator/test/setup.ts). BFF's relay/role-scoping overhead sits
// on top of what's measured here and is not included — see the plan this
// tool was built from for that scoping decision.

const PROVIDERS: ProviderId[] = ['aws', 'gcp', 'alibaba', 'oci', 'biznet'];

const VM_COUNT = Number(process.env.LOADTEST_VM_COUNT ?? 500);
const CONNECTIONS_PER_PROVIDER = Number(process.env.LOADTEST_CONNECTIONS_PER_PROVIDER ?? 2);
const COLLECTOR_LATENCY_MS = Number(process.env.LOADTEST_COLLECTOR_LATENCY_MS ?? 1000);
const RUNS = Number(process.env.LOADTEST_RUNS ?? 3);

const COLD_TARGET_MS = 8000;
const WARM_TARGET_MS = 2000;

const totalConnections = PROVIDERS.length * CONNECTIONS_PER_PROVIDER;
const vmsPerConnection = Math.floor(VM_COUNT / totalConnections);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function readStreamToDone(res: Response): Promise<{ ms: number; vmCount: number }> {
  const start = performance.now();
  const text = await res.text();
  const ms = performance.now() - start;
  const frames = text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as VmStreamFrame);
  if (!frames.some((f) => f.type === 'done')) throw new Error('stream never sent a done frame');
  const vmCount = frames
    .filter((f): f is Extract<VmStreamFrame, { type: 'connection' }> => f.type === 'connection')
    .reduce((sum, f) => sum + f.vms.length, 0);
  return { ms, vmCount };
}

async function main() {
  console.log(
    `Cirrus load test — target ${VM_COUNT} VM across ${totalConnections} connections ` +
      `(${CONNECTIONS_PER_PROVIDER}/provider × ${PROVIDERS.length} providers, ${vmsPerConnection} VM/connection), ` +
      `${COLLECTOR_LATENCY_MS}ms simulated collector latency, ${RUNS} run(s).`,
  );
  console.log('Starting disposable Redis container (never touches the live docker-compose.yml stack)...');

  const redisContainer: StartedTestContainer = await new GenericContainer('redis:8-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();
  process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  const RBAC_URL = 'http://rbac.loadtest.invalid';
  const INTERNAL_SECRET = 'loadtest-internal-shared-secret';
  process.env.RBAC_URL = RBAC_URL;
  process.env.INTERNAL_SHARED_SECRET = INTERNAL_SECRET;

  const collectors = await startFakeCollectors({ vmsPerConnection, latencyMs: COLLECTOR_LATENCY_MS });
  process.env.AWS_COLLECTOR_URL = collectors.urls.aws;
  process.env.GCP_COLLECTOR_URL = collectors.urls.gcp;
  process.env.ALIBABA_COLLECTOR_URL = collectors.urls.alibaba;
  process.env.OCI_COLLECTOR_URL = collectors.urls.oci;
  process.env.BIZNET_COLLECTOR_URL = collectors.urls.biznet;

  const connections: ActiveConnection[] = PROVIDERS.flatMap((provider) =>
    Array.from({ length: CONNECTIONS_PER_PROVIDER }, (_, i) => ({
      connectionId: `loadtest-${provider}-${i}`,
      provider,
      account: `loadtest-${provider}-account-${i}`,
    })),
  );

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === `${RBAC_URL}/internal/connections?status=active`) {
      return new Response(JSON.stringify(connections), { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const { connectRedis, redis: redisClient } = await import('../src/cache/redisClient.js');
  await connectRedis();
  const { buildApp } = await import('../src/server.js');
  const app = await buildApp();
  const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });

  const coldTimes: number[] = [];
  const warmTimes: number[] = [];
  let lastVmCount = 0;

  try {
    for (let run = 1; run <= RUNS; run++) {
      const coldRes = await realFetch(`${baseUrl}/vms/refresh`, {
        method: 'POST',
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      const cold = await readStreamToDone(coldRes);
      coldTimes.push(cold.ms);
      lastVmCount = cold.vmCount;

      // Cache just written by the cold run above via the real production
      // cache-write path (fetchInstancesCached) — not seeded by hand.
      const warmRes = await realFetch(`${baseUrl}/vms`, {
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      const warm = await readStreamToDone(warmRes);
      warmTimes.push(warm.ms);

      console.log(`Run ${run}/${RUNS}: cold=${cold.ms.toFixed(0)}ms warm=${warm.ms.toFixed(0)}ms (${cold.vmCount} VM streamed)`);
    }
  } finally {
    await app.close();
    await redisClient.quit();
    await collectors.stop();
    await redisContainer.stop();
    globalThis.fetch = realFetch;
  }

  const coldMedian = median(coldTimes);
  const warmMedian = median(warmTimes);
  const coldPass = coldMedian < COLD_TARGET_MS;
  const warmPass = warmMedian < WARM_TARGET_MS;

  console.log('');
  console.log('=== PRD §9 result ===');
  console.log(`VM count actually streamed: ${lastVmCount} (target: ${VM_COUNT})`);
  console.log(
    `Cold fetch (bypass cache):  median ${coldMedian.toFixed(0)}ms — target < ${COLD_TARGET_MS}ms — ${coldPass ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `Cache warm:                 median ${warmMedian.toFixed(0)}ms — target < ${WARM_TARGET_MS}ms — ${warmPass ? 'PASS' : 'FAIL'}`,
  );

  if (!coldPass || !warmPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
