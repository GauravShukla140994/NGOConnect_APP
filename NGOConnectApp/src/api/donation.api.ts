import apiClient from './apiClient';
import {ApiResponse, DonationCampaign, DonationTransaction, RecurringDonation, PagedResult} from '../types/api.types';

export const donationApi = {
  // ── Campaigns ────────────────────────────────────────────────────────────────
  listCampaigns: (params: {orgId?: number; keyword?: string; pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<DonationCampaign>>>('/donation/campaigns', {params}),

  getCampaign: (campaignId: number) =>
    apiClient.get<ApiResponse<DonationCampaign>>(`/donation/campaigns/${campaignId}`),

  createCampaign: (data: Partial<DonationCampaign>) =>
    apiClient.post<ApiResponse<{campaignId: number}>>('/donation/campaigns', data),

  // ── Donation flow ─────────────────────────────────────────────────────────────
  /** Phase 1: Creates DB record → returns transactionId + donationId.
   *  Phase 2: Also returns gatewayOrderId for Razorpay. */
  initiateDonation: (data: {
    orgId: number;
    campaignId?: number;       // optional — null/undefined = general donation to org
    amount: number;
    donTypeCode: string;       // 'ONE_TIME' | 'MONTHLY' — SP resolves LkpId internally
    payMethodCode: string;     // 'UPI' | 'CARD' | 'NET_BANKING'
    visibilityCode: string;    // 'PUBLIC' | 'ANONYMOUS'
    donorPan?: string;
  }) =>
    apiClient.post<ApiResponse<{transactionId: number; donationId: string; gatewayOrderId: string | null}>>(
      '/donation/initiate', data),

  /** Confirm payment. Phase 1: pass statusCode="SUCCESS" to simulate. */
  confirmPayment: (data: {transactionId: number; statusCode: string; gatewayPaymentId?: string}) =>
    apiClient.post<ApiResponse<null>>('/donation/confirm', data),

  /** Get single donation detail (member view) */
  getDonationDetail: (donationRef: string) =>
    apiClient.get<ApiResponse<any>>(`/donation/detail/${donationRef}`),

  // ── Member views ──────────────────────────────────────────────────────────────
  getHistory: (params: {status?: string; pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<DonationTransaction>>>('/donation/history', {params}),

  getReceiptList: (params: {orgId?: number; dateFrom?: string; dateTo?: string; pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<any>>>('/donation/receipts', {params}),

  getRecurring: () =>
    apiClient.get<ApiResponse<RecurringDonation[]>>('/donation/recurring'),

  setupRecurring: (data: {orgId: number; campaignId?: number; amount: number; frequencyCode: string; startDate: string}) =>
    apiClient.post<ApiResponse<null>>('/donation/recurring', data),

  pauseRecurring: (recurringId: number) =>
    apiClient.put<ApiResponse<null>>(`/donation/recurring/${recurringId}/pause`),

  resumeRecurring: (recurringId: number) =>
    apiClient.put<ApiResponse<null>>(`/donation/recurring/${recurringId}/resume`),

  updateRecurring: (recurringId: number, data: { amount: number; frequencyCode: string }) =>
    apiClient.put<ApiResponse<null>>(`/donation/recurring/${recurringId}`, data),

  cancelRecurring: (recurringId: number) =>
    apiClient.delete<ApiResponse<null>>(`/donation/recurring/${recurringId}`),

  // ── Member analytics ──────────────────────────────────────────────────────────
  getAnnualSummary: (year: number) =>
    apiClient.get<ApiResponse<any>>('/donation/annual-summary', {params: {year}}),

  getSupportedNgos: () =>
    apiClient.get<ApiResponse<any[]>>('/donation/supported-ngos'),

  // ── Admin views ───────────────────────────────────────────────────────────────
  getOrgDashboard: (orgId: number) =>
    apiClient.get<ApiResponse<any[]>>(`/donation/org/${orgId}/dashboard`),

  getOrgTransactions: (orgId: number, params: {
    status?: string; dateFrom?: string; dateTo?: string;
    search?: string; pageNumber?: number; pageSize?: number;
  }) =>
    apiClient.get<ApiResponse<PagedResult<any>>>(`/donation/org/${orgId}/transactions`, {params}),

  getOrgDonorList: (orgId: number, params: {
    dateFrom?: string; dateTo?: string; search?: string;
    pageNumber?: number; pageSize?: number;
  }) =>
    apiClient.get<ApiResponse<PagedResult<any>>>(`/donation/org/${orgId}/donors`, {params}),

  getDonorDetail: (orgId: number, donorUserId: number, params?: {dateFrom?: string; dateTo?: string}) =>
    apiClient.get<ApiResponse<any[]>>(`/donation/org/${orgId}/donor/${donorUserId}`, {params}),

  getDonationDetailAdmin: (donationRef: string) =>
    apiClient.get<ApiResponse<any>>(`/donation/admin/detail/${donationRef}`),
};
