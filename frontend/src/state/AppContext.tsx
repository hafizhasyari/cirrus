import { createContext, useContext } from 'react';
import type { CirrusApp } from './useCirrusApp';

export const AppContext = createContext<CirrusApp | null>(null);

export function useApp(): CirrusApp {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppContext.Provider');
  return app;
}
