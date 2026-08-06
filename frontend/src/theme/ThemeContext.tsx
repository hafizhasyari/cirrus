import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Theme } from '../types';

export interface ThemeTokens {
  pageBg: string;
  sidebarBg: string;
  surface: string;
  surfaceAlt: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  accentGradient: string;
  accentGlow: string;
  shadowCard: string;
  overlayBg: string;
  inputBg: string;
  successBg: string;
  successBorder: string;
  errorBg: string;
  errorBorder: string;
  warningBg: string;
  warningBorder: string;
}

const DARK_TOKENS: ThemeTokens = {
  pageBg: '#0a0b11', sidebarBg: '#111219', surface: '#15161f', surfaceAlt: '#1a1c27', surfaceHover: 'rgba(147,132,255,0.09)',
  border: 'rgba(255,255,255,0.08)', borderStrong: 'rgba(255,255,255,0.18)',
  textPrimary: '#f3f3f8', textSecondary: '#a4a7ba', textMuted: '#6d7086',
  accent: '#9384ff', accentSoft: 'rgba(147,132,255,0.16)', accentBorder: 'rgba(147,132,255,0.4)',
  accentGradient: 'linear-gradient(135deg,#8b7bff,#c084fc)', accentGlow: '0 6px 20px rgba(139,123,255,0.35)',
  shadowCard: '0 1px 2px rgba(0,0,0,0.3), 0 16px 40px rgba(0,0,0,0.5)',
  overlayBg: 'rgba(4,5,9,0.6)', inputBg: '#1a1c27',
  successBg: 'rgba(16,185,129,0.12)', successBorder: 'rgba(16,185,129,0.35)',
  errorBg: 'rgba(244,63,94,0.12)', errorBorder: 'rgba(244,63,94,0.35)',
  warningBg: 'rgba(245,158,11,0.12)', warningBorder: 'rgba(245,158,11,0.35)',
};

const LIGHT_TOKENS: ThemeTokens = {
  pageBg: '#f6f6fb', sidebarBg: '#ffffff', surface: '#ffffff', surfaceAlt: '#f4f4fa', surfaceHover: 'rgba(109,94,252,0.06)',
  border: 'rgba(20,20,35,0.08)', borderStrong: 'rgba(20,20,35,0.18)',
  textPrimary: '#16161f', textSecondary: '#585c70', textMuted: '#9396a8',
  accent: '#6d5efc', accentSoft: 'rgba(109,94,252,0.1)', accentBorder: 'rgba(109,94,252,0.35)',
  accentGradient: 'linear-gradient(135deg,#7c6bff,#a78bfa)', accentGlow: '0 6px 20px rgba(109,94,252,0.28)',
  shadowCard: '0 1px 2px rgba(20,20,35,0.04), 0 12px 32px rgba(20,20,35,0.07)',
  overlayBg: 'rgba(10,10,20,0.45)', inputBg: '#f9f9fd',
  successBg: 'rgba(16,185,129,0.08)', successBorder: 'rgba(16,185,129,0.3)',
  errorBg: 'rgba(244,63,94,0.08)', errorBorder: 'rgba(244,63,94,0.3)',
  warningBg: 'rgba(245,158,11,0.1)', warningBorder: 'rgba(245,158,11,0.32)',
};

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
  T: ThemeTokens;
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
  const T = useMemo(() => (theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS), [theme]);
  const value = useMemo(() => ({ theme, setTheme, T }), [theme, setTheme, T]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

// Re-exported so callers that only need local theme state (e.g. the login
// screen before the app shell mounts) don't have to duplicate useState wiring.
export function useThemeState(initial: Theme): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(initial);
  return [theme, setTheme];
}
