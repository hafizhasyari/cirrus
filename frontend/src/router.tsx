import { useEffect } from 'react';
import { Outlet, createRootRouteWithContext, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { LoginScreen } from './components/LoginScreen';
import { ProtectedLayout, ScreenLayout } from './components/AppShell';
import { InventoryHeader, InventoryScreen } from './components/inventory/InventoryScreen';
import { ConnectionsHeader, ConnectionsScreen } from './components/connections/ConnectionsScreen';
import { WizardHeader, WizardScreen } from './components/wizard/WizardScreen';
import { UsersHeader, UsersScreen } from './components/users/UsersScreen';
import { useApp } from './state/AppContext';
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

// Codes redirected from the auth service (backend/auth/src/oidc/errorRedirect.ts)
// when /auth/callback or /auth/dev-login can't complete the login flow.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_FLOW: 'Sesi login sudah tidak valid atau kedaluwarsa. Klik Continue with Microsoft untuk mencoba lagi.',
  STATE_MISMATCH: 'Login gagal diverifikasi. Klik Continue with Microsoft untuk mencoba lagi.',
  NETWORK_ERROR: 'Gagal terhubung ke Microsoft. Cek koneksi internet lalu coba lagi.',
  OAUTH_ERROR: 'Login dibatalkan atau ditolak oleh Microsoft.',
  NOT_INVITED: 'Akun Microsoft ini belum diundang ke Cirrus. Hubungi Admin untuk meminta akses.',
  MISSING_CLAIMS: 'Login gagal karena data akun tidak lengkap. Coba lagi atau hubungi Admin.',
  RBAC_UNAVAILABLE: 'Layanan sedang bermasalah. Coba lagi beberapa saat.',
  BAD_REQUEST: 'Permintaan login tidak valid.',
};
const DEFAULT_AUTH_ERROR_MESSAGE = 'Login gagal. Coba lagi.';

function LoginRouteComponent() {
  const app = useApp();
  const { showToast } = app;
  const { authError } = loginRoute.useSearch();
  const navigate = loginRoute.useNavigate();

  useEffect(() => {
    if (!authError) return;
    showToast(AUTH_ERROR_MESSAGES[authError] ?? DEFAULT_AUTH_ERROR_MESSAGE, 'error');
    navigate({ to: '/', search: {}, replace: true });
  }, [authError, showToast, navigate]);

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
  const app = useApp();
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
  const app = useApp();
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
  const app = useApp();
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
  const app = useApp();
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
