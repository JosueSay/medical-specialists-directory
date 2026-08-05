import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clientEnv, STORAGE_KEYS, type Theme } from '@/config/env';
import { ThemeContext, type ThemeContextValue } from '@/theme/themeContext';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.theme);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Almacenamiento no disponible: se usa la preferencia por defecto
  }

  return clientEnv.defaultTheme;
}

/**
 * Aplica el tema como atributo `data-theme` en <html>, que es lo que leen los
 * tokens CSS y el variante `dark:` de Tailwind.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia(DARK_MEDIA_QUERY).matches,
  );

  // Suscripcion al sistema operativo: solo importa si la preferencia es `system`
  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Valor derivado, no estado propio: evita renders en cascada
  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);

    try {
      localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      // La preferencia no persiste entre recargas
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
