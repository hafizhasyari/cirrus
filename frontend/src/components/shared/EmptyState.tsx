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

export function UsersOffIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
      <path d="M16 8.5a3.2 3.2 0 010 6.36" />
      <path d="M20.5 19c0-2.4-1.6-4.4-3.8-5" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
