import apiClient from './apiClient';
import { AxiosResponse } from 'axios';
import { ApiResponse } from '../types/api.types';

// ── Request types ────────────────────────────────────────────────────────────

export interface SupportContactRequest {
  categoryCode:  string;
  categoryLabel: string;
  subject:       string;
  description:   string;
  contactEmail:  string;
  contactName:   string;
  /** Public URL returned by /media/upload?module=support-attachments (optional, ≤ 5 MB) */
  attachmentUrl?: string;
}

// ── API calls ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/contact
 * Submits a Help & Support request.
 * Logs to AuditLogs + emails support@ripplehub.app.
 * Returns raw AxiosResponse — access payload via res.data
 */
export const submitSupportContact = (
  request: SupportContactRequest,
): Promise<AxiosResponse<ApiResponse<null>>> =>
  apiClient.post<ApiResponse<null>>('/support/contact', request);
