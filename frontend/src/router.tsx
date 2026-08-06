import { Outlet, createRootRouteWithContext, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { LoginScreen } from './components/LoginScreen';
import { ProtectedLayout, ScreenLayout } from './components/AppShell';
import { InventoryHeader, InventoryScreen } from './components/inventory/InventoryScreen';
import { ConnectionsHeader, ConnectionsScreen } from './components/connections/ConnectionsScreen';
import { WizardHeader, WizardScreen } from './components/wizard/WizardScreen';
import { UsersHeader, UsersScreen } from './components/users/UsersScreen';
import type { CirrusApp } from './state/useCirrusApp';

export const rootRoute = createRootRouteWithContext<{ app: CirrusApp }>()({
  component: () => <Outlet />,
});

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    if (context.app.currentUser) throw redirect({ to: '/inventory' });
  },
  component: LoginRouteComponent,
});

function LoginRouteComponent() {
  const { app } = loginRoute.useRouteContext();
  return <LoginScreen theme={app.theme} setTheme={app.setTheme} onContinue={app.goToInventoryFromLogin} />;
}

export const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: ({ context }) => {
    if (!context.app.currentUser) throw redirect({ to: '/' });
  },
  component: ProtectedLayout,
});

function requireAdmin({ context }: { context: { app: CirrusApp } }) {
  if (context.app.role !== 'admin') throw redirect({ to: '/inventory' });
}

export const inventoryRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: 'inventory',
  component: InventoryPage,
});

function InventoryPage() {
  const { app } = inventoryRoute.useRouteContext();
  return (
    <ScreenLayout header={<InventoryHeader app={app} />}>
      <InventoryScreen app={app} />
    </ScreenLayout>
  );
}

export const connectionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: 'connections',
  beforeLoad: requireAdmin,
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { app } = connectionsRoute.useRouteContext();
  return (
    <ScreenLayout header={<ConnectionsHeader app={app} />}>
      <ConnectionsScreen app={app} />
    </ScreenLayout>
  );
}

export const wizardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: 'connections/new',
  beforeLoad: requireAdmin,
  component: WizardPage,
});

function WizardPage() {
  const { app } = wizardRoute.useRouteContext();
  return (
    <ScreenLayout header={<WizardHeader app={app} />}>
      <WizardScreen app={app} />
    </ScreenLayout>
  );
}

export const usersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: 'users',
  beforeLoad: requireAdmin,
  component: UsersPage,
});

function UsersPage() {
  const { app } = usersRoute.useRouteContext();
  return (
    <ScreenLayout header={<UsersHeader app={app} />}>
      <UsersScreen app={app} />
    </ScreenLayout>
  );
}

const routeTree = rootRoute.addChildren([
  loginRoute,
  protectedRoute.addChildren([inventoryRoute, connectionsRoute, wizardRoute, usersRoute]),
]);

// Real app context is injected per-render via <RouterProvider context={{ app }} /> in App.tsx —
// this placeholder is only used for typing the router before that first render.
export const router = createRouter({ routeTree, context: { app: undefined! } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
