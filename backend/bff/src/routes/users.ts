import type { FastifyInstance } from 'fastify';
import { deleteUser, inviteUser, listUsers, updateUser } from '../clients/rbacClient.js';
import { requireAdmin } from '../middleware/requireRole.js';

export async function registerUserRoutes(app: FastifyInstance) {
  app.get('/api/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return listUsers();
  });

  app.post('/api/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const res = await inviteUser(req.body, req.user!.id);
    reply.code(res.status);
    return res.json();
  });

  app.patch<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const res = await updateUser(req.params.id, req.body, req.user!.id);
    reply.code(res.status);
    return res.json();
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const res = await deleteUser(req.params.id, req.user!.id);
    reply.code(res.status);
    if (res.status === 204) return;
    return res.json();
  });
}
