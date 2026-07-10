import apiClient from './apiClient';
import {ApiResponse, AuthTokens, SendOtpRequest, VerifyOtpRequest} from '../types/api.types';

export const authApi = {
  sendOtp: (data: SendOtpRequest) =>
    apiClient.post<ApiResponse<null>>('/auth/send-otp', data),

  verifyOtp: (data: VerifyOtpRequest) =>
    apiClient.post<ApiResponse<AuthTokens>>('/auth/verify-otp', data),

  refreshToken: (refreshToken: string) =>
    apiClient.post<ApiResponse<AuthTokens>>('/auth/refresh-token', {
      refreshToken,
      deviceInfo: 'Android',
    }),

  revokeToken: (refreshToken: string) =>
    apiClient.post<ApiResponse<null>>('/auth/revoke-token', {refreshToken}),
};
