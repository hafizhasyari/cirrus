import { env } from '../../env.js';

// Hosted on the frontend's own public domain (frontend/public/cirrus-mark-email.png,
// same origin as RESEND_FROM_EMAIL) rather than inlined as base64 — Gmail and
// other receivers flag base64 data: URI images as a spoofing signal, since
// legitimate senders normally host images on their own domain.
const CIRRUS_LOGO_URL = `${env.appUrl}/cirrus-mark-email.png`;

// Includes the article ("an Admin" / "a Viewer") since "Viewer" starts with a
// consonant sound and "Admin" doesn't — a bare "as an ${role}" was wrong for
// Viewer invites, the more common case.
const ROLE_LABEL: Record<'admin' | 'viewer', string> = {
  admin: 'an Admin',
  viewer: 'a Viewer',
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function renderInviteEmail(params: { name: string; role: 'admin' | 'viewer' }): {
  subject: string;
  html: string;
  text: string;
} {
  const roleLabel = ROLE_LABEL[params.role];
  const loginUrl = env.appUrl;
  const name = escapeHtml(params.name);

  const subject = 'You have been invited to Cirrus';

  const text = `You've been invited to Cirrus

Hi ${params.name}, you've been added to Cirrus, the internal cloud VM inventory dashboard, as ${roleLabel}.

Sign in with your organization account to get started:
${loginUrl}

This is an automated message from Cirrus. If you weren't expecting this, you can ignore it.`;

  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--[if !mso]><!-->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap"
    />
    <!--<![endif]-->
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:10px;">
                      <img src="${CIRRUS_LOGO_URL}" width="28" height="28" alt="" style="display:block;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#1f2937;">Cirrus</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;color:#1f2937;">
                  You've been invited to Cirrus
                </h1>
                <p style="margin:0 0 12px;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#374151;">
                  Hi ${name}, you've been added to Cirrus, the internal cloud VM inventory dashboard, as <strong>${roleLabel}</strong>.
                </p>
                <p style="margin:0 0 24px;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#374151;">
                  Sign in with your organization account to get started.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:#6d5efc;">
                      <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                        Sign in to Cirrus
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#9ca3af;font-family:'IBM Plex Mono',Consolas,monospace;">
                  This is an automated message from Cirrus. If you weren't expecting this, you can ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  return { subject, html, text };
}
