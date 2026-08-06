import { ProviderBadge } from '../shared/ProviderBadge';
import { formatRelativeTime } from '../../lib/relativeTime';
import type { Connection, Provider } from '../../types';

export function ConnectionCard({
  conn,
  providerMeta,
  statusLabel,
  statusColor,
  statusBg,
  onClick,
}: {
  conn: Connection;
  providerMeta: Provider;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  onClick: () => void;
}) {
  return (
    <div className="card card--clickable" style={{ padding: 18, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <ProviderBadge provider={providerMeta} size={30} iconSize={15} />
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: statusBg,
            color: statusColor,
            borderRadius: 20,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
          {statusLabel}
        </div>
      </div>
      <div>
        <div className="font-display" style={{ fontSize: 15, fontWeight: 700 }}>{conn.account}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{providerMeta.name}</div>
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          background: 'var(--surface-alt)',
          borderRadius: 7,
          padding: '8px 10px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {conn.identifier}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)',
          paddingTop: 11,
        }}
      >
        <span>{formatRelativeTime(conn.lastChecked)}</span>
        <span>Added by {conn.addedBy}</span>
      </div>
    </div>
  );
}
