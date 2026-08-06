import type { FastifyInstance } from 'fastify';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/auth/me', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: { code: 'UNAUTHORIZED', message: 'not logged in' } };
    }
    return req.user;
  });
}
