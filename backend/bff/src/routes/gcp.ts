import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { requireAdmin } from '../middleware/requireRole.js';

export async function registerGcpRoutes(app: FastifyInstance) {
  app.get('/api/gcp/jwks', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const upstream = await fetch(new URL('/.well-known/jwks.json', env.authUrl));
    if (!upstream.ok) {
      reply.code(502).send({ error: { code: 'UPSTREAM_ERROR', message: 'failed to fetch JWKS from Auth Service' } });
      return;
    }

    reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', 'attachment; filename="cirrus-jwks.json"')
      .send(await upstream.text());
  });
}
