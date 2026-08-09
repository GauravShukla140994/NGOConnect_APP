// ── Core API Response (mirrors backend ApiResponse<T>) ───────────────────────
export interface ApiResponse<T> {
  isSuccess: number; // 1 = success, 0 = failure
  message: string;
  data: T | null;
  errorCode?: string;
}

// ── Paged Result ─────────────────────────────────────────────────────────────
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
}

// ── Lookup ───────────────────────────────────────────────────────────────────
export interface LookupValue {
  lookupValueId: number;
  typeCode: string;
  valueCode: string;
  valueName: string;
  isDefault: number;
  orderNo: number;
}

export interface LookupType {
  lookupTypeId: number;
  typeCode: string;
  typeName: string;
  values: LookupValue[];
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface SendOtpRequest {
  recipient: string;
  countryCode: string;
  purposeLkpId: number;
}

export interface VerifyOtpRequest {
  recipient: string;
  otpCode: string;
  purposeLkpId: number;
  countryCode?: string;  // dial code e.g. "+44" — stored on Users.CountryCode for new registrations
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
  deviceInfo: string;
}

// ── Post Permissions ─────────────────────────────────────────────────────────
export interface PostPermissions {
  isMember:          boolean;  // true if user is an APPROVED member of the org
  canPost:           boolean;  // org admin's per-member posting toggle
  canComment:        boolean;  // org admin's per-member commenting toggle
  canCommunityPost:  boolean;  // org admin's toggle for community posts/polls
  maxPostsPerDay:    number;   // org-configured daily limit (default 10)
  todayPostCount:    number;   // posts already created today for this org
}

// ── User ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  userId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  bio?: string;
  profilePhoto?: string;
  dateOfBirth?: string;
  genderLkpId?: number;
  gender?: string;
  occupation?: string;
  organisation?: string;
  volunteerExp?: string;
  educationLkpId?: number;
  fieldOfStudy?: string;
  workExpLkpId?: number;
  addressLine1?: string;
  addressLine2?: string;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
  mobile?: string;       // phone number without country code
  countryCode?: string;  // e.g. "+91", "+1"
  email?: string;
  memberSince?: string;
  // Computed/extended fields returned by API (v4.9: now returned by User_GetProfile SP)
  totalHours?: number;
  projectsCount?: number;
  impactScore?: number;
  ngosJoined?: number;
  skills?: UserSkill[];
}

export interface UserImpact {
  // Core scores
  impactScore: number;
  reliabilityPct: number;
  // Activity totals
  projectsCompleted: number;
  totalHours: number;
  badgeCount: number;
  skillCount: number;
  projectsApplied: number;
  certificateCount: number;
  memberSince: string;
  // NGOs
  ngosJoined?: number;
  // Rank
  rankName?: string;      // Newcomer | Helper | Active Volunteer | Committed Volunteer | Gold | Platinum | Diamond | Elite
  rankNumber?: number;    // e.g. 42
  totalRanked?: number;   // e.g. 1234
  // Application summary (for tab badges)
  pendingApplications?: number;
  approvedApplications?: number;
  // Profile (returned inline to avoid a second API call)
  firstName?: string;
  lastName?: string;
  profilePhoto?: string;
  bio?: string;
  // Legacy rich-breakdown fields (future SP extension)
  skillBreakdown?: { skillName: string; hours: number }[];
  certificates?: { projectName: string; orgName: string; issuedOn: string; certificateUrl?: string }[];
  ngoBreakdown?: { orgName: string; projectsCount: number; hours: number; tier?: string }[];
}

// ── User Application (GET /user/applications) ─────────────────────────────────
export interface UserApplication {
  applicationId: number;
  projectId: number;
  projectName: string;
  orgName: string;
  orgLogoUrl?: string;
  // Application status
  statusCode: string;        // PENDING | APPROVED | REJECTED | WITHDRAWN
  status: string;            // Human-readable label
  createdAt: string;
  statusUpdatedAt?: string;
  // Project schedule info (for card display)
  scheduleTypeCode?: string; // ONE_TIME | RECURRING | FLEXIBLE
  scheduleTypeName?: string;
  oneTimeDate?: string;      // ONE_TIME date (YYYY-MM-DD)
  recurStart?: string;       // RECURRING start date
  recurEnd?: string;         // RECURRING end date
  recurDays?: string;        // comma-separated day names e.g. "Monday,Wednesday,Friday"
  flexFromDate?: string;     // FLEXIBLE from date
  flexToDate?: string;       // FLEXIBLE to date
  sessionStartTime?: string;
  sessionEndTime?: string;
  landmark?: string;
  city?: string;
  // Project status (drives tab routing client-side)
  projectStatusCode?: string; // UPCOMING | ACTIVE | COMPLETED | EXPIRED | CANCELLED
  projectStatus?: string;
  requiresApproval?: boolean; // true = QR scan required to mark attendance
  isCheckedIn?: boolean;      // true = user already scanned QR for this project
  // Completed tab extras (enriched by future SP update)
  hoursLogged?: number;
  impactNote?: string;
  skillRatings?: { skillName: string; rating: number }[];
  // Certificate status — 1 if cert issued, 0/undefined otherwise (from HasCertificate column)
  hasCertificate?: number;
}

export interface UserBadge {
  userBadgeId: number;
  badgeLkpId: number;
  badgeName: string;
  badgeCode: string;
  orgName: string;
  projectName: string;
  awardedAt: string;
  tier?: string;       // Gold | Silver | Bronze | Platinum
  emoji?: string;
  awardedOn?: string;  // formatted display date
}

// ── User Certificate (GET /certificates) ─────────────────────────────────────
export interface UserCert {
  certificateId: number;
  certCode: string;
  projectId: number;
  projectTitle: string;
  orgId: number;
  orgName: string;
  totalHours?: number;
  certificateUrl?: string;
  issuedAt: string;
  // Encrypted public verify link (e.g. ripplehub.app/verify/{token}) — build share
  // links from this, never from certCode (a plain incrementing counter, guessable).
  verifyUrl?: string;
}

// ── Impact Summary (GET /user/impact-summary) ────────────────────────────────
// Single-call replacement for getMyImpact + getMyBadges + getMyApplications.
// Lists are server-limited (5 apps per tab, 3 badges).
// Total* fields hold full DB counts for "View N more" buttons.
export interface ImpactSummary {
  // Tab lists (server-side limited, 5 items each)
  applied:        UserApplication[];
  upcoming:       UserApplication[];
  completed:      UserApplication[];
  cancelled:      UserApplication[];
  // Badge list (server-side limited, 3 items)
  badges:         UserBadge[];
  // Full DB counts
  totalApplied:   number;
  totalUpcoming:  number;
  totalCompleted: number;
  totalCancelled: number;
  totalBadges:    number;
  // Impact stats (same as UserImpact)
  impactScore:          number;
  reliabilityPct:       number;
  projectsCompleted:    number;
  totalHours:           number;
  badgeCount:           number;
  skillCount:           number;
  projectsApplied:      number;
  certificateCount:     number;
  memberSince:          string;
  rankName:             string;
  rankNumber:           number;
  totalRanked:          number;
  ngosJoined:           number;
  pendingApplications:  number;
  approvedApplications: number;
  firstName?:           string;
  lastName?:            string;
  profilePhoto?:        string;
  bio?:                 string;
}

export interface UserSkill {
  userSkillId: number;
  skillName: string;
  rating?: number;
  hoursLogged?: number;
}

export interface UserDocument {
  userDocumentId: number;
  documentTypeLkpId: number;
  docTypeCode: string;
  docTypeName: string;
  fileUrl: string;
  fileName: string;
  fileSizeKb?: number;
  isVerified: boolean;
  uploadedAt: string;
}

export interface UserInterest {
  interestLkpId: number;
  interestName: string;
  interestCode: string;
}

export interface SafetyPrefs {
  emergVisibilityLkpId: number;
  emergVisibility: string;
  autoShareDurLkpId: number;
  autoShareDuration: string;
  allowLocDuringSos: boolean;
  allowLocDuringProj: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
}

// ── Organisation ─────────────────────────────────────────────────────────────
export interface Organisation {
  orgId: number;
  orgName: string;
  name?: string;           // alias for orgName (some endpoints return 'name')
  registrationNumber?: string; // Org_GetProfile SP returns this as 'regNumber' (DynamicRow camelCase of RegNumber)
  regNumber?: string;          // alias — actual key returned by Org_GetProfile
  orgType?: string;
  orgTypeLkpId?: number;
  category?: string;
  categoryName?: string;
  contactPerson?: string;
  about?: string;
  description?: string;    // alias for about
  mission?: string;
  vision?: string;
  logoUrl?: string;
  contactEmail?: string;
  email?: string;          // alias for contactEmail
  contactPhone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
  memberCount?: number;
  avgRating?: number;
  rating?: number;         // alias for avgRating
  latitude?: number;
  longitude?: number;
  is80G?: boolean;             // interface alias — Org_GetProfile returns is80GEligible
  is12A?: boolean;             // interface alias — Org_GetProfile returns is12AEligible
  is80GEligible?: boolean;     // actual key from Org_GetProfile (DynamicRow camelCase of Is80GEligible)
  is12AEligible?: boolean;     // actual key from Org_GetProfile (DynamicRow camelCase of Is12AEligible)
  statusCode?: string;
  // Extended fields
  activeProjects?: number;
  totalVolunteerHours?: number;
  distanceKm?: number;
  isMember?: boolean;
  myRole?: string;         // e.g. 'Admin', 'Member', 'Founder'
  myRoleCode?: string;     // e.g. 'ADMIN', 'MEMBER', 'FOUNDER'
  memberStatusCode?: string;    // APPROVED | PENDING  (user's membership status in OrgMembers)
  orgStatusCode?: string;       // PENDING | UNDER_REVIEW | APPROVED | REJECTED | SUSPENDED
  lastRejectionReason?: string; // populated when orgStatusCode = REJECTED or SUSPENDED
  suspendedAt?: string;         // ISO datetime when org was last suspended (from OrgStatusHistory)
  joinedAt?: string;            // ISO date string when user joined this org
  areasOfWork?: string[];
  followerCount?: number;         // denormalized — from Organisations.FollowerCount
  isFollowing?: number | boolean; // 0|1 from SP (use !! to convert to boolean)
  verificationStatusCode?: string; // PENDING | VERIFIED | REJECTED (from ORG_VERIFICATION_STATUS lookup)
}

export interface OrgMember {
  userId: number;
  memberId?: number;              // OrgMembers PK — used for role/permission updates
  membershipRequestId?: number;   // for pending approval/rejection
  fullName: string;
  email?: string;
  phone?: string;
  occupation?: string;
  profilePhoto?: string;
  city?: string;
  state?: string;
  roleName: string;
  roleCode: string;
  statusCode: string;             // APPROVED | PENDING | REJECTED
  joinedAt: string;
  requestedAt?: string;           // when membership request was submitted
  isActive?: boolean;
  lastActiveAt?: string;          // formatted time-ago string
  motivation?: string;            // legacy alias
  // Membership request fields (submitted when applying)
  prevNgoExperience?: string;
  volunteerSkills?: string;
  areasOfInterest?: string;
  whyJoin?: string;
  bio?: string;
  volunteerExp?: string;
  documents?: { name: string; url?: string }[];
  canPost?: boolean;
  canComment?: boolean;
  canCommunityPost?: boolean;
  locationSharing?: boolean;
  maxPostsPerDay?: number;
  reliabilityPct?: number;
  profileVerificationStatusCode?: string;  // PENDING | VERIFIED | NEEDS_UPDATE | REJECTED (from PROFILE_VERIFICATION_STATUS lookup)
}

// ── Admin volunteer profile (GET /org/{orgId}/volunteers/{userId}) ────────────
export interface OrgVolunteerProfile {
  userId: number;
  fullName?: string;
  city?: string;
  state?: string;
  occupation?: string;
  profilePhoto?: string;
  bio?: string;
  volunteerExp?: string;
  // Impact stats
  totalHours: number;
  projectCount: number;
  orgCount: number;
  // Reliability (admin-only)
  reliabilityPct: number;
  avgRating: number;
  peerRating: number;
  noShowCount: number;
  excusedCount: number;
  complaintCount: number;
  // Membership in this org
  roleCode?: string;
  roleName?: string;
  statusCode?: string;
  statusName?: string;
  joinedAt?: string;
  // Membership request fields (what the volunteer submitted when applying)
  prevNgoExperience?: string;
  volunteerSkills?: string;
  areasOfInterest?: string;
  whyJoin?: string;
  requestedAt?: string;
}

export interface AdminPost {
  postId: number;
  userId: number;
  fullName: string;
  roleCode?: string;
  roleName?: string;
  content: string;
  likesCount: number;
  commentsCount: number;
  statusCode: string;             // PUBLISHED | PENDING | REMOVED
  reportCount?: number;
  isPinned?: boolean;
  createdAt: string;
  timeAgo?: string;
}

export interface OrgDashboard {
  totalMembers: number;
  newMembersThisMonth: number;
  activeVolunteers: number;
  activeRatePct: number;
  volunteerHoursMonth: number;
  activeProjects: number;
  pendingApplications: number;         // pending member join requests
  pendingProjectApplications?: number; // pending volunteer project applications
  followerCount?: number;              // denormalized from Organisations.FollowerCount
  // Extended fields
  totalDonations?: number;
  totalVolunteerHours?: number;
  thisMonthVolunteers?: number;
  recentActivity?: { type?: string; icon?: string; message: string; timeAgo: string }[];
}

// ── Project ───────────────────────────────────────────────────────────────────
export interface Project {
  projectId: number;
  orgId: number;
  orgName?: string;
  orgLogoUrl?: string;
  title: string;
  description?: string;
  projectType?: string;
  scheduleType?: string; // ONE_TIME | RECURRING | FLEXIBLE
  recurrenceDays?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  locationName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  maxVolunteers?: number;
  approvedCount?: number;
  isPublic?: boolean;
  requiresApproval?: boolean;
  coverImageUrl?: string;
  statusCode?: string;
  statusName?: string;
  applicationStatusCode?: string;
  // Extended/computed fields
  projectName?: string;           // SP returns ProjectName (camelCase: projectName)
  maxParticipants?: number;       // alias for maxVolunteers
  currentParticipants?: number;   // alias for approvedCount
  spotsLeft?: number;
  categoryName?: string;
  distanceKm?: number;
  scheduleSummary?: string;       // computed: human-readable schedule string
  skills?: { skillName: string; isRequired?: boolean }[];
  // Raw SP schedule fields (from Project_List)
  oneTimeDate?: string;
  recurStart?: string;
  recurEnd?: string;
  recurDays?: string;
  sessionStartTime?: string;
  sessionEndTime?: string;
  flexFromDate?: string;
  flexToDate?: string;
}

export interface ProjectSession {
  sessionId: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  maxVolunteers: number;
  checkedInCount: number;
  qrToken?: string;
}

export interface ProjectApplication {
  applicationId: number;
  userId: number;
  fullName: string;
  profilePhoto?: string;
  statusCode: string;
  appliedAt: string;
  adminNotes?: string;
}

// ── Feed / Post ───────────────────────────────────────────────────────────────
export interface Post {
  postId: number;
  userId: number;
  fullName: string;
  profilePhoto?: string;
  orgId?: number;
  orgName?: string;
  orgLogoUrl?: string;
  content: string;
  postType?: string;
  postTypeLkpCode?: string;  // e.g. PINNED, ANNOUNCEMENT, EVENT, etc.
  title?: string;
  authorName?: string;       // display name (may differ from fullName for org posts)
  authorRole?: string;       // e.g. 'Admin', 'Member' — shown as badge on post
  timeAgo?: string;          // relative time string from server
  visibility?: string;       // e.g. 'Public', 'Members Only'
  mediaUrls?: string[];
  mediaTypes?: string;   // CSV of ValueCodes matching mediaUrls — e.g. "IMAGE,VIDEO,IMAGE"
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isPinned: boolean;
  isAnnouncement: boolean;
  campaignGoal?: number;     // for FUNDRAISING posts
  campaignRaised?: number;   // for FUNDRAISING posts
  isFollowing?: number | boolean; // 0|1 from SP — whether current user follows this post's org
  // Phase 1 personalised feed additions
  isSaved?:      number | boolean; // 0|1 — whether current user has saved this post
  saveCount?:    number;
  savedAt?:      string;           // ISO datetime when the user saved this post (Post_GetSaved only)
  shareCount?:   number;
  viewCount?:    number;            // denormalized unique-user view count
  isEmergency?:  number | boolean;
  isEvergreen?:  number | boolean;
  feedSource?:   string;           // MY_ORG | FOLLOWED_ORG | TRENDING | EMERGENCY | INTEREST | RECENT
  feedScore?:    number;
  createdAt: string;
}

// ── Personalised Feed Page (cursor-based) ──────────────────────────────────────
export interface FeedPageResult {
  items:            Post[];
  nextCursorPostId: number | null;
  nextCursorScore:  number | null;
  hasMore:          boolean;
}

// ── Community ─────────────────────────────────────────────────────────────────
export interface CommunityPost {
  communityPostId: number;
  orgId: number;
  userId: number;
  fullName?: string;           // legacy field name
  authorName?: string;         // SP returns AuthorName → camelCase authorName
  profilePhoto?: string;
  roleName?: string;           // e.g. "Admin", "Moderator", "Member"
  title?: string;
  content?: string;
  postType?: string;           // ValueCode: ANNOUNCEMENT | DISCUSSION | POLL | EVENT_UPDATE | VOL_REQUEST | TASK | RESOURCE | QUESTION
  postTypeName?: string;       // ValueName: human readable
  postTypeLkpCode?: string;
  audienceCode?: string;       // ValueCode from AUDIENCE_TYPE
  isPinned?: boolean;
  acknowledgeCount: number;
  isAcknowledged?: boolean;    // legacy field
  isAcknowledgedByMe?: boolean; // SP returns IsAcknowledgedByMe
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isLikedByMe?: boolean;
  timeAgo?: string;
  createdAt: string;
  pollOptions?: PollOption[];
  pollEndsAt?: string;         // ISO date when poll closes (SP column: PollEndsAt → DynamicRow → pollEndsAt)
  pollIsMultiChoice?: boolean; // 1 = multiple options can be selected, 0/null = single-choice radio

  // ── Shared extra field (EventRef column) ──────────────────────────────────
  // SP column cp.EventRef → DynamicRow → eventRef. Meaning varies by type:
  //   EVENT_UPDATE  → whatChanged text (e.g. "Venue changed")
  //   VOL_REQUEST   → date/time display text (e.g. "Jun 14, 6:30 AM")
  //   TASK          → free-text assignee name
  eventRef?: string;

  // ── EVENT_UPDATE extra fields (SP columns, DynamicRow auto-maps) ──────────
  projectId?: number;
  projectTitle?: string;
  // changeType / changeDetail / mapsUrl have no DB columns — use eventRef + title instead
  rsvpCount?: number;
  isRsvped?: boolean;

  // ── VOL_REQUEST extra fields ───────────────────────────────────────────────
  filledCount?: number;        // volunteers already signed up (no DB column yet)
  volunteersNeeded?: number;   // SP column VolunteersNeeded → volunteersNeeded
  totalNeeded?: number;        // legacy alias — prefer volunteersNeeded
  isVolunteered?: boolean;     // true if current user signed up

  // ── TASK extra fields ──────────────────────────────────────────────────────
  assignedToUserId?: number;   // SP column AssignedToUserId
  assignedToName?: string;     // SP JOIN on AssignedToUserId (null when not a real user)
  assignedToInitials?: string;
  dueDate?: string;            // SP column DueDate → dueDate (ISO string)
  dueBy?: string;              // formatted display string (future: SP alias)
  taskStatus?: string;         // "Open" | "In Progress" | "Completed"

  // ── RESOURCE extra fields ──────────────────────────────────────────────────
  resourceFileUrl?: string;    // SP column ResourceFileUrl → DynamicRow → resourceFileUrl (single file URL)
  fileNames?: string[];        // parallel array with mediaUrls
  fileSizes?: string[];        // e.g. ["2.3 MB", "1.1 MB"]
  fileTypes?: string[];        // e.g. ["PDF", "Image"]
  mediaUrls?: string[];        // legacy / future multi-file support

  // ── QUESTION extra fields ─────────────────────────────────────────────────
  bestAnswerText?: string;
  bestAnswerAuthor?: string;
  bestAnswerLikes?: number;
}

export interface PollOption {
  pollOptionId: number;
  optionText: string;
  voteCount: number;
  votePct: number;
  isVoted: boolean;
}

export interface CommunityComment {
  communityCommentId: number;
  communityPostId: number;
  userId: number;
  authorName?: string;
  profilePhoto?: string;
  content: string;
  likeCount: number;
  isLiked: boolean;
  isLikedByMe?: boolean;
  timeAgo?: string;
  createdAt: string;
}

// ── Donation ─────────────────────────────────────────────────────────────────
export interface DonationCampaign {
  campaignId: number;
  orgId: number;
  orgName: string;
  orgLogoUrl?: string;
  title: string;
  description?: string;
  goalAmount: number;
  raisedAmount: number;
  progressPct: number;
  donorCount: number;
  startDate: string;
  endDate?: string;
  bannerUrl?: string;
  isEmergency?: boolean;
  is80G?: boolean;
  statusCode?: string;
}

export interface DonationTransaction {
  transactionId: number;
  readableId: string; // DON-2026-000001
  campaignName: string;
  orgName: string;
  amount: number;
  netAmount: number;
  statusCode: string;
  statusName: string;
  paymentMethod: string;
  isAnonymous: boolean;
  createdAt: string;
  receiptUrl?: string;
}

export interface RecurringDonation {
  recurringId: number;
  orgName: string;
  campaignName: string;
  amount: number;
  frequency: string;
  nextDate: string;
  statusCode: string;
}

// ── SOS ───────────────────────────────────────────────────────────────────────
export interface SosIncident {
  sosId: number;
  userId: number;
  fullName: string;
  latitude: number;
  longitude: number;
  description?: string;
  alertType?: string;
  statusCode: string; // ACTIVE | RESOLVED | CANCELLED
  triggeredAt: string;
  resolvedAt?: string;
  responderCount: number;
}

export interface SosResponder {
  responderId: number;
  userId: number;
  fullName: string;
  profilePhoto?: string;
  statusCode: string;
  canViewLocation: boolean;
  respondedAt: string;
}

// ── Notification ──────────────────────────────────────────────────────────────
export interface Notification {
  notificationId: number;
  title: string;
  body: string;
  notifType: string;       // matches SP: NotifType → camelCase notifType
  refId?: number;
  refType?: string;
  isRead: number | boolean; // Pomelo returns TINYINT(1) as true/false — always use !isRead / !!isRead
  readAt?: string;
  createdAt: string;
  orgId?: number;
  orgName?: string;
  orgLogoUrl?: string;
  // Marketing & Communication Center — CAMPAIGN notifications
  deepLink?:    string;   // ngoconnect:// or https:// URL to navigate on tap
  actionLabel?: string;   // CTA button label (e.g. "Donate Now", "Learn More")
}
