export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="font-display" style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{message}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <div className="ghost-btn" onClick={onCancel}>Cancel</div>
          <div className="danger-btn" onClick={onConfirm}>{confirmLabel}</div>
        </div>
      </div>
    </div>
  );
}
