import helmet from '@fastify/helmet';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { connectRedis } from './cache/redisClient.js';
import { env } from './env.js';
import { httpRequestDurationSeconds, httpRequestsTotal, register } from './lib/metrics.js';
import { requestIdStorage } from './lib/requestContext.js';
import { registerInternalAuth } from './plugins/internalAuth.js';
import { registerVmRoutes } from './routes/vms.js';
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

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { name: 'aggregator', level: env.logLevel, redact: logRedactPaths },
    // Adopts the X-Request-Id nginx mints at the edge (see frontend/nginx.conf,
    // forwarded here via bff's clients/aggregatorClient.ts) as this request's
    // own id, instead of generating an unrelated one — lets one user action be
    // traced across every service's logs by one shared id.
    requestIdHeader: 'x-request-id',
  });

  app.addHook('onRequest', async (req) => {
    requestIdStorage.enterWith(req.id);
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

  // Exempted in plugins/internalAuth.ts's PUBLIC_PATHS alongside /health so
  // Prometheus can scrape it without the internal shared secret. Never exposed
  // externally regardless — frontend/nginx.conf never proxies it, and
  // aggregator's host port is cleared in docker-compose.prod.yml.
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url;
    httpRequestsTotal.inc({ method: req.method, route, status_code: String(reply.statusCode) });
    httpRequestDurationSeconds.observe({ method: req.method, route }, reply.elapsedTime / 1000);
  });
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // CSP is disabled here — aggregator is a pure JSON API, never the document a
  // browser renders as a page, so a CSP header on its responses is close to
  // meaningless. The real CSP that matters lives in frontend/nginx.conf.
  await app.register(helmet, { contentSecurityPolicy: false });

  registerInternalAuth(app);
  await registerVmRoutes(app);

  return app;
}

// Only actually connects to Redis and binds a port when this file is run
// directly — not when `buildApp` is imported by a test. A test needs to
// point `connectRedis()` at its own (test) Redis instance first, so
// `buildApp()` itself must not assume the real `env.redisUrl` is already
// connected.
const isMainModule = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const app = await buildApp();
  await connectRedis();
  app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
