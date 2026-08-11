import { ProviderBadge } from '../shared/ProviderBadge';
import { StatusDot } from '../shared/StatusDot';
import type { Provider, Vm } from '../../types';

export function VmDetailDrawer({
  vm,
  providerMeta,
  statusLabel,
  statusColor,
  cpuDisplay,
  memoryDisplay,
  publicIpDisplay,
  onClose,
}: {
  vm: Vm;
  providerMeta: Provider;
  statusLabel: string;
  statusColor: string;
  cpuDisplay: string;
  memoryDisplay: string;
  publicIpDisplay: string;
  onClose: () => void;
}) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" style={{ width: 'min(440px, 100vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <ProviderBadge provider={providerMeta} size={32} />
          <div style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </div>
        </div>

        <div>
          <div className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>{vm.name}</div>
          <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{vm.id}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 10 }}>
            <StatusDot color={statusColor} />
            {statusLabel}
          </div>
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>Specs</div>
          <div className="drawer-grid-2col">
            <Field label="Instance type" value={vm.type} mono />
            <Field label="CPU / Memory" value={`${cpuDisplay} · ${memoryDisplay}`} mono />
            <Field label="Region" value={vm.region} mono />
            <Field label="Account / project" value={vm.account} />
            <Field label="Launched" value={vm.launched} />
          </div>
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>Storage</div>
          <div className="drawer-grid-2col">
            {vm.disks.map((disk, i) => (
              <Field key={i} label={disk.label} value={`${disk.sizeGB} GB`} mono />
            ))}
            {vm.disks.length > 1 && (
              <Field label="Total" value={`${vm.disks.reduce((sum, d) => sum + d.sizeGB, 0)} GB`} mono />
            )}
          </div>
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>Network</div>
          <div className="drawer-grid-2col">
            <Field label="Private IP" value={vm.privateIp} mono />
            <Field label="Public IP" value={publicIpDisplay} mono />
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          Cost &amp; billing data isn't part of this release — Cirrus is read-only inventory for now.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div className={mono ? 'font-mono' : undefined} style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
