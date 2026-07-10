import apiClient from './apiClient';
import { ApiResponse, CommunityPost, CommunityComment, PagedResult } from '../types/api.types';

export interface CreatePostPayload {
  orgId: number;
  title: string;
  content: string;
  postTypeLkpId?: number;
  audienceLkpId?: number;
  isPinned?: boolean;
  notifyAll?: boolean;
  allowBestAnswer?: boolean;
  eventReference?: string;
  whatChanged?: string;
  projectId?: number;
  volunteersNeeded?: number;
  dateTime?: string;
  skills?: string;
  assignedTo?: string;
  dueDate?: string;
}

export interface CreatePollPayload {
  orgId: number;
  question: string;
  options: string[];
  expiresInHours: number;
  isMultiChoice?: boolean;
  audienceLkpId?: number;
}

export const communityApi = {
  getFeed: (orgId: number, params: { pageNumber?: number; pageSize?: number }) =>
    apiClient.get<ApiResponse<PagedResult<CommunityPost>>>('/community/feed', { params: { ...params, orgId } }),

  createPost: (data: CreatePostPayload) =>
    apiClient.post<ApiResponse<null>>('/community/post', data),

  createPoll: (data: CreatePollPayload) =>
    apiClient.post<ApiResponse<null>>('/community/poll', data),

  acknowledgePost: (communityPostId: number) =>
    apiClient.post<ApiResponse<null>>(`/community/post/${communityPostId}/acknowledge`),

  voteOnPoll: (pollId: number, pollOptionId: number) =>
    apiClient.post<ApiResponse<null>>(`/community/poll/${pollId}/vote`, { pollOptionId }),

  pinPost: (communityPostId: number, isPinned: boolean) =>
    apiClient.patch<ApiResponse<null>>(`/community/post/${communityPostId}/pin`, { isPinned }),

  deletePost: (communityPostId: number) =>
    apiClient.delete<ApiResponse<null>>(`/community/post/${communityPostId}`),

  likePost: (communityPostId: number) =>
    apiClient.post<ApiResponse<{ isLiked: boolean; likeCount: number }>>(`/community/post/${communityPostId}/like`),

  getComments: (communityPostId: number) =>
    apiClient.get<ApiResponse<CommunityComment[]>>(`/community/post/${communityPostId}/comments`),

  addComment: (communityPostId: number, content: string) =>
    apiClient.post<ApiResponse<{ communityCommentId: number }>>(`/community/post/${communityPostId}/comment`, { content }),

  likeComment: (commentId: number) =>
    apiClient.post<ApiResponse<{ isLiked: boolean; likeCount: number }>>(`/community/comment/${commentId}/like`),
};

export const getCommunityFeed    = (orgId: number, params: { pageNumber?: number; pageSize?: number }) => communityApi.getFeed(orgId, params);
export const createCommunityPost = (data: CreatePostPayload) => communityApi.createPost(data);
export const createCommunityPoll = (data: CreatePollPayload) => communityApi.createPoll(data);
export const acknowledgePost     = (communityPostId: number) => communityApi.acknowledgePost(communityPostId);
export const voteOnPoll          = (pollId: number, pollOptionId: number) => communityApi.voteOnPoll(pollId, pollOptionId);
export const pinCommunityPost    = (communityPostId: number, isPinned: boolean) => communityApi.pinPost(communityPostId, isPinned);
export const deleteCommunityPost = (communityPostId: number) => communityApi.deletePost(communityPostId);
export const likePost            = (communityPostId: number) => communityApi.likePost(communityPostId);
export const getComments         = (communityPostId: number) => communityApi.getComments(communityPostId);
export const addComment          = (communityPostId: number, content: string) => communityApi.addComment(communityPostId, content);
export const likeComment         = (commentId: number) => communityApi.likeComment(commentId);
