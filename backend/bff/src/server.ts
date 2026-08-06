import cookie from '@fastify/cookie';
import httpProxy from '@fastify/http-proxy';
import Fastify from 'fastify';
import { env } from './env.js';
import { registerSessionMiddleware } from './plugins/session.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerProviderRoutes } from './routes/providers.js';
import { registerUserRoutes } from './routes/users.js';
import { registerVmRoutes } from './routes/vms.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

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

registerSessionMiddleware(app);

await registerAuthRoutes(app);
await registerVmRoutes(app);
await registerConnectionRoutes(app);
await registerUserRoutes(app);
await registerProviderRoutes(app);

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
