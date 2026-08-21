// Runs before any test file's imports resolve (vitest.config.ts's
// `test.setupFiles`) — env.ts's required() throws synchronously at import
// time if any of these is missing.
process.env.AUTH_URL ??= 'http://auth.test.invalid';
process.env.RBAC_URL ??= 'http://rbac.test.invalid';
process.env.AGGREGATOR_URL ??= 'http://aggregator.test.invalid';
process.env.INTERNAL_SHARED_SECRET ??= 'test-internal-shared-secret';
