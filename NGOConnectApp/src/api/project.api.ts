import apiClient from './apiClient';
import { ApiResponse, Project, ProjectSession, ProjectApplication, PagedResult } from '../types/api.types';

// -- Request types --

export interface CreateProjectPayload {
  title: string;
  description?: string;
  orgId: number;
  category?: string;            // stored as string in DB
  projectTypeLkpId?: number;
  joinTypeLkpId?: number;
  maxVolunteers?: number;
  minAge?: number;
  isPublic?: boolean;
  requiresApproval?: boolean;   // SP resolves to JoinTypeLkpId (APPROVE_REQ | OPEN_SIGNUP)
  coverImageUrl?: string;
  // Schedule
  scheduleType?: string;        // ONE_TIME | RECURRING | FLEXIBLE
  startDate?: string;           // ISO date string YYYY-MM-DD
  endDate?: string;
  recurrenceDays?: string;      // comma-separated: MON,TUE,WED
  startTime?: string;           // HH:MM
  endTime?: string;
  durationMinutes?: number;
  // Location
  locationTypeLkpId?: number;
  locationTypeCode?: string;    // IN_PERSON | REMOTE | HYBRID — SP resolves to LkpId
  locationName?: string;        // landmark / venue name
  address?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  googleMapsUrl?: string;
  // Status
  isDraft?: boolean;            // true = save as DRAFT, false/null = UPCOMING
}

export interface AdminListParams {
  orgId?: number;
  statusCode?: string;         // ACTIVE | UPCOMING | COMPLETED | CANCELLED
  typeCode?: string;
  category?: string;           // e.g. Community, Education, Environment
  city?: string;               // city filter for volunteer browse
  keyword?: string;
  pageNumber?: number;
  pageSize?: number;
  userLat?: number;            // user's current latitude  — enables DistanceKm + nearest-first sort
  userLon?: number;            // user's current longitude
}

// -- API --

export const projectApi = {
  // CRUD
  create: (data: CreateProjectPayload) =>
    apiClient.post<ApiResponse<{ projectId: number }>>('/project', data),

  get: (projectId: number) =>
    apiClient.get<ApiResponse<any>>(`/project/${projectId}`),

  update: (projectId: number, data: Partial<CreateProjectPayload>) =>
    apiClient.put<ApiResponse<null>>(`/project/${projectId}`, data),

  // List (admin or volunteer view)
  list: (params: AdminListParams) =>
    apiClient.get<ApiResponse<PagedResult<any>>>('/project/list', { params }),

  // Personalised nearby feed for home screen
  getNearbyFeed: (params: { userLat?: number; userLon?: number; pageNumber?: number; pageSize?: number }) =>
    apiClient.get<ApiResponse<PagedResult<any>>>('/project/nearby-feed', { params }),

  // Skills
  addSkill: (projectId: number, skillName: string, isRequired = false) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/skills`, { skillName, isRequired }),

  getSkills: (projectId: number) =>
    apiClient.get<ApiResponse<any[]>>(`/project/${projectId}/skills`),

  getSkillRatings: (projectId: number, userId: number) =>
    apiClient.get<ApiResponse<any[]>>(`/project/${projectId}/skill-ratings/${userId}`),

  rateSkill: (data: {
    ratedUserId: number;
    projectSkillId: number;
    rating: number;
    notes?: string;
    projectId?: number;
    orgId?: number;
  }) =>
    apiClient.post<ApiResponse<null>>('/skills/rate', data),

  // Sessions
  getSessions: (projectId: number) =>
    apiClient.get<ApiResponse<any[]>>(`/project/${projectId}/sessions`),

  createSession: (projectId: number, data: Partial<ProjectSession>) =>
    apiClient.post<ApiResponse<{ sessionId: number }>>(
      `/project/${projectId}/sessions`, data,
    ),

  getSessionQr: (projectId: number, sessionId: number) =>
    apiClient.get<ApiResponse<{ qrToken: string; expiresAt: string }>>(
      `/project/${projectId}/sessions/${sessionId}/qr`,
    ),

  qrCheckIn: (projectId: number, qrToken: string) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/sessions/checkin`, { qrToken }),

  // Applications
  apply: (projectId: number, payload?: { motivation?: string; requestedSessions?: string }) =>
    apiClient.post<ApiResponse<{ applicationId: number }>>(`/project/${projectId}/apply`, payload ?? {}),

  getApplications: (projectId: number, params: { statusCode?: string; pageNumber?: number; pageSize?: number }) =>
    apiClient.get<ApiResponse<PagedResult<ProjectApplication>>>(
      `/project/${projectId}/applications`, { params },
    ),

  reviewApplication: (projectId: number, data: { applicationId: number; statusCode: string; adminNotes?: string }) =>
    apiClient.put<ApiResponse<null>>(`/project/${projectId}/applications/review`, data),

  // Status transitions
  complete: (projectId: number, completionNotes?: string) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/complete`, { completionNotes }),

  cancel: (projectId: number, cancelReason?: string) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/cancel`, { cancelReason }),

  // Manual attendance (admin marks volunteer as attended)
  manualAttendance: (projectId: number, applicationId: number) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/attendance/manual`, { applicationId }),
};

// -- Named exports --

export const list         = (params: AdminListParams) => projectApi.list(params);
export const getNearbyFeed = (params: { userLat?: number; userLon?: number; pageNumber?: number; pageSize?: number }) =>
  projectApi.getNearbyFeed(params);
export const get          = (projectId: number) => projectApi.get(projectId);
export const apply        = (projectId: number, payload?: { motivation?: string; requestedSessions?: string }) => projectApi.apply(projectId, payload);
export const create       = (data: CreateProjectPayload) => projectApi.create(data);
export const update       = (projectId: number, data: Partial<CreateProjectPayload>) =>
  projectApi.update(projectId, data);
export const cancel       = (projectId: number, reason?: string) => projectApi.cancel(projectId, reason);
export const addSkill        = (projectId: number, skillName: string, isRequired?: boolean) =>
  projectApi.addSkill(projectId, skillName, isRequired);
export const getSkills       = (projectId: number) => projectApi.getSkills(projectId);
export const getSkillRatings = (projectId: number, userId: number) =>
  projectApi.getSkillRatings(projectId, userId);
export const rateSkill       = (data: Parameters<typeof projectApi.rateSkill>[0]) =>
  projectApi.rateSkill(data);
export const getSessions  = (projectId: number) => projectApi.getSessions(projectId);
export const getSessionQr = (projectId: number, sessionId: number) =>
  projectApi.getSessionQr(projectId, sessionId);
