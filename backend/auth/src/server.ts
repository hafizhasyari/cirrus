import cookie from '@fastify/cookie';
import Fastify, { type FastifyError } from 'fastify';
import { env } from './env.js';
import { getJwks, initSigningKey } from './jwt.js';
import { registerOidcRoutes } from './oidc/callback.js';
import { registerDevLoginRoutes } from './routes/devLogin.js';
import { registerInternalAuth } from './plugins/internalAuth.js';
import { registerWifRoutes } from './routes/wif.js';

const app = Fastify({ logger: true });

app.setErrorHandler((err: FastifyError, _req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    app.log.error({ err }, 'unhandled request error');
    reply.status(status).send({ error: 'Internal Server Error' });
    return;
  }
  reply.status(status).send({ error: err.message });
});

app.get('/health', async () => ({ status: 'ok' }));
app.get('/.well-known/jwks.json', async () => getJwks());

await app.register(cookie, { secret: env.cookieSecret });
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
