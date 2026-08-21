import type { FastifyInstance } from 'fastify';
import { buildSetupGuide, FAILURE_MSG, FIELD_DEFS, PROVIDERS } from '../data/providers.js';
import { env } from '../env.js';

export async function registerProviderRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeFieldDefs?: string } }>('/providers', async (req) => {
    if (req.query.includeFieldDefs !== 'true') return PROVIDERS;

    const setupGuide = buildSetupGuide(env.jwtIssuer);

    return PROVIDERS.map((provider) => ({
      ...provider,
      fieldDefs: FIELD_DEFS[provider.id],
      setupGuide: setupGuide[provider.id],
      failureMessage: FAILURE_MSG[provider.id],
    }));
  });
}
