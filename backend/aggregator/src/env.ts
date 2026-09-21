import type { ProviderId } from '@cirrus/shared-types';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4002),
  redisUrl: required('REDIS_URL'),
  rbacUrl: required('RBAC_URL'),
  internalSharedSecret: required('INTERNAL_SHARED_SECRET'),
  // Defense-in-depth — aggregator is never browser-facing (only reachable
  // from bff, already gated by X-Internal-Secret), so this is sized
  // generously to never trip on real internal traffic, only a genuinely
  // runaway/abusive caller.
  rateLimitInternalMax: Number(process.env.RATE_LIMIT_INTERNAL_MAX ?? 500),
  rateLimitInternalWindowMs: Number(process.env.RATE_LIMIT_INTERNAL_WINDOW_SECONDS ?? 60) * 1000,
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export const COLLECTOR_URLS: Record<ProviderId, string> = {
  aws: required('AWS_COLLECTOR_URL'),
  gcp: required('GCP_COLLECTOR_URL'),
  alibaba: required('ALIBABA_COLLECTOR_URL'),
  oci: required('OCI_COLLECTOR_URL'),
  biznet: required('BIZNET_COLLECTOR_URL'),
};
