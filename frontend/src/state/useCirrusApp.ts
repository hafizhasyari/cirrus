import { useCallback, useRef, useState } from 'react';
import { CONNECTIONS, FIELD_DEFS, PROVIDERS, USERS, generateVMs } from '../data/mockData';
import type {
  Connection,
  ConnectionsView,
  InventoryView,
  ProviderId,
  Role,
  Screen,
  Theme,
  User,
  Vm,
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

/** Keeps a ref in sync with the latest value of state on every render, so
 * setTimeout callbacks captured at click time can read the current value
 * instead of the value from the render they were created in. */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useCirrusApp(vmCount = 100) {
  // Screen / identity
  const [screen, setScreenState] = useState<Screen>('login');
  const [role, setRoleState] = useState<Role>('admin');
  const [theme, setTheme] = useState<Theme>('light');

  // Data
  const [vms] = useState<Vm[]>(() => generateVMs(vmCount));
  const [connections, setConnections] = useState<Connection[]>(() => CONNECTIONS.slice());
  const [users, setUsers] = useState<User[]>(() => USERS.slice());
  const connectionsRef = useLatestRef(connections);
  const usersRef = useLatestRef(users);

  // VM detail drawer
  const [detailVmId, setDetailVmId] = useState<string | null>(null);

  // Inventory filters + preview state
  const [search, setSearch] = useState('');
  const [filterProviders, setFilterProviders] = useState<ProviderId[]>(() => PROVIDERS.map((p) => p.id));
  const [filterStatuses, setFilterStatuses] = useState<VmStatus[]>(['running', 'stopped']);
  const [inventoryView, setInventoryView] = useState<InventoryView>('default');
  const [filterOpen, setFilterOpen] = useState<'provider' | 'status' | null>(null);

  // Connections screen
  const [connectionsView, setConnectionsView] = useState<ConnectionsView>('default');

  // Add-connection wizard
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [wizardProvider, setWizardProvider] = useState<ProviderId | null>(null);
  const [wizardForm, setWizardForm] = useState<WizardFormValues>({});
  const [wizardSimulate, setWizardSimulate] = useState<'success' | 'failure'>('success');
  const [wizardTesting, setWizardTesting] = useState(false);
  const [wizardResult, setWizardResult] = useState<WizardResult>(null);
  const wizardSimulateRef = useLatestRef(wizardSimulate);
  const wizardFormRef = useLatestRef(wizardForm);
  const wizardProviderRef = useLatestRef(wizardProvider);

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

  const go = useCallback((next: Screen) => {
    setScreenState(next);
    setDetailVmId(null);
  }, []);

  const goToInventoryFromLogin = useCallback(() => {
    setScreenState('inventory');
    setDetailVmId(null);
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    if (next === 'viewer') {
      setScreenState((s) => (s === 'connections' || s === 'wizard' || s === 'users' ? 'inventory' : s));
    }
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
    setFilterProviders(PROVIDERS.map((p) => p.id));
    setFilterStatuses(['running', 'stopped']);
    setSearch('');
  }, []);

  const toggleFilterOpen = useCallback((name: 'provider' | 'status') => {
    setFilterOpen((prev) => (prev === name ? null : name));
  }, []);
  const closeFilterOpen = useCallback(() => setFilterOpen(null), []);

  const selectAllProviders = useCallback(() => setFilterProviders(PROVIDERS.map((p) => p.id)), []);
  const selectAllStatuses = useCallback(() => setFilterStatuses(['running', 'stopped']), []);

  const refreshInventory = useCallback(() => showToast('Inventory refreshed'), [showToast]);

  const startWizard = useCallback(() => {
    setScreenState('wizard');
    setWizardStep(1);
    setWizardProvider(null);
    setWizardForm({});
    setWizardResult(null);
    setWizardTesting(false);
  }, []);

  const selectWizardProvider = useCallback((id: ProviderId) => {
    setWizardProvider(id);
    setWizardStep(2);
    setWizardForm({});
    setWizardResult(null);
  }, []);

  const wizardBackToStep1 = useCallback(() => {
    setWizardStep(1);
    setWizardProvider(null);
    setWizardResult(null);
  }, []);

  const updateWizardField = useCallback((key: string, val: string) => {
    setWizardForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const runTest = useCallback(() => {
    setWizardTesting(true);
    setWizardResult(null);
    setTimeout(() => {
      setWizardTesting(false);
      setWizardResult(wizardSimulateRef.current);
    }, 1100);
  }, [wizardSimulateRef]);

  const editRetry = useCallback(() => setWizardResult(null), []);

  const saveConnection = useCallback(() => {
    const vals = Object.values(wizardFormRef.current).filter(Boolean);
    const accountLabel = vals[0] || 'New account';
    const identifier = vals[1] || vals[0] || '—';
    const newConn: Connection = {
      id: `c${connectionsRef.current.length}-${accountLabel}`,
      provider: wizardProviderRef.current as ProviderId,
      account: accountLabel,
      identifier,
      status: 'active',
      lastChecked: 'just now',
      addedBy: 'You',
    };
    setConnections((prev) => [newConn, ...prev]);
    setScreenState('connections');
    showToast('Connection added');
  }, [connectionsRef, wizardFormRef, wizardProviderRef, showToast]);

  const openEditConnection = useCallback((conn: Connection) => {
    const defs = FIELD_DEFS[conn.provider] || [];
    const vals: WizardFormValues = {};
    defs.forEach((f, i) => {
      if (f.kind === 'text') vals[f.key] = i === 0 ? conn.identifier : '';
      if (f.kind === 'textarea') vals[f.key] = '••••••••••••••••••••';
    });
    setEditingConnectionId(conn.id);
    setEditForm({ account: conn.account });
    setEditFieldValues(vals);
    setEditTesting(false);
    setEditTested(false);
  }, []);

  const closeEditConnection = useCallback(() => setEditingConnectionId(null), []);

  const updateEditAccount = useCallback((val: string) => {
    setEditForm((prev) => ({ ...prev, account: val }));
    setEditTested(false);
  }, []);

  const updateEditFieldValue = useCallback((key: string, val: string) => {
    setEditFieldValues((prev) => ({ ...prev, [key]: val }));
    setEditTested(false);
  }, []);

  const runEditTest = useCallback(() => {
    setEditTesting(true);
    setEditTested(false);
    setTimeout(() => {
      setEditTesting(false);
      setEditTested(true);
    }, 1000);
  }, []);

  const saveEditConnection = useCallback(() => {
    const conn = connectionsRef.current.find((c) => c.id === editingConnectionIdRef.current);
    const defs = conn ? FIELD_DEFS[conn.provider] || [] : [];
    const firstText = defs.find((f) => f.kind === 'text');
    const identifier = (firstText && editFieldValuesRef.current[firstText.key]) || conn?.identifier;
    setConnections((prev) =>
      prev.map((c) =>
        c.id === editingConnectionIdRef.current
          ? { ...c, account: editFormRef.current.account, identifier: identifier ?? c.identifier, lastChecked: 'just now' }
          : c,
      ),
    );
    setEditingConnectionId(null);
    showToast('Connection updated');
  }, [connectionsRef, editingConnectionIdRef, editFieldValuesRef, editFormRef, showToast]);

  const removeEditConnection = useCallback(() => {
    setConnections((prev) => prev.filter((c) => c.id !== editingConnectionIdRef.current));
    setEditingConnectionId(null);
    showToast('Connection removed');
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

  const saveUser = useCallback(() => {
    const wasInvite = userDrawerModeRef.current === 'invite';
    const f = userFormRef.current;
    if (userDrawerModeRef.current === 'edit') {
      setUsers((prev) => prev.map((u) => (u.id === editingUserIdRef.current ? { ...u, name: f.name, email: f.email, role: f.role } : u)));
    } else {
      const newUser: User = {
        id: `u${usersRef.current.length + 1}-${f.email}`,
        name: f.name || 'Untitled User',
        email: f.email,
        role: f.role,
        accounts: [],
        status: 'pending',
        lastLogin: 'Never',
      };
      setUsers((prev) => [...prev, newUser]);
    }
    setUserDrawerMode(null);
    if (wasInvite) showToast(`Invitation sent to ${f.email || 'the user'}`);
    else showToast('User updated');
  }, [userDrawerModeRef, userFormRef, editingUserIdRef, usersRef, showToast]);

  const removeUser = useCallback(() => {
    setUsers((prev) => prev.filter((u) => u.id !== editingUserIdRef.current));
    setUserDrawerMode(null);
    showToast('User removed');
  }, [editingUserIdRef, showToast]);

  return {
    // identity / navigation
    screen, role, theme, setTheme, go, goToInventoryFromLogin, setRole,
    // data
    providers: PROVIDERS, vms, connections, users,
    // vm detail
    detailVmId, openDetail, closeDetail,
    // inventory filters
    search, setSearch, filterProviders, filterStatuses, toggleProviderFilter, toggleStatusFilter, clearFilters,
    selectAllProviders, selectAllStatuses, refreshInventory,
    inventoryView, setInventoryView, filterOpen, toggleFilterOpen, closeFilterOpen,
    // connections
    connectionsView, setConnectionsView,
    openEditConnection, closeEditConnection,
    editingConnectionId, editForm, editFieldValues, editTesting, editTested,
    updateEditAccount, updateEditFieldValue, runEditTest, saveEditConnection, removeEditConnection,
    // wizard
    startWizard, wizardStep, wizardProvider, wizardForm, wizardSimulate, wizardTesting, wizardResult,
    selectWizardProvider, wizardBackToStep1, updateWizardField, setWizardSimulate, runTest, editRetry, saveConnection,
    // users
    userDrawerMode, editingUserId, userForm, openEditUser, openInviteUser, closeUserDrawer,
    updateUserField, setUserFormRole, saveUser, removeUser,
    // toast
    toast, showToast,
  };
}

export type CirrusApp = ReturnType<typeof useCirrusApp>;
