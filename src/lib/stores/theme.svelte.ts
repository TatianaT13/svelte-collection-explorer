import { browser } from '$app/environment';

export type ThemeMode = 'light' | 'dark' | 'system';

function createThemeStore() {
  let mode = $state<ThemeMode>('system');

  if (browser) {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') mode = saved;
    } catch {
      /* stockage indisponible */
    }
  }

  function apply(m: ThemeMode) {
    if (!browser) return;
    const root = document.documentElement;
    if (m === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', m);
  }

  return {
    get mode() {
      return mode;
    },
    /** Thème effectivement affiché. */
    resolved(): 'light' | 'dark' {
      if (mode !== 'system') return mode;
      return browser && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    set(m: ThemeMode) {
      mode = m;
      apply(m);
      try {
        if (m === 'system') localStorage.removeItem('theme');
        else localStorage.setItem('theme', m);
      } catch {
        /* ignore */
      }
    },
    toggle() {
      this.set(this.resolved() === 'dark' ? 'light' : 'dark');
    }
  };
}

export const theme = createThemeStore();
