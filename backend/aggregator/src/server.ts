import Fastify, { type FastifyError } from 'fastify';
import { connectRedis } from './cache/redisClient.js';
import { env } from './env.js';
import { registerInternalAuth } from './plugins/internalAuth.js';
import { registerVmRoutes } from './routes/vms.js';

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

registerInternalAuth(app);
await registerVmRoutes(app);

await connectRedis();

app.listen({ port: env.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
