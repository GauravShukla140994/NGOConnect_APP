import apiClient from './apiClient';
import { ApiResponse } from '../types/api.types';

export interface TriggerSosPayload {
  alertTypeLkpId: number;
  orgId?: number;
  latitude: number;
  longitude: number;
  approxLocation?: string;
  description?: string;
}

export interface SosResponderItem {
  sosResponderId: number;
  userId: number;
  responderName: string;
  profilePhoto?: string;
  approvalStatus: string;   // PENDING | APPROVED | REJECTED
  respondedAt: string;
  canViewLocation: boolean;
}

export interface SosIncidentDetail {
  sosIncidentId: number;
  orgId?: number;
  orgName?: string;
  alertType: string;        // SOS_ALERT | HELP_REQUEST | MISSING_VOLUNTEER | SAFE_ARRIVAL
  alertTypeName: string;
  description?: string;
  approxLocation?: string;
  latitude?: number;
  longitude?: number;
  status: string;           // ACTIVE | RESOLVED | CANCELLED
  createdAt: string;
  resolvedAt?: string;      // set when status = RESOLVED
  cancelledAt?: string;     // set when status = CANCELLED (CancelledAt column)
  responders: SosResponderItem[];
}

export const sosApi = {
  /** Trigger a new SOS incident */
  trigger: (data: TriggerSosPayload) =>
    apiClient.post<ApiResponse<{ sosIncidentId: number }>>('/sos', data),

  /** All active SOS incidents visible to user in their org (community feed — active only) */
  getActive: (orgId?: number) =>
    apiClient.get<ApiResponse<any[]>>('/sos/active', { params: { orgId } }),

  /** All SOS incidents for an org — active + resolved + cancelled, newest first (community history) */
  getOrgAlerts: (orgId: number, limit = 20) =>
    apiClient.get<ApiResponse<any[]>>('/sos/org-alerts', { params: { orgId, limit } }),

  /** Victim's own active incident + responders (s-sos-active screen) */
  getMyActive: () =>
    apiClient.get<ApiResponse<SosIncidentDetail>>('/sos/my-active'),

  /** Full incident details + responders (View Details button) */
  getById: (sosIncidentId: number) =>
    apiClient.get<ApiResponse<SosIncidentDetail>>(`/sos/${sosIncidentId}`),

  /** "I Can Assist" — register as a responder */
  respond: (sosIncidentId: number) =>
    apiClient.post<ApiResponse<null>>(`/sos/${sosIncidentId}/respond`),

  /** Victim approves a responder — field renamed: sosResponderId (not responderId) */
  approveResponder: (sosIncidentId: number, data: { sosResponderId: number; canViewLocation: boolean }) =>
    apiClient.put<ApiResponse<null>>(`/sos/${sosIncidentId}/approve-responder`, data),

  /** Victim declines a responder request */
  declineResponder: (sosIncidentId: number, sosResponderId: number) =>
    apiClient.put<ApiResponse<null>>(`/sos/${sosIncidentId}/decline-responder`, { sosResponderId }),

  /** Mark incident as resolved — no request body */
  resolve: (sosIncidentId: number) =>
    apiClient.put<ApiResponse<null>>(`/sos/${sosIncidentId}/resolve`),

  /** Cancel incident with optional reason */
  cancel: (sosIncidentId: number, cancelReason?: string) =>
    apiClient.put<ApiResponse<null>>(`/sos/${sosIncidentId}/cancel`, { cancelReason }),

  /** Get latest GPS location (approved responders only) */
  getLatestLocation: (sosIncidentId: number) =>
    apiClient.get<ApiResponse<{ latitude: number; longitude: number; accuracy?: number; loggedAt: string }>>(
      `/sos/${sosIncidentId}/location`,
    ),

  /** Push victim's current GPS location (~every 10s) */
  updateLocation: (sosIncidentId: number, data: { latitude: number; longitude: number; accuracy?: number }) =>
    apiClient.post<ApiResponse<null>>(`/sos/${sosIncidentId}/location`, data),
};
