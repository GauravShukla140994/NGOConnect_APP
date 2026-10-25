import apiClient from './apiClient';
import { ApiResponse, UnclaimedMatch } from '../types/api.types';

// Imported ("unclaimed") organisations. Scenario A: the user signed in with a number that is on an imported listing.
// Nothing is auto-assigned — a claim goes to the RippleHub team for review.
export const unclaimedApi = {
  /** Listings whose imported contact number equals the signed-in user's number. */
  getMyMatches: () =>
    apiClient.get<ApiResponse<{ items: UnclaimedMatch[] }>>('/unclaimed-orgs/my-matches'),

  /** Link the organisation the user just registered (orgId) to the listing as an ownership claim. */
  claim: (data: { listingToken: string; orgId: number; notes?: string }) =>
    apiClient.post<ApiResponse<{ claimToken: string }>>('/unclaimed-orgs/claim', data),
};
