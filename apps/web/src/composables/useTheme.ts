import { ref } from 'vue';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'oq-theme';
const mode = ref<ThemeMode>('auto');

export function applyTheme(next: ThemeMode): void {
  mode.value = next;
  const root = document.documentElement;
  if (next === 'auto') {
    root.removeAttribute('data-theme');
    localStorage.removeItem(STORAGE_KEY);
  } else {
    root.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEY, next);
  }
}

export function initTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    applyTheme(stored);
  } else {
    applyTheme('auto');
  }
}

export function useTheme() {
  function toggle(): void {
    if (mode.value === 'auto') applyTheme('dark');
    else if (mode.value === 'dark') applyTheme('light');
    else applyTheme('auto');
  }
  return { mode, applyTheme, toggle };
}
