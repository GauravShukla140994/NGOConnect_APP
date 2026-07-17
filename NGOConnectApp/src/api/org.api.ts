import apiClient from './apiClient';
import { ApiResponse, Organisation, OrgMember, OrgDashboard, AdminPost, PagedResult } from '../types/api.types';

export const orgApi = {
  register: (data: Partial<Organisation>) =>
    apiClient.post<ApiResponse<{ orgId: number }>>('/org', data),

  getProfile: (orgId: number) =>
    apiClient.get<ApiResponse<Organisation>>(`/org/${orgId}`),

  update: (orgId: number, data: Partial<Organisation>) =>
    apiClient.put<ApiResponse<null>>(`/org/${orgId}`, data),

  // Called when founder fixes and resubmits a REJECTED org — status returns to PENDING
  resubmit: (orgId: number, data: { orgName: string; about?: string; mission?: string; website?: string; contactEmail?: string; contactPhone?: string }) =>
    apiClient.put<ApiResponse<null>>(`/org/${orgId}/resubmit`, data),

  list: (params: { keyword?: string; category?: string; pageNumber?: number; pageSize?: number }) =>
    apiClient.get<ApiResponse<PagedResult<Organisation>>>('/org/list', { params }),

  getRecommended: () =>
    apiClient.get<ApiResponse<Organisation[]>>('/org/recommended'),

  getTrendingCampaigns: (pageSize = 10) =>
    apiClient.get('/org/trending-campaigns', { params: { pageSize } }),

  getDashboard: (orgId: number) =>
    apiClient.get<ApiResponse<OrgDashboard>>(`/org/${orgId}/dashboard`),

  getMembers: (orgId: number) =>
    apiClient.get<ApiResponse<OrgMember[]>>(`/org/${orgId}/members`),

  getPendingMembers: (orgId: number) =>
    apiClient.get<ApiResponse<OrgMember[]>>(`/org/${orgId}/members/pending`),

  requestMembership: (orgId: number, data: {
    prevNgoExperience?: string;
    volunteerSkills?: string;
    areasOfInterest?: string;
    whyJoin?: string;
  }) =>
    apiClient.post<ApiResponse<null>>(`/org/${orgId}/membership-request`, data),

  reviewMembershipRequest: (orgId: number, data: { membershipRequestId: number; statusCode: string; adminNotes?: string }) =>
    apiClient.put<ApiResponse<null>>(`/org/${orgId}/membership-request/review`, data),

  removeMember: (orgId: number, userId: number) =>
    apiClient.delete<ApiResponse<null>>(`/org/${orgId}/members/${userId}`),

  updateMemberRole: (orgId: number, data: { memberId: number; roleCode: string }) =>
    apiClient.put<ApiResponse<null>>(`/org/${orgId}/members/role`, data),

  getVolunteerProfile: (orgId: number, userId: number) =>
    apiClient.get(`/org/${orgId}/volunteers/${userId}`),

  getMemberImpact: (orgId: number, userId: number) =>
    apiClient.get(`/org/${orgId}/members/${userId}/impact`),

  excuseNoShow: (orgId: number, attendanceId: number) =>
    apiClient.post<ApiResponse<null>>(`/org/${orgId}/attendance/excuse`, { attendanceId }),

  awardBadge: (orgId: number, data: { userId: number; badgeLkpId: number; projectId: number }) =>
    apiClient.post<ApiResponse<null>>(`/org/${orgId}/badges`, data),

  // Member permissions (canPost, canComment, canCommunityPost, locationSharing, maxPostsPerDay)
  updateMemberPermissions: (orgId: number, memberId: number, data: Partial<Pick<OrgMember, 'canPost'|'canComment'|'canCommunityPost'|'locationSharing'|'maxPostsPerDay'>>) =>
    apiClient.put<ApiResponse<null>>(`/org/${orgId}/members/${memberId}/permissions`, data),

  // Community posts management
  getAdminPosts: (orgId: number, params?: { statusCode?: string }) =>
    apiClient.get<ApiResponse<AdminPost[]>>(`/org/${orgId}/community-posts/admin`, { params }),

  pinPost: (orgId: number, postId: number) =>
    apiClient.post<ApiResponse<null>>(`/org/${orgId}/community-posts/${postId}/pin`),

  deletePost: (orgId: number, postId: number) =>
    apiClient.delete<ApiResponse<null>>(`/org/${orgId}/community-posts/${postId}`),

  moderatePost: (orgId: number, postId: number, action: 'KEEP' | 'REMOVE') =>
    apiClient.post<ApiResponse<null>>(`/org/${orgId}/community-posts/${postId}/moderate`, { action }),

  // Follow / Unfollow an NGO
  // POST   /org/{orgId}/follow — follow or re-follow
  // DELETE /org/{orgId}/follow — soft-unfollow (row kept in OrgFollowers with IsFollowing=0)
  followOrg: (orgId: number) =>
    apiClient.post<ApiResponse<null>>(`/org/${orgId}/follow`),

  unfollowOrg: (orgId: number) =>
    apiClient.delete<ApiResponse<null>>(`/org/${orgId}/follow`),

  getDonationDashboard: (orgId: number) =>
    apiClient.get(`/org/${orgId}/donation-dashboard`),

  getDonors: (orgId: number, params: { tab?: string; pageNumber?: number; pageSize?: number }) =>
    apiClient.get(`/org/${orgId}/donors`, { params }),

  getTransactions: (orgId: number, params: { statusCode?: string; pageNumber?: number; pageSize?: number }) =>
    apiClient.get(`/org/${orgId}/transactions`, { params }),
};

// Named exports for direct import in screens
export const register = (data: Partial<Organisation>) => orgApi.register(data);
export const getProfile = (orgId: number) => orgApi.getProfile(orgId);
export const update = (orgId: number, data: Partial<Organisation>) => orgApi.update(orgId, data);
export const list = (params: { keyword?: string; search?: string; category?: string; orgId?: number; pageNumber?: number; pageSize?: number; lat?: number; lng?: number }) =>
  apiClient.get<ApiResponse<PagedResult<Organisation>>>('/org/list', { params });
export const getRecommended = () => orgApi.getRecommended();
export const getDashboard = (orgId: number) => orgApi.getDashboard(orgId);
export const getMembers = (orgId: number) => orgApi.getMembers(orgId);
export const getPendingMembers = (orgId: number) => orgApi.getPendingMembers(orgId);
export const requestMembership = (
  orgId: number,
  data: { prevNgoExperience?: string; volunteerSkills?: string; areasOfInterest?: string; whyJoin?: string }
) => orgApi.requestMembership(orgId, data);
export const reviewMembershipRequest = (orgId: number, data: { membershipRequestId: number; statusCode: string; adminNotes?: string }) => orgApi.reviewMembershipRequest(orgId, data);
export const removeMember = (orgId: number, userId: number) => orgApi.removeMember(orgId, userId);
export const awardBadge = (orgId: number, data: { userId: number; badgeLkpId: number; projectId: number }) => orgApi.awardBadge(orgId, data);
export const getDonors = (orgId: number, params: { tab?: string; pageNumber?: number; pageSize?: number }) => orgApi.getDonors(orgId, params);
export const getTransactions = (orgId: number, params: { statusCode?: string; pageNumber?: number; pageSize?: number }) => orgApi.getTransactions(orgId, params);
