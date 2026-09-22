import { useApp } from '../../state/AppContext';

export function CopyButton({ value }: { value: string }) {
  const app = useApp();
  return (
    <span
      className="copy-btn"
      title="Copy to clipboard"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        app.showToast('Copied to clipboard');
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </span>
  );
}
