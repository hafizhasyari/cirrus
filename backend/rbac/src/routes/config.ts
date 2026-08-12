import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@cirrus/shared-types';
import { env } from '../env.js';

export async function registerConfigRoutes(app: FastifyInstance) {
  app.get('/config', async (): Promise<AppConfig> => ({
    healthCheckIntervalSeconds: env.healthCheckIntervalMs / 1000,
  }));
}
