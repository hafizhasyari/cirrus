import { useMemo } from 'react';
import { UserDrawer } from './UserDrawer';
import { StatCard } from '../shared/StatCard';
import { formatRelativeTime } from '../../lib/relativeTime';
import type { CirrusApp } from '../../state/useCirrusApp';

export function UsersHeader({ app }: { app: CirrusApp }) {
  return (
    <>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Administration</div>
        <div className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>Users &amp; Roles</div>
      </div>
      <div className="primary-btn" onClick={() => app.openInviteUser()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Invite User
      </div>
    </>
  );
}

export function UsersScreen({ app }: { app: CirrusApp }) {
  const usersRows = useMemo(
    () =>
      app.users.map((u) => ({
        user: u,
        initials: u.name.split(' ').map((n) => n[0]).slice(0, 2).join(''),
        roleLabel: u.role === 'admin' ? 'Admin' : 'Viewer',
        isAdminRole: u.role === 'admin',
        isPending: u.status === 'pending',
      })),
    [app.users],
  );

  const userStats = useMemo(
    () => ({
      total: usersRows.length,
      admins: usersRows.filter((u) => u.user.role === 'admin').length,
      viewers: usersRows.filter((u) => u.user.role === 'viewer').length,
    }),
    [usersRows],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stat-grid" style={{ flexShrink: 0 }}>
        <StatCard label="Total users" value={userStats.total} />
        <StatCard label="Admins" value={userStats.admins} />
        <StatCard label="Viewers" value={userStats.viewers} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ overflow: 'auto' }}>
        <table className="cirrus-table">
          <thead>
            <tr>
              <th className="th">User</th>
              <th className="th">Role</th>
              <th className="th">Last login</th>
            </tr>
          </thead>
          <tbody>
            {usersRows.map((row) => (
              <tr key={row.user.id} onClick={() => app.openEditUser(row.user)}>
                <td className="td">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      className="font-display"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {row.initials}
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{row.user.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="td">
                  <div
                    style={{
                      display: 'inline-block',
                      background: row.isAdminRole ? 'var(--accent-soft)' : 'var(--surface-alt)',
                      color: row.isAdminRole ? 'var(--accent)' : 'var(--text-secondary)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {row.roleLabel}
                  </div>
                </td>
                <td className="td">
                  {row.isPending ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--warning-bg)',
                        color: '#f59e0b',
                        borderRadius: 20,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                      Pending invite
                    </div>
                  ) : (
                    formatRelativeTime(row.user.lastLogin)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      {app.userDrawerMode && <UserDrawer app={app} />}
    </div>
  );
}
