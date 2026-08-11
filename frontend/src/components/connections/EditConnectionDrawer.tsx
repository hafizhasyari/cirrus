import { ProviderBadge } from '../shared/ProviderBadge';
import { CredentialFieldRow } from '../shared/CredentialField';
import { CONN_STATUS_META, statusBgForTheme, useTheme } from '../../theme/ThemeContext';
import { formatRelativeTime } from '../../lib/relativeTime';
import type { CirrusApp } from '../../state/useCirrusApp';

export function EditConnectionDrawer({ app }: { app: CirrusApp }) {
  const { theme } = useTheme();
  const conn = app.connections.find((c) => c.id === app.editingConnectionId);
  if (!conn) return null;

  const providerMeta = app.providers.find((p) => p.id === conn.provider)!;
  const statusMeta = CONN_STATUS_META[conn.status];
  const statusColor = statusMeta.color ?? 'var(--text-muted)';
  const statusBg = statusMeta.color ? statusBgForTheme(statusMeta.color, theme) : 'var(--surface-alt)';
  const fields = providerMeta?.fieldDefs ?? [];

  return (
    <div className="drawer-overlay" onClick={() => app.closeEditConnection()}>
      <div className="drawer-panel" style={{ width: 'min(440px, 100vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <ProviderBadge provider={providerMeta} size={32} />
          <div style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => app.closeEditConnection()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </div>
        </div>

        <div>
          <div className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>{providerMeta.name}</div>
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
              marginTop: 8,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
            {statusMeta.label}
          </div>
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Account name</div>
          <input
            className="field-input font-plain"
            value={app.editForm.account}
            onChange={(e) => app.updateEditAccount(e.target.value)}
          />
        </div>

        {fields.map((f) => (
          <CredentialFieldRow
            key={f.key}
            field={f}
            value={f.kind === 'generated' ? (f.value ?? '') : app.editFieldValues[f.key] || ''}
            onChange={(v) => app.updateEditFieldValue(f.key, v)}
          />
        ))}

        <div className="drawer-grid-2col" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>Last checked</div>
            <div style={{ fontSize: 12.5 }}>{formatRelativeTime(conn.lastChecked)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>Added by</div>
            <div style={{ fontSize: 12.5 }}>{conn.addedBy}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="ghost-btn" onClick={() => app.runEditTest()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M13 2L4.5 14h6L11 22l8.5-12h-6z" />
            </svg>
            Test Connection
          </div>
          {app.editTesting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12.5 }}>
              <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
                <path d="M21 12a9 9 0 11-2.6-6.4" />
              </svg>
              Testing…
            </div>
          )}
          {app.editTested && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 12.5, fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Validated
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f43f5e', cursor: 'pointer' }} onClick={() => app.removeEditConnection()}>
            Remove Connection
          </div>
          <div className="primary-btn" onClick={() => app.saveEditConnection()}>Save Changes</div>
        </div>
      </div>
    </div>
  );
}
