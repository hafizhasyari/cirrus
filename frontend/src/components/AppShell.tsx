import type { ReactNode } from 'react';
import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { protectedRoute } from '../router';

export function ProtectedLayout() {
  const { app } = protectedRoute.useRouteContext();

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex' }}>
      <Sidebar app={app} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
        <Outlet />
      </div>
    </div>
  );
}

/** Shared per-page chrome: the 72px header row + the scrollable content area
 * below it. Each route's page component supplies its own header/body pair
 * (the same components AppShell used to multiplex on `screen`), since a
 * single `<Outlet />` can only render one matched component, not a header
 * and body split across two separate containers. */
export function ScreenLayout({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <>
      <div
        style={{
          height: 72,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          boxSizing: 'border-box',
        }}
      >
        {header}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '24px 32px 32px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
    </>
  );
}
