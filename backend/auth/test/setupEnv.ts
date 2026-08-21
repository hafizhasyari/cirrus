// Runs before any test file's imports resolve (vitest.config.ts's
// `test.setupFiles`) — env.ts's required() throws synchronously at import
// time if any of these is missing, so they must exist before the module
// graph (server.ts -> oidc/callback.ts -> env.js, etc.) is ever reached.
process.env.ENTRA_TENANT_ID ??= 'test-tenant-id';
process.env.ENTRA_CLIENT_ID ??= 'test-client-id';
process.env.ENTRA_CLIENT_SECRET ??= 'test-client-secret';
process.env.AUTH_REDIRECT_URI ??= 'http://localhost:8080/auth/callback';
process.env.RBAC_URL ??= 'http://rbac.test.invalid';
process.env.INTERNAL_SHARED_SECRET ??= 'test-internal-shared-secret';
process.env.COOKIE_SECRET ??= 'test-cookie-secret';
