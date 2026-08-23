import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CollectorInstance, CollectorInstancesResponse, ProviderId } from '@cirrus/shared-types';

const PROVIDERS: ProviderId[] = ['aws', 'gcp', 'alibaba', 'oci', 'biznet'];

export interface FakeCollectorOptions {
  vmsPerConnection: number;
  latencyMs: number;
}

export interface FakeCollectors {
  urls: Record<ProviderId, string>;
  stop: () => Promise<void>;
}

function buildInstances(provider: ProviderId, connectionId: string, count: number): CollectorInstance[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${connectionId}-vm-${i}`,
    name: `${provider}-loadtest-vm-${i}`,
    region: 'loadtest-region-1',
    status: 'running',
    instanceType: 'loadtest.medium',
    cpu: 2,
    memoryGB: 4,
    disks: [{ label: 'Root (loadtest)', sizeGB: 50 }],
    privateIp: `10.${i % 256}.${(i >> 8) % 256}.1`,
    publicIp: null,
    launchedAt: new Date().toISOString(),
  }));
}

function startOneCollector(provider: ProviderId, opts: FakeCollectorOptions): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/instances') {
        res.writeHead(404).end();
        return;
      }
      const connectionId = url.searchParams.get('connectionId') ?? 'unknown';
      // Artificial delay stands in for a real provider API round-trip, so the
      // test also exercises Cirrus's own per-request overhead (JSON
      // encode/decode, cache write, NDJSON streaming) on top of realistic
      // network latency instead of measuring a trivially-instant no-op.
      setTimeout(() => {
        const body: CollectorInstancesResponse = {
          connectionId,
          provider,
          fetchedAt: new Date().toISOString(),
          instances: buildInstances(provider, connectionId, opts.vmsPerConnection),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      }, opts.latencyMs);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

export async function startFakeCollectors(opts: FakeCollectorOptions): Promise<FakeCollectors> {
  const servers = await Promise.all(PROVIDERS.map((provider) => startOneCollector(provider, opts)));
  const urls = {} as Record<ProviderId, string>;
  PROVIDERS.forEach((provider, i) => {
    const address = servers[i].address() as AddressInfo;
    urls[provider] = `http://127.0.0.1:${address.port}`;
  });

  return {
    urls,
    stop: async () => {
      await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    },
  };
}
