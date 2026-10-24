import { useCallback, useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';
const listeners = new Set<() => void>();

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* almacenamiento bloqueado: se usa el tema del sistema */
  }
  return 'system';
}

// Una sola fuente de verdad para toda la app: todos los componentes ven el mismo tema.
let current: ThemePreference = readStored();

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(preference: ThemePreference): void {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  apply(current);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (current !== 'system') return;
    apply('system');
    emit();
  };
  media.addEventListener('change', onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystemChange);
  };
}

const getPreference = () => current;
const getIsDark = () => document.documentElement.classList.contains('dark');

function setTheme(next: ThemePreference): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* si no se puede recordar, el tema igualmente se aplica en esta sesión */
  }
  apply(next);
  emit();
}

/** Solo para pruebas: vuelve a leer la preferencia guardada. */
export function resetThemeForTests(): void {
  current = readStored();
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getPreference);
  const isDark = useSyncExternalStore(subscribe, getIsDark);
  const setPreference = useCallback((next: ThemePreference) => setTheme(next), []);
  return { preference, isDark, setPreference };
}
