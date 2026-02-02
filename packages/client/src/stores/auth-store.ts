import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@imap-browser/shared';
import { authApi } from '@/lib/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,

      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { user } = await authApi.login({ email, password });
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (email, password, displayName) => {
        set({ isLoading: true });
        try {
          const { user } = await authApi.register({ email, password, displayName });
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          set({ user: null, isAuthenticated: false });
        }
      },

      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const { user } = await authApi.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
