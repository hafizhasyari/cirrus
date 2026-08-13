import { useMemo } from 'react';
import { formatIntervalHuman } from '../../lib/formatInterval';
import { ConnectionCard } from './ConnectionCard';
import { ConnectionCardSkeleton } from './ConnectionCardSkeleton';
import { EditConnectionDrawer } from './EditConnectionDrawer';
import { AlertTriangleIcon, EmptyState, LinkOffIcon } from '../shared/EmptyState';
import { StatCard } from '../shared/StatCard';
import { CONN_STATUS_META, statusBgForTheme, useTheme } from '../../theme/ThemeContext';
import type { CirrusApp } from '../../state/useCirrusApp';

export function ConnectionsHeader({ app }: { app: CirrusApp }) {
  return (
    <>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Administration</div>
        <div className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>Cloud Connections</div>
      </div>
      <div className="primary-btn" onClick={() => app.startWizard()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add Connection
      </div>
    </>
  );
}

export function ConnectionsScreen({ app }: { app: CirrusApp }) {
  const { theme } = useTheme();
  const providerMap = useMemo(() => {
    const m: Record<string, (typeof app.providers)[number]> = {};
    app.providers.forEach((p) => (m[p.id] = p));
    return m;
  }, [app.providers]);

  const connectionsRows = useMemo(
    () =>
      app.connections.map((c) => {
        const sm = CONN_STATUS_META[c.status];
        return {
          conn: c,
          providerMeta: providerMap[c.provider],
          statusLabel: sm.label,
          statusColor: sm.color ?? 'var(--text-muted)',
          statusBg: sm.color ? statusBgForTheme(sm.color, theme) : 'var(--surface-alt)',
        };
      }),
    [app.connections, providerMap, theme],
  );

  const showLoading = app.connectionsLoading && connectionsRows.length === 0;
  const showError = !showLoading && !!app.connectionsError && connectionsRows.length === 0;
  const showEmpty = !showLoading && !showError && connectionsRows.length === 0;
  const connectionsDisplay = showLoading || showError || showEmpty ? [] : connectionsRows;

  const connStats = useMemo(
    () => ({
      total: connectionsRows.length,
      active: connectionsRows.filter((c) => c.conn.status === 'active').length,
      pending: connectionsRows.filter((c) => c.conn.status === 'pending').length,
      issues: connectionsRows.filter((c) => c.conn.status === 'error' || c.conn.status === 'expired').length,
    }),
    [connectionsRows],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stat-grid" style={{ flexShrink: 0 }}>
        <StatCard label="Total connections" value={connStats.total} />
        <StatCard label="Active" value={connStats.active} color="#10b981" />
        <StatCard label="Pending" value={connStats.pending} color="#f59e0b" />
        <StatCard label="Issues" value={connStats.issues} color="#f43f5e" />
      </div>

      {showLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <ConnectionCardSkeleton key={i} />
          ))}
        </div>
      )}

      {showError && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '64px 20px' }}>
          <EmptyState
            icon={<AlertTriangleIcon />}
            message={app.connectionsError!}
            action={<div className="empty-action" onClick={() => app.loadConnections()}>Retry</div>}
          />
        </div>
      )}

      {showEmpty && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '64px 20px' }}>
          <EmptyState
            icon={<LinkOffIcon />}
            message="No cloud accounts connected yet"
            action={<div className="empty-action" onClick={() => app.startWizard()}>+ Add Connection</div>}
          />
        </div>
      )}

      {!showLoading && !showError && !showEmpty && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {connectionsDisplay.map((row) => (
            <ConnectionCard
              key={row.conn.id}
              conn={row.conn}
              providerMeta={row.providerMeta}
              statusLabel={row.statusLabel}
              statusColor={row.statusColor}
              statusBg={row.statusBg}
              onClick={() => app.openEditConnection(row.conn)}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
        Connections are re-validated automatically{' '}
        {app.healthCheckIntervalSeconds != null
          ? `every ${formatIntervalHuman(app.healthCheckIntervalSeconds)}`
          : 'periodically'}{' '}
        by a background health check.
      </div>

      {app.editingConnectionId && <EditConnectionDrawer app={app} />}
    </div>
  );
}
