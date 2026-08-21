import type { ProviderId } from '@cirrus/shared-types';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4001),
  databaseUrl: required('DATABASE_URL'),
  internalSharedSecret: required('INTERNAL_SHARED_SECRET'),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL,
  seedAdminName: process.env.SEED_ADMIN_NAME,
  vaultAddr: required('VAULT_ADDR'),
  vaultToken: required('VAULT_TOKEN'),
  // PRD §6.1: how often (ms) the connection health-check scheduler
  // (scheduler.ts) re-validates every stored connection. Stored in seconds
  // in the env var (matches SESSION_TTL_SECONDS's house style). 0 disables it.
  healthCheckIntervalMs: Number(process.env.HEALTH_CHECK_INTERVAL_SECONDS ?? 21_600) * 1000,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Optional — outage alerting (lib/telegramAlert.ts) silently no-ops unless
  // both are set, same "works without it" precedent as ENTRA_*.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  // Optional — invite emails (lib/resendClient.ts) silently no-op unless
  // RESEND_API_KEY is set, same "works without it" precedent as ENTRA_*/
  // Telegram. RESEND_FROM_EMAIL's domain must be verified in Resend's
  // dashboard (DNS records) first, or sends fail with a 403 — a manual,
  // one-time operational step outside code's reach.
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? 'Cirrus <notification@example.com>',
  // Public URL of the frontend SPA, used only to build the invite email's
  // "Sign in to Cirrus" link. rbac has no existing copy of this (CORS_ORIGIN/
  // POST_LOGIN_REDIRECT live in bff/auth respectively) — same per-service
  // duplication precedent those two already follow.
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
};

export const COLLECTOR_URLS: Record<ProviderId, string> = {
  aws: required('AWS_COLLECTOR_URL'),
  gcp: required('GCP_COLLECTOR_URL'),
  alibaba: required('ALIBABA_COLLECTOR_URL'),
  oci: required('OCI_COLLECTOR_URL'),
  biznet: required('BIZNET_COLLECTOR_URL'),
};
