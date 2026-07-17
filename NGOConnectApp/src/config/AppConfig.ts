/**
 * AppConfig.ts — NGO Connect Global Settings
 * Single source of truth for all app-wide configuration.
 * Every component, API call, and service imports from here only.
 * To go live: change BASE_URL to production URL — zero other changes needed.
 */

// ── Environment URLs ─────────────────────────────────────────────────────────
// To build a Stage APK: set BASE_URL = STAGE_API_URL (release build variant)
const DEV_API_URL   = 'http://10.55.200.135:58411/api/v1';
const STAGE_API_URL = 'https://ngoconnectapi-staging.up.railway.app/api/v1';
const PROD_API_URL  = 'https://api.ngoconnect.app/api/v1';

const AppConfig = {
  // ── Base URL ─────────────────────────────────────────────────────────────
  // Dev: local machine  |  Release: production
  // For Stage APK: swap PROD_API_URL → STAGE_API_URL before building
  BASE_URL: STAGE_API_URL,

  // ── Auth ─────────────────────────────────────────────────────────────────
  JWT_EXPIRY_MINUTES: 15,
  REFRESH_TOKEN_DAYS: 30,
  MAX_SESSIONS: 5,

  // ── OTP ──────────────────────────────────────────────────────────────────
  OTP_RESEND_SECONDS: 60,
  OTP_LENGTH: 6,
  OTP_MAX_ATTEMPTS: 3,

  // ── Pagination ───────────────────────────────────────────────────────────
  DEFAULT_PAGE_SIZE: 20,
  FEED_PAGE_SIZE: 20,
  NOTIFICATIONS_PAGE_SIZE: 20,

  // ── Upload ───────────────────────────────────────────────────────────────
  MAX_FILE_SIZE_MB: 10,
  ALLOWED_IMAGE_TYPES: ['jpg', 'jpeg', 'png'],
  ALLOWED_DOC_TYPES: ['pdf', 'jpg', 'jpeg', 'png'],
  UPLOAD_MODULES: {
    USER_DOCUMENTS: 'user-documents',
    USER_PHOTOS:    'user-photos',
    ORG_DOCUMENTS:  'org-documents',
    ORG_LOGOS:      'org-logos',
    CERTIFICATES:   'certificates',
    POST_MEDIA:     'post-media',      // feed images + short videos (50 MB, mp4/mov/jpg/png)
  },

  // ── SOS ──────────────────────────────────────────────────────────────────
  SOS_LOCATION_INTERVAL_MS: 10000,

  // ── API Timeouts ─────────────────────────────────────────────────────────
  API_TIMEOUT_MS: 30000,

  // ── Design System Colors (mirrors prototype CSS :root variables) ──────────
  COLORS: {
    PRIMARY:       '#6B4EFF',
    PRIMARY_LIGHT: '#EEF0FF',
    TEAL:          '#2ECC71',
    ORANGE:        '#FF8C42',
    RED:           '#FF4444',
    YELLOW:        '#F59E0B',
    TEXT:          '#1A1A2E',
    TEXT2:         '#666680',
    TEXT3:         '#999BB0',
    BG:            '#F0F2F8',
    BORDER:        '#E8E8F0',
    CARD:          '#FFFFFF',
    INPUT_BG:      '#F8F8FC',  // .fi background in prototype
  },

  // ── Shadows — Android elevation + iOS shadow ──────────────────────────────
  // prototype .card  → box-shadow: 0 2px 12px rgba(0,0,0,.06)
  // prototype .csm   → box-shadow: 0 1px 6px rgba(0,0,0,.05)
  // Usage: style={[styles.card, AppConfig.SHADOW.CARD]}
  SHADOW: {
    CARD: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius:  8,
      elevation:     3,
    },
    CARD_SM: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius:  4,
      elevation:     2,
    },
    FAB: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius:  8,
      elevation:     8,
    },
    BTN: {
      shadowColor:   '#6B4EFF',
      shadowOffset:  { width: 0, height: 3 },
      shadowOpacity: 0.28,
      shadowRadius:  6,
      elevation:     4,
    },
    TOPBAR: {
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius:  4,
      elevation:     2,
    },
  },

  // ── Typography scale (mirrors prototype .h1 .h2 .h3 .body .sm .xs) ───────
  FONTS: {
    H1:   { fontSize: 22, fontWeight: '700' as const, color: '#1A1A2E' },
    H2:   { fontSize: 18, fontWeight: '700' as const, color: '#1A1A2E' },
    H3:   { fontSize: 15, fontWeight: '600' as const, color: '#1A1A2E' },
    BODY: { fontSize: 14, color: '#1A1A2E', lineHeight: 22 },
    SM:   { fontSize: 12, color: '#666680' },
    XS:   { fontSize: 11, color: '#999BB0' },
  },

  // ── Border radii (mirrors prototype .card .btn .pill .fi) ────────────────
  RADIUS: {
    CARD:    16,   // .card    border-radius: 16px
    CARD_SM: 12,   // .csm     border-radius: 12px
    BTN:     12,   // .btn-p   border-radius: 12px
    BTN_SM:  9,    // .btn-sm  border-radius: 9px
    INPUT:   10,   // .fi      border-radius: 10px
    PILL:    20,   // .pill    border-radius: 20px
    SHEET:   24,   // .sheet   border-radius: 24px 24px 0 0
  },

  // ── Sentry Error Monitoring ───────────────────────────────────────────────
  // DSN is project-specific — does NOT change on plan upgrade.
  // Android + iOS both report to this single React Native project.
  SENTRY_DSN: 'https://64a28e697455d4e17952db6e5bcd012e@o4511746239430656.ingest.de.sentry.io/4511746348548176',

  // ── Lookup Type Codes (matches LookupTypes in DB) ─────────────────────────
  LOOKUP: {
    GENDER:             'GENDER',
    ORG_CATEGORY:       'ORG_CATEGORY',
    ORG_TYPE:           'ORG_TYPE',
    PROJECT_TYPE:       'PROJECT_TYPE',
    SKILL:              'SKILL',
    BADGE_TYPE:         'BADGE_TYPE',
    MEMBER_ROLE:        'MEMBER_ROLE',
    EDUCATION:          'EDUCATION',
    WORK_EXP:           'WORK_EXP',
    INTEREST:           'INTEREST_TYPE',
    OTP_PURPOSE:        'OTP_PURPOSE',
    PAY_METHOD:         'PAY_METHOD',
    CAMPAIGN_TYPE:      'CAMPAIGN_TYPE',
    DONATION_FREQUENCY: 'DONATION_FREQUENCY',
    SOS_ALERT_TYPE:         'SOS_ALERT_TYPE',
    POST_TYPE:              'POST_TYPE',
    POST_TYPE_FEED:         'POST_TYPE_FEED',    // GENERAL | ANNOUNCEMENT | EVENT | VOL_REQUEST | FUNDRAISING | SUCCESS | ACHIEVEMENT | PHOTO_VIDEO
    POST_VISIBILITY:        'POST_VISIBILITY',   // PUBLIC | ORG_MEMBERS | FOLLOWERS
    VISIBILITY:             'VISIBILITY',
    COMMUNITY_POST_TYPE:    'COMMUNITY_POST_TYPE',
    DOCUMENT_TYPE:          'DOCUMENT_TYPE',
    EMERGENCY_VISIBILITY:   'EMERGENCY_VISIBILITY',   // ADMIN_ONLY | ADMIN_MODS | ALL_MEMBERS
    AUTO_SHARE_DURATION:    'AUTO_SHARE_DURATION',    // MIN_30 | HOUR_1 | HOUR_2 | HOUR_4 | UNTIL_STOPPED
  },
};

export default AppConfig;
