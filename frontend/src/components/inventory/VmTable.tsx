import { ProviderBadge } from '../shared/ProviderBadge';
import { ServiceBadge } from '../shared/ServiceBadge';
import { StaleBadge } from '../shared/StaleBadge';
import { StatusDot } from '../shared/StatusDot';
import type { Provider, Vm, VmSortColumn } from '../../types';

export interface VmRowView extends Vm {
  providerMeta: Provider;
  statusLabel: string;
  statusColor: string;
  cpuDisplay: string;
  memoryDisplay: string;
  publicIpDisplay: string;
  privateIpDisplay: string;
}

const COLUMNS: { key: VmSortColumn; label: string; width: number }[] = [
  { key: 'name', label: 'Name', width: 220 },
  { key: 'provider', label: 'Provider', width: 220 },
  { key: 'account', label: 'Account', width: 245 },
  { key: 'region', label: 'Region', width: 130 },
  { key: 'status', label: 'Status', width: 120 },
  { key: 'type', label: 'Type', width: 150 },
  { key: 'cpu', label: 'CPU', width: 100 },
  { key: 'memory', label: 'Memory', width: 115 },
  { key: 'disk', label: 'Disk', width: 100 },
  { key: 'ip', label: 'IP', width: 160 },
];

export function VmTable({
  rows,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
}: {
  rows: VmRowView[];
  sortColumn: VmSortColumn | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: VmSortColumn) => void;
  onRowClick: (id: string) => void;
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <table className="cirrus-table">
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
          {/* Absorbs whatever width is left over once the 10 real columns
              take their fixed widths, so the table fills its container
              instead of leaving a dead gap — see table-layout: fixed's
              column-width algorithm. On a viewport too narrow to fit the
              sum of fixed widths, this same algorithm makes the table
              render wider than its container instead of shrinking any
              column, so the ancestor's overflow:auto scrolls horizontally. */}
          <col key="spacer" />
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="th th-sortable"
                data-sorted={sortColumn === col.key}
                data-direction={sortColumn === col.key ? sortDirection : undefined}
                onClick={() => onSort(col.key)}
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
          {rows.map((vm) => (
            <tr key={vm.id} onClick={() => onRowClick(vm.id)}>
              <td className="td" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {vm.name}
                <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{vm.id}</div>
              </td>
              <td className="td">
                <ProviderBadge provider={vm.providerMeta} size={26} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>{vm.providerMeta.name}</span>
                {vm.service && (
                  <span style={{ marginLeft: 6 }}>
                    <ServiceBadge service={vm.service} />
                  </span>
                )}
              </td>
              <td className="td">{vm.account}</td>
              <td className="td font-mono">{vm.region}</td>
              <td className="td">
                <div className="status-cell">
                  <div className="status-cell-row">
                    <StatusDot color={vm.statusColor} />
                    {vm.statusLabel}
                  </div>
                  {vm.stale && <StaleBadge />}
                </div>
              </td>
              <td className="td font-mono">{vm.type}</td>
              <td className="td font-mono">{vm.cpuDisplay}</td>
              <td className="td font-mono">{vm.memoryDisplay}</td>
              <td className="td font-mono">
                {vm.disks.map((d, i) => (
                  <div key={i}>{d.sizeGB} GB</div>
                ))}
              </td>
              <td className="td font-mono">
                {vm.privateIpDisplay}
                <div style={{ color: 'var(--text-muted)' }}>{vm.publicIpDisplay}</div>
              </td>
              <td className="td" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
