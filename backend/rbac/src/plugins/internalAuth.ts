import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';

const PUBLIC_PATHS = new Set(['/health', '/metrics']);

export function registerInternalAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (PUBLIC_PATHS.has(req.url)) return;
    const secret = req.headers['x-internal-secret'];
    if (secret !== env.internalSharedSecret) {
      reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'missing or invalid X-Internal-Secret' } });
    }
  });
}
