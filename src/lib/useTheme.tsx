import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

export type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('tikrar-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    localStorage.setItem('tikrar-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      supabase
        .from('profiles')
        .update({ preferred_theme: next })
        .then(() => {});
      return next;
    });
  }, []);

  const setThemeExplicit = useCallback((t: Theme) => {
    setTheme(t);
    supabase
      .from('profiles')
      .update({ preferred_theme: t })
      .then(() => {});
  }, []);

  return { theme, toggle, setTheme: setThemeExplicit };
}

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="surface border-border-soft text-text-muted rounded-[9px] px-3 py-2 sm:px-3.5 sm:py-2.5 text-base cursor-pointer hover:text-amber hover:border-amber/40 transition-all"
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
    </button>
  );
}
