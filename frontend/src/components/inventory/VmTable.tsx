import { ProviderBadge } from '../shared/ProviderBadge';
import { StaleBadge } from '../shared/StaleBadge';
import { StatusDot } from '../shared/StatusDot';
import type { Provider, Vm } from '../../types';

export interface VmRowView extends Vm {
  providerMeta: Provider;
  statusLabel: string;
  statusColor: string;
  cpuDisplay: string;
  memoryDisplay: string;
  publicIpDisplay: string;
}

export function VmTable({ rows, onRowClick }: { rows: VmRowView[]; onRowClick: (id: string) => void }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <table className="cirrus-table">
        <thead>
          <tr>
            <th className="th">Name</th>
            <th className="th">Provider</th>
            <th className="th">Account</th>
            <th className="th">Region</th>
            <th className="th">Status</th>
            <th className="th">Type</th>
            <th className="th">CPU</th>
            <th className="th">Memory</th>
            <th className="th">Disk</th>
            <th className="th">IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((vm) => (
            <tr key={vm.id} onClick={() => onRowClick(vm.id)}>
              <td className="td" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {vm.name}
                <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{vm.id}</div>
              </td>
              <td className="td" style={{ whiteSpace: 'nowrap' }}>
                <ProviderBadge provider={vm.providerMeta} size={26} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>{vm.providerMeta.name}</span>
              </td>
              <td className="td">{vm.account}</td>
              <td className="td font-mono">{vm.region}</td>
              <td className="td">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <StatusDot color={vm.statusColor} />
                  {vm.statusLabel}
                  {vm.stale && <StaleBadge />}
                </div>
              </td>
              <td className="td font-mono">{vm.type}</td>
              <td className="td font-mono" style={{ whiteSpace: 'nowrap' }}>{vm.cpuDisplay}</td>
              <td className="td font-mono">{vm.memoryDisplay}</td>
              <td className="td font-mono" style={{ whiteSpace: 'nowrap' }}>
                {vm.disks.map((d, i) => (
                  <div key={i}>{d.sizeGB} GB</div>
                ))}
              </td>
              <td className="td font-mono" style={{ whiteSpace: 'nowrap' }}>
                {vm.privateIp}
                <div style={{ color: 'var(--text-muted)' }}>{vm.publicIpDisplay}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
