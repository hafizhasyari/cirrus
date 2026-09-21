import { randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { env } from '../env.js';

// Both the real OIDC callback and the dev-login bypass need to set the exact
// same pair of cookies on a successful login — centralized here so neither
// call site can drift (e.g. forget the CSRF cookie) the way the two used to
// duplicate the session cookie's setCookie call independently.
export function setSessionCookies(reply: FastifyReply, sessionJwt: string): void {
  reply.setCookie(env.cookieName, sessionJwt, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionTtlSeconds,
  });
  reply.setCookie(env.csrfCookieName, randomBytes(32).toString('hex'), {
    httpOnly: false,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionTtlSeconds,
  });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(env.cookieName, { path: '/' });
  reply.clearCookie(env.csrfCookieName, { path: '/' });
}
