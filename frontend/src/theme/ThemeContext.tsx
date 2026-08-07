import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Theme } from '../types';

export const STATUS_META = {
  running: { label: 'Running', color: '#10b981' },
  stopped: { label: 'Stopped', color: '#f43f5e' },
} as const;

export const CONN_STATUS_META = {
  active: { label: 'Active', color: '#10b981' },
  error: { label: 'Error', color: '#f43f5e' },
  expired: { label: 'Expired', color: '#f59e0b' },
  pending: { label: 'Pending', color: null },
} as const;

/** Adjusts a provider's `rgba(...)` background swatch to the theme's alpha convention. */
export function providerBgForTheme(bg: string, theme: Theme): string {
  const alpha = theme === 'dark' ? 0.24 : 0.13;
  return bg.replace(/[\d.]+\)$/, `${alpha})`);
}

/** Translucent badge background for a status/hex color, tuned per theme. */
export function statusBgForTheme(hexColor: string, theme: Theme): string {
  const alphaHex = theme === 'dark' ? '2e' : '1f';
  return `${hexColor}${alphaHex}`;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  theme,
  setTheme,
  children,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
