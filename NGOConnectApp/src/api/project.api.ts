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
  // v5.1 RECURRING / FLEXIBLE attendance rules (nullable = use platform defaults)
  minAttendPct?: number;        // % of sessions volunteer must attend to be cert-eligible
  maxDailyHours?: number;       // FLEXIBLE only: max hours logged per day (cap)
  minSessionHours?: number;     // min hours in a session to count as ATTENDED
}

// ── v5.1 Request payloads ─────────────────────────────────────────────────

export interface FinalizeClosingPayload {
  impactSummary?: string;
  beneficiaryCount?: number;
}

export interface CancelSessionPayload {
  reason?: string;
}

export interface SessionOptOutPayload {
  sessionId: number;
  userId: number;
  optOutType?: 'SELF' | 'ADMIN_EXCUSED' | 'ADMIN_REMOVED';
  reason?: string;
}

export interface SessionSkillRatingPayload {
  sessionId: number;
  userId: number;
  skillId: number;
  rating: number;           // 1-5
  notes?: string;
}

export interface IssueBulkCertificatePayload {
  projectId: number;
  orgId: number;
}

// ── v5.1 Response shapes ──────────────────────────────────────────────────

export interface FlexCheckInResult {
  sessionId: number | null;
  message: string;
}

export interface FlexCheckOutResult {
  hoursLogged: number;
  message: string;
}

export interface VolunteerEligibilityResult {
  totalSessions: number;
  eligibleSessions: number;
  attendedCount: number;
  totalHoursLogged: number;
  attendancePct: number;
  minAttendPct: number | null;
  isEligibleForCert: boolean;
}

export interface SessionListItem {
  sessionId: number;
  sessionDate: string;          // YYYY-MM-DD
  startTime: string;
  endTime: string;
  sessionStatus: string;
  sessionStatusName: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  hoursLogged: number | null;
  attendanceStatus: string | null;
  attendanceStatusName: string | null;
  isNoShowExcused: boolean | null;
  adminNote: string | null;
  optOutId: number | null;
  optOutType: string | null;
  optOutTypeName: string | null;
  optOutReason: string | null;
  ratingCount: number;
}

export interface MilestoneResult {
  totalSessions: number;
  attendedCount: number;
  attendancePct: number;
  milestoneReached: 0 | 25 | 50 | 75;
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

  selfCheckIn: (projectId: number) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/self-checkin`),

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

  // Excuse a no-show (marks IsNoShowExcused = 1, reliability score unaffected)
  excuseNoShow: (attendanceId: number) =>
    apiClient.put<ApiResponse<null>>(`/project/attendance/${attendanceId}/excuse`),

  confirmNoShow: (attendanceId: number) =>
    apiClient.put<ApiResponse<null>>(`/project/attendance/${attendanceId}/confirm-noshow`),

  // Admin remove volunteer (sets application WITHDRAWN, frees slot)
  // POST instead of DELETE: Railway's Nginx proxy drops DELETE response bodies.
  adminRemoveVolunteer: (projectId: number, userId: number) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/participants/${userId}/remove`),

  // ── v5.1: FLEXIBLE self check-in / check-out ───────────────────────────

  flexCheckIn: (projectId: number) =>
    apiClient.post<ApiResponse<FlexCheckInResult>>(`/project/${projectId}/flex-checkin`),

  flexCheckOut: (projectId: number) =>
    apiClient.post<ApiResponse<FlexCheckOutResult>>(`/project/${projectId}/flex-checkout`),

  // ── v5.1: Project lifecycle ────────────────────────────────────────────

  finalizeClosing: (projectId: number, data: FinalizeClosingPayload) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/finalize`, data),

  // ── v5.1: Session management ───────────────────────────────────────────

  cancelSession: (projectId: number, sessionId: number, data: CancelSessionPayload) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/sessions/${sessionId}/cancel`, data),

  sessionOptOut: (projectId: number, data: SessionOptOutPayload) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/sessions/optout`, data),

  // ── v5.1: Session-level skill ratings ─────────────────────────────────

  addSessionSkillRating: (projectId: number, data: SessionSkillRatingPayload) =>
    apiClient.post<ApiResponse<null>>(`/project/${projectId}/sessions/skill-rating`, data),

  // ── v5.1: Volunteer session history + eligibility ─────────────────────

  getMySessionList: (projectId: number, userId: number) =>
    apiClient.get<ApiResponse<SessionListItem[]>>(`/project/${projectId}/my-sessions/${userId}`),

  getVolunteerEligibility: (projectId: number, userId: number) =>
    apiClient.get<ApiResponse<VolunteerEligibilityResult>>(`/project/${projectId}/eligibility/${userId}`),

  // ── v5.1: Milestone check (called after flex checkout) ────────────────

  checkMilestone: (projectId: number, userId: number) =>
    apiClient.get<ApiResponse<MilestoneResult>>(`/project/${projectId}/milestone/${userId}`),

  // ── v5.1: Bulk certificate issuance ───────────────────────────────────

  issueBulkCertificates: (data: IssueBulkCertificatePayload) =>
    apiClient.post<ApiResponse<null>>(`/certificate/bulk`, data),
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

// v5.1 named exports
export const flexCheckIn        = (projectId: number) => projectApi.flexCheckIn(projectId);
export const flexCheckOut       = (projectId: number) => projectApi.flexCheckOut(projectId);
export const finalizeClosing    = (projectId: number, data: FinalizeClosingPayload) => projectApi.finalizeClosing(projectId, data);
export const cancelSession      = (projectId: number, sessionId: number, data: CancelSessionPayload) => projectApi.cancelSession(projectId, sessionId, data);
export const sessionOptOut      = (projectId: number, data: SessionOptOutPayload) => projectApi.sessionOptOut(projectId, data);
export const addSessionSkillRating = (projectId: number, data: SessionSkillRatingPayload) => projectApi.addSessionSkillRating(projectId, data);
export const getMySessionList   = (projectId: number, userId: number) => projectApi.getMySessionList(projectId, userId);
export const getVolunteerEligibility = (projectId: number, userId: number) => projectApi.getVolunteerEligibility(projectId, userId);
export const checkMilestone     = (projectId: number, userId: number) => projectApi.checkMilestone(projectId, userId);
export const issueBulkCertificates = (data: IssueBulkCertificatePayload) => projectApi.issueBulkCertificates(data);
