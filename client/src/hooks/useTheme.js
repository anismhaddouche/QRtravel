import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'qrtravel.theme';
const THEMES = ['dark', 'light'];

function readInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.includes(saved)) return saved;
  } catch { /* ignore */ }
  return 'light';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  // shadcn's dark variant keys on a `.dark` class — keep it in sync.
  document.documentElement.classList.toggle('dark', theme === 'dark');
  // Helps the browser pick the right native scrollbars / form controls.
  document.documentElement.style.colorScheme = theme;
}

// Apply at module load so the first paint already has the right theme
// (no FOUC). Safe to call multiple times.
applyTheme(readInitialTheme());

export function useTheme() {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (THEMES.includes(next)) setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, setTheme, toggle };
}
