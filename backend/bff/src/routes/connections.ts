import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Connection } from '@cirrus/shared-types';
import {
  createConnection,
  deleteConnection,
  listConnections,
  testConnection,
  updateConnection,
} from '../clients/rbacClient.js';
import { requireAdmin, requireAuth } from '../middleware/requireRole.js';

// Mirrors vms.ts's scopeFrame: admins see every connection, everyone else
// only their own assigned ones. Safe to expose read-only to non-admins since
// Connection never carries secrets (those live in Vault) and a Viewer's own
// connections are already reflected elsewhere (e.g. the VM table's Account
// column).
export function scopeConnections(connections: Connection[], req: FastifyRequest): Connection[] {
  if (req.user!.role === 'admin') return connections;
  return connections.filter((c) => req.user!.connectionIds.includes(c.id));
}

export async function registerConnectionRoutes(app: FastifyInstance) {
  app.get('/api/connections', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return scopeConnections(await listConnections(), req);
  });

  app.post('/api/connections', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const res = await createConnection(req.body, req.user!.id);
    reply.code(res.status);
    return res.json();
  });

  app.patch<{ Params: { id: string } }>('/api/connections/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const res = await updateConnection(req.params.id, req.body, req.user!.id);
    reply.code(res.status);
    return res.json();
  });

  app.delete<{ Params: { id: string } }>('/api/connections/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const res = await deleteConnection(req.params.id, req.user!.id);
    reply.code(res.status);
    if (res.status === 204) return;
    return res.json();
  });

  app.post<{ Params: { id: string } }>('/api/connections/:id/test', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const res = await testConnection(req.params.id, req.body, req.user!.id);
    reply.code(res.status);
    return res.json();
  });
}
