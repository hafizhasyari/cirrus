import { useEffect, useMemo, useState } from 'react';
import { FilterDropdown } from './FilterDropdown';
import { OutageBanner } from './OutageBanner';
import { SkeletonRows } from './SkeletonRows';
import { VmTable, type VmRowView } from './VmTable';
import { VmDetailDrawer } from './VmDetailDrawer';
import { AlertTriangleIcon, EmptyState, SearchOffIcon } from '../shared/EmptyState';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 0 }}>
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
        {app.vmProgress && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Refreshing {app.vmProgress.done}/{app.vmProgress.total} connections…
          </div>
        )}
        <div
          className="ghost-btn"
          style={app.vmProgress ? { opacity: 0.6, cursor: 'default' } : undefined}
          onClick={() => {
            if (!app.vmProgress) app.refreshInventory();
          }}
        >
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
  const {
    providers, vms, vmErrors, connections, search,
    filterProviders, filterStatuses, filterAccounts, filterRegions, filterOpen,
    isLoadingVms, detailVmId,
  } = app;

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
      providers: connections.filter((c) => c.status === 'active').length,
    }),
    [vms, connections],
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

  // Unlike provider/status, there's no fixed universe of accounts/regions —
  // the option list is whatever distinct values are currently in vms, and
  // filterAccounts/filterRegions being null means "unrestricted" rather than
  // "seeded to the full list" (see useCirrusApp.ts). [] is a distinct state
  // meaning the user explicitly selected zero (via Unselect all). So checked
  // has to treat a null filter as everything checked, not an empty array.
  // An account/region always belongs to a single provider connection, so its
  // dot color can borrow that provider's brand color (same as providerFilterList)
  // instead of a flat accent — looked up from any vm sharing that account/region.
  const accountFilterList = useMemo(() => {
    const known = Array.from(new Set(vms.map((v) => v.account))).sort((a, b) => a.localeCompare(b));
    return known.map((id) => {
      const owner = vms.find((v) => v.account === id);
      return {
        id,
        label: id,
        color: (owner && providerMap[owner.provider]?.color) || 'var(--accent)',
        checked: filterAccounts === null || filterAccounts.includes(id),
        count: vms.filter((v) => v.account === id).length,
      };
    });
  }, [vms, filterAccounts, providerMap]);

  const regionFilterList = useMemo(() => {
    const known = Array.from(new Set(vms.map((v) => v.region))).sort((a, b) => a.localeCompare(b));
    return known.map((id) => {
      const owner = vms.find((v) => v.region === id);
      return {
        id,
        label: id,
        color: (owner && providerMap[owner.provider]?.color) || 'var(--accent)',
        checked: filterRegions === null || filterRegions.includes(id),
        count: vms.filter((v) => v.region === id).length,
      };
    });
  }, [vms, filterRegions, providerMap]);

  const providerHasSelection = filterProviders.length < providers.length;
  const statusHasSelection = filterStatuses.length < 2;
  const accountHasSelection = filterAccounts !== null;
  const regionHasSelection = filterRegions !== null;
  const providerTriggerLabel = providerHasSelection ? `Provider · ${filterProviders.length}` : 'Provider';
  const statusTriggerLabel = statusHasSelection ? `Status · ${filterStatuses.length}` : 'Status';
  const accountTriggerLabel = accountHasSelection ? `Account · ${filterAccounts?.length ?? 0}` : 'Account';
  const regionTriggerLabel = regionHasSelection ? `Region · ${filterRegions?.length ?? 0}` : 'Region';

  const filtered = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return vms.filter(
      (v) =>
        filterProviders.includes(v.provider) &&
        filterStatuses.includes(v.status) &&
        (filterAccounts === null || filterAccounts.includes(v.account)) &&
        (filterRegions === null || filterRegions.includes(v.region)) &&
        (searchLower === '' || v.name.toLowerCase().includes(searchLower) || v.id.toLowerCase().includes(searchLower)),
    );
  }, [vms, filterProviders, filterStatuses, filterAccounts, filterRegions, search]);

  const hasActiveFilters =
    filterProviders.length < providers.length ||
    filterStatuses.length < 2 ||
    filterAccounts !== null ||
    filterRegions !== null ||
    search !== '';
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterProviders.length < providers.length) {
      chips.push({ key: 'p', label: `Provider (${filterProviders.length})`, clear: () => app.selectAllProviders() });
    }
    if (filterStatuses.length < 2) {
      chips.push({ key: 'st', label: `Status (${filterStatuses.length})`, clear: () => app.selectAllStatuses() });
    }
    if (filterAccounts !== null) {
      chips.push({ key: 'ac', label: `Account (${filterAccounts.length})`, clear: () => app.selectAllAccounts() });
    }
    if (filterRegions !== null) {
      chips.push({ key: 're', label: `Region (${filterRegions.length})`, clear: () => app.selectAllRegions() });
    }
    if (search !== '') chips.push({ key: 'se', label: `"${search}"`, clear: () => app.setSearch('') });
    return chips;
  }, [filterProviders, filterStatuses, filterAccounts, filterRegions, providers.length, search, app]);

  const showOutageBanner = vmErrors.length > 0 && !outageDismissed;
  // Only blank the whole table on the very first load — once at least one
  // connection's VMs have arrived, later frames (initial load or refresh)
  // update rows in place instead of hiding the table again.
  const showSkeleton = isLoadingVms && vms.length === 0;
  const displayVms = filtered;
  // A total fetch failure (rejected before any NDJSON frame arrived) leaves
  // vms empty just like a genuinely empty account — distinguish the two so
  // the "no VMs match your filters" copy/action isn't shown for a load error.
  const showLoadError = !showSkeleton && vms.length === 0 && !!app.vmsLoadError;
  const showEmpty = !showSkeleton && !showLoadError && displayVms.length === 0;
  const showTable = !showSkeleton && !showLoadError && !showEmpty;

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
          privateIpDisplay: v.privateIp || '—',
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
      <div className="stat-grid" style={{ flexShrink: 0 }}>
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
          onUnselectAll={() => app.unselectAllProviders()}
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
          onUnselectAll={() => app.unselectAllStatuses()}
          onDone={() => app.closeFilterOpen()}
        />
        <FilterDropdown
          triggerLabel={accountTriggerLabel}
          open={filterOpen === 'account'}
          hasSelection={accountHasSelection}
          options={accountFilterList}
          onToggleOpen={() => app.toggleFilterOpen('account')}
          onToggleOption={(id) => app.toggleAccountFilter(id)}
          onSelectAll={() => app.selectAllAccounts()}
          onUnselectAll={() => app.unselectAllAccounts()}
          onDone={() => app.closeFilterOpen()}
        />
        <FilterDropdown
          triggerLabel={regionTriggerLabel}
          open={filterOpen === 'region'}
          hasSelection={regionHasSelection}
          options={regionFilterList}
          onToggleOpen={() => app.toggleFilterOpen('region')}
          onToggleOption={(id) => app.toggleRegionFilter(id)}
          onSelectAll={() => app.selectAllRegions()}
          onUnselectAll={() => app.unselectAllRegions()}
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
        {showLoadError && (
          <EmptyState
            icon={<AlertTriangleIcon />}
            message={app.vmsLoadError!}
            action={<div className="empty-action" onClick={() => app.refreshInventory()}>Retry</div>}
          />
        )}
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
        Showing {rows.length} of {vms.length} VMs
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
          privateIpDisplay={detailSrc.privateIp || '—'}
          launchedDisplay={detailSrc.launched || '—'}
          onClose={() => app.closeDetail()}
        />
      )}
    </div>
  );
}
