import Fastify from 'fastify';
import { connectRedis } from './cache/redisClient.js';
import { env } from './env.js';
import { registerInternalAuth } from './plugins/internalAuth.js';
import { registerVmRoutes } from './routes/vms.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

registerInternalAuth(app);
await registerVmRoutes(app);

await connectRedis();

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
