import type { FastifyReply, FastifyRequest } from 'fastify';

export function requireAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.user) {
    reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'not logged in' } });
    return false;
  }
  return true;
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!requireAuth(req, reply)) return false;
  if (req.user!.role !== 'admin') {
    reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'admin only' } });
    return false;
  }
  return true;
}
