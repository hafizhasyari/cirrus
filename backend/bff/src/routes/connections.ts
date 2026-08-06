import type { FastifyInstance } from 'fastify';
import {
  createConnection,
  deleteConnection,
  listConnections,
  testConnection,
  updateConnection,
} from '../clients/rbacClient.js';
import { requireAdmin } from '../middleware/requireRole.js';

export async function registerConnectionRoutes(app: FastifyInstance) {
  app.get('/api/connections', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return listConnections();
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
