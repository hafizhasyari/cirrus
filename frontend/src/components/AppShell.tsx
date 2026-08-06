import { Sidebar } from './Sidebar';
import { InventoryHeader, InventoryScreen } from './inventory/InventoryScreen';
import { ConnectionsHeader, ConnectionsScreen } from './connections/ConnectionsScreen';
import { WizardHeader, WizardScreen } from './wizard/WizardScreen';
import { UsersHeader, UsersScreen } from './users/UsersScreen';
import type { CirrusApp } from '../state/useCirrusApp';

export function AppShell({ app }: { app: CirrusApp }) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex' }}>
      <Sidebar
        screen={app.screen}
        role={app.role}
        theme={app.theme}
        onGo={app.go}
        onSetRole={app.setRole}
        onSetTheme={app.setTheme}
        onSignOut={() => app.go('login')}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
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
          {app.screen === 'inventory' && <InventoryHeader app={app} />}
          {app.screen === 'connections' && <ConnectionsHeader app={app} />}
          {app.screen === 'wizard' && <WizardHeader app={app} />}
          {app.screen === 'users' && <UsersHeader app={app} />}
        </div>

        <div style={{ flex: 1, overflow: 'hidden', padding: '24px 32px 32px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {app.screen === 'inventory' && <InventoryScreen app={app} />}
          {app.screen === 'connections' && <ConnectionsScreen app={app} />}
          {app.screen === 'wizard' && <WizardScreen app={app} />}
          {app.screen === 'users' && <UsersScreen app={app} />}
        </div>
      </div>
    </div>
  );
}
