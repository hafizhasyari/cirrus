import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthenticatedUser, SessionClaims } from '@cirrus/shared-types';
import { env } from '../env.js';
import { whoami } from '../clients/rbacClient.js';

const jwks = createRemoteJWKSet(new URL('/.well-known/jwks.json', env.authUrl));

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

async function resolveSession(req: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = req.cookies[env.cookieName];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: env.jwtIssuer, audience: env.jwtAudience });
    const claims = payload as unknown as SessionClaims;
    return await whoami(claims.oid, claims.tid);
  } catch {
    return null;
  }
}

export function registerSessionMiddleware(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    req.user = (await resolveSession(req)) ?? undefined;
  });
}
