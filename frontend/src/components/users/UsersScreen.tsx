import { useMemo } from 'react';
import { UserDrawer } from './UserDrawer';
import { UserRowSkeleton } from './UserRowSkeleton';
import { StatCard } from '../shared/StatCard';
import { AlertTriangleIcon, EmptyState, UsersOffIcon } from '../shared/EmptyState';
import { formatRelativeTime } from '../../lib/relativeTime';
import { ScreenLayout } from '../AppShell';
import { useApp } from '../../state/AppContext';
import type { CirrusApp } from '../../state/useCirrusApp';
import type { Role, User, UserSortColumn } from '../../types';

const USER_COLUMNS: { key: UserSortColumn; label: string }[] = [
  { key: 'user', label: 'User' },
  { key: 'role', label: 'Role' },
  { key: 'lastLogin', label: 'Last login' },
];

const USER_ROLE_SORT_RANK: Record<Role, number> = { admin: 0, viewer: 1 };

/** Always returns "ascending" ordering — the caller flips sign for desc. */
function compareUsers(a: User, b: User, column: UserSortColumn): number {
  switch (column) {
    case 'user':
      return a.name.localeCompare(b.name);
    case 'role':
      return USER_ROLE_SORT_RANK[a.role] - USER_ROLE_SORT_RANK[b.role];
    case 'lastLogin': {
      const at = new Date(a.lastLogin).getTime();
      const bt = new Date(b.lastLogin).getTime();
      if (Number.isNaN(at)) return 1;
      if (Number.isNaN(bt)) return -1;
      return at - bt;
    }
    default:
      return 0;
  }
}

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
  const sortedUsers = useMemo(() => {
    if (!app.userSortColumn) return app.users;
    const dir = app.userSortDirection === 'asc' ? 1 : -1;
    return [...app.users].sort((a, b) => dir * compareUsers(a, b, app.userSortColumn!));
  }, [app.users, app.userSortColumn, app.userSortDirection]);

  const usersRows = useMemo(
    () =>
      sortedUsers.map((u) => ({
        user: u,
        initials: u.name.split(' ').map((n) => n[0]).slice(0, 2).join(''),
        roleLabel: u.role === 'admin' ? 'Admin' : 'Viewer',
        isAdminRole: u.role === 'admin',
        isPending: u.status === 'pending',
      })),
    [sortedUsers],
  );

  const userStats = useMemo(
    () => ({
      total: usersRows.length,
      admins: usersRows.filter((u) => u.user.role === 'admin').length,
      viewers: usersRows.filter((u) => u.user.role === 'viewer').length,
    }),
    [usersRows],
  );

  const showLoading = app.usersLoading && usersRows.length === 0;
  const showError = !showLoading && !!app.usersError && usersRows.length === 0;
  const showEmpty = !showLoading && !showError && usersRows.length === 0;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stat-grid" style={{ flexShrink: 0 }}>
        <StatCard label="Total users" value={userStats.total} />
        <StatCard label="Admins" value={userStats.admins} />
        <StatCard label="Viewers" value={userStats.viewers} />
      </div>

      <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {showLoading && (
        <div style={{ overflow: 'auto' }}>
          <UserRowSkeleton />
        </div>
      )}
      {showError && (
        <EmptyState
          icon={<AlertTriangleIcon />}
          message={app.usersError!}
          action={<div className="empty-action" onClick={() => app.loadUsers()}>Retry</div>}
        />
      )}
      {showEmpty && (
        <EmptyState
          icon={<UsersOffIcon />}
          message="No users yet"
          action={<div className="empty-action" onClick={() => app.openInviteUser()}>+ Invite User</div>}
        />
      )}
      {!showLoading && !showError && !showEmpty && (
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table className="cirrus-table cirrus-table--users">
          <colgroup>
            {USER_COLUMNS.map((col) => (
              <col key={col.key} />
            ))}
            <col key="spacer" />
          </colgroup>
          <thead>
            <tr>
              {USER_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="th th-sortable"
                  data-sorted={app.userSortColumn === col.key}
                  data-direction={app.userSortColumn === col.key ? app.userSortDirection : undefined}
                  onClick={() => app.toggleUserSort(col.key)}
                >
                  <div className="th-inner">
                    <span className="th-label">{col.label}</span>
                    <svg className="th-sort-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </th>
              ))}
              <th className="th" />
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
                <td className="td" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      </div>

      {app.userDrawerMode && <UserDrawer app={app} />}
    </div>
  );
}

export function UsersPage() {
  const app = useApp();
  return (
    <ScreenLayout header={<UsersHeader app={app} />}>
      <UsersScreen app={app} />
    </ScreenLayout>
  );
}
