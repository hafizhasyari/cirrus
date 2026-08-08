import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Vm, VmStreamFrame } from '@cirrus/shared-types';
import { streamAggregatorVms } from '../clients/aggregatorClient.js';
import { requireAuth } from '../middleware/requireRole.js';

// Mirrors the pre-streaming route's scoping exactly: `vms` is filtered to the
// requester's assigned connections (admins see everything), while a frame's
// mere existence — like the old `errors` array — is never scoped, so every
// user still sees the same refresh progress/outage visibility as an admin.
// The Aggregator's `connection` frames actually carry `connectionId` on each
// VM (VmWithConnection, structurally assignable to the wire type's `Vm[]`)
// so it can be stripped here, same as the pre-streaming route used to.
function scopeFrame(frame: VmStreamFrame, req: FastifyRequest): VmStreamFrame {
  if (frame.type !== 'connection') return frame;
  const vms = frame.vms as (Vm & { connectionId: string })[];
  const visible = req.user!.role === 'admin' || req.user!.connectionIds.includes(frame.connectionId);
  return { ...frame, vms: visible ? vms.map(({ connectionId, ...vm }) => vm) : [] };
}

async function relay(req: FastifyRequest, reply: FastifyReply, path: '/vms' | '/vms/refresh') {
  if (!requireAuth(req, reply)) return;

  reply.hijack();
  // Small/frequent writes (one per connection frame, plus the Aggregator's
  // heartbeat pings) are exactly what Nagle-style coalescing affects —
  // disable it so each relayed write hits the wire promptly.
  reply.raw.socket?.setNoDelay(true);
  reply.raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });

  try {
    await streamAggregatorVms(path, (frame) => {
      reply.raw.write(`${JSON.stringify(scopeFrame(frame, req))}\n`);
    });
  } catch (err) {
    req.log.error(err, `failed to relay aggregator ${path} stream`);
    reply.raw.write(`${JSON.stringify({ type: 'done', refreshedAt: new Date().toISOString() })}\n`);
  } finally {
    reply.raw.end();
  }
}

export async function registerVmRoutes(app: FastifyInstance) {
  app.get('/api/vms', (req, reply) => relay(req, reply, '/vms'));
  app.post('/api/vms/refresh', (req, reply) => relay(req, reply, '/vms/refresh'));
}
