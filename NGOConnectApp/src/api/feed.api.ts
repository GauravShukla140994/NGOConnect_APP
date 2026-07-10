import apiClient from './apiClient';
import {ApiResponse, Post, PagedResult} from '../types/api.types';

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
    apiClient.post<ApiResponse<null>>(`/post/${postId}/comments`, {content, parentCommentId}),

  getComments: (postId: number, params: {pageNumber?: number; pageSize?: number}) =>
    apiClient.get(`/post/${postId}/comments`, {params}),

  reportPost: (postId: number, data: {reasonCode: string; details?: string}) =>
    apiClient.post<ApiResponse<null>>(`/post/${postId}/report`, data),
};

// Named exports
export const getFeed     = (pageNumber = 1, pageSize = 20) => feedApi.getFeed({ pageNumber, pageSize });
export const createPost  = (data: Parameters<typeof feedApi.createPost>[0]) => feedApi.createPost(data);
export const likePost    = (postId: number) => feedApi.likePost(postId);
export const unlikePost  = (postId: number) => feedApi.unlikePost(postId);
export const addComment  = (postId: number, content: string, parentCommentId?: number) => feedApi.addComment(postId, content, parentCommentId);
export const getComments = (postId: number, params: {pageNumber?: number; pageSize?: number}) => feedApi.getComments(postId, params);
