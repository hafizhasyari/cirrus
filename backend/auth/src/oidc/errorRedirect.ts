import type { FastifyReply } from 'fastify';
import { env } from '../env.js';

// The OIDC callback and /dev-login are both reached via a top-level browser
// navigation (redirect from Microsoft, or window.location in dev), never a
// fetch/XHR — so a raw JSON error body just renders as text in the user's
// tab. Redirect back to the login screen instead, carrying the failure
// reason as a query param the frontend can turn into a friendly toast.
export function redirectWithError(reply: FastifyReply, code: string) {
  const url = new URL(env.postLoginRedirect);
  url.searchParams.set('authError', code);
  return reply.redirect(url.toString());
}
