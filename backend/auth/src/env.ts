function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  entraTenantId: required('ENTRA_TENANT_ID'),
  entraClientId: required('ENTRA_CLIENT_ID'),
  entraClientSecret: required('ENTRA_CLIENT_SECRET'),
  redirectUri: required('AUTH_REDIRECT_URI'), // e.g. http://localhost:8080/auth/callback
  postLoginRedirect: process.env.POST_LOGIN_REDIRECT ?? 'http://localhost:5173/',
  rbacUrl: required('RBAC_URL'),
  internalSharedSecret: required('INTERNAL_SHARED_SECRET'),
  jwtIssuer: process.env.JWT_ISSUER ?? 'https://auth.cirrus.internal',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'cirrus-bff',
  cookieName: process.env.SESSION_COOKIE_NAME ?? 'cirrus_session',
  cookieSecure: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  cookieSecret: required('COOKIE_SECRET'), // for signed flow-state cookies (PKCE verifier/nonce/state)
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 12 * 60 * 60),
  signingKeyJwk: process.env.AUTH_SIGNING_KEY_JWK,
  // TEMPORARY: lets the frontend be exercised end-to-end before a real Entra
  // ID app registration exists. Must default OFF — never `required()`.
  devLoginEnabled: (process.env.DEV_LOGIN_ENABLED ?? 'false') === 'true',
};
