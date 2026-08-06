import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createConnection,
  createUser,
  deleteConnection,
  deleteUser,
  getConnections,
  getMe,
  getProviders,
  getUsers,
  getVms,
  logout,
  refreshVms,
  testConnection,
  updateConnection,
  updateUser,
} from '../api/client';
import { computeIdentifier } from '../lib/connectionIdentifier';
import type {
  AuthenticatedUser,
  Connection,
  ConnectionsView,
  ProviderId,
  ProviderWithFieldDefs,
  Role,
  Screen,
  Theme,
  User,
  Vm,
  VmFetchError,
  VmStatus,
  WizardFormValues,
  WizardResult,
} from '../types';

interface UserFormValues {
  name: string;
  email: string;
  role: Role;
}

interface EditFormValues {
  account: string;
}

const MASKED_PLACEHOLDER = '••••••••••••••••••••';

/** Keeps a ref in sync with the latest value of state on every render, so
 * async callbacks captured at click time can read the current value
 * instead of the value from the render they were created in. */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function useCirrusApp() {
  // Screen / session
  const [screen, setScreenState] = useState<Screen>('login');
  const [theme, setTheme] = useState<Theme>('light');
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const role: Role = currentUser?.role ?? 'viewer';

  // Data (fetch-driven — empty until the bootstrap/data effects below populate them)
  const [providers, setProviders] = useState<ProviderWithFieldDefs[]>([]);
  const [vms, setVms] = useState<Vm[]>([]);
  const [vmErrors, setVmErrors] = useState<VmFetchError[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingVms, setIsLoadingVms] = useState(false);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // VM detail drawer
  const [detailVmId, setDetailVmId] = useState<string | null>(null);

  // Inventory filters
  const [search, setSearch] = useState('');
  const [filterProviders, setFilterProviders] = useState<ProviderId[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<VmStatus[]>(['running', 'stopped']);
  const [filterOpen, setFilterOpen] = useState<'provider' | 'status' | null>(null);

  // Connections screen
  const [connectionsView, setConnectionsView] = useState<ConnectionsView>('default');

  // Add-connection wizard
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [wizardProvider, setWizardProvider] = useState<ProviderId | null>(null);
  const [wizardAccount, setWizardAccount] = useState('');
  const [wizardForm, setWizardForm] = useState<WizardFormValues>({});
  const [wizardConnectionId, setWizardConnectionId] = useState<string | null>(null);
  const [wizardSimulate, setWizardSimulate] = useState<'success' | 'failure'>('success');
  const [wizardTesting, setWizardTesting] = useState(false);
  const [wizardResult, setWizardResult] = useState<WizardResult>(null);
  const wizardSimulateRef = useLatestRef(wizardSimulate);
  const wizardFormRef = useLatestRef(wizardForm);
  const wizardAccountRef = useLatestRef(wizardAccount);
  const wizardProviderRef = useLatestRef(wizardProvider);
  const wizardConnectionIdRef = useLatestRef(wizardConnectionId);

  // Edit connection drawer
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormValues>({ account: '' });
  const [editFieldValues, setEditFieldValues] = useState<WizardFormValues>({});
  const [editTesting, setEditTesting] = useState(false);
  const [editTested, setEditTested] = useState(false);
  const editingConnectionIdRef = useLatestRef(editingConnectionId);
  const editFormRef = useLatestRef(editForm);
  const editFieldValuesRef = useLatestRef(editFieldValues);

  // User drawer
  const [userDrawerMode, setUserDrawerMode] = useState<'edit' | 'invite' | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormValues>({ name: '', email: '', role: 'viewer' });
  const userDrawerModeRef = useLatestRef(userDrawerMode);
  const editingUserIdRef = useLatestRef(editingUserId);
  const userFormRef = useLatestRef(userForm);

  // Toast
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast({ message });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // --- Session bootstrap: is there already a valid cookie? ---------------
  useEffect(() => {
    getMe()
      .then((user) => {
        setCurrentUser(user);
        setScreenState('inventory');
      })
      .catch(() => {
        setCurrentUser(null);
        setScreenState('login');
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // --- Once a session is confirmed, load everything the role can see ------
  useEffect(() => {
    if (!currentUser) return;

    setIsLoadingProviders(true);
    getProviders(true)
      .then((data) => {
        setProviders(data);
        setFilterProviders(data.map((p) => p.id));
      })
      .catch((err) => showToast(errorMessage(err, 'Failed to load providers')))
      .finally(() => setIsLoadingProviders(false));

    setIsLoadingVms(true);
    getVms()
      .then((res) => {
        setVms(res.vms);
        setVmErrors(res.errors);
      })
      .catch((err) => showToast(errorMessage(err, 'Failed to load inventory')))
      .finally(() => setIsLoadingVms(false));

    if (currentUser.role === 'admin') {
      setIsLoadingConnections(true);
      getConnections()
        .then(setConnections)
        .catch((err) => showToast(errorMessage(err, 'Failed to load connections')))
        .finally(() => setIsLoadingConnections(false));

      setIsLoadingUsers(true);
      getUsers()
        .then(setUsers)
        .catch((err) => showToast(errorMessage(err, 'Failed to load users')))
        .finally(() => setIsLoadingUsers(false));
    }
  }, [currentUser, showToast]);

  const go = useCallback((next: Screen) => {
    setScreenState(next);
    setDetailVmId(null);
  }, []);

  // Real navigation to the Auth Service's OIDC login, not a local state flip.
  const goToInventoryFromLogin = useCallback(() => {
    window.location.href = '/auth/login';
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      // clear local state regardless of whether the network call succeeded
    }
    setCurrentUser(null);
    setVms([]);
    setVmErrors([]);
    setConnections([]);
    setUsers([]);
    setScreenState('login');
  }, []);

  const openDetail = useCallback((id: string) => setDetailVmId(id), []);
  const closeDetail = useCallback(() => setDetailVmId(null), []);

  const toggleProviderFilter = useCallback((id: ProviderId) => {
    setFilterProviders((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleStatusFilter = useCallback((id: VmStatus) => {
    setFilterStatuses((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const clearFilters = useCallback(() => {
    setFilterProviders(providers.map((p) => p.id));
    setFilterStatuses(['running', 'stopped']);
    setSearch('');
  }, [providers]);

  const toggleFilterOpen = useCallback((name: 'provider' | 'status') => {
    setFilterOpen((prev) => (prev === name ? null : name));
  }, []);
  const closeFilterOpen = useCallback(() => setFilterOpen(null), []);

  const selectAllProviders = useCallback(() => setFilterProviders(providers.map((p) => p.id)), [providers]);
  const selectAllStatuses = useCallback(() => setFilterStatuses(['running', 'stopped']), []);

  const refreshInventory = useCallback(async () => {
    setIsLoadingVms(true);
    try {
      const res = await refreshVms();
      setVms(res.vms);
      setVmErrors(res.errors);
      showToast('Inventory refreshed');
    } catch (err) {
      showToast(errorMessage(err, 'Refresh failed'));
    } finally {
      setIsLoadingVms(false);
    }
  }, [showToast]);

  const startWizard = useCallback(() => {
    setScreenState('wizard');
    setWizardStep(1);
    setWizardProvider(null);
    setWizardAccount('');
    setWizardForm({});
    setWizardConnectionId(null);
    setWizardResult(null);
    setWizardTesting(false);
  }, []);

  const selectWizardProvider = useCallback((id: ProviderId) => {
    setWizardProvider(id);
    setWizardStep(2);
    setWizardAccount('');
    setWizardForm({});
    setWizardConnectionId(null);
    setWizardResult(null);
  }, []);

  const wizardBackToStep1 = useCallback(() => {
    setWizardStep(1);
    setWizardProvider(null);
    setWizardResult(null);
  }, []);

  const updateWizardAccount = useCallback((val: string) => setWizardAccount(val), []);

  const updateWizardField = useCallback((key: string, val: string) => {
    setWizardForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Test Connection creates the connection on first test (status starts
  // 'pending' — an already-modeled, real status, not a workaround) so the
  // backend's per-connection test endpoint has something to operate on;
  // "Edit & Retry" reuses that same id instead of creating a second row.
  const runTest = useCallback(async () => {
    const provider = wizardProviderRef.current;
    if (!provider) return;
    setWizardTesting(true);
    setWizardResult(null);
    try {
      const identifier = computeIdentifier(provider, wizardFormRef.current);
      const account = wizardAccountRef.current || 'Untitled account';
      let id = wizardConnectionIdRef.current;

      if (!id) {
        const created = await createConnection({ provider, account, identifier, config: wizardFormRef.current });
        id = created.id;
        setWizardConnectionId(id);
        setConnections((prev) => [created, ...prev]);
      } else {
        const updated = await updateConnection(id, { account, identifier, config: wizardFormRef.current });
        setConnections((prev) => prev.map((c) => (c.id === id ? updated : c)));
      }

      const result = await testConnection(id, wizardSimulateRef.current);
      setWizardResult(result.result);
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: result.result === 'success' ? 'active' : 'error' } : c)),
      );
    } catch (err) {
      showToast(errorMessage(err, 'Test failed'));
    } finally {
      setWizardTesting(false);
    }
  }, [wizardProviderRef, wizardFormRef, wizardAccountRef, wizardConnectionIdRef, wizardSimulateRef, showToast]);

  const editRetry = useCallback(() => setWizardResult(null), []);

  // The connection already exists (created during runTest) — this step is
  // now just navigation, not a second create call.
  const saveConnection = useCallback(() => {
    setScreenState('connections');
    showToast('Connection added');
  }, [showToast]);

  const openEditConnection = useCallback((conn: Connection) => {
    const providerMeta = providers.find((p) => p.id === conn.provider);
    const defs = providerMeta?.fieldDefs ?? [];
    const vals: WizardFormValues = {};
    defs.forEach((f, i) => {
      if (f.kind === 'text') vals[f.key] = i === 0 ? conn.identifier : '';
      if (f.kind === 'textarea') vals[f.key] = MASKED_PLACEHOLDER;
    });
    setEditingConnectionId(conn.id);
    setEditForm({ account: conn.account });
    setEditFieldValues(vals);
    setEditTesting(false);
    setEditTested(false);
  }, [providers]);

  const closeEditConnection = useCallback(() => setEditingConnectionId(null), []);

  const updateEditAccount = useCallback((val: string) => {
    setEditForm((prev) => ({ ...prev, account: val }));
    setEditTested(false);
  }, []);

  const updateEditFieldValue = useCallback((key: string, val: string) => {
    setEditFieldValues((prev) => ({ ...prev, [key]: val }));
    setEditTested(false);
  }, []);

  const runEditTest = useCallback(async () => {
    const id = editingConnectionIdRef.current;
    if (!id) return;
    setEditTesting(true);
    setEditTested(false);
    try {
      const result = await testConnection(id);
      setEditTested(result.result === 'success');
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: result.result === 'success' ? 'active' : 'error' } : c)),
      );
      if (result.result === 'failure') showToast(result.message);
    } catch (err) {
      showToast(errorMessage(err, 'Test failed'));
    } finally {
      setEditTesting(false);
    }
  }, [editingConnectionIdRef, showToast]);

  const saveEditConnection = useCallback(async () => {
    const id = editingConnectionIdRef.current;
    if (!id) return;
    // Only send config if every field was genuinely (re)entered — secret
    // fields are prefilled blank/masked (never round-tripped to the
    // frontend), so a partial submit would otherwise overwrite real stored
    // credentials with blanks/bullets (the backend replaces the whole
    // config column, it doesn't merge).
    const entries = Object.entries(editFieldValuesRef.current);
    const allProvided = entries.length > 0 && entries.every(([, v]) => v && v !== MASKED_PLACEHOLDER);
    try {
      const updated = await updateConnection(id, {
        account: editFormRef.current.account,
        ...(allProvided ? { config: editFieldValuesRef.current } : {}),
      });
      setConnections((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingConnectionId(null);
      showToast('Connection updated');
    } catch (err) {
      showToast(errorMessage(err, 'Update failed'));
    }
  }, [editingConnectionIdRef, editFieldValuesRef, editFormRef, showToast]);

  const removeEditConnection = useCallback(async () => {
    const id = editingConnectionIdRef.current;
    if (!id) return;
    try {
      await deleteConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      setEditingConnectionId(null);
      showToast('Connection removed');
    } catch (err) {
      showToast(errorMessage(err, 'Remove failed'));
    }
  }, [editingConnectionIdRef, showToast]);

  const openEditUser = useCallback((u: User) => {
    setUserDrawerMode('edit');
    setEditingUserId(u.id);
    setUserForm({ name: u.name, email: u.email, role: u.role });
  }, []);

  const openInviteUser = useCallback(() => {
    setUserDrawerMode('invite');
    setEditingUserId(null);
    setUserForm({ name: '', email: '', role: 'viewer' });
  }, []);

  const closeUserDrawer = useCallback(() => setUserDrawerMode(null), []);

  const updateUserField = useCallback((key: 'name' | 'email', val: string) => {
    setUserForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const setUserFormRole = useCallback((role: Role) => {
    setUserForm((prev) => ({ ...prev, role }));
  }, []);

  const saveUser = useCallback(async () => {
    const wasInvite = userDrawerModeRef.current === 'invite';
    const f = userFormRef.current;
    try {
      if (userDrawerModeRef.current === 'edit') {
        const id = editingUserIdRef.current;
        if (!id) return;
        const updated = await updateUser(id, { name: f.name, email: f.email, role: f.role });
        setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      } else {
        // NOTE: no UI yet to pick which connections a new Viewer can see
        // (accountConnectionIds) — invited Viewers get zero accounts until
        // an Admin assigns some another way. Known gap, not built here.
        const created = await createUser({ name: f.name, email: f.email, role: f.role });
        setUsers((prev) => [...prev, created]);
      }
      setUserDrawerMode(null);
      showToast(wasInvite ? `Invitation sent to ${f.email || 'the user'}` : 'User updated');
    } catch (err) {
      showToast(errorMessage(err, 'Save failed'));
    }
  }, [userDrawerModeRef, userFormRef, editingUserIdRef, showToast]);

  const removeUser = useCallback(async () => {
    const id = editingUserIdRef.current;
    if (!id) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setUserDrawerMode(null);
      showToast('User removed');
    } catch (err) {
      showToast(errorMessage(err, 'Remove failed'));
    }
  }, [editingUserIdRef, showToast]);

  return {
    // identity / navigation
    screen, role, currentUser, authChecked, theme, setTheme, go, goToInventoryFromLogin, signOut,
    // data
    providers, vms, vmErrors, connections, users,
    isLoadingVms, isLoadingProviders, isLoadingConnections, isLoadingUsers,
    // vm detail
    detailVmId, openDetail, closeDetail,
    // inventory filters
    search, setSearch, filterProviders, filterStatuses, toggleProviderFilter, toggleStatusFilter, clearFilters,
    selectAllProviders, selectAllStatuses, refreshInventory,
    filterOpen, toggleFilterOpen, closeFilterOpen,
    // connections
    connectionsView, setConnectionsView,
    openEditConnection, closeEditConnection,
    editingConnectionId, editForm, editFieldValues, editTesting, editTested,
    updateEditAccount, updateEditFieldValue, runEditTest, saveEditConnection, removeEditConnection,
    // wizard
    startWizard, wizardStep, wizardProvider, wizardAccount, wizardForm, wizardSimulate, wizardTesting, wizardResult,
    selectWizardProvider, wizardBackToStep1, updateWizardAccount, updateWizardField, setWizardSimulate, runTest, editRetry, saveConnection,
    // users
    userDrawerMode, editingUserId, userForm, openEditUser, openInviteUser, closeUserDrawer,
    updateUserField, setUserFormRole, saveUser, removeUser,
    // toast
    toast, showToast,
  };
}

export type CirrusApp = ReturnType<typeof useCirrusApp>;
