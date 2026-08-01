import { Platform } from 'react-native';
import apiClient from './apiClient';
import {ApiResponse, Notification, PagedResult} from '../types/api.types';

export const notificationApi = {
  getAll: (params: {onlyUnread?: boolean; pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<Notification>>>('/notifications', {params}),

  getUnreadCount: () =>
    apiClient.get<ApiResponse<{unreadCount: number}>>('/notifications/unread-count'),

  markRead: (notificationId: number) =>
    apiClient.put<ApiResponse<null>>(`/notifications/${notificationId}/read`),

  markAllRead: () =>
    apiClient.put<ApiResponse<null>>('/notifications/read-all'),

  registerDeviceToken: (token: string) =>
    apiClient.post<ApiResponse<null>>('/notifications/device-token', {token, platform: Platform.OS}),

  sendTest: (payload: {
    token:        string;
    title:        string;
    body:         string;
    notifType?:   string;
    refId?:       number;
    refType?:     string;
    // CAMPAIGN extras
    deepLink?:    string;
    actionLabel?: string;
    imageUrl?:    string;
  }) =>
    apiClient.post<ApiResponse<null>>('/notifications/send-test', payload),

  // ── CAMPAIGN delivery acknowledgment ─────────────────────────────────────
  // Call this the moment the app renders a CAMPAIGN notification (foreground
  // or background). Fire-and-forget — never block notification rendering on
  // the response. A missed ack just means one row won't show as confirmed-
  // delivered in the Super Admin dashboard; not worth retrying aggressively.
  acknowledgeDelivery: (campaignRecipientId: string) =>
    apiClient.post<ApiResponse<null>>(
      `/campaign-recipients/${campaignRecipientId}/delivered`,
    ),
};
