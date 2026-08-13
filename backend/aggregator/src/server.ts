import helmet from '@fastify/helmet';
import Fastify, { type FastifyError } from 'fastify';
import { connectRedis } from './cache/redisClient.js';
import { env } from './env.js';
import { registerInternalAuth } from './plugins/internalAuth.js';
import { registerVmRoutes } from './routes/vms.js';

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

const app = Fastify({ logger: { name: 'aggregator', level: env.logLevel, redact: logRedactPaths } });

app.setErrorHandler((err: FastifyError, req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    req.log.error({ err }, 'unhandled request error');
    reply.status(status).send({ error: 'Internal Server Error' });
    return;
  }
  reply.status(status).send({ error: err.message });
});

app.get('/health', async () => ({ status: 'ok' }));

// CSP is disabled here — aggregator is a pure JSON API, never the document a
// browser renders as a page, so a CSP header on its responses is close to
// meaningless. The real CSP that matters lives in frontend/nginx.conf.
await app.register(helmet, { contentSecurityPolicy: false });

registerInternalAuth(app);
await registerVmRoutes(app);

await connectRedis();

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
