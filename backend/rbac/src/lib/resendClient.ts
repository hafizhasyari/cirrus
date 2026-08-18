import { env } from '../env.js';
import { renderInviteEmail } from './templates/inviteEmail.js';

// Plain fetch against the Resend REST API — no client library, matching this
// codebase's existing pattern for every other external HTTP call (see
// lib/telegramAlert.ts, lib/vault.ts). No-ops entirely unless RESEND_API_KEY
// is set, same "works without it" precedent as the ENTRA_*/Telegram config.

function configured(): boolean {
  return Boolean(env.resendApiKey);
}

export async function sendInviteEmail(params: {
  to: string;
  name: string;
  role: 'admin' | 'viewer';
}): Promise<void> {
  if (!configured()) return;

  const { subject, html, text } = renderInviteEmail({ name: params.name, role: params.role });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.resendFromEmail,
      to: [params.to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`resend: send failed (${res.status}): ${body}`);
  }
}
