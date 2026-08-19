import { useMemo, type ReactNode } from 'react';
import type { Theme } from '../types';
import { ThemeContext } from './themeUtils';

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
