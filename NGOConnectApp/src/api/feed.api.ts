import apiClient from './apiClient';
import {ApiResponse, Post, PagedResult, PostPermissions, FeedPageResult} from '../types/api.types';

export const feedApi = {
  getFeed: (params: {pageNumber?: number; pageSize?: number}) =>
    apiClient.get<ApiResponse<PagedResult<Post>>>('/feed', {params}),

  createPost: (data: {content: string; orgId?: number; mediaUrls?: string[]; postTypeLkpId?: number; visibilityLkpId?: number}) =>
    apiClient.post<ApiResponse<{postId: number}>>('/post', data),

  getPost: (postId: number) =>
    apiClient.get<ApiResponse<Post>>(`/post/${postId}`),

  deletePost: (postId: number) =>
    apiClient.delete<ApiResponse<null>>(`/post/${postId}`),

  pinPost: (postId: number) =>
    apiClient.post<ApiResponse<null>>(`/post/${postId}/pin`),

  likePost: (postId: number) =>
    apiClient.post<ApiResponse<null>>(`/post/${postId}/like`),

  unlikePost: (postId: number) =>
    apiClient.delete<ApiResponse<null>>(`/post/${postId}/like`),

  addComment: (postId: number, content: string, parentCommentId?: number) =>
    apiClient.post<ApiResponse<{ commentId: number }>>(`/post/${postId}/comments`, {content, parentCommentId}),

  getComments: (postId: number, params: {pageNumber?: number; pageSize?: number}) =>
    apiClient.get(`/post/${postId}/comments`, {params}),

  reportPost: (postId: number, data: {reasonCode: string; details?: string}) =>
    apiClient.post<ApiResponse<null>>(`/post/${postId}/report`, data),

  getPostPermissions: (orgId: number) =>
    apiClient.get<ApiResponse<PostPermissions>>(`/post/permissions/${orgId}`),

  // ── Phase 1 Personalised Feed ─────────────────────────────────────────────
  /** Cursor-based personalised feed. Omit cursors for first page. */
  getPersonalizedFeed: (params: {
    cursorPostId?: number | null;
    cursorScore?:  number | null;
    pageSize?:     number;
  }) =>
    apiClient.get<ApiResponse<FeedPageResult>>('/feed/personalized', {
      params: {
        ...(params.cursorPostId != null ? { cursorPostId: params.cursorPostId } : {}),
        ...(params.cursorScore  != null ? { cursorScore:  params.cursorScore  } : {}),
        pageSize: params.pageSize ?? 20,
      },
    }),

  savePost: (postId: number) =>
    apiClient.post<ApiResponse<null>>(`/feed/post/${postId}/save`),

  unsavePost: (postId: number) =>
    apiClient.delete<ApiResponse<null>>(`/feed/post/${postId}/save`),

  getSavedPosts: (params?: { pageNumber?: number; pageSize?: number }) =>
    apiClient.get<ApiResponse<PagedResult<Post>>>('/feed/saved', { params }),

  getMyPosts: (params?: { pageNumber?: number; pageSize?: number }) =>
    apiClient.get<ApiResponse<PagedResult<Post>>>('/feed/myposts', { params }),

  trackInteraction: (data: { postId: number; interactionType: string; durationMs?: number }) =>
    apiClient.post<ApiResponse<null>>('/feed/interaction', data),

  /** Bulk-mark posts as viewed. Fire-and-forget from HomeScreen every ~10 s. */
  markPostsViewed: (postIds: number[]) =>
    apiClient.post<ApiResponse<null>>('/feed/viewed', { postIds }),
};

// Named exports
export const getFeed             = (pageNumber = 1, pageSize = 20) => feedApi.getFeed({ pageNumber, pageSize });
export const getPersonalizedFeed = (params: Parameters<typeof feedApi.getPersonalizedFeed>[0]) => feedApi.getPersonalizedFeed(params);
export const createPost          = (data: Parameters<typeof feedApi.createPost>[0]) => feedApi.createPost(data);
export const likePost            = (postId: number) => feedApi.likePost(postId);
export const unlikePost          = (postId: number) => feedApi.unlikePost(postId);
export const savePost            = (postId: number) => feedApi.savePost(postId);
export const unsavePost          = (postId: number) => feedApi.unsavePost(postId);
export const getSavedPosts       = (params?: { pageNumber?: number; pageSize?: number }) => feedApi.getSavedPosts(params);
export const getMyPosts          = (params?: { pageNumber?: number; pageSize?: number }) => feedApi.getMyPosts(params);
export const trackInteraction    = (data: Parameters<typeof feedApi.trackInteraction>[0]) => feedApi.trackInteraction(data);
export const markPostsViewed     = (postIds: number[]) => feedApi.markPostsViewed(postIds);
export const addComment          = (postId: number, content: string, parentCommentId?: number) => feedApi.addComment(postId, content, parentCommentId);
export const getComments         = (postId: number, params: {pageNumber?: number; pageSize?: number}) => feedApi.getComments(postId, params);
