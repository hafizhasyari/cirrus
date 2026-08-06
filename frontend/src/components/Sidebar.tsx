import type { Role, Screen, Theme } from '../types';

export function Sidebar({
  screen,
  role,
  theme,
  onGo,
  onSetRole,
  onSetTheme,
  onSignOut,
}: {
  screen: Screen;
  role: Role;
  theme: Theme;
  onGo: (screen: Screen) => void;
  onSetRole: (role: Role) => void;
  onSetTheme: (theme: Theme) => void;
  onSignOut: () => void;
}) {
  const isAdmin = role === 'admin';
  const isDark = theme === 'dark';
  const currentUserInitials = isAdmin ? 'HA' : 'RF';
  const currentUserName = isAdmin ? 'Admin User' : 'Viewer User';

  return (
    <div
      style={{
        width: 264,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 4px 20px' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--accent-glow)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 15 }}>
            <div style={{ height: 3, borderRadius: 2, background: '#ffffff', width: '100%' }} />
            <div style={{ height: 3, borderRadius: 2, background: '#ffffff', opacity: 0.75, width: '70%' }} />
            <div style={{ height: 3, borderRadius: 2, background: '#ffffff', opacity: 0.5, width: '46%' }} />
          </div>
        </div>
        <div>
          <div className="font-display" style={{ fontSize: 17, fontWeight: 700 }}>Cirrus</div>
          <div className="section-label" style={{ fontSize: 9.5 }}>VM Inventory</div>
        </div>
      </div>

      <div className="section-label" style={{ padding: '0 10px', marginBottom: 6 }}>Workspace</div>
      <div className="nav-item" data-active={screen === 'inventory'} onClick={() => onGo('inventory')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
        Inventory
      </div>

      {isAdmin && (
        <>
          <div className="section-label" style={{ padding: '0 10px', margin: '16px 0 6px' }}>Administration</div>
          <div
            className="nav-item"
            data-active={screen === 'connections' || screen === 'wizard'}
            onClick={() => onGo('connections')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 15L15 9" /><path d="M10 6l1.5-1.5a4 4 0 015.66 5.66L15.5 11.5" /><path d="M14 18l-1.5 1.5a4 4 0 01-5.66-5.66L8.5 12.5" />
            </svg>
            Cloud Connections
          </div>
          <div className="nav-item" data-active={screen === 'users'} onClick={() => onGo('users')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
              <circle cx="17.5" cy="8.5" r="2.3" /><path d="M15.5 13.2c2.4.4 4 2 4 5.8" />
            </svg>
            Users &amp; Roles
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 12,
          marginBottom: 14,
          background: 'var(--surface-alt)',
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          boxSizing: 'border-box',
        }}
      >
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Preview role</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="pill" data-active={isAdmin} style={{ flex: 1, justifyContent: 'center' }} onClick={() => onSetRole('admin')}>Admin</div>
            <div className="pill" data-active={!isAdmin} style={{ flex: 1, justifyContent: 'center' }} onClick={() => onSetRole('viewer')}>Viewer</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 11 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Theme</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="pill" data-active={!isDark} style={{ flex: 1, justifyContent: 'center' }} onClick={() => onSetTheme('light')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
              Light
            </div>
            <div className="pill" data-active={isDark} style={{ flex: 1, justifyContent: 'center' }} onClick={() => onSetTheme('dark')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
              </svg>
              Dark
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
          className="font-display"
        >
          {currentUserInitials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUserName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={onSignOut}>Sign out</div>
        </div>
      </div>
    </div>
  );
}
