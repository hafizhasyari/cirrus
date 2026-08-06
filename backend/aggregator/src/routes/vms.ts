import type { FastifyInstance } from 'fastify';
import { fetchAllVms } from '../fanout.js';

export async function registerVmRoutes(app: FastifyInstance) {
  app.get('/vms', async () => fetchAllVms());

  app.post('/vms/refresh', async () => {
    const result = await fetchAllVms({ forceRefresh: true });
    return { refreshedAt: new Date().toISOString(), ...result };
  });
}
