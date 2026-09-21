import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit cookie CSRF check — defense-in-depth on top of the
// SameSite=Lax session cookie + strict CORS origin allowlist already in
// place (see CLAUDE.md). auth's setSessionCookies() sets a second,
// non-httpOnly cirrus_csrf cookie alongside the session cookie; the
// frontend reads it via document.cookie and echoes it back as
// X-CSRF-Token on every mutating request (frontend/src/api/client.ts).
// A cross-site attacker's forged request rides the session cookie
// automatically but can't read cirrus_csrf's value (different origin), so
// it can never produce a matching header.
//
// Scoped to /api/* only (never /auth/*, which is proxied straight through
// to the Auth Service and isn't authenticated by this session cookie
// check to begin with) and gated on req.user already being set — an
// unauthenticated request has no session to forge in the first place, and
// letting it through here means requireAuth/requireAdmin still produce
// their normal 401, instead of a CSRF-flavored rejection that would be
// confusing to debug.
export function registerCsrfProtection(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return;
    if (!req.url.startsWith('/api/')) return;
    if (!req.user) return;

    const cookieToken = req.cookies[env.csrfCookieName];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      reply.code(403).send({ error: { code: 'CSRF_MISMATCH', message: 'missing or invalid X-CSRF-Token' } });
    }
  });
}
