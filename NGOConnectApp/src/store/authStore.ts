import {create} from 'zustand';
import {UserProfile, AuthTokens} from '../types/api.types';
import {tokenStorage} from '../api/apiClient';
import {authApi} from '../api/auth.api';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  tokens: AuthTokens | null;

  // Actions
  login: (tokens: AuthTokens, user?: UserProfile) => void;
  logout: () => Promise<void>;
  setUser: (user: UserProfile) => void;
  checkAuth: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: !!tokenStorage.getAccessToken(),
  isLoading: false,
  user: null,
  tokens: null,

  login: (tokens: AuthTokens, user?: UserProfile) => {
    tokenStorage.setTokens(tokens);
    set({
      isAuthenticated: true,
      tokens,
      user: user || null,
    });
  },

  logout: async () => {
    set({isLoading: true});
    try {
      const refreshToken = tokenStorage.getRefreshToken();
      if (refreshToken) {
        await authApi.revokeToken(refreshToken);
      }
    } catch {
      // Silently fail — clear tokens regardless
    } finally {
      tokenStorage.clearTokens();
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
        isLoading: false,
      });
    }
  },

  setUser: (user: UserProfile) => set({user}),

  checkAuth: () => {
    const token = tokenStorage.getAccessToken();
    const isAuth = !!token;
    set({isAuthenticated: isAuth});
    return isAuth;
  },
}));
