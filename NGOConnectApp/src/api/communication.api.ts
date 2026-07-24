import apiClient from './apiClient';
import { ApiResponse } from '../types/api.types';

export interface CommunicationPreferences {
  receivePushNotifications:      boolean;
  receivePromotionalEmails:      boolean;
  receivePromotionalSms:         boolean;
  receiveNgoUpdates:             boolean;
  receiveDonationAlerts:         boolean;
  receiveVolunteerOpportunities: boolean;
}

const DEFAULT_PREFS: CommunicationPreferences = {
  receivePushNotifications:      true,
  receivePromotionalEmails:      true,
  receivePromotionalSms:         true,
  receiveNgoUpdates:             true,
  receiveDonationAlerts:         true,
  receiveVolunteerOpportunities: true,
};

export { DEFAULT_PREFS };

export const communicationApi = {
  get: () =>
    apiClient.get<ApiResponse<CommunicationPreferences>>('/communication-preferences'),

  update: (prefs: CommunicationPreferences) =>
    apiClient.put<ApiResponse<null>>('/communication-preferences', prefs),
};
