import apiClient from './apiClient';
import {ApiResponse, Notification, PagedResult} from '../types/api.types';

export const notificationApi = {
  getAll: (params: {onlyUnread?: boolean; pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<Notification>>>('/notifications', {params}),

  getUnreadCount: () =>
    apiClient.get<ApiResponse<{count: number}>>('/notifications/unread-count'),

  markRead: (notificationId: number) =>
    apiClient.put<ApiResponse<null>>(`/notifications/${notificationId}/read`),

  markAllRead: () =>
    apiClient.put<ApiResponse<null>>('/notifications/read-all'),

  registerDeviceToken: (token: string) =>
    apiClient.post<ApiResponse<null>>('/notifications/device-token', {token, platform: 'android'}),
};
