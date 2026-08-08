import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  LayoutChangeEvent,
  PanResponder,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { getImpactSummary, withdrawApplication } from '../../api/user.api';
import { projectApi } from '../../api/project.api';
import type { ImpactSummary, UserApplication, UserBadge } from '../../types/api.types';
import QRScannerModal     from './QRScannerModal';
import ProjectDetailModal from './ProjectDetailModal';
import CertificateModal   from '../common/CertificateModal';

const C = AppConfig.COLORS;

// ─── Rank config ──────────────────────────────────────────────────────────────

const RANK_THRESHOLDS = [
  { name: 'Helper',              min: 100,   color: '#7C3AED' },
  { name: 'Active Volunteer',    min: 500,   color: '#2563EB' },
  { name: 'Committed Volunteer', min: 1500,  color: '#059669' },
  { name: 'Gold',                min: 2500,  color: '#CA8A04' },
  { name: 'Platinum',            min: 5000,  color: '#6B4EFF' },
  { name: 'Diamond',             min: 10000, color: '#6366F1' },
  { name: 'Elite',               min: 20000, color: '#DC2626' },
];
const RANK_COLORS: Record<string, string> = {
  Elite: '#DC2626', Diamond: '#6366F1', Platinum: '#6B4EFF', Gold: '#CA8A04',
  'Committed Volunteer': '#059669', 'Active Volunteer': '#2563EB',
  Helper: '#7C3AED', Newcomer: '#9CA3AF',
};
const RANK_EMOJI: Record<string, string> = {
  Elite: '💎', Diamond: '🔷', Platinum: '🥇', Gold: '🏆',
  'Committed Volunteer': '⭐', 'Active Volunteer': '🌟', Helper: '🙌', Newcomer: '🌱',
};

function getRankMeta(score: number) {
  const cur  = [...RANK_THRESHOLDS].reverse().find(r => score >= r.min);
  const next = RANK_THRESHOLDS.find(r => r.min > score);
  const prev = cur?.min ?? 0;
  return {
    next,
    progress: next ? Math.min(((score - prev) / (next.min - prev)) * 100, 100) : 100,
  };
}

// ─── Compact hero height ──────────────────────────────────────────────────────

const COMPACT_H = 56; // height of the sticky compact bar shown when hero is collapsed

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMonthYear = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';

const fmtShort = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const fmtTime = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const abbrevDays = (days?: string) => {
  if (!days) return '';
  const M: Record<string, string> = {
    Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
    Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
  };
  return days.split(',').map(d => M[d.trim()] ?? d.trim().slice(0, 3)).join(' & ');
};

function scheduleOneLiner(app: UserApplication) {
  const time = (app.sessionStartTime && app.sessionEndTime)
    ? `${fmtTime(app.sessionStartTime)} – ${fmtTime(app.sessionEndTime)}`
    : app.sessionStartTime ? fmtTime(app.sessionStartTime) : '';
  const loc  = [app.city, app.landmark].filter(Boolean).join(', ');

  if (app.scheduleTypeCode === 'ONE_TIME') {
    // oneTimeDate is the correct field; recurStart is a fallback for older API responses
    const date = fmtShort(app.oneTimeDate ?? app.recurStart);
    return [date, time, loc].filter(Boolean).join(' · ');
  }
  if (app.scheduleTypeCode === 'RECURRING') {
    const dateRange = app.recurStart
      ? app.recurEnd
        ? `${fmtShort(app.recurStart)} – ${fmtShort(app.recurEnd)}`
        : fmtShort(app.recurStart)
      : '';
    const days = abbrevDays(app.recurDays);
    return [dateRange, days, time, loc].filter(Boolean).join(' · ');
  }
  // FLEXIBLE
  const dateRange = app.flexFromDate
    ? app.flexToDate
      ? `${fmtShort(app.flexFromDate)} – ${fmtShort(app.flexToDate)}`
      : fmtShort(app.flexFromDate)
    : '';
  return ['Flexible', dateRange, loc].filter(Boolean).join(' · ');
}

function appliedDateLine(app: UserApplication) {
  const date = fmtShort(app.createdAt);
  if (app.statusCode === 'PENDING')  return `Applied ${date} · Awaiting admin review`;
  if (app.statusCode === 'APPROVED') return `Approved ${fmtShort(app.statusUpdatedAt)} · Moving to Upcoming`;
  if (app.statusCode === 'REJECTED') return `Rejected ${fmtShort(app.statusUpdatedAt)}`;
  return `Applied ${date}`;
}

/**
 * Returns true if the user is allowed to withdraw this application.
 * - PENDING: always allowed (admin hasn't reviewed yet)
 * - APPROVED: only allowed if project start is more than 24 hours away
 */
function canWithdraw(app: UserApplication): boolean {
  if (app.statusCode === 'PENDING') return true;
  // APPROVED — enforce 24-hour gate
  if (app.scheduleTypeCode === 'FLEXIBLE' || !app.recurStart) return true;
  const startDate = new Date(app.recurStart);
  if (app.sessionStartTime) {
    const [h, m, s] = app.sessionStartTime.split(':').map(Number);
    startDate.setHours(h, m, s ?? 0, 0);
  }
  const hoursLeft = (startDate.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursLeft > 24;
}

// ─── Status chip ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string; label: string; icon?: string }> = {
  PENDING:   { color: '#D97706', bg: '#FEF3C7', label: 'Pending',   icon: '🕒' },
  APPROVED:  { color: '#059669', bg: '#D1FAE5', label: 'Approved',  icon: '✓' },
  REJECTED:  { color: '#DC2626', bg: '#FEE2E2', label: 'Rejected' },
  WITHDRAWN: { color: '#6B7280', bg: '#F3F4F6', label: 'Withdrawn' },
  COMPLETED: { color: '#6B4EFF', bg: '#EEF0FF', label: 'Completed', icon: '✓' },
  EXPIRED:   { color: '#9CA3AF', bg: '#F3F4F6', label: 'Expired' },
};

function StatusChip({ code }: { code: string }) {
  const cfg = STATUS_CFG[code] ?? { color: '#6B7280', bg: '#F3F4F6', label: code };
  return (
    <View style={[s.chip, { backgroundColor: cfg.bg }]}>
      <Text style={[s.chipText, { color: cfg.color }]}>
        {cfg.icon ? `${cfg.icon} ` : ''}{cfg.label}
      </Text>
    </View>
  );
}

// ─── Applied Card ─────────────────────────────────────────────────────────────

function AppliedCard({
  app, onPress, onWithdraw,
}: { app: UserApplication; onPress: () => void; onWithdraw: (app: UserApplication) => void }) {
  const borderColor = app.statusCode === 'PENDING' ? '#F59E0B'
    : app.statusCode === 'APPROVED'  ? '#059669'
    : C.BORDER;

  const allowed = canWithdraw(app);

  return (
    <TouchableOpacity style={[s.projectCard, { borderLeftColor: borderColor }]} onPress={onPress} activeOpacity={0.8}>
      {/* Top row */}
      <View style={s.cardRow}>
        <Text style={s.projectName} numberOfLines={1}>{app.projectName}</Text>
        <StatusChip code={app.statusCode} />
      </View>
      <Text style={s.orgName}>{app.orgName}</Text>
      <Text style={s.scheduleLine}>{scheduleOneLiner(app)}</Text>

      <View style={s.divider} />

      {/* Bottom row */}
      <View style={s.cardRow}>
        <Text style={s.appliedLine}>{appliedDateLine(app)}</Text>
        {app.statusCode === 'PENDING' && (
          <TouchableOpacity
            style={[s.withdrawBtn, !allowed && s.withdrawBtnDisabled]}
            onPress={() => {
              if (!allowed) {
                Alert.alert(
                  'Cannot Withdraw',
                  'Withdrawal is not allowed within 24 hours of the project start.',
                );
                return;
              }
              onWithdraw(app);
            }}
          >
            <Text style={[s.withdrawBtnText, !allowed && { color: '#9CA3AF' }]}>Withdraw</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Upcoming Card ────────────────────────────────────────────────────────────

function UpcomingCard({
  app, onPress, onScanQR, onSelfCheckIn,
}: { app: UserApplication; onPress: () => void; onScanQR: () => void; onSelfCheckIn: () => void }) {
  const typeLabel = app.scheduleTypeCode === 'RECURRING' ? 'Recurring' : 'Event';

  return (
    <TouchableOpacity style={s.projectCard} onPress={onPress} activeOpacity={0.85}>
      {/* Top row */}
      <View style={s.cardRow}>
        <Text style={s.projectName} numberOfLines={1}>{app.projectName}</Text>
        <View style={[s.typeChip]}>
          <Text style={s.typeChipText}>{typeLabel} ›</Text>
        </View>
      </View>
      <Text style={s.orgName}>{app.orgName}</Text>

      {/* Schedule */}
      <View style={s.scheduleRow}>
        <Text style={s.scheduleIcon}>📅</Text>
        <Text style={s.scheduleLine}>{scheduleOneLiner(app)}</Text>
      </View>

      {/* QR hint + scan button — shown when admin approval required */}
      {app.requiresApproval && !app.isCheckedIn && (
        <>
          <View style={s.hintBox}>
            <Text style={s.hintText}>
              At the venue? Ask admin to show the session QR and scan it to log your attendance.
            </Text>
          </View>
          <View style={[s.cardRow, { alignItems: 'center', gap: 8 }]}>
            <TouchableOpacity style={s.scanQrBtn} onPress={onScanQR} activeOpacity={0.85}>
              <Text style={s.scanQrBtnText}>📱  Scan QR to Mark Attendance</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Self check-in button — shown for open-signup projects (no QR required) */}
      {!app.requiresApproval && !app.isCheckedIn && (
        <>
          <View style={s.hintBox}>
            <Text style={s.hintText}>
              At the venue? Tap below during the session window to mark your attendance.
            </Text>
          </View>
          <View style={[s.cardRow, { alignItems: 'center', gap: 8 }]}>
            <TouchableOpacity style={s.scanQrBtn} onPress={onSelfCheckIn} activeOpacity={0.85}>
              <Text style={s.scanQrBtnText}>✅  Mark My Attendance</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Attendance confirmed — shown after successful check-in */}
      {app.isCheckedIn && (
        <View style={[s.hintBox, { backgroundColor: '#D1FAE5', borderColor: '#059669' }]}>
          <Text style={[s.hintText, { color: '#059669', fontWeight: '600' }]}>
            ✅ Attendance marked
          </Text>
        </View>
      )}

      <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
        <View style={[s.chip, { backgroundColor: '#D1FAE5' }]}>
          <Text style={[s.chipText, { color: '#059669' }]}>✓ Registered</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Completed Card ───────────────────────────────────────────────────────────

function CompletedCard({ app, onPress, onCertPress }: { app: UserApplication; onPress: () => void; onCertPress?: () => void }) {
  // Reuse the shared helper so date display is consistent across all card types
  const scheduleLine = scheduleOneLiner(app) ? `📅 ${scheduleOneLiner(app)}` : null;

  return (
    <TouchableOpacity style={[s.projectCard, { borderLeftColor: '#059669' }]} onPress={onPress} activeOpacity={0.85}>
      {/* Top row */}
      <View style={s.cardRow}>
        <Text style={s.projectName} numberOfLines={1}>{app.projectName}</Text>
        <View style={[s.chip, { backgroundColor: '#D1FAE5' }]}>
          <Text style={[s.chipText, { color: '#059669' }]}>✓ Completed</Text>
        </View>
      </View>
      <Text style={s.orgName}>{app.orgName}</Text>
      {scheduleLine ? <Text style={s.scheduleLine}>{scheduleLine}</Text> : null}

      <View style={s.divider} />

      {/* Hours / Impact row */}
      <View style={[s.cardRow, { marginBottom: app.skillRatings?.length ? 10 : 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.metaLabel}>Hours Volunteered</Text>
          <Text style={s.metaValue}>{(app.hoursLogged ?? 0) > 0 ? `${app.hoursLogged}h` : '—'}</Text>
        </View>
        {app.impactNote ? (
          <View style={{ flex: 1 }}>
            <Text style={s.metaLabel}>Impact</Text>
            <Text style={[s.metaValue, { color: C.TEAL }]}>{app.impactNote}</Text>
          </View>
        ) : null}
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.metaLabel}>Completed On</Text>
          <Text style={[s.metaValue, { fontSize: 12 }]}>{fmtShort(app.statusUpdatedAt ?? app.createdAt)}</Text>
        </View>
      </View>

      {/* Skill ratings */}
      {app.skillRatings?.length ? (
        <View style={{ marginBottom: 10 }}>
          <Text style={s.metaLabel}>Skill ratings received</Text>
          <View style={[s.cardRow, { flexWrap: 'wrap', marginTop: 6, gap: 8 }]}>
            {app.skillRatings.map((sr, i) => (
              <View key={i} style={s.skillRatingChip}>
                <Text style={s.skillRatingText}>
                  {'★'.repeat(Math.round(sr.rating))} {sr.skillName} {sr.rating.toFixed(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Footer */}
      <View style={s.cardRow}>
        <Text style={[s.appliedLine, { color: C.TEXT3 }]}>Tap to view project details</Text>
        {!!app.hasCertificate && !!onCertPress && (
          <TouchableOpacity
            style={s.downloadBtn}
            onPress={(e) => { e.stopPropagation(); onCertPress(); }}
            activeOpacity={0.85}
          >
            <Text style={s.downloadBtnText}>📄 Certificate</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Cancelled Card ───────────────────────────────────────────────────────────

function CancelledCard({ app, onPress }: { app: UserApplication; onPress: () => void }) {
  const reason =
    app.statusCode === 'REJECTED'
      ? { label: '✕ Rejected by Admin', color: '#DC2626', bg: '#FEE2E2', border: '#DC2626' }
    : app.statusCode === 'WITHDRAWN'
      ? { label: 'Withdrawn by You',    color: '#6B7280', bg: '#F3F4F6', border: C.BORDER }
    : app.projectStatusCode === 'CANCELLED'
      ? { label: 'Project Cancelled',   color: '#D97706', bg: '#FEF3C7', border: '#D97706' }
      : { label: 'Project Expired',     color: '#9CA3AF', bg: '#F3F4F6', border: C.BORDER };

  const scheduleLine = scheduleOneLiner(app) ? `📅 ${scheduleOneLiner(app)}` : null;

  return (
    <TouchableOpacity style={[s.projectCard, { borderLeftColor: reason.border }]} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardRow}>
        <Text style={s.projectName} numberOfLines={1}>{app.projectName}</Text>
        <View style={[s.chip, { backgroundColor: reason.bg }]}>
          <Text style={[s.chipText, { color: reason.color }]}>{reason.label}</Text>
        </View>
      </View>
      <Text style={s.orgName}>{app.orgName}</Text>
      {scheduleLine ? <Text style={s.scheduleLine}>{scheduleLine}</Text> : null}
      <View style={s.divider} />
      <Text style={[s.appliedLine, { color: C.TEXT3 }]}>
        Applied {fmtShort(app.createdAt)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ photo, name, compact }: { photo?: string; name: string; compact?: boolean }) {
  const init = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  if (compact) {
    const cStyle = { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' } as const;
    if (photo) return <Image source={{ uri: photo }} style={cStyle} />;
    return (
      <View style={[cStyle, s.avatarFallback]}>
        <Text style={[s.avatarText, { fontSize: 13 }]}>{init || '?'}</Text>
      </View>
    );
  }
  if (photo) return <Image source={{ uri: photo }} style={s.avatar} />;
  return (
    <View style={[s.avatar, s.avatarFallback]}>
      <Text style={s.avatarText}>{init || '?'}</Text>
    </View>
  );
}

function StatPill({ value, label, color, compact }: { value: number | string; label: string; color: string; compact?: boolean }) {
  return (
    <View style={s.statPill}>
      <Text style={[s.statValue, { color, fontSize: compact ? 17 : 22 }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const BADGE_META: Record<string, { emoji: string; color: string }> = {
  STAR_VOL:    { emoji: '⭐', color: '#D97706' },
  TEAM_PLAYER: { emoji: '🤝', color: '#2563EB' },
  TOP_PERFORM: { emoji: '🏆', color: '#7C3AED' },
};

function BadgeCard({ badge }: { badge: UserBadge }) {
  const meta  = BADGE_META[badge.badgeCode] ?? { emoji: '🏅', color: '#B45309' };
  const date  = badge.awardedAt
    ? new Date(badge.awardedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return (
    <View style={[s.badgeCard, { borderLeftColor: meta.color, borderLeftWidth: 3 }]}>
      {/* Left: emoji bubble */}
      <View style={[s.badgeIconWrap, { backgroundColor: meta.color + '20' }]}>
        <Text style={{ fontSize: 24 }}>{meta.emoji}</Text>
      </View>
      {/* Right: details */}
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.badgeName} numberOfLines={1}>{badge.badgeName}</Text>
        {!!badge.orgName    && <Text style={s.badgeMeta} numberOfLines={1}>🏢 {badge.orgName}</Text>}
        {!!badge.projectName && <Text style={s.badgeMeta} numberOfLines={1}>📋 {badge.projectName}</Text>}
        {!!date             && <Text style={s.badgeDate}>{date}</Text>}
      </View>
    </View>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <View style={s.infoBanner}>
      <Text style={s.infoBannerIcon}>ℹ️</Text>
      <Text style={s.infoBannerText}>{text}</Text>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.emptyState}>
      <Text style={{ fontSize: 36, marginBottom: 8 }}>{icon}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type TabKey = 'Applied' | 'Upcoming' | 'Completed' | 'Cancelled';
const TABS: TabKey[] = ['Applied', 'Upcoming', 'Completed', 'Cancelled'];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ImpactScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<any>();

  // ── Animated scroll tracking ──
  const scrollY = useRef(new Animated.Value(0)).current;
  const [heroH, setHeroH] = useState(400); // updated by onLayout after first render

  const [summary,    setSummary]    = useState<ImpactSummary | null>(null);
  const [activeTab,  setActiveTab]  = useState<TabKey>('Applied');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [qrVisible,      setQrVisible]      = useState(false);
  const [qrProjectId,    setQrProjectId]    = useState(0);
  const [qrProjectName,  setQrProjectName]  = useState('');
  const [detailVisible,  setDetailVisible]  = useState(false);
  const [detailApp,      setDetailApp]      = useState<UserApplication | null>(null);
  const [certVisible,    setCertVisible]    = useState(false);
  const [certProjectId,  setCertProjectId]  = useState<number | null>(null);
  const [certProjName,   setCertProjName]   = useState('');

  const TAB_LIMIT = 5;

  // ── Swipe to change tab ──────────────────────────────────────────────────────
  const swipeState = useRef({ tab: 'Applied' as TabKey, setTab: (_t: TabKey) => {} });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        const { tab: curTab, setTab } = swipeState.current;
        const idx = TABS.indexOf(curTab);
        if ((dx < -40 || vx < -0.4) && idx < TABS.length - 1) setTab(TABS[idx + 1]);
        else if ((dx > 40 || vx > 0.4) && idx > 0) setTab(TABS[idx - 1]);
      },
    })
  ).current;
  swipeState.current = { tab: activeTab, setTab: setActiveTab };

  // ── Load — single summary call (replaces 3 separate calls) ──
  const load = useCallback(async () => {
    try {
      const res = await getImpactSummary();
      if (res.data?.isSuccess) setSummary(res.data.data);
    } catch { /* silent */ }
  }, []);

  const init = useCallback(async () => {
    setLoading(true); await load(); setLoading(false);
  }, [load]);

  useEffect(() => { init(); }, [init]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  // ── Tab data — server-side filtered and limited; no client-side filtering needed ──
  const tabApps: Record<TabKey, UserApplication[]> = {
    Applied:   (summary?.applied   ?? []) as UserApplication[],
    Upcoming:  (summary?.upcoming  ?? []) as UserApplication[],
    Completed: (summary?.completed ?? []) as UserApplication[],
    Cancelled: (summary?.cancelled ?? []) as UserApplication[],
  };
  // Full DB counts — used for tab badge numbers and "View N more" buttons
  const tabTotals: Record<TabKey, number> = {
    Applied:   summary?.totalApplied   ?? 0,
    Upcoming:  summary?.totalUpcoming  ?? 0,
    Completed: summary?.totalCompleted ?? 0,
    Cancelled: summary?.totalCancelled ?? 0,
  };

  // ── Rank ──
  const score     = summary?.impactScore ?? 0;
  const rankName  = summary?.rankName ?? 'Newcomer';
  const rankColor = RANK_COLORS[rankName] ?? '#9CA3AF';
  const { next: nextRank, progress } = getRankMeta(score);
  const fullName  = [summary?.firstName, summary?.lastName].filter(Boolean).join(' ') || 'Volunteer';

  const openDetail = (app: UserApplication) => { setDetailApp(app); setDetailVisible(true); };
  const openCert   = (app: UserApplication) => {
    setCertProjectId(app.projectId);
    setCertProjName(app.projectName);
    setCertVisible(true);
  };

  const handleWithdraw = (app: UserApplication) => {
    Alert.alert(
      'Withdraw Application',
      `Withdraw from "${app.projectName}"?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await withdrawApplication(app.applicationId);
              if (res.data?.isSuccess === 1) {
                // Remove from applied list; decrement total (SP filters PENDING-only)
                setSummary(prev => prev ? {
                  ...prev,
                  applied:      prev.applied.filter(a => a.applicationId !== app.applicationId),
                  totalApplied: Math.max(0, prev.totalApplied - 1),
                } : null);
                Alert.alert('Withdrawn', 'Your application has been withdrawn.');
              } else {
                Alert.alert('Could not withdraw', res.data?.message ?? 'Please try again.');
              }
            } catch (err: any) {
              Alert.alert('Could not withdraw', err?.response?.data?.message ?? 'Please check your connection.');
            }
          },
        },
      ],
    );
  };
  const openQR     = (app: UserApplication) => {
    setQrProjectId(app.projectId);
    setQrProjectName(app.projectName);
    setQrVisible(true);
  };

  const handleSelfCheckIn = async (app: UserApplication) => {
    try {
      const res = await projectApi.selfCheckIn(app.projectId);
      if (res.data?.isSuccess === 1) {
        Alert.alert('Attendance Marked', res.data.message ?? 'Your attendance has been recorded. Thank you!');
        onRefresh();
      } else {
        Alert.alert('Check-in Failed', res.data?.message ?? 'Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Check-in Failed', err?.response?.data?.message ?? 'Please check your connection.');
    }
  };

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        message: `I'm a ${rankName} on RippleHub with an impact score of ${score.toLocaleString()}! 🌍 Join me at ripplehub.app`,
      });
    } catch { /* ignore */ }
  }, [rankName, score]);

  // ── Animation derivations ──────────────────────────────────────────────────
  // Recomputed on render when heroH changes (acceptable — happens once after first layout)
  const collapsible = Math.max(heroH - COMPACT_H, 1);

  // Phase 2: once content reaches the hero's top edge, the hero slides up
  const headerTranslateY = scrollY.interpolate({
    inputRange:  [heroH, heroH + collapsible],
    outputRange: [0, -collapsible],
    extrapolate: 'clamp',
  });

  // Full hero content fades out during the first 40% of the collapse
  const fullOpacity = scrollY.interpolate({
    inputRange:  [heroH, heroH + collapsible * 0.4],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Compact bar fades in during the last 60% of the collapse
  const compactOpacity = scrollY.interpolate({
    inputRange:  [heroH + collapsible * 0.4, heroH + collapsible],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ─── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={{ flex: 1 }}>

        {/* ── SCROLLABLE CONTENT ──
            paddingTop = heroH so content starts exactly below the hero.
            Phase 1 (0 → heroH): content scrolls up; hero stays fixed.
            Phase 2 (heroH → heroH+collapsible): hero collapses upward.
        */}
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[C.PRIMARY]}
              progressViewOffset={heroH}
            />
          }
          contentContainerStyle={{ paddingTop: heroH, paddingBottom: insets.bottom + 100 }}
        >
          {/* ── BADGES ── */}
          <View style={s.section}>
            <View style={s.sectionHdr}>
              <Text style={s.sectionTitle}>Badges Earned</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {(summary?.totalBadges ?? 0) > 0 && (
                  <View style={s.countChip}><Text style={s.countChipTxt}>{summary!.totalBadges}</Text></View>
                )}
                {(summary?.totalBadges ?? 0) > 0 && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => nav.navigate('AllBadges', { badges: summary!.badges })}
                  >
                    <Text style={s.viewAllTxt}>View All</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {(summary?.badges ?? []).length === 0
              ? <EmptyState icon="🎖" text="Complete projects to earn your first badge!" />
              : (
                <View style={{ gap: 8 }}>
                  {summary!.badges.map((b: any, i: number) => <BadgeCard key={b.userBadgeId ?? i} badge={b} />)}
                  {(summary?.totalBadges ?? 0) > summary!.badges.length && (
                    <TouchableOpacity
                      style={s.viewAllBadgesBtn}
                      activeOpacity={0.7}
                      onPress={() => nav.navigate('AllBadges', { badges: summary!.badges })}
                    >
                      <Text style={s.viewAllBadgesBtnTxt}>
                        View all {summary!.totalBadges} badges →
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
          </View>

          {/* ── EVENTS & PROJECTS ── */}
          <View style={s.section} {...panResponder.panHandlers}>
            <View style={s.sectionHdr}>
              <Text style={s.sectionTitle}>Events &amp; Projects</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => nav.navigate('MyProjects' as never, { initialTab: activeTab.toLowerCase() })}
              >
                <Text style={s.viewAllTxt}>View All</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={s.tabBar}>
              {TABS.map(tab => {
                const cnt = tabTotals[tab]; // show full DB count, not just visible slice
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[s.tab, activeTab === tab && s.tabActive]}
                    onPress={() => setActiveTab(tab)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>{tab}</Text>
                    {cnt > 0 && (
                      <View style={[s.tabBadge, activeTab === tab && s.tabBadgeActive]}>
                        <Text style={[s.tabBadgeTxt, activeTab === tab && s.tabBadgeTxtActive]}>{cnt}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Applied tab */}
            {activeTab === 'Applied' && (
              <>
                <InfoBanner text="Applications pending admin approval will appear here. Once approved they move to Upcoming." />
                {tabApps.Applied.length === 0
                  ? <EmptyState icon="📝" text="No applications yet. Explore projects to apply!" />
                  : <>
                      {tabApps.Applied.slice(0, TAB_LIMIT).map((app, i) => (
                        <AppliedCard key={i} app={app} onPress={() => openDetail(app)} onWithdraw={handleWithdraw} />
                      ))}
                      {tabTotals.Applied > TAB_LIMIT && (
                        <TouchableOpacity
                          style={s.viewMoreBtn}
                          onPress={() => nav.navigate('MyProjects' as never, { initialTab: 'applied' })}
                          activeOpacity={0.7}
                        >
                          <Text style={s.viewMoreBtnTxt}>View {tabTotals.Applied - TAB_LIMIT} more →</Text>
                        </TouchableOpacity>
                      )}
                    </>
                }
              </>
            )}

            {/* Upcoming tab */}
            {activeTab === 'Upcoming' && (
              tabApps.Upcoming.length === 0
                ? <EmptyState icon="📅" text="No upcoming projects. Approved projects appear here." />
                : <>
                    {tabApps.Upcoming.slice(0, TAB_LIMIT).map((app, i) => (
                      <UpcomingCard
                        key={i}
                        app={app}
                        onPress={() => openDetail(app)}
                        onScanQR={() => openQR(app)}
                        onSelfCheckIn={() => handleSelfCheckIn(app)}
                      />
                    ))}
                    {tabTotals.Upcoming > TAB_LIMIT && (
                      <TouchableOpacity
                        style={s.viewMoreBtn}
                        onPress={() => nav.navigate('MyProjects' as never, { initialTab: 'upcoming' })}
                        activeOpacity={0.7}
                      >
                        <Text style={s.viewMoreBtnTxt}>View {tabTotals.Upcoming - TAB_LIMIT} more →</Text>
                      </TouchableOpacity>
                    )}
                  </>
            )}

            {/* Completed tab */}
            {activeTab === 'Completed' && (
              tabApps.Completed.length === 0
                ? <EmptyState icon="✅" text="No completed projects yet. Keep volunteering!" />
                : <>
                    {tabApps.Completed.slice(0, TAB_LIMIT).map((app, i) => (
                      <CompletedCard
                        key={i}
                        app={app}
                        onPress={() => openDetail(app)}
                        onCertPress={() => openCert(app)}
                      />
                    ))}
                    {tabTotals.Completed > TAB_LIMIT && (
                      <TouchableOpacity
                        style={s.viewMoreBtn}
                        onPress={() => nav.navigate('MyProjects' as never, { initialTab: 'completed' })}
                        activeOpacity={0.7}
                      >
                        <Text style={s.viewMoreBtnTxt}>View {tabTotals.Completed - TAB_LIMIT} more →</Text>
                      </TouchableOpacity>
                    )}
                  </>
            )}

            {/* Cancelled tab */}
            {activeTab === 'Cancelled' && (
              <>
                <InfoBanner text="Applications rejected by admin, withdrawn by you, or projects that expired or were cancelled." />
                {tabApps.Cancelled.length === 0
                  ? <EmptyState icon="📭" text="No rejected or cancelled applications." />
                  : <>
                      {tabApps.Cancelled.slice(0, TAB_LIMIT).map((app, i) => (
                        <CancelledCard key={i} app={app} onPress={() => openDetail(app)} />
                      ))}
                      {tabTotals.Cancelled > TAB_LIMIT && (
                        <TouchableOpacity
                          style={s.viewMoreBtn}
                          onPress={() => nav.navigate('MyProjects' as never, { initialTab: 'cancelled' })}
                          activeOpacity={0.7}
                        >
                          <Text style={s.viewMoreBtnTxt}>View {tabTotals.Cancelled - TAB_LIMIT} more →</Text>
                        </TouchableOpacity>
                      )}
                    </>
                }
              </>
            )}
          </View>

        </Animated.ScrollView>

        {/* ── HERO HEADER ──
            Absolutely positioned at top, zIndex 10.
            Contains:
              • compactBar  — position:absolute at top, fades IN when collapsed
              • heroContent — full purple section, fades OUT when collapsed
              • statsCardHero — Hours/Projects/NGOs card at hero bottom
            translateY drives the collapse: slides up by (heroH - COMPACT_H),
            leaving only the compact bar visible at the top.
        */}
        <Animated.View
          style={[s.hero, { transform: [{ translateY: headerTranslateY }] }]}
          onLayout={(e: LayoutChangeEvent) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - heroH) > 2) setHeroH(h);
          }}
        >
          {/* Compact bar — overlays top COMPACT_H pixels; purely visual */}
          <Animated.View style={[s.compactBar, { opacity: compactOpacity }]} pointerEvents="none">
            <Avatar photo={summary?.profilePhoto} name={fullName} compact />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.compactName} numberOfLines={1}>{fullName}</Text>
              <Text style={s.compactScore} numberOfLines={1}>
                {score.toLocaleString()} pts · {rankName}
              </Text>
            </View>
          </Animated.View>

          {/* Full hero content — compact 2-row layout */}
          <Animated.View style={[s.heroContent, { opacity: fullOpacity }]}>
            {/* Share button */}
            <TouchableOpacity style={s.shareBtn} onPress={onShare} activeOpacity={0.8}>
              <Text style={s.shareBtnText}>Share 🔗</Text>
            </TouchableOpacity>

            {/* Row 1: Avatar  |  Name / Member Since / Rank badge */}
            <View style={s.heroIdentityRow}>
              <Avatar photo={summary?.profilePhoto} name={fullName} />
              <View style={s.heroIdentityInfo}>
                <Text style={s.userName} numberOfLines={1}>{fullName}</Text>
                <Text style={s.memberSince}>Member since {fmtMonthYear(summary?.memberSince)}</Text>
                <View style={[s.rankBadge, { backgroundColor: rankColor }]}>
                  <Text style={s.rankBadgeText}>{RANK_EMOJI[rankName] ?? '🌱'} {rankName}</Text>
                </View>
              </View>
            </View>

            {/* Row 2: Score number  |  Score label + Rank position */}
            <View style={s.scoreRow}>
              <Text style={s.scoreNum}>{score.toLocaleString()}</Text>
              <View style={s.scoreMeta}>
                <Text style={s.scoreLabel}>Impact Score</Text>
                {(summary?.rankNumber ?? 0) > 0 && (
                  <Text style={s.rankPos}>
                    #{summary!.rankNumber} of {(summary!.totalRanked ?? 0).toLocaleString()} volunteers
                  </Text>
                )}
              </View>
            </View>

            {/* Progress bar */}
            <View style={s.progressOuter}>
              <View style={[s.progressFill, { width: `${Math.min(progress, 100)}%` as any }]} />
            </View>
            {nextRank
              ? <Text style={s.progressHint}>{(nextRank.min - score).toLocaleString()} pts to {nextRank.name}</Text>
              : <Text style={s.progressHint}>🎉 Maximum rank achieved!</Text>
            }
          </Animated.View>

          {/* Primary stats card — all 5 KPIs in one row */}
          <View style={s.statsCardHero}>
            <StatPill compact value={summary?.projectsCompleted ?? 0}            label="Projects"    color={C.TEAL} />
            <View style={s.statDiv} />
            <StatPill compact value={summary?.ngosJoined ?? 0}                   label="NGOs"        color={C.ORANGE} />
            <View style={s.statDiv} />
            <StatPill compact value={`${summary?.reliabilityPct ?? 0}%`}         label="Reliability" color={C.TEAL} />
            <View style={s.statDiv} />
            <StatPill compact value={summary?.badgeCount ?? 0}                   label="Badges"      color={C.YELLOW} />
            <View style={s.statDiv} />
            <StatPill compact value={summary?.certificateCount ?? 0}             label="Certs"       color={C.ORANGE} />
          </View>
        </Animated.View>

      </View>

      {/* ── MODALS ── */}
      <ProjectDetailModal
        visible={detailVisible}
        application={detailApp}
        onClose={() => setDetailVisible(false)}
        onScanQR={() => {
          if (detailApp) openQR(detailApp);
        }}
        onSelfCheckIn={() => {
          if (detailApp) handleSelfCheckIn(detailApp);
        }}
      />

      <QRScannerModal
        visible={qrVisible}
        projectId={qrProjectId}
        projectName={qrProjectName}
        onClose={() => setQrVisible(false)}
        onSuccess={() => {
          setQrVisible(false);
          onRefresh();
        }}
      />

      <CertificateModal
        visible={certVisible}
        projectId={certProjectId}
        projectName={certProjName}
        onClose={() => setCertVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.BG },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Hero wrapper (absolute, animates up) ──
  hero: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },

  // Compact bar — position:absolute inside hero, stays visible at top when collapsed
  compactBar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: COMPACT_H,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.PRIMARY, paddingHorizontal: 16, zIndex: 2,
  },
  compactName:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  compactScore:   { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },

  // Full hero content (fades out when collapsed)
  heroContent:      { backgroundColor: C.PRIMARY, paddingTop: 6, paddingBottom: 14, paddingHorizontal: 16, alignItems: 'center' },
  shareBtn:         { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 8 },
  shareBtnText:     { color: '#fff', fontSize: 11, fontWeight: '600' },
  avatar:           { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  avatarFallback:   { backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarText:       { color: '#fff', fontSize: 20, fontWeight: '700' },
  // Row 1: identity
  heroIdentityRow:  { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 8 },
  heroIdentityInfo: { flex: 1, marginLeft: 12 },
  userName:         { color: '#fff', fontSize: 15, fontWeight: '700' },
  memberSince:      { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2, marginBottom: 6 },
  rankBadge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  rankBadgeText:    { color: '#fff', fontSize: 11, fontWeight: '700' },
  // Row 2: score
  scoreRow:         { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 8 },
  scoreNum:         { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  scoreMeta:        { marginLeft: 10 },
  scoreLabel:       { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  rankPos:          { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2, fontWeight: '600' },
  // Progress
  progressOuter:    { width: '100%', height: 5, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill:     { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
  progressHint:     { color: 'rgba(255,255,255,0.7)', fontSize: 10, alignSelf: 'flex-start' },

  // Primary stats card (inside hero, no negative margin)
  statsCardHero:  { flexDirection: 'row', backgroundColor: C.CARD, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16, ...AppConfig.SHADOW.CARD },

  // Secondary stats card (in scroll content)
  statsCard:      { flexDirection: 'row', backgroundColor: C.CARD, marginHorizontal: 16, marginTop: -16, borderRadius: 14, padding: 16, ...AppConfig.SHADOW.CARD },
  statPill:       { flex: 1, alignItems: 'center' },
  statValue:      { fontSize: 22, fontWeight: '800' },
  statLabel:      { fontSize: 11, color: C.TEXT2, marginTop: 2 },
  statDiv:        { width: 1, backgroundColor: C.BORDER, marginVertical: 4 },

  // Sections
  section:        { paddingHorizontal: 16, marginTop: 20 },
  sectionHdr:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:   { fontSize: 15, fontWeight: '700', color: C.TEXT },
  countChip:      { backgroundColor: C.PRIMARY_LIGHT, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countChipTxt:   { fontSize: 12, fontWeight: '700', color: C.PRIMARY },
  viewAllTxt:     { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },

  // Tabs
  tabBar:         { flexDirection: 'row', backgroundColor: C.INPUT_BG, borderRadius: 10, padding: 4, marginBottom: 12 },
  tab:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, gap: 4 },
  tabActive:      { backgroundColor: C.CARD, ...AppConfig.SHADOW.CARD_SM },
  tabTxt:         { fontSize: 11, color: C.TEXT2, fontWeight: '500' },
  tabTxtActive:   { color: C.PRIMARY, fontWeight: '700' },
  tabBadge:       { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.BORDER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeActive: { backgroundColor: C.PRIMARY_LIGHT },
  tabBadgeTxt:    { fontSize: 10, fontWeight: '700', color: C.TEXT2 },
  tabBadgeTxtActive: { color: C.PRIMARY },

  // Info banner
  infoBanner:     { flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 12 },
  infoBannerIcon: { fontSize: 14 },
  infoBannerText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

  // Project cards (shared base)
  projectCard:    {
    backgroundColor: C.CARD, borderRadius: 14, padding: 14, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: C.BORDER,
    ...AppConfig.SHADOW.CARD_SM,
  },
  cardRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  projectName:    { flex: 1, fontSize: 14, fontWeight: '700', color: C.TEXT, marginRight: 8 },
  orgName:        { fontSize: 12, color: C.TEXT2, marginTop: 4, marginBottom: 6 },
  orgNameGray:    { fontSize: 11, color: C.TEXT3, marginTop: 3, marginBottom: 4 },
  divider:        { height: 1, backgroundColor: C.BORDER, marginVertical: 10 },

  // Schedule line
  scheduleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  scheduleIcon:   { fontSize: 13 },
  scheduleLine:   { fontSize: 12, color: C.TEXT2, flex: 1 },

  // Chips
  chip:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  chipText:       { fontSize: 11, fontWeight: '700' },
  typeChip:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: C.PRIMARY_LIGHT },
  typeChipText:   { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },

  // Applied-specific
  appliedLine:    { flex: 1, fontSize: 11, color: C.TEXT2 },
  withdrawBtn:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: C.ORANGE },
  withdrawBtnDisabled: { borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
  withdrawBtnText:     { color: C.ORANGE, fontSize: 12, fontWeight: '700' },

  // Upcoming-specific
  hintBox:        { backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, marginVertical: 10 },
  hintText:       { fontSize: 11, color: '#92400E', lineHeight: 17 },
  scanQrBtn:      { flex: 1, backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 12, alignItems: 'center', ...AppConfig.SHADOW.BTN },
  scanQrBtnText:  { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Completed-specific
  metaLabel:      { fontSize: 11, color: C.TEXT3 },
  metaValue:      { fontSize: 15, fontWeight: '700', color: C.TEXT, marginTop: 2 },
  skillRatingChip: { backgroundColor: C.INPUT_BG, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  skillRatingText: { fontSize: 11, color: C.TEXT2, fontWeight: '600' },
  downloadBtn:    { backgroundColor: C.PRIMARY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  downloadBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Badges
  viewMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.BORDER,
    marginBottom: 8,
  },
  viewMoreBtnTxt: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },

  viewAllBadgesBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  viewAllBadgesBtnTxt: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },
  badgeCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD, borderRadius: 12, padding: 12, borderLeftWidth: 3, ...AppConfig.SHADOW.CARD_SM },
  badgeIconWrap:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeName:      { fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  badgeMeta:      { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  badgeDate:      { fontSize: 10, color: C.TEXT2, marginTop: 3, fontStyle: 'italic' },

  // Empty state
  emptyState:     { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  emptyText:      { fontSize: 13, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },
});
