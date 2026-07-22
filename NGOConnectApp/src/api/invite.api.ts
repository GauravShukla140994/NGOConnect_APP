import apiClient from './apiClient';
import { ApiResponse, PagedResult } from '../types/api.types';

// ── Request types ────────────────────────────────────────────────────────────

export interface SendInviteRequest {
  inviteTypeCode: 'PHONE' | 'EMAIL';
  inviteValue: string;
  countryCode?: string;   // required for PHONE (e.g. '+91'), omit for EMAIL
}

// ── Response types ───────────────────────────────────────────────────────────

export interface SendInviteData {
  invitationId: number;
  existingUserFound: boolean;
  // Non-null when existingUserFound = true (show profile preview card)
  existingUserId?: number;
  existingUserName?: string;
  existingUserPhoto?: string;
  existingUserCity?: string;
  existingUserOrgCount?: number;
  // Non-null when existingUserFound = false (show share sheet)
  inviteLink?: string;
}

export interface OrgInvitation {
  orgInvitationId: number;
  inviteType: 'PHONE' | 'EMAIL';
  inviteValue: string;
  countryCode?: string;
  statusCode: 'PENDING' | 'OPENED' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
  statusName: string;
  sentAt?: string;
  tokenExpiry?: string;
  openedAt?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  deliveryStatus?: string;
  // Invitee info (null if not a platform user)
  invitedUserId?: number;
  inviteeName?: string;
  inviteeLastName?: string;
  inviteePhoto?: string;
  // Inviter info
  invitedByName?: string;
  invitedByPhoto?: string;
}

export interface VerifyTokenData {
  orgInvitationId: number;
  orgId: number;
  orgName: string;
  orgLogo?: string;
  orgCity?: string;
  orgAbout?: string;
  statusCode: string;
  inviteType: string;
  inviteValue: string;
  countryCode?: string;
  invitedUserId?: number;
  tokenExpiry: string;
  invitedByName: string;
  invitedByPhoto?: string;
}

export interface AcceptInviteData {
  joinType: string;   // 'REQUEST_SUBMITTED'
  orgId: number;
  orgName: string;
}

export interface PendingInviteItem {
  orgInvitationId: number;
  orgId: number;
  orgName: string;
  orgLogo?: string;
  orgCity?: string;
  inviteToken: string;
  statusCode: string;
  tokenExpiry: string;
  invitedByName: string;
  invitedByPhoto?: string;
}

// ── API calls ────────────────────────────────────────────────────────────────

export const inviteApi = {
  /** Admin: send a new invitation */
  send: (orgId: number, data: SendInviteRequest) =>
    apiClient.post<ApiResponse<SendInviteData>>(
      `/org/${orgId}/invite/send`, data),

  /** Admin: paged list of invitations */
  list: (
    orgId: number,
    params: { statusCode?: string; pageNumber?: number; pageSize?: number } = {},
  ) =>
    apiClient.get<ApiResponse<PagedResult<OrgInvitation>>>(
      `/org/${orgId}/invite/list`, { params }),

  /** Admin: cancel a pending invitation */
  cancel: (invitationId: number) =>
    apiClient.post<ApiResponse<null>>(
      `/org/invite/${invitationId}/cancel`),

  /** Invitee: decline their own pending invitation */
  decline: (invitationId: number) =>
    apiClient.post<ApiResponse<null>>(
      `/org/invite/${invitationId}/decline`),

  /** Admin: resend (refresh token + re-deliver) */
  resend: (invitationId: number) =>
    apiClient.post<ApiResponse<null>>(
      `/org/invite/${invitationId}/resend`),

  /** Public: validate a deep link token */
  verifyToken: (token: string) =>
    apiClient.get<ApiResponse<VerifyTokenData>>(
      `/org/invite/verify/${token}`),

  /** Authenticated: accept an invitation */
  accept: (invitationId: number) =>
    apiClient.post<ApiResponse<AcceptInviteData>>(
      `/org/invite/${invitationId}/accept`),

  /** Authenticated: pending invitations for logged-in user */
  getPending: () =>
    apiClient.get<ApiResponse<PendingInviteItem[]>>(
      '/org/invite/pending'),
};
