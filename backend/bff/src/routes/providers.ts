import type { FastifyInstance } from 'fastify';
import { listProviders } from '../clients/rbacClient.js';
import { requireAuth } from '../middleware/requireRole.js';

export async function registerProviderRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeFieldDefs?: string } }>('/api/providers', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return listProviders(req.query.includeFieldDefs === 'true');
  });
}
