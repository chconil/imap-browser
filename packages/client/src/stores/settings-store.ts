import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, NavigationMode } from '@imap-browser/shared';

interface SettingsState {
  // Local settings (persisted in localStorage)
  theme: Theme;
  navigationMode: NavigationMode;

  // Actions
  setTheme: (theme: Theme) => void;
  setNavigationMode: (mode: NavigationMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      navigationMode: 'dropdown',

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },

      setNavigationMode: (navigationMode) => {
        set({ navigationMode });
      },
    }),
    {
      name: 'settings-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
        }
      },
    },
  ),
);

function applyTheme(theme: Theme): void {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    root.classList.add(systemTheme);
  } else {
    root.classList.add(theme);
  }
}

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useSettingsStore.getState();
    if (theme === 'system') {
      applyTheme('system');
    }
  });
}
