/**
 * apiClient.ts — Axios instance with JWT auto-refresh interceptor
 * All API calls go through this client. Never use raw axios elsewhere.
 */
import axios, {AxiosInstance, InternalAxiosRequestConfig, AxiosError} from 'axios';
import {MMKV} from 'react-native-mmkv';
import AppConfig from '../config/AppConfig';
import {ApiResponse, AuthTokens} from '../types/api.types';

// ── Secure storage (10x faster than AsyncStorage) ────────────────────────────
export const storage = new MMKV();

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
};

export const tokenStorage = {
  getAccessToken: () => storage.getString(STORAGE_KEYS.ACCESS_TOKEN),
  getRefreshToken: () => storage.getString(STORAGE_KEYS.REFRESH_TOKEN),
  setTokens: (tokens: AuthTokens) => {
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  },
  clearTokens: () => {
    storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
    storage.delete(STORAGE_KEYS.REFRESH_TOKEN);
  },
};

// ── Axios instance ────────────────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: AppConfig.BASE_URL,
  timeout: AppConfig.API_TIMEOUT_MS,
  headers: {'Content-Type': 'application/json'},
});

// ── Request interceptor — attach JWT ─────────────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

// ── Token refresh state ───────────────────────────────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ── Response interceptor — auto refresh on 401 ───────────────────────────────
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({resolve, reject});
        })
          .then(token => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = tokenStorage.getRefreshToken();

      if (!refreshToken) {
        processQueue(error, null);
        isRefreshing = false;
        tokenStorage.clearTokens();
        // Trigger logout — handled by authStore listener
        return Promise.reject(error);
      }

      try {
        const response = await axios.post<ApiResponse<AuthTokens>>(
          `${AppConfig.BASE_URL}/auth/refresh-token`,
          {refreshToken, deviceInfo: 'Android'},
        );

        if (response.data.isSuccess === 1 && response.data.data) {
          const newTokens = response.data.data;
          tokenStorage.setTokens(newTokens);
          processQueue(null, newTokens.accessToken);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
          }
          return apiClient(originalRequest);
        } else {
          processQueue(error, null);
          tokenStorage.clearTokens();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        tokenStorage.clearTokens();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
