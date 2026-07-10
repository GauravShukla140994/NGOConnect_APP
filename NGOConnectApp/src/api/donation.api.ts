import apiClient from './apiClient';
import {ApiResponse, DonationCampaign, DonationTransaction, RecurringDonation, PagedResult} from '../types/api.types';

export const donationApi = {
  listCampaigns: (params: {orgId?: number; keyword?: string; pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<DonationCampaign>>>('/donation/campaigns', {params}),

  getCampaign: (campaignId: number) =>
    apiClient.get<ApiResponse<DonationCampaign>>(`/donation/campaigns/${campaignId}`),

  createCampaign: (data: Partial<DonationCampaign>) =>
    apiClient.post<ApiResponse<{campaignId: number}>>('/donation/campaigns', data),

  initiateDonation: (data: {campaignId: number; amount: number; note?: string; isAnonymous?: boolean; payMethodLkpId: number}) =>
    apiClient.post<ApiResponse<{donationRef: string; razorpayOrderId?: string}>>('/donation/donate', data),

  confirmPayment: (donationRef: string) =>
    apiClient.post<ApiResponse<null>>('/donation/confirm-payment', {donationRef}),

  getHistory: (params: {pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<DonationTransaction>>>('/donation/history', {params}),

  getReceipt: (receiptId: number) =>
    apiClient.get<ApiResponse<{receiptUrl: string}>>(`/donation/receipts/${receiptId}`),

  setupRecurring: (data: {orgId: number; campaignId?: number; amount: number; frequencyLkpId: number; startDate: string}) =>
    apiClient.post<ApiResponse<null>>('/donation/recurring', data),

  pauseRecurring: (recurringId: number) =>
    apiClient.put<ApiResponse<null>>(`/donation/recurring/${recurringId}/pause`),

  resumeRecurring: (recurringId: number) =>
    apiClient.put<ApiResponse<null>>(`/donation/recurring/${recurringId}/resume`),

  cancelRecurring: (recurringId: number) =>
    apiClient.delete<ApiResponse<null>>(`/donation/recurring/${recurringId}`),

  getAnnualSummary: (year: number) =>
    apiClient.get('/donation/annual-summary', {params: {year}}),

  getSupportedNgos: () =>
    apiClient.get('/donation/supported-ngos'),
};
