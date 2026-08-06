import type { FastifyInstance } from 'fastify';
import { getVms, refreshVms } from '../clients/aggregatorClient.js';
import { requireAuth } from '../middleware/requireRole.js';

export async function registerVmRoutes(app: FastifyInstance) {
  app.get('/api/vms', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const { vms, errors } = await getVms();
    const scoped =
      req.user!.role === 'admin' ? vms : vms.filter((vm) => req.user!.connectionIds.includes(vm.connectionId));

    return { vms: scoped.map(({ connectionId, ...vm }) => vm), errors };
  });

  app.post('/api/vms/refresh', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const { vms, errors, refreshedAt } = await refreshVms();
    const scoped =
      req.user!.role === 'admin' ? vms : vms.filter((vm) => req.user!.connectionIds.includes(vm.connectionId));

    return { refreshedAt, vms: scoped.map(({ connectionId, ...vm }) => vm), errors };
  });
}
