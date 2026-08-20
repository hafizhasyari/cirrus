import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import { env } from './env.js';
import { getJwks, initSigningKey } from './jwt.js';
import { httpRequestDurationSeconds, httpRequestsTotal, register } from './lib/metrics.js';
import { registerOidcRoutes } from './oidc/callback.js';
import { registerDevLoginRoutes } from './routes/devLogin.js';
import { registerInternalAuth } from './plugins/internalAuth.js';
import { registerWifRoutes } from './routes/wif.js';
import { version } from './version.js';

// Precautionary — Fastify's default request/response serializer never
// includes headers/cookies/bodies, so nothing today actually logs these
// paths. This just keeps a future debug log (e.g. someone adding
// req.headers to a log call) from leaking a session cookie/token by default.
const logRedactPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-internal-secret"]',
  'res.headers["set-cookie"]',
  'token',
  'accessToken',
  'sessionJwt',
  'secret',
  'password',
];

const app = Fastify({
  logger: { name: 'auth', level: env.logLevel, redact: logRedactPaths },
  trustProxy: true,
  // Adopts the X-Request-Id nginx mints at the edge (see frontend/nginx.conf,
  // forwarded here by bff's httpProxy) as this request's own id, instead of
  // generating an unrelated one — lets one user action be traced across
  // every service's logs by one shared id.
  requestIdHeader: 'x-request-id',
});

app.setErrorHandler((err: FastifyError, req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    req.log.error({ err }, 'unhandled request error');
    reply.status(status).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } });
    return;
  }
  reply.status(status).send({ error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
});

app.get('/health', async () => ({ status: 'ok', version }));
app.get('/.well-known/jwks.json', async () => getJwks());

// Declared at the top level, outside the /internal-prefixed sub-plugin below
// (registerInternalAuth's hook is scoped to that sub-plugin's encapsulation
// context — see plugins/internalAuth.ts — so this route is unaffected by
// it), same as /health above. Never exposed externally regardless —
// frontend/nginx.conf never proxies /auth/metrics and auth has no public
// route of its own.
app.addHook('onResponse', async (req, reply) => {
  const route = req.routeOptions?.url ?? req.url;
  httpRequestsTotal.inc({ method: req.method, route, status_code: String(reply.statusCode) });
  httpRequestDurationSeconds.observe({ method: req.method, route }, reply.elapsedTime / 1000);
});
app.get('/metrics', { config: { rateLimit: false } }, async (_req, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});

// CSP is disabled here — auth is a pure JSON/redirect API, never the
// document a browser renders as a page, so a CSP header on its responses is
// close to meaningless. The real CSP that matters lives in frontend/nginx.conf.
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cookie, { secret: env.cookieSecret });
await app.register(rateLimit, { global: false });
await registerOidcRoutes(app);

await app.register(
  async (instance) => {
    registerInternalAuth(instance);
    registerWifRoutes(instance);
  },
  { prefix: '/internal' },
);

if (env.devLoginSuppressedByNodeEnv) {
  app.log.warn('DEV_LOGIN_ENABLED=true but NODE_ENV=production — dev-login bypass suppressed.');
}
if (env.devLoginEnabled) {
  app.log.warn('DEV_LOGIN_ENABLED=true — /dev-login bypass is active. Never enable this in production.');
  await registerDevLoginRoutes(app);
}

await initSigningKey();

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
