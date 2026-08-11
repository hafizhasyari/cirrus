import type { ReactNode } from 'react';
import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { useApp } from '../state/AppContext';
import { useMediaQuery } from '../lib/useMediaQuery';
import { COMPACT_QUERY, MOBILE_QUERY } from '../lib/responsive';

export function ProtectedLayout() {
  const app = useApp();

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
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  return (
    <>
      <div
        style={{
          height: isMobile ? 'auto' : 72,
          minHeight: 72,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          gap: isMobile ? 10 : 0,
          paddingTop: isMobile ? 14 : 0,
          paddingBottom: isMobile ? 14 : 0,
          paddingRight: isMobile ? 16 : 32,
          paddingLeft: isMobile ? 62 : isCompact ? 62 : 32,
          boxSizing: 'border-box',
        }}
      >
        {header}
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: isMobile ? '16px' : '24px 32px 32px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </>
  );
}
