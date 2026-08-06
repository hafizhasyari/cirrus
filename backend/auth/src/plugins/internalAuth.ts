import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';

// Scoped to an `/internal`-prefixed sub-plugin (server.ts) rather than a
// global hook + exclusion set (RBAC/Aggregator's pattern) — Auth's route
// surface is mostly public-by-design (login/callback/logout/dev-login/jwks),
// so an opt-in secured prefix is harder to get wrong than remembering to add
// every future public route to an exclusion list.
export function registerInternalAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers['x-internal-secret'] !== env.internalSharedSecret) {
      reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'missing or invalid X-Internal-Secret' } });
    }
  });
}
