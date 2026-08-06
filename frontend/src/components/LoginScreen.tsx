import type { Theme } from '../types';

export function LoginScreen({
  theme,
  setTheme,
  onContinue,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onContinue: () => void;
}) {
  const dark = theme === 'dark';
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 22,
          right: 28,
          zIndex: 2,
          display: 'flex',
          gap: 6,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
        }}
      >
        <div className="pill" data-active={!dark} onClick={() => setTheme('light')}>
          <SunIcon /> Light
        </div>
        <div className="pill" data-active={dark} onClick={() => setTheme('dark')}>
          <MoonIcon /> Dark
        </div>
      </div>

      <div
        style={{
          width: 460,
          flexShrink: 0,
          background: 'linear-gradient(155deg,#4c3ce8 0%,#7c6bff 48%,#b28cff 100%)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '44px 40px',
          boxSizing: 'border-box',
        }}
      >
        <svg style={{ position: 'absolute', top: -90, right: -110, opacity: 0.22 }} width="360" height="360" viewBox="0 0 360 360">
          <circle cx="180" cy="180" r="179" stroke="white" strokeWidth="1" fill="none" />
          <circle cx="180" cy="180" r="124" stroke="white" strokeWidth="1" fill="none" />
          <circle cx="180" cy="180" r="68" stroke="white" strokeWidth="1" fill="none" />
        </svg>
        <svg style={{ position: 'absolute', bottom: -60, left: -70, opacity: 0.16 }} width="240" height="240" viewBox="0 0 240 240">
          <circle cx="120" cy="120" r="119" stroke="white" strokeWidth="1" fill="none" />
        </svg>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CirrusMark />
          <div className="font-display" style={{ fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Cirrus</div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="font-display" style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.12, color: '#ffffff', marginBottom: 16 }}>
            Every VM.<br />Every cloud.<br />One view.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)', maxWidth: 340, marginBottom: 26 }}>
            Cirrus pulls a live, read-only inventory across every provider your team runs — no agents, no drift.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <LoginFeature text="AWS, GCP, Alibaba, OCI & Biznet Gio in one table" />
            <LoginFeature text="Least-privilege, read-only credentials by design" />
            <LoginFeature text="Live inventory, cached automatically if a provider is down" />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="card"
          style={{
            width: 380,
            padding: '40px 34px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div className="font-display" style={{ fontSize: 21, fontWeight: 700 }}>Welcome back</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 8, lineHeight: 1.5 }}>Sign in to see your cloud inventory.</div>
          </div>
          <button
            type="button"
            onClick={onContinue}
            className="ms-login-btn"
            style={{
              width: '100%',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              padding: '13px 16px',
              fontFamily: "'Plus Jakarta Sans',sans-serif",
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ display: 'grid', gridTemplateColumns: '9px 9px', gridTemplateRows: '9px 9px', gap: 1 }}>
              <span style={{ background: '#f25022' }} />
              <span style={{ background: '#7fba00' }} />
              <span style={{ background: '#00a4ef' }} />
              <span style={{ background: '#ffb900' }} />
            </span>
            Continue with Microsoft
          </button>
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => {
                const email = window.prompt('Dev login as (must already be an invited RBAC user):', 'admin@example.com');
                if (email) window.location.href = `/auth/dev-login?email=${encodeURIComponent(email)}`;
              }}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px dashed var(--border-strong)',
                borderRadius: 10,
                padding: '10px 16px',
                fontFamily: "'Plus Jakarta Sans',sans-serif",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              Dev login (bypass Entra ID)
            </button>
          )}
          <div style={{ fontSize: 11.5, opacity: 0.55, textAlign: 'center', lineHeight: 1.7 }}>
            Single sign-on via your company Microsoft 365 account.
            <br />
            Need access? Contact your Cirrus admin.
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginFeature({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'rgba(255,255,255,0.92)', fontSize: 12.5 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" opacity="0.3" />
        <path d="M8 12l3 3 5-6" />
      </svg>
      {text}
    </div>
  );
}

export function CirrusMark({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        background: 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: size * 0.47 }}>
        <div style={{ height: 3, borderRadius: 2, background: '#ffffff', width: '100%' }} />
        <div style={{ height: 3, borderRadius: 2, background: '#ffffff', opacity: 0.75, width: '70%' }} />
        <div style={{ height: 3, borderRadius: 2, background: '#ffffff', opacity: 0.5, width: '46%' }} />
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  );
}
