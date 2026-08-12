import type { FastifyInstance } from 'fastify';
import { getAppConfig } from '../clients/rbacClient.js';
import { requireAuth } from '../middleware/requireRole.js';

export async function registerConfigRoutes(app: FastifyInstance) {
  app.get('/api/config', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return getAppConfig();
  });
}
