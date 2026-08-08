import type { FastifyInstance, FastifyReply } from 'fastify';
import type { VmStreamFrame } from '@cirrus/shared-types';
import { fanOutVms } from '../fanout.js';
import { getActiveConnections } from '../rbacClient.js';

function writeFrame(reply: FastifyReply, frame: VmStreamFrame) {
  try {
    reply.raw.write(`${JSON.stringify(frame)}\n`);
  } catch {
    // client disconnected mid-stream; nothing left to do
  }
}

async function streamVms(reply: FastifyReply, forceRefresh: boolean) {
  // Resolve the active-connection list before hijacking the response, so an
  // RBAC-unreachable failure here still gets Fastify's normal JSON error
  // reply instead of a headers-already-sent stream failure.
  const connections = await getActiveConnections();

  reply.hijack();
  // Small/frequent writes (one per connection frame) are exactly what
  // Nagle-style coalescing affects — disable it so each write hits the wire
  // promptly instead of waiting to be bundled with the next one.
  reply.raw.socket?.setNoDelay(true);
  reply.raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });

  writeFrame(reply, { type: 'start', connectionIds: connections.map((c) => c.connectionId) });

  // AWS alone can take up to 45s with nothing else to write in the meantime —
  // a periodic heartbeat gives any idle-timeout-based buffering intermediary
  // between us and the client more chances to flush before the real data.
  const heartbeat = setInterval(() => writeFrame(reply, { type: 'ping' }), 1000);
  try {
    await fanOutVms(connections, forceRefresh, (result) => writeFrame(reply, { type: 'connection', ...result }));
  } finally {
    clearInterval(heartbeat);
  }

  writeFrame(reply, { type: 'done', refreshedAt: new Date().toISOString() });
  reply.raw.end();
}

export async function registerVmRoutes(app: FastifyInstance) {
  app.get('/vms', (req, reply) => streamVms(reply, false));
  app.post('/vms/refresh', (req, reply) => streamVms(reply, true));
}
