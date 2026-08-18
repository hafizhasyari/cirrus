import { useColumnResize } from '../../lib/columnResize';
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

const COLUMNS: { key: VmSortColumn; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'provider', label: 'Provider' },
  { key: 'account', label: 'Account' },
  { key: 'region', label: 'Region' },
  { key: 'status', label: 'Status' },
  { key: 'type', label: 'Type' },
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: 'Memory' },
  { key: 'disk', label: 'Disk' },
  { key: 'ip', label: 'IP' },
];

export const COLUMN_KEYS: VmSortColumn[] = COLUMNS.map((c) => c.key);

const FLUID_COLUMN_WIDTH = `${100 / COLUMNS.length}%`;

export function VmTable({
  rows,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  columnWidthOverrides,
  onResizeColumn,
  onResetColumnWidth,
}: {
  rows: VmRowView[];
  sortColumn: VmSortColumn | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: VmSortColumn) => void;
  onRowClick: (id: string) => void;
  columnWidthOverrides: Partial<Record<VmSortColumn, number>>;
  onResizeColumn: (column: VmSortColumn, width: number) => void;
  onResetColumnWidth: (column: VmSortColumn) => void;
}) {
  const startResize = useColumnResize(onResizeColumn);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <table className="cirrus-table">
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.key} style={{ width: columnWidthOverrides[col.key] ?? FLUID_COLUMN_WIDTH }} />
          ))}
          {/* Absorbs whatever width is left over once the 10 real columns
              take their explicit widths, so the table fills its container
              instead of leaving a dead gap — see table-layout: fixed's
              column-width algorithm. */}
          <col key="spacer" />
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((col, index) => (
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
                {index < COLUMNS.length - 1 && (
                  <span
                    className="th-resize-handle"
                    onMouseDown={(e) => startResize(e, col.key)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onResetColumnWidth(col.key);
                    }}
                  />
                )}
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
              <td className="td" style={{ whiteSpace: 'nowrap' }}>
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
