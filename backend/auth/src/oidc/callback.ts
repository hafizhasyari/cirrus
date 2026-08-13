import type { FastifyInstance } from 'fastify';
import { AuthError, ClientAuthErrorCodes, type AuthorizationCodeRequest } from '@azure/msal-node';
import { env } from '../env.js';
import { signSession } from '../jwt.js';
import { cryptoProvider, msalClient, SCOPES } from './msalClient.js';
import { redirectWithError } from './errorRedirect.js';

interface FlowState {
  verifier: string;
  state: string;
  nonce: string;
}

// A blip on the outbound call to Microsoft's token endpoint (seen in
// production as AuthError errorCode "network_error") is transient, not a
// rejection of the code/verifier — worth one retry before giving up.
async function acquireTokenWithRetry(params: AuthorizationCodeRequest, attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await msalClient.acquireTokenByCode(params);
    } catch (err) {
      const isNetworkError = err instanceof AuthError && err.errorCode === ClientAuthErrorCodes.networkError;
      if (!isNetworkError || attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('unreachable');
}

export async function registerOidcRoutes(app: FastifyInstance) {
  const loginRateLimit = { config: { rateLimit: { max: env.rateLimitLoginMax, timeWindow: env.rateLimitLoginWindowMs } } };

  app.get('/login', loginRateLimit, async (req, reply) => {
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
      const { code, state, error } = req.query;

      if (error) {
        reply.clearCookie('auth_flow', { path: '/' });
        return redirectWithError(reply, 'OAUTH_ERROR');
      }

      const rawFlowCookie = req.cookies.auth_flow;
      const unsigned = rawFlowCookie ? req.unsignCookie(rawFlowCookie) : null;
      if (!rawFlowCookie || !unsigned?.valid || !unsigned.value) {
        return redirectWithError(reply, 'INVALID_FLOW');
      }
      const flow = JSON.parse(unsigned.value) as FlowState;

      if (!code || state !== flow.state) {
        reply.clearCookie('auth_flow', { path: '/' });
        return redirectWithError(reply, 'STATE_MISMATCH');
      }

      // Deliberately NOT clearing auth_flow yet: if the exchange below fails
      // on a transient network error, the cookie (still within its 10-minute
      // maxAge) needs to survive so a hard-refresh of this same callback URL
      // can genuinely retry rather than dying on a missing-cookie check.
      let tokenResponse;
      try {
        tokenResponse = await acquireTokenWithRetry({
          code,
          scopes: SCOPES,
          redirectUri: env.redirectUri,
          codeVerifier: flow.verifier,
        });
      } catch {
        return redirectWithError(reply, 'NETWORK_ERROR');
      }

      // The code is spent now regardless of what happens next — the flow's
      // job is done, so it's safe (and correct) to clear it from here on.
      reply.clearCookie('auth_flow', { path: '/' });

      const claims = (tokenResponse.idTokenClaims ?? {}) as Record<string, unknown>;
      const oid = claims.oid as string | undefined;
      const tid = claims.tid as string | undefined;
      const name = (claims.name as string | undefined) ?? '';
      const preferredUsername = (claims.preferred_username as string | undefined) ?? '';

      if (!oid || !tid) {
        return redirectWithError(reply, 'MISSING_CLAIMS');
      }

      const rbacRes = await fetch(`${env.rbacUrl}/internal/upsert-on-login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': env.internalSharedSecret },
        body: JSON.stringify({ oid, tid, email: preferredUsername, name }),
      });

      if (rbacRes.status === 404) {
        return redirectWithError(reply, 'NOT_INVITED');
      }
      if (!rbacRes.ok) {
        return redirectWithError(reply, 'RBAC_UNAVAILABLE');
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
