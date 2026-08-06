import Fastify from 'fastify';
import { env } from './env.js';
import { registerInternalAuth } from './plugins/internalAuth.js';
import { registerUserRoutes } from './routes/users.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerProviderRoutes } from './routes/providers.js';
import { registerInternalRoutes } from './routes/internal.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

registerInternalAuth(app);
await registerUserRoutes(app);
await registerConnectionRoutes(app);
await registerProviderRoutes(app);
await registerInternalRoutes(app);

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
