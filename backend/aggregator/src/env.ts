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
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export const COLLECTOR_URLS: Record<ProviderId, string> = {
  aws: required('AWS_COLLECTOR_URL'),
  gcp: required('GCP_COLLECTOR_URL'),
  alibaba: required('ALIBABA_COLLECTOR_URL'),
  oci: required('OCI_COLLECTOR_URL'),
  biznet: required('BIZNET_COLLECTOR_URL'),
};
