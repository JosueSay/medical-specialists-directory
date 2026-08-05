import { createContext } from 'react';
import type { Theme } from '@/config/env';

export interface ThemeContextValue {
  /** Preferencia elegida por la persona: puede ser `system`. */
  theme: Theme;
  /** Tema efectivamente aplicado tras resolver `system`. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
