/**
 * review.api.ts — NGO Reviews
 * Route base: /api/v1/orgs/{orgId}/reviews
 */
import apiClient from './apiClient';
import { ApiResponse, PagedResult } from '../types/api.types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewMediaItem {
  url:  string;
  type: 'IMAGE' | 'VIDEO';
}

export interface AddReviewPayload {
  overallRating: number;               // 1–5
  reviewText:    string;               // 20–500 chars
  reviewerType:  'VOLUNTEER' | 'DONOR' | 'GENERAL';
  mediaItems:    ReviewMediaItem[];     // pre-uploaded URLs
}

export interface ReviewAggregate {
  avgRating:    number;
  totalReviews: number;
  star5Pct:     number;
  star4Pct:     number;
  star3Pct:     number;
  star2Pct:     number;
  star1Pct:     number;
}

export interface ReviewItem {
  reviewId:          number;
  overallRating:     number;
  reviewText:        string;
  helpfulCount:      number;
  notHelpfulCount:   number;
  createdAt:         string;
  userId:            number;
  authorName:        string;
  authorAvatar:      string | null;
  reviewerType:      'VOLUNTEER' | 'DONOR' | 'GENERAL';
  currentUserVote:   1 | 0 | null;     // 1=helpful, 0=not helpful, null=no vote
  isOwnReview:       1 | 0;
  canDelete:         1 | 0;   // 1 if own review AND submitted within 30 days
  responseText:      string | null;
  responseCreatedAt: string | null;
  mediaItems:        ReviewMediaItem[] | null;
}

export type ReviewSort = 'RECENT' | 'HELPFUL' | 'HIGHEST' | 'LOWEST';

// ── API ───────────────────────────────────────────────────────────────────────

export const reviewApi = {
  /** Paged reviews for an NGO. Optional auth — pass currentUserId in header via JWT. */
  getList: (
    orgId:      number,
    sort:       ReviewSort = 'RECENT',
    pageNumber: number     = 1,
    pageSize:   number     = 10,
  ) =>
    apiClient.get<ApiResponse<PagedResult<ReviewItem>>>(
      `/orgs/${orgId}/reviews`,
      { params: { sort, pageNumber, pageSize } },
    ),

  /** Star histogram + totals for the Reviews tab header. */
  getAggregate: (orgId: number) =>
    apiClient.get<ApiResponse<ReviewAggregate>>(`/orgs/${orgId}/reviews/aggregate`),

  /** Submit a new review. MediaItems must be pre-uploaded blob URLs. */
  addReview: (orgId: number, payload: AddReviewPayload) =>
    apiClient.post<ApiResponse<null>>(`/orgs/${orgId}/reviews`, payload),

  /** Soft-delete own review. */
  deleteReview: (orgId: number, reviewId: number) =>
    apiClient.delete<ApiResponse<null>>(`/orgs/${orgId}/reviews/${reviewId}`),

  /**
   * Toggle helpful / not-helpful vote.
   * Sending the same isHelpful value twice removes the vote.
   */
  markHelpful: (orgId: number, reviewId: number, isHelpful: boolean) =>
    apiClient.post<ApiResponse<null>>(`/orgs/${orgId}/reviews/${reviewId}/helpful`, { isHelpful }),

  /** NGO admin posts official response to a review. */
  addResponse: (orgId: number, reviewId: number, responseText: string) =>
    apiClient.post<ApiResponse<null>>(
      `/orgs/${orgId}/reviews/${reviewId}/response`,
      { responseText },
    ),

  /** Flag a review for moderation. */
  reportReview: (orgId: number, reviewId: number) =>
    apiClient.post<ApiResponse<null>>(`/orgs/${orgId}/reviews/${reviewId}/report`),
};
