import { Outlet, createRootRouteWithContext, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { LoginRouteComponent } from './components/LoginScreen';
import { ProtectedLayout } from './components/AppShell';
import { InventoryPage } from './components/inventory/InventoryScreen';
import { ConnectionsPage } from './components/connections/ConnectionsScreen';
import { WizardPage } from './components/wizard/WizardScreen';
import { UsersPage } from './components/users/UsersScreen';
import { NotFoundScreen } from './components/shared/NotFoundScreen';
import type { CirrusApp } from './state/useCirrusApp';

export const rootRoute = createRootRouteWithContext<{ app: CirrusApp }>()({
  component: () => <Outlet />,
});

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    authError: typeof search.authError === 'string' ? search.authError : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (context.app.currentUser) throw redirect({ to: '/inventory' });
  },
  component: LoginRouteComponent,
});

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

export const connectionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: 'connections',
  beforeLoad: requireAdmin,
  component: ConnectionsPage,
});

export const wizardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: 'connections/new',
  beforeLoad: requireAdmin,
  component: WizardPage,
});

export const usersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: 'users',
  beforeLoad: requireAdmin,
  component: UsersPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  protectedRoute.addChildren([inventoryRoute, connectionsRoute, wizardRoute, usersRoute]),
]);

// Real app context is injected per-render via <RouterProvider context={{ app }} /> in App.tsx —
// this placeholder is only used for typing the router before that first render.
export const router = createRouter({ routeTree, context: { app: undefined! }, defaultNotFoundComponent: NotFoundScreen });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
