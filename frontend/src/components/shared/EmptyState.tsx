import type { ReactNode } from 'react';

export function EmptyState({ icon, message, action }: { icon: ReactNode; message: string; action: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '64px 20px' }}>
      {icon}
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{message}</div>
      {action}
    </div>
  );
}

export function SearchOffIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function LinkOffIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6">
      <path d="M9 15L15 9" />
      <path d="M10 6l1.5-1.5a4 4 0 015.66 5.66L15.5 11.5" />
      <path d="M14 18l-1.5 1.5a4 4 0 01-5.66-5.66L8.5 12.5" />
    </svg>
  );
}
