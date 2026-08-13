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
  jwtIssuer: process.env.JWT_ISSUER ?? 'https://auth.cirrus.internal',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'cirrus-bff',
};
