import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { signSession } from '../jwt.js';

// TEMPORARY dev-only bypass for exercising the app before a real Entra ID
// app registration exists. Only registered when DEV_LOGIN_ENABLED=true
// (server.ts) — must never be reachable in a real deployment. It cannot
// invite/bypass RBAC: it calls the exact same upsert-on-login endpoint the
// real OIDC callback uses, so it only "logs in" an email RBAC already
// recognizes as invited (same 404 -> 403 guard as the real flow).
export async function registerDevLoginRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { email?: string } }>('/dev-login', async (req, reply) => {
    const email = req.query.email;
    if (!email) {
      reply.code(400);
      return { error: { code: 'BAD_REQUEST', message: 'email query param is required' } };
    }

    // Deterministic fake identity derived from the email so repeated dev
    // logins for the same address resolve to the same RBAC user.
    const oid = `dev-${email}`;
    const tid = 'dev-tenant';

    const rbacRes = await fetch(`${env.rbacUrl}/internal/upsert-on-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': env.internalSharedSecret },
      body: JSON.stringify({ oid, tid, email, name: email }),
    });

    if (rbacRes.status === 404) {
      reply.code(403);
      return { error: { code: 'NOT_INVITED', message: 'no pending or active invitation for this email' } };
    }
    if (!rbacRes.ok) {
      reply.code(502);
      return { error: { code: 'RBAC_UNAVAILABLE', message: 'could not resolve user via RBAC' } };
    }

    const sessionJwt = await signSession({ oid, tid, name: email, preferredUsername: email });

    reply.setCookie(env.cookieName, sessionJwt, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: env.sessionTtlSeconds,
    });

    reply.redirect(env.postLoginRedirect);
  });
}
