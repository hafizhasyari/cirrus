import { useEffect, useMemo, useState } from 'react';
import { FilterDropdown } from './FilterDropdown';
import { OutageBanner } from './OutageBanner';
import { SkeletonRows } from './SkeletonRows';
import { VmTable, type VmRowView } from './VmTable';
import { VmDetailDrawer } from './VmDetailDrawer';
import { EmptyState, SearchOffIcon } from '../shared/EmptyState';
import { StatCard } from '../shared/StatCard';
import { STATUS_META } from '../../theme/ThemeContext';
import type { CirrusApp } from '../../state/useCirrusApp';
import type { ProviderId, VmStatus } from '../../types';

export function InventoryHeader({ app }: { app: CirrusApp }) {
  return (
    <>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Workspace</div>
        <div className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>Inventory</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            className="search-input"
            value={app.search}
            onChange={(e) => app.setSearch(e.target.value)}
            placeholder="Search name or ID"
          />
        </div>
        <div className="ghost-btn" onClick={() => app.refreshInventory()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
          Refresh
        </div>
      </div>
    </>
  );
}

export function InventoryScreen({ app }: { app: CirrusApp }) {
  const { providers, vms, vmErrors, search, filterProviders, filterStatuses, filterOpen, isLoadingVms, detailVmId } = app;

  const [outageDismissed, setOutageDismissed] = useState(false);
  useEffect(() => setOutageDismissed(false), [vmErrors]);

  const providerMap = useMemo(() => {
    const m: Record<string, (typeof providers)[number]> = {};
    providers.forEach((p) => (m[p.id] = p));
    return m;
  }, [providers]);

  const stats = useMemo(
    () => ({
      total: vms.length,
      running: vms.filter((v) => v.status === 'running').length,
      attention: vms.filter((v) => v.status === 'stopped').length,
      providers: providers.length,
    }),
    [vms, providers],
  );

  const providerFilterList = useMemo(
    () =>
      providers.map((p) => ({
        id: p.id,
        label: p.name,
        color: p.color,
        checked: filterProviders.includes(p.id),
        count: vms.filter((v) => v.provider === p.id).length,
      })),
    [providers, filterProviders, vms],
  );

  const statusFilterList = useMemo(
    () =>
      (['running', 'stopped'] as VmStatus[]).map((id) => ({
        id,
        label: STATUS_META[id].label,
        color: STATUS_META[id].color,
        checked: filterStatuses.includes(id),
        count: vms.filter((v) => v.status === id).length,
      })),
    [filterStatuses, vms],
  );

  const providerHasSelection = filterProviders.length < providers.length;
  const statusHasSelection = filterStatuses.length < 2;
  const providerTriggerLabel = providerHasSelection ? `Provider · ${filterProviders.length}` : 'Provider';
  const statusTriggerLabel = statusHasSelection ? `Status · ${filterStatuses.length}` : 'Status';

  const filtered = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return vms.filter(
      (v) =>
        filterProviders.includes(v.provider) &&
        filterStatuses.includes(v.status) &&
        (searchLower === '' || v.name.toLowerCase().includes(searchLower) || v.id.toLowerCase().includes(searchLower)),
    );
  }, [vms, filterProviders, filterStatuses, search]);

  const hasActiveFilters = filterProviders.length < providers.length || filterStatuses.length < 2 || search !== '';
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterProviders.length < providers.length) {
      chips.push({ key: 'p', label: `Provider (${filterProviders.length})`, clear: () => app.selectAllProviders() });
    }
    if (filterStatuses.length < 2) {
      chips.push({ key: 'st', label: `Status (${filterStatuses.length})`, clear: () => app.selectAllStatuses() });
    }
    if (search !== '') chips.push({ key: 'se', label: `"${search}"`, clear: () => app.setSearch('') });
    return chips;
  }, [filterProviders, filterStatuses, providers.length, search, app]);

  const showOutageBanner = vmErrors.length > 0 && !outageDismissed;
  const showSkeleton = isLoadingVms;
  const displayVms = filtered;
  const showEmpty = !showSkeleton && displayVms.length === 0;
  const showTable = !showSkeleton && !showEmpty;

  const rows: VmRowView[] = useMemo(
    () =>
      displayVms.slice(0, 100).map((v) => {
        const sm = STATUS_META[v.status];
        return {
          ...v,
          providerMeta: providerMap[v.provider],
          statusLabel: sm.label,
          statusColor: sm.color,
          cpuDisplay: `${v.cpu} ${v.provider === 'oci' ? 'OCPU' : 'vCPU'}`,
          memoryDisplay: `${v.memory} GB`,
          publicIpDisplay: v.publicIp || '—',
        };
      }),
    [displayVms, providerMap],
  );

  const detailSrc = vms.find((v) => v.id === detailVmId) || null;
  const detailStatusMeta = detailSrc ? STATUS_META[detailSrc.status] : null;

  const emptyActionLabel = 'Clear filters';
  const emptyActionFn = () => app.clearFilters();

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, flexShrink: 0 }}>
        <StatCard label="Total VMs" value={stats.total} />
        <StatCard label="Running" value={stats.running} color="#10b981" />
        <StatCard label="Stopped" value={stats.attention} color="#f43f5e" />
        <StatCard label="Providers connected" value={stats.providers} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <FilterDropdown
          triggerLabel={providerTriggerLabel}
          open={filterOpen === 'provider'}
          hasSelection={providerHasSelection}
          options={providerFilterList}
          onToggleOpen={() => app.toggleFilterOpen('provider')}
          onToggleOption={(id) => app.toggleProviderFilter(id as ProviderId)}
          onSelectAll={() => app.selectAllProviders()}
          onDone={() => app.closeFilterOpen()}
        />
        <FilterDropdown
          triggerLabel={statusTriggerLabel}
          open={filterOpen === 'status'}
          hasSelection={statusHasSelection}
          options={statusFilterList}
          onToggleOpen={() => app.toggleFilterOpen('status')}
          onToggleOption={(id) => app.toggleStatusFilter(id as VmStatus)}
          onSelectAll={() => app.selectAllStatuses()}
          onDone={() => app.closeFilterOpen()}
        />
      </div>

      {!!filterOpen && <div className="filter-backdrop" onClick={() => app.closeFilterOpen()} />}

      {hasActiveFilters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          {activeChips.map((chip) => (
            <div key={chip.key} className="filter-chip" onClick={chip.clear}>
              {chip.label} <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => app.clearFilters()}>Clear all</div>
        </div>
      )}

      {showOutageBanner && <OutageBanner errors={vmErrors} onDismiss={() => setOutageDismissed(true)} />}

      <div className="card" style={{ overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {showSkeleton && <SkeletonRows />}
        {showEmpty && (
          <EmptyState
            icon={<SearchOffIcon />}
            message="No VMs match your filters"
            action={<div className="empty-action" onClick={emptyActionFn}>{emptyActionLabel}</div>}
          />
        )}
        {showTable && <VmTable rows={rows} onRowClick={(id) => app.openDetail(id)} />}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>
        Showing {rows.length} of {vms.length} VMs · fetched in parallel from 5 providers
      </div>

      {detailSrc && detailStatusMeta && (
        <VmDetailDrawer
          vm={detailSrc}
          providerMeta={providerMap[detailSrc.provider]}
          statusLabel={detailStatusMeta.label}
          statusColor={detailStatusMeta.color}
          cpuDisplay={`${detailSrc.cpu} ${detailSrc.provider === 'oci' ? 'OCPU' : 'vCPU'}`}
          memoryDisplay={`${detailSrc.memory} GB`}
          publicIpDisplay={detailSrc.publicIp || '—'}
          onClose={() => app.closeDetail()}
        />
      )}
    </div>
  );
}
