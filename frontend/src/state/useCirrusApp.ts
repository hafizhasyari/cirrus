import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  createConnection,
  createUser,
  deleteConnection,
  deleteUser,
  getConfig,
  getConnections,
  getMe,
  getProviders,
  getUsers,
  getVmsStream,
  logout,
  refreshVmsStream,
  testConnection,
  updateConnection,
  updateUser,
} from '../api/client';
import { computeIdentifier } from '../lib/connectionIdentifier';
import { router } from '../router';
import type {
  AuthenticatedUser,
  Connection,
  ProviderId,
  ProviderWithFieldDefs,
  Role,
  Theme,
  User,
  Vm,
  VmFetchError,
  VmStatus,
  VmStreamFrame,
  WizardFormValues,
  WizardResult,
} from '../types';

interface UserFormValues {
  name: string;
  email: string;
  role: Role;
  accountConnectionIds: string[];
}

interface EditFormValues {
  account: string;
}

const MASKED_PLACEHOLDER = '••••••••••••••••••••';

const THEME_STORAGE_KEY = 'cirrus-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'light';
}

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
  // Session
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const role: Role = currentUser?.role ?? 'viewer';

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Data (fetch-driven — empty until the bootstrap/data effects below populate them)
  const [providers, setProviders] = useState<ProviderWithFieldDefs[]>([]);
  const [healthCheckIntervalSeconds, setHealthCheckIntervalSeconds] = useState<number | null>(null);
  // Per-connection maps rather than a single vms/vmErrors array — GET /api/vms
  // and POST /api/vms/refresh stream one NDJSON frame per connection as its
  // fetch settles (see api/client.ts's getVmsStream/refreshVmsStream), so each
  // connection's slice of state is updated independently as its frame arrives
  // instead of the whole list flipping at once when everything is done.
  const [vmsByConnection, setVmsByConnection] = useState<Map<string, Vm[]>>(new Map());
  const [vmErrorsByConnection, setVmErrorsByConnection] = useState<Map<string, VmFetchError>>(new Map());
  const [vmProgress, setVmProgress] = useState<{ done: number; total: number } | null>(null);
  const vms = useMemo(() => Array.from(vmsByConnection.values()).flat(), [vmsByConnection]);
  const vmErrors = useMemo(() => Array.from(vmErrorsByConnection.values()), [vmErrorsByConnection]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingVms, setIsLoadingVms] = useState(false);

  // VM detail drawer
  const [detailVmId, setDetailVmId] = useState<string | null>(null);

  // Inventory filters
  const [search, setSearch] = useState('');
  const [filterProviders, setFilterProviders] = useState<ProviderId[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<VmStatus[]>(['running', 'stopped']);
  const [filterOpen, setFilterOpen] = useState<'provider' | 'status' | null>(null);

  // Add-connection wizard
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [wizardProvider, setWizardProvider] = useState<ProviderId | null>(null);
  const [wizardAccount, setWizardAccount] = useState('');
  const [wizardForm, setWizardForm] = useState<WizardFormValues>({});
  const [wizardConnectionId, setWizardConnectionId] = useState<string | null>(null);
  const [wizardTesting, setWizardTesting] = useState(false);
  const [wizardResult, setWizardResult] = useState<WizardResult>(null);
  const [wizardFailureMessage, setWizardFailureMessage] = useState<string | null>(null);
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
  const [userForm, setUserForm] = useState<UserFormValues>({ name: '', email: '', role: 'viewer', accountConnectionIds: [] });
  const userDrawerModeRef = useLatestRef(userDrawerMode);
  const editingUserIdRef = useLatestRef(editingUserId);
  const userFormRef = useLatestRef(userForm);

  // Toast
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string, variant?: 'success' | 'error') => {
    clearTimeout(toastTimer.current);
    setToast({ message, variant });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // --- Session bootstrap: is there already a valid cookie? ---------------
  useEffect(() => {
    getMe()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  // Consumes an NDJSON VM stream (initial load or refresh), updating
  // vmsByConnection/vmErrorsByConnection/vmProgress frame by frame. The
  // `start` frame's connectionIds list is also used to prune any connection
  // that no longer exists (deleted since the last load) from state, so a
  // stale row doesn't linger forever once its connection is gone.
  const consumeVmStream = useCallback((streamFn: (onFrame: (f: VmStreamFrame) => void) => Promise<void>) => {
    setVmProgress({ done: 0, total: 0 });
    return streamFn((frame) => {
      if (frame.type === 'start') {
        const known = new Set(frame.connectionIds);
        setVmsByConnection((prev) => new Map([...prev].filter(([id]) => known.has(id))));
        setVmErrorsByConnection((prev) => new Map([...prev].filter(([id]) => known.has(id))));
        setVmProgress({ done: 0, total: frame.connectionIds.length });
      } else if (frame.type === 'connection') {
        setVmsByConnection((prev) => new Map(prev).set(frame.connectionId, frame.vms));
        setVmErrorsByConnection((prev) => {
          const next = new Map(prev);
          if (frame.error) next.set(frame.connectionId, frame.error);
          else next.delete(frame.connectionId);
          return next;
        });
        setVmProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
      } else if (frame.type === 'done') {
        setVmProgress(null);
      } else if (frame.type === 'ping') {
        // Liveness signal only, sent while a slow fetch (e.g. AWS) is still
        // in flight — no state to apply.
      }
    });
  }, []);

  // --- Once a session is confirmed, load everything the role can see ------
  useEffect(() => {
    if (!currentUser) return;

    getProviders(true)
      .then((data) => {
        setProviders(data);
        setFilterProviders(data.map((p) => p.id));
      })
      .catch((err) => showToast(errorMessage(err, 'Failed to load providers')));

    getConfig()
      .then((data) => setHealthCheckIntervalSeconds(data.healthCheckIntervalSeconds))
      .catch((err) => showToast(errorMessage(err, 'Failed to load app config')));

    // React StrictMode double-invokes effects in dev, which would otherwise
    // fire two overlapping /api/vms streams racing on the same state — an
    // AbortController lets the cleanup below cancel a stale run.
    const vmsAbort = new AbortController();
    setIsLoadingVms(true);
    consumeVmStream((onFrame) => getVmsStream(onFrame, vmsAbort.signal))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        showToast(errorMessage(err, 'Failed to load inventory'));
      })
      .finally(() => setIsLoadingVms(false));

    if (currentUser.role === 'admin') {
      getConnections()
        .then(setConnections)
        .catch((err) => showToast(errorMessage(err, 'Failed to load connections')));

      getUsers()
        .then(setUsers)
        .catch((err) => showToast(errorMessage(err, 'Failed to load users')));
    }

    return () => vmsAbort.abort();
  }, [currentUser, showToast, consumeVmStream]);

  const go = useCallback((next: '/inventory' | '/connections' | '/users') => {
    router.navigate({ to: next });
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
    setVmsByConnection(new Map());
    setVmErrorsByConnection(new Map());
    setVmProgress(null);
    setConnections([]);
    setUsers([]);
    router.navigate({ to: '/' });
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
    if (vmProgress) return; // a stream is already in flight — ignore re-entrant clicks
    setIsLoadingVms(true);
    try {
      await consumeVmStream(refreshVmsStream);
      showToast('Inventory refreshed');
    } catch (err) {
      showToast(errorMessage(err, 'Refresh failed'));
      setVmProgress(null);
    } finally {
      setIsLoadingVms(false);
    }
  }, [consumeVmStream, vmProgress, showToast]);

  const startWizard = useCallback(() => {
    router.navigate({ to: '/connections/new' });
    setWizardStep(1);
    setWizardProvider(null);
    setWizardAccount('');
    setWizardForm({});
    setWizardConnectionId(null);
    setWizardResult(null);
    setWizardFailureMessage(null);
    setWizardTesting(false);
  }, []);

  const selectWizardProvider = useCallback((id: ProviderId) => {
    setWizardProvider(id);
    setWizardStep(2);
    setWizardAccount('');
    setWizardForm({});
    setWizardConnectionId(null);
    setWizardResult(null);
    setWizardFailureMessage(null);
  }, []);

  const wizardBackToStep1 = useCallback(() => {
    setWizardStep(1);
    setWizardProvider(null);
    setWizardResult(null);
    setWizardFailureMessage(null);
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
    setWizardFailureMessage(null);
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

      const result = await testConnection(id);
      setWizardResult(result.result);
      setWizardFailureMessage(result.result === 'failure' ? result.message : null);
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: result.result === 'success' ? 'active' : 'error' } : c)),
      );
    } catch (err) {
      showToast(errorMessage(err, 'Test failed'));
    } finally {
      setWizardTesting(false);
    }
  }, [wizardProviderRef, wizardFormRef, wizardAccountRef, wizardConnectionIdRef, showToast]);

  const editRetry = useCallback(() => {
    setWizardResult(null);
    setWizardFailureMessage(null);
  }, []);

  // The connection already exists (created during runTest) — this step is
  // now just navigation, not a second create call.
  const saveConnection = useCallback(() => {
    router.navigate({ to: '/connections' });
    showToast('Connection added');
  }, [showToast]);

  const openEditConnection = useCallback((conn: Connection) => {
    const providerMeta = providers.find((p) => p.id === conn.provider);
    const defs = providerMeta?.fieldDefs ?? [];
    const vals: WizardFormValues = {};
    defs.forEach((f) => {
      if (f.kind === 'text') vals[f.key] = (conn.config[f.key] as string) ?? '';
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
    setUserForm({ name: u.name, email: u.email, role: u.role, accountConnectionIds: u.connectionIds });
  }, []);

  const openInviteUser = useCallback(() => {
    setUserDrawerMode('invite');
    setEditingUserId(null);
    setUserForm({ name: '', email: '', role: 'viewer', accountConnectionIds: [] });
  }, []);

  const closeUserDrawer = useCallback(() => setUserDrawerMode(null), []);

  const updateUserField = useCallback((key: 'name' | 'email', val: string) => {
    setUserForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const setUserFormRole = useCallback((role: Role) => {
    setUserForm((prev) => ({ ...prev, role }));
  }, []);

  const toggleUserFormConnection = useCallback((connectionId: string) => {
    setUserForm((prev) => ({
      ...prev,
      accountConnectionIds: prev.accountConnectionIds.includes(connectionId)
        ? prev.accountConnectionIds.filter((id) => id !== connectionId)
        : [...prev.accountConnectionIds, connectionId],
    }));
  }, []);

  const saveUser = useCallback(async () => {
    const wasInvite = userDrawerModeRef.current === 'invite';
    const f = userFormRef.current;
    // Only send accountConnectionIds for viewers — omitting it for admins
    // leaves any pre-existing assignment untouched (PATCH/POST semantics),
    // and an admin's DTO ignores assignments anyway.
    const accountConnectionIds = f.role === 'viewer' ? f.accountConnectionIds : undefined;
    try {
      if (userDrawerModeRef.current === 'edit') {
        const id = editingUserIdRef.current;
        if (!id) return;
        const updated = await updateUser(id, { name: f.name, email: f.email, role: f.role, accountConnectionIds });
        setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      } else {
        const created = await createUser({ name: f.name, email: f.email, role: f.role, accountConnectionIds });
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
    role, currentUser, authChecked, theme, setTheme, go, goToInventoryFromLogin, signOut,
    // data
    providers, healthCheckIntervalSeconds, vms, vmErrors, connections, users,
    isLoadingVms, vmProgress,
    // vm detail
    detailVmId, openDetail, closeDetail,
    // inventory filters
    search, setSearch, filterProviders, filterStatuses, toggleProviderFilter, toggleStatusFilter, clearFilters,
    selectAllProviders, selectAllStatuses, refreshInventory,
    filterOpen, toggleFilterOpen, closeFilterOpen,
    // connections
    openEditConnection, closeEditConnection,
    editingConnectionId, editForm, editFieldValues, editTesting, editTested,
    updateEditAccount, updateEditFieldValue, runEditTest, saveEditConnection, removeEditConnection,
    // wizard
    startWizard, wizardStep, wizardProvider, wizardAccount, wizardForm, wizardTesting, wizardResult, wizardFailureMessage,
    selectWizardProvider, wizardBackToStep1, updateWizardAccount, updateWizardField, runTest, editRetry, saveConnection,
    // users
    userDrawerMode, editingUserId, userForm, openEditUser, openInviteUser, closeUserDrawer,
    updateUserField, setUserFormRole, toggleUserFormConnection, saveUser, removeUser,
    // toast
    toast, showToast,
  };
}

export type CirrusApp = ReturnType<typeof useCirrusApp>;
