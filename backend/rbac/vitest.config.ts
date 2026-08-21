import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Starting disposable Postgres + Vault containers (testcontainers) is
    // slow relative to a normal unit test — well past vitest's 5s/10s
    // defaults, especially on a cold image cache.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
