import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { env } from './env.js';
import { getJwks, initSigningKey } from './jwt.js';
import { registerOidcRoutes } from './oidc/callback.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));
app.get('/.well-known/jwks.json', async () => getJwks());

await app.register(cookie, { secret: env.cookieSecret });
await registerOidcRoutes(app);

await initSigningKey();

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
