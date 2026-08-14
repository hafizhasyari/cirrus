import { env } from '../env.js';
import type { ConnectionRow } from './connectionCheck.js';

// Plain fetch against the Telegram Bot API — no client library, matching
// this codebase's existing pattern for every other inter-service/external
// HTTP call (see lib/vault.ts). No-ops entirely (debug log only) unless both
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set, same "works without it,
// that feature just doesn't fire" precedent as the ENTRA_* / Vault setup.

type ConnectionStatus = ConnectionRow['status'];

function configured(): boolean {
  return Boolean(env.telegramBotToken && env.telegramChatId);
}

async function sendMessage(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.telegramChatId, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram: sendMessage failed (${res.status}): ${body}`);
  }
}

// Called only from the scheduled health-check pass (scheduler.ts), never
// from the manual POST /connections/:id/test route — an Admin already uses
// that route's edit-connection-drawer Test Connection to deliberately try
// broken/typed-but-unsaved credentials, and alerting on that would spam
// Telegram with self-inflicted false alarms. The scheduled pass only ever
// re-checks real stored credentials with nobody necessarily watching, which
// is exactly the gap this alert exists to cover.
//
// Fires only on an actual transition (previousStatus !== newStatus), so a
// connection stuck in 'error' across many consecutive passes alerts once,
// not every ~6h. Throws on a Telegram API failure (bad token, network blip,
// rate limit) — the caller (scheduler.ts, which has a logger this plain
// lib function doesn't) is responsible for catching and logging so one
// failed alert send can never abort the health-check pass it's reporting on.
export async function notifyConnectionStatusChange(
  conn: ConnectionRow,
  previousStatus: ConnectionStatus,
  newStatus: ConnectionStatus,
  message: string,
): Promise<void> {
  if (previousStatus === newStatus) return;
  if (!configured()) return;

  let text: string | null = null;
  if (newStatus === 'error') {
    text = `🔴 Cirrus: ${conn.provider.toUpperCase()} connection "${conn.account}" (${conn.id}) just failed its scheduled health check.\n${message}`;
  } else if (newStatus === 'active' && previousStatus === 'error') {
    text = `✅ Cirrus: ${conn.provider.toUpperCase()} connection "${conn.account}" (${conn.id}) recovered on its scheduled health check.`;
  }
  if (!text) return;

  await sendMessage(text);
}
