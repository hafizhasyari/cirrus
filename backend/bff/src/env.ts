function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  authUrl: required('AUTH_URL'),
  rbacUrl: required('RBAC_URL'),
  aggregatorUrl: required('AGGREGATOR_URL'),
  internalSharedSecret: required('INTERNAL_SHARED_SECRET'),
  cookieName: process.env.SESSION_COOKIE_NAME ?? 'cirrus_session',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  rateLimitApiMax: Number(process.env.RATE_LIMIT_API_MAX ?? 300),
  rateLimitApiWindowMs: Number(process.env.RATE_LIMIT_API_WINDOW_SECONDS ?? 60) * 1000,
  jwtIssuer: process.env.JWT_ISSUER ?? 'https://auth.cirrus.internal',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'cirrus-bff',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
