import { CheckboxBox } from '../shared/CheckboxBox';

export interface FilterOption {
  id: string;
  label: string;
  color: string;
  checked: boolean;
  count: number;
}

export function FilterDropdown({
  triggerLabel,
  open,
  hasSelection,
  options,
  onToggleOpen,
  onToggleOption,
  onSelectAll,
  onDone,
}: {
  triggerLabel: string;
  open: boolean;
  hasSelection: boolean;
  options: FilterOption[];
  onToggleOpen: () => void;
  onToggleOption: (id: string) => void;
  onSelectAll: () => void;
  onDone: () => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div className="filter-trigger" data-open={open} data-selected={hasSelection} onClick={onToggleOpen}>
        {triggerLabel}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && (
        <div className="dropdown-panel" onClick={(e) => e.stopPropagation()}>
          <div className="dropdown-rows">
            {options.map((opt) => (
              <div key={opt.id} className="dropdown-row" onClick={() => onToggleOption(opt.id)}>
                <CheckboxBox checked={opt.checked} color={opt.color} />
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                <span
                  title={opt.label}
                  style={{
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.count}</span>
              </div>
            ))}
          </div>
          <div className="dropdown-footer">
            <span style={{ cursor: 'pointer' }} onClick={onSelectAll}>Select all</span>
            <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onDone}>Done</span>
          </div>
        </div>
      )}
    </div>
  );
}
