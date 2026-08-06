import type { FastifyInstance } from 'fastify';
import { CHECKLIST, FAILURE_MSG, FIELD_DEFS, PROVIDERS } from '../data/providers.js';

export async function registerProviderRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeFieldDefs?: string } }>('/providers', async (req) => {
    if (req.query.includeFieldDefs !== 'true') return PROVIDERS;

    return PROVIDERS.map((provider) => ({
      ...provider,
      fieldDefs: FIELD_DEFS[provider.id],
      checklist: CHECKLIST[provider.id],
      failureMessage: FAILURE_MSG[provider.id],
    }));
  });
}
