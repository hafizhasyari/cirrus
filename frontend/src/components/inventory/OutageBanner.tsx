import type { VmFetchError } from '../../types';

const PROVIDER_NAMES: Record<string, string> = {
  aws: 'AWS',
  gcp: 'Google Cloud',
  alibaba: 'Alibaba Cloud',
  oci: 'Oracle Cloud',
  biznet: 'Biznet Gio Cloud',
};

export function OutageBanner({ errors, onDismiss }: { errors: VmFetchError[]; onDismiss: () => void }) {
  const providerNames = [...new Set(errors.map((e) => PROVIDER_NAMES[e.provider] ?? e.provider))];
  const label = providerNames.length === 1 ? providerNames[0] : `${providerNames.length} providers`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--warning-bg)',
        border: '1px solid var(--warning-border)',
        borderRadius: 12,
        padding: '12px 16px',
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{ flexShrink: 0 }}>
        <path d="M12 3l10 18H2z" />
        <path d="M12 10v4" />
        <circle cx="12" cy="17.5" r="0.6" fill="#f59e0b" />
      </svg>
      <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)' }}>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{label} not responding.</span> Showing cached
        data where available. Other providers are live.
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={onDismiss}>Dismiss</div>
    </div>
  );
}
