import { createClient } from 'redis';
import { env } from '../env.js';

export const redis = createClient({ url: env.redisUrl });

redis.on('error', (err) => console.error('Aggregator: Redis client error', err));

export async function connectRedis() {
  await redis.connect();
}
