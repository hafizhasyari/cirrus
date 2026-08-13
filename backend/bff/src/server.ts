import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import httpProxy from '@fastify/http-proxy';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import { env } from './env.js';
import { registerSessionMiddleware } from './plugins/session.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerGcpRoutes } from './routes/gcp.js';
import { registerProviderRoutes } from './routes/providers.js';
import { registerUserRoutes } from './routes/users.js';
import { registerVmRoutes } from './routes/vms.js';

const app = Fastify({ logger: true, trustProxy: true });

app.setErrorHandler((err: FastifyError, _req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    app.log.error({ err }, 'unhandled request error');
    reply.status(status).send({ error: 'Internal Server Error' });
    return;
  }
  reply.status(status).send({ error: err.message });
});

app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

await app.register(cors, { origin: env.corsOrigin, credentials: true });
// CSP is disabled here — bff is a pure JSON/proxy API, never the document a
// browser renders as a page, so a CSP header on its responses is close to
// meaningless. The real CSP that matters lives in frontend/nginx.conf.
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: env.rateLimitApiMax, timeWindow: env.rateLimitApiWindowMs });
await app.register(cookie);

// Proxy the OIDC dance straight through to the Auth Service so it can set/read
// its own cookies on the browser-visible response. /auth/me is handled locally
// below (a static route always wins over these proxied paths in Fastify's router).
await app.register(httpProxy, { upstream: env.authUrl, prefix: '/auth/login', rewritePrefix: '/login' });
await app.register(httpProxy, { upstream: env.authUrl, prefix: '/auth/callback', rewritePrefix: '/callback' });
await app.register(httpProxy, {
  upstream: env.authUrl,
  prefix: '/auth/logout',
  rewritePrefix: '/logout',
  httpMethods: ['POST'],
});
// TEMPORARY: proxies the dev-login bypass too — harmless to register
// unconditionally here since the Auth Service 404s unless it has
// DEV_LOGIN_ENABLED=true itself; the "off by default" guarantee lives there.
await app.register(httpProxy, { upstream: env.authUrl, prefix: '/auth/dev-login', rewritePrefix: '/dev-login' });

registerSessionMiddleware(app);

await registerAuthRoutes(app);
await registerVmRoutes(app);
await registerConnectionRoutes(app);
await registerUserRoutes(app);
await registerProviderRoutes(app);
await registerGcpRoutes(app);
await registerConfigRoutes(app);

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
