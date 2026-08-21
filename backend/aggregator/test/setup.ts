import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

/**
 * Starts a disposable Redis container matching the image `docker-compose.yml`
 * uses in production (redis:8-alpine) and points this process's REDIS_URL at
 * it. Deliberately never touches the real running `docker-compose.yml`
 * stack — see CLAUDE.md/TODO.md's testing notes on why automated tests must
 * use disposable infra, not shared/live services.
 */
export async function startRedis(): Promise<StartedTestContainer> {
  const redis = await new GenericContainer('redis:8-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();

  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

  return redis;
}
