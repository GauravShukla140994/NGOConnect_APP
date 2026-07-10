import apiClient from './apiClient';
import {ApiResponse, PagedResult, UserProfile, UserImpact, UserBadge, UserSkill, UserInterest, UserDocument, SafetyPrefs, Organisation, UserApplication} from '../types/api.types';

export const userApi = {
  getMyProfile: () =>
    apiClient.get<ApiResponse<UserProfile>>('/user/profile'),

  updateProfile: (data: Partial<UserProfile>) =>
    apiClient.put<ApiResponse<null>>('/user/profile', data),

  getPublicProfile: (userId: number) =>
    apiClient.get<ApiResponse<UserProfile>>(`/user/profile/${userId}`),

  getMyImpact: () =>
    apiClient.get<ApiResponse<UserImpact>>('/user/impact'),

  getMyBadges: () =>
    apiClient.get<ApiResponse<UserBadge[]>>('/user/badges'),

  getMyApplications: () =>
    apiClient.get<ApiResponse<UserApplication[]>>('/user/applications'),

  getMySkills: () =>
    apiClient.get<ApiResponse<UserSkill[]>>('/user/skills'),

  addSkill: (skillName: string) =>
    apiClient.post<ApiResponse<null>>('/user/skills', {skillName}),

  removeSkill: (userSkillId: number) =>
    apiClient.delete<ApiResponse<null>>(`/user/skills/${userSkillId}`),

  getMyInterests: () =>
    apiClient.get<ApiResponse<UserInterest[]>>('/user/interests'),

  saveInterests: (interestLkpIds: number[]) =>
    apiClient.post<ApiResponse<null>>('/user/interests', {interestLkpIds}),

  getSafetyPrefs: () =>
    apiClient.get<ApiResponse<SafetyPrefs>>('/user/safety-prefs'),

  updateSafetyPrefs: (data: Partial<SafetyPrefs>) =>
    apiClient.put<ApiResponse<null>>('/user/safety-prefs', data),

  getMyOrgs: () =>
    apiClient.get<ApiResponse<Organisation[]>>('/user/orgs'),

  getMyDocuments: () =>
    apiClient.get<ApiResponse<UserDocument[]>>('/user/documents'),

  uploadDocument: (data: {documentTypeLkpId: number; fileUrl: string; fileName: string; fileSizeKb: number}) =>
    apiClient.post<ApiResponse<null>>('/user/documents', data),

  deleteDocument: (userDocumentId: number) =>
    apiClient.delete<ApiResponse<null>>(`/user/documents/${userDocumentId}`),

  // getMyProjects — no backend endpoint yet (ProjectController has no /user/my-projects route)
  // Will be added when the "My Projects" screen (s-all-projects) is built
};

// Named exports for direct import in screens
export const getMyProfile      = () => userApi.getMyProfile();
export const updateProfile     = (data: Partial<UserProfile>) => userApi.updateProfile(data);
export const getMyImpact          = () => userApi.getMyImpact();
export const getMyBadges          = () => userApi.getMyBadges();
export const getMyApplications    = () => userApi.getMyApplications();
export const getMySkills       = () => userApi.getMySkills();
export const addSkill          = (data: {skillName: string}) => userApi.addSkill(data.skillName);
export const removeSkill       = (userSkillId: number) => userApi.removeSkill(userSkillId);
export const getMyOrgs         = () => userApi.getMyOrgs();
export const getMyInterests    = () => userApi.getMyInterests();
export const saveInterests     = (ids: number[]) => userApi.saveInterests(ids);
export const getSafetyPrefs    = () => userApi.getSafetyPrefs();
export const updateSafetyPrefs = (data: Partial<SafetyPrefs>) => userApi.updateSafetyPrefs(data);
export const getMyDocuments    = () => userApi.getMyDocuments();
export const uploadDocument    = (data: {documentTypeLkpId: number; fileUrl: string; fileName: string; fileSizeKb: number}) => userApi.uploadDocument(data);
export const deleteDocument    = (userDocumentId: number) => userApi.deleteDocument(userDocumentId);
