import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@hamilton/shared';
import { setStoredToken, clearStoredToken } from '../lib/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) => {
        setStoredToken(accessToken);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      logout: () => {
        clearStoredToken();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'hamilton-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-sync token to localStorage on hydration
        if (state?.accessToken) {
          setStoredToken(state.accessToken);
        }
      },
    },
  ),
);
