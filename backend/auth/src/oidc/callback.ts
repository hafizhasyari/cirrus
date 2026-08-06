import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { signSession } from '../jwt.js';
import { cryptoProvider, msalClient, SCOPES } from './msalClient.js';

interface FlowState {
  verifier: string;
  state: string;
  nonce: string;
}

export async function registerOidcRoutes(app: FastifyInstance) {
  app.get('/login', async (req, reply) => {
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = cryptoProvider.createNewGuid();
    const nonce = cryptoProvider.createNewGuid();

    const flow: FlowState = { verifier, state, nonce };
    reply.setCookie('auth_flow', JSON.stringify(flow), {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      path: '/',
      signed: true,
      maxAge: 600,
    });

    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: env.redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state,
      nonce,
    });

    reply.redirect(authUrl);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    '/callback',
    async (req, reply) => {
      const { code, state, error, error_description } = req.query;

      if (error) {
        reply.code(400);
        return { error, message: error_description };
      }

      const rawFlowCookie = req.cookies.auth_flow;
      const unsigned = rawFlowCookie ? req.unsignCookie(rawFlowCookie) : null;
      if (!rawFlowCookie || !unsigned?.valid || !unsigned.value) {
        reply.code(400);
        return { error: { code: 'INVALID_FLOW', message: 'missing or invalid login flow cookie — please retry /login' } };
      }
      const flow = JSON.parse(unsigned.value) as FlowState;
      reply.clearCookie('auth_flow', { path: '/' });

      if (!code || state !== flow.state) {
        reply.code(400);
        return { error: { code: 'STATE_MISMATCH', message: 'state did not match — possible CSRF or expired flow' } };
      }

      const tokenResponse = await msalClient.acquireTokenByCode({
        code,
        scopes: SCOPES,
        redirectUri: env.redirectUri,
        codeVerifier: flow.verifier,
      });

      const claims = (tokenResponse.idTokenClaims ?? {}) as Record<string, unknown>;
      const oid = claims.oid as string | undefined;
      const tid = claims.tid as string | undefined;
      const name = (claims.name as string | undefined) ?? '';
      const preferredUsername = (claims.preferred_username as string | undefined) ?? '';

      if (!oid || !tid) {
        reply.code(502);
        return {
          error: {
            code: 'MISSING_CLAIMS',
            message: 'id token is missing oid/tid — check that the app registration requests the profile scope',
          },
        };
      }

      const rbacRes = await fetch(`${env.rbacUrl}/internal/upsert-on-login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': env.internalSharedSecret },
        body: JSON.stringify({ oid, tid, email: preferredUsername, name }),
      });

      if (rbacRes.status === 404) {
        reply.code(403);
        return {
          error: {
            code: 'NOT_INVITED',
            message: 'This Microsoft account has not been invited to Cirrus. Contact an Admin to request access.',
          },
        };
      }
      if (!rbacRes.ok) {
        reply.code(502);
        return { error: { code: 'RBAC_UNAVAILABLE', message: 'could not resolve user via RBAC service' } };
      }

      const sessionJwt = await signSession({ oid, tid, name, preferredUsername });

      reply.setCookie(env.cookieName, sessionJwt, {
        httpOnly: true,
        secure: env.cookieSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: env.sessionTtlSeconds,
      });

      reply.redirect(env.postLoginRedirect);
    },
  );

  app.post('/logout', async (req, reply) => {
    reply.clearCookie(env.cookieName, { path: '/' });
    return { ok: true };
  });
}
