import type { CirrusApp } from '../../state/useCirrusApp';

export function UserDrawer({ app }: { app: CirrusApp }) {
  const isEdit = app.userDrawerMode === 'edit';
  const isAdminRole = app.userForm.role === 'admin';

  return (
    <div className="drawer-overlay" onClick={() => app.closeUserDrawer()}>
      <div className="drawer-panel" style={{ width: 'min(420px, 100vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>
            {isEdit ? 'Edit User' : 'Invite User'}
          </div>
          <div style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => app.closeUserDrawer()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </div>
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Full name</div>
          <input
            className={`field-input font-plain${app.userFormErrors.name ? ' has-error' : ''}`}
            value={app.userForm.name}
            onChange={(e) => app.updateUserField('name', e.target.value)}
            placeholder="e.g. Andi Wijaya"
          />
          {app.userFormErrors.name && (
            <div className="field-error">{app.userFormErrors.name}</div>
          )}
        </div>
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Email</div>
          <input
            className={`field-input font-plain${app.userFormErrors.email ? ' has-error' : ''}`}
            value={app.userForm.email}
            onChange={(e) => app.updateUserField('email', e.target.value)}
            placeholder="name@example.com"
          />
          {app.userFormErrors.email && (
            <div className="field-error">{app.userFormErrors.email}</div>
          )}
        </div>
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Role</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="pill" data-active={isAdminRole} style={{ flex: 1, justifyContent: 'center' }} onClick={() => app.setUserFormRole('admin')}>Admin</div>
            <div className="pill" data-active={!isAdminRole} style={{ flex: 1, justifyContent: 'center' }} onClick={() => app.setUserFormRole('viewer')}>Viewer</div>
          </div>
        </div>

        {!isAdminRole && (
          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>Assigned accounts</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 6,
                boxSizing: 'border-box',
              }}
            >
              {app.connections.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>
                  No cloud connections registered yet.
                </div>
              )}
              {app.connections.map((conn) => {
                const providerName = app.providers.find((p) => p.id === conn.provider)?.name ?? conn.provider;
                const checked = app.userForm.accountConnectionIds.includes(conn.id);
                return (
                  <label
                    key={conn.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      padding: '5px 6px',
                      borderRadius: 6,
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => app.toggleUserFormConnection(conn.id)} />
                    {providerName} – {conn.account}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {isEdit ? (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f43f5e', cursor: 'pointer' }} onClick={() => app.removeUser()}>
              Remove User
            </div>
          ) : (
            <div />
          )}
          <div className="primary-btn" style={{ marginLeft: 'auto' }} onClick={() => app.saveUser()}>
            {isEdit ? 'Save Changes' : 'Send Invite'}
          </div>
        </div>
      </div>
    </div>
  );
}
