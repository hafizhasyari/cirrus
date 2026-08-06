import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signWifToken } from '../jwt.js';

const mintSchema = z.object({
  connectionId: z.string().min(1),
  audience: z.string().min(1),
});

// Called by the GCP collector only — mints a fresh WIF-audience token per
// request, exchanged by the collector via GCP's STS + service-account
// impersonation. Protected by internalAuth (X-Internal-Secret).
export function registerWifRoutes(app: FastifyInstance) {
  app.post('/wif-token', async (req, reply) => {
    const body = mintSchema.parse(req.body);
    const token = await signWifToken({ connectionId: body.connectionId, audience: body.audience });
    reply.send({ token, expiresIn: 300 });
  });
}
