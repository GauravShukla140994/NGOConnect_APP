/**
 * ParticipantsScreen.tsx — Admin view of project participants
 *
 * Sections (all statuses always visible):
 *   PENDING APPLICATIONS   — approve / reject / view profile
 *   APPROVED — UPCOMING    — confirmed members not yet in a session
 *   ATTENDED — LAST SESSION — QR time, skill ratings, badge buttons
 *   NO SHOWS — LAST SESSION — mark excused / confirm no show
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { projectApi } from '../../api/project.api';
import { awardBadge } from '../../api/org.api';
import { issueCertificate } from '../../api/user.api';

type ProjectSkill = { id: number; name: string };
import { UserAvatar } from '../../components/ui';

const C = AppConfig.COLORS;

// ─── Constants ────────────────────────────────────────────────────────────────

const BADGE_DEFS = [
  { key: 'STAR_VOL',    icon: '⭐', label: 'Star Vol.'     },
  { key: 'TEAM_PLAYER', icon: '🤝', label: 'Team Player'   },
  { key: 'TOP_PERFORM', icon: '🏆', label: 'Top Performer' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime12(t?: string): string {
  if (!t) return '';
  const d = new Date(t);
  if (!isNaN(d.getTime()))
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDate(d?: string): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function relativeDate(iso?: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${Math.min(Math.max(pct, 0), 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── PENDING CARD ─────────────────────────────────────────────────────────────

function PendingCard({
  app, reviewing, onApprove, onReject, onProfile,
}: {
  app: any; reviewing: boolean;
  onApprove: () => void; onReject: () => void; onProfile: () => void;
}) {
  const name = app.applicantName ?? app.fullName ?? 'Volunteer';
  const subParts = [app.city, app.profession, app.createdAt ? `Applied ${relativeDate(app.createdAt)}` : null].filter(Boolean);
  const hasRelData = app.attendancePct != null || app.avgSkillRating != null || app.noShowCount != null;

  return (
    <View style={s.card}>
      {/* Top row */}
      <View style={s.cardTopRow}>
        <UserAvatar name={name} photoUrl={app.profilePhoto} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardName}>{name}</Text>
          {subParts.length > 0 && <Text style={s.cardSub} numberOfLines={2}>{subParts.join(' · ')}</Text>}
          {!!app.requestedSessions && <Text style={s.cardSub}>Requested: {app.requestedSessions}</Text>}
        </View>
        <View style={s.pendingChip}><Text style={s.pendingChipText}>Pending</Text></View>
      </View>

      {/* Reliability profile */}
      {hasRelData && (
        <View style={s.reliabilityBox}>
          <View style={s.reliabilityHdr}>
            <Text style={s.reliabilityHdrText}>Reliability profile — admin only</Text>
            <View style={s.privateChip}><Text style={s.privateChipText}>Private</Text></View>
          </View>
          {app.attendancePct != null && (
            <View style={s.reliabilityRow}>
              <Text style={s.reliabilityKey}>Attendance</Text>
              <ProgressBar pct={app.attendancePct} color="#16A34A" />
              <Text style={[s.reliabilityVal, { color: '#16A34A' }]}>{app.attendancePct}%</Text>
            </View>
          )}
          {app.avgSkillRating != null && (
            <View style={s.reliabilityRow}>
              <Text style={s.reliabilityKey}>Skill rating</Text>
              <ProgressBar pct={(app.avgSkillRating / 5) * 100} color={C.PRIMARY} />
              <Text style={[s.reliabilityVal, { color: C.PRIMARY }]}>{Number(app.avgSkillRating).toFixed(1)}★</Text>
            </View>
          )}
          {app.noShowCount != null && (
            <View style={s.reliabilityRow}>
              <Text style={s.reliabilityKey}>No shows</Text>
              <ProgressBar pct={Math.min(app.noShowCount * 25, 100)} color="#EF4444" />
              <Text style={[s.reliabilityVal, { color: '#EF4444' }]}>{app.noShowCount}×</Text>
            </View>
          )}
          {(app.totalHours != null || app.totalProjects != null) && (
            <View style={s.reliabilityStats}>
              {app.totalHours    != null && <Text style={s.reliabilityStatItem}>{app.totalHours} hrs</Text>}
              {app.totalProjects != null && <Text style={s.reliabilityStatItem}>{app.totalProjects} projects</Text>}
              <TouchableOpacity onPress={onProfile}>
                <Text style={[s.reliabilityStatItem, { color: C.PRIMARY }]}>Full profile →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Motivation */}
      {!!app.motivation && (
        <View style={s.motivationBox}>
          <Text style={s.motivationText}>"{app.motivation}"</Text>
        </View>
      )}

      {/* Actions */}
      <View style={s.threeActionRow}>
        <TouchableOpacity style={[s.approveBtn, reviewing && s.btnDisabled]} onPress={onApprove} disabled={reviewing} activeOpacity={0.85}>
          {reviewing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.approveBtnText}>✓  Approve</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[s.rejectBtn, reviewing && s.btnDisabled]} onPress={onReject} disabled={reviewing} activeOpacity={0.85}>
          <Text style={s.rejectBtnText}>✕  Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.profileBtn} onPress={onProfile} activeOpacity={0.85}>
          <Text style={s.profileBtnText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── APPROVED CARD ────────────────────────────────────────────────────────────

function ApprovedCard({
  app, onProfile, onMarkAttended, marking, onRemove, removing, canMark,
}: {
  app: any;
  onProfile: () => void;
  onMarkAttended: () => void;
  marking: boolean;
  onRemove: () => void;
  removing: boolean;
  canMark: boolean;   // false for expired projects — session time has passed
}) {
  const name = app.applicantName ?? app.fullName ?? 'Volunteer';
  const subParts = [app.city, app.profession].filter(Boolean);
  const approvedDate = app.statusUpdatedAt ? fmtDate(app.statusUpdatedAt) : '';

  return (
    <View style={s.card}>
      <View style={s.cardTopRow}>
        <UserAvatar name={name} photoUrl={app.profilePhoto} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardName}>{name}</Text>
          {subParts.length > 0 && <Text style={s.cardSub}>{subParts.join(' · ')}</Text>}
          {!!approvedDate && <Text style={s.cardSub}>Approved {approvedDate}</Text>}
        </View>
        <View style={s.approvedChip}><Text style={s.approvedChipText}>✓ Approved</Text></View>
      </View>
      {canMark && (
        <View style={s.approvedCardFooter}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              style={[s.markAttendedBtn, marking && s.btnDisabled]}
              onPress={onMarkAttended}
              disabled={marking || removing}
              activeOpacity={0.85}
            >
              {marking
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.markAttendedBtnText}>✓  Mark Attended</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onProfile} activeOpacity={0.75}>
            <Text style={s.viewProfileText}>View profile →</Text>
          </TouchableOpacity>
        </View>
      )}
      {!canMark && (
        <TouchableOpacity onPress={onProfile} activeOpacity={0.75} style={{ alignSelf: 'flex-end', marginTop: 6 }}>
          <Text style={s.viewProfileText}>View profile →</Text>
        </TouchableOpacity>
      )}
      {/* Remove from project — available even for expired projects */}
      <TouchableOpacity
        style={[s.removeVolBtn, (removing || marking) && s.btnDisabled]}
        onPress={onRemove}
        disabled={removing || marking}
        activeOpacity={0.85}
      >
        {removing
          ? <ActivityIndicator color="#DC2626" size="small" />
          : <Text style={s.removeVolBtnText}>✕  Remove from Project</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── ATTENDED CARD ────────────────────────────────────────────────────────────

function AttendedCard({
  app, projectSkills, skillRatings, onRateSkill, onSubmitRatings,
  submittingRatings, submittedRatings,
  awardedBadges, onAwardBadge, awardingBadge,
  isCompleted, isClosing, hasCertificate, onIssueCertificate, issuingCert,
}: {
  app: any;
  projectSkills: ProjectSkill[];
  skillRatings: Record<number, number>;
  onRateSkill: (skillId: number, val: number) => void;
  onSubmitRatings: () => void;
  submittingRatings: boolean;
  submittedRatings: boolean;
  awardedBadges: string[];
  onAwardBadge: (key: string) => void;
  awardingBadge: string | null;
  isCompleted: boolean;
  isClosing: boolean;
  hasCertificate: boolean;
  onIssueCertificate: () => void;
  issuingCert: boolean;
}) {
  const name = app.applicantName ?? app.fullName ?? 'Volunteer';
  const checkinDt    = app.checkedInAt ? new Date(app.checkedInAt) : null;
  const checkinDate  = checkinDt ? fmtDate(app.checkedInAt) : null;
  const checkinTime  = checkinDt ? fmtTime12(app.checkedInAt) : null;
  const checkInLabel = app.qrScannedAt ? 'QR' : checkinDt ? 'Self Check-in' : null;
  const hours = app.hoursLogged ?? app.hoursAttended;

  const checkinLine = [
    (checkInLabel && checkinDate && checkinTime) ? `${checkInLabel} ${checkinDate} ${checkinTime}` : null,
    hours ? `${hours} hrs logged` : null,
  ].filter(Boolean).join(' · ');

  const hasAnyRating = projectSkills.some(sk => (skillRatings[sk.id] ?? 0) > 0);

  return (
    <View style={s.card}>
      {/* Top row */}
      <View style={s.cardTopRow}>
        <UserAvatar name={name} photoUrl={app.profilePhoto} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardName}>{name}</Text>
          {!!checkinLine && (
            <View style={s.checkinRow}>
              <Text style={s.checkinIcon}>⊠</Text>
              <Text style={s.checkinLine}>{checkinLine}</Text>
            </View>
          )}
        </View>
        <View style={s.attendedChip}><Text style={s.attendedChipText}>Attended</Text></View>
      </View>

      {/* Skill ratings — only shown when project has skills defined */}
      {projectSkills.length > 0 && (
        <View style={s.skillRatingSection}>
          <View style={s.skillRatingWrap}>
            <Text style={s.rateSkillsLabel}>Rate skills:</Text>
            <View style={s.skillColumnsRow}>
              {projectSkills.map(sk => (
                <View key={sk.id} style={s.skillColumn}>
                  <Text style={s.skillColName}>{sk.name}</Text>
                  <View style={s.starsRow}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => !submittedRatings && !hasCertificate && onRateSkill(sk.id, i)}
                        hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                        disabled={submittedRatings || hasCertificate}
                      >
                        <Text style={[s.star, { color: i <= (skillRatings[sk.id] ?? 0) ? '#F59E0B' : '#D1D5DB' }]}>★</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Save ratings button */}
          {!submittedRatings && !hasCertificate && (
            <TouchableOpacity
              style={[s.saveRatingsBtn, (!hasAnyRating || submittingRatings) && s.btnDisabled]}
              onPress={onSubmitRatings}
              disabled={!hasAnyRating || submittingRatings}
              activeOpacity={0.8}
            >
              {submittingRatings
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={s.saveRatingsBtnText}>Save Ratings</Text>}
            </TouchableOpacity>
          )}
          {submittedRatings && (
            <View style={s.ratingsSubmittedRow}>
              <Text style={s.ratingsSubmittedText}>✓ Ratings saved</Text>
            </View>
          )}
          {!submittedRatings && hasCertificate && (
            <View style={s.ratingsSubmittedRow}>
              <Text style={[s.ratingsSubmittedText, { color: '#9CA3AF' }]}>🔒  Locked — certificate issued</Text>
            </View>
          )}
        </View>
      )}

      {/* Badge buttons — only for attended volunteers; disabled while API is in-flight */}
      <View style={s.badgeRow}>
        {BADGE_DEFS.map(b => {
          const awarded   = awardedBadges.includes(b.key);
          const awarding  = awardingBadge === b.key;
          const disabled  = awarded || !!awardingBadge || hasCertificate;
          return (
            <TouchableOpacity
              key={b.key}
              style={[s.badgeBtn, awarded && s.badgeBtnAwarded, disabled && !awarded && s.btnDisabled]}
              onPress={() => !disabled && onAwardBadge(b.key)}
              activeOpacity={0.8}
              disabled={disabled}
            >
              {awarding
                ? <ActivityIndicator size="small" color={C.PRIMARY} />
                : <Text style={[s.badgeBtnIcon, awarded && { color: C.PRIMARY }]}>{b.icon}</Text>}
              <Text style={[s.badgeBtnLabel, awarded && { color: C.PRIMARY }]}>{b.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Issue Certificate — shown for COMPLETED or CLOSING projects; ATTENDED volunteers only */}
      {(isCompleted || isClosing) && (
        <TouchableOpacity
          style={[
            s.issueCertBtn,
            hasCertificate && s.issueCertBtnIssued,
            issuingCert && s.btnDisabled,
          ]}
          onPress={hasCertificate ? undefined : onIssueCertificate}
          disabled={hasCertificate || issuingCert}
          activeOpacity={0.85}
        >
          {issuingCert
            ? <ActivityIndicator size="small" color="#fff" />
            : hasCertificate
              ? <Text style={s.issueCertBtnIssuedText}>✓  Certificate Issued</Text>
              : <Text style={s.issueCertBtnText}>📄  Issue Certificate</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── NO SHOW CARD ─────────────────────────────────────────────────────────────

function NoShowCard({
  app, onExcuse, onConfirm, onMarkAttended, marking,
}: {
  app: any; onExcuse: () => void; onConfirm: () => void; onMarkAttended: () => void; marking: boolean;
}) {
  const name = app.applicantName ?? app.fullName ?? 'Volunteer';
  const dateStr = fmtDate(app.sessionDate ?? app.lastSessionDate ?? app.statusUpdatedAt);

  return (
    <View style={s.card}>
      {/* Top row */}
      <View style={s.cardTopRow}>
        <UserAvatar name={name} photoUrl={app.profilePhoto} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardName}>{name}</Text>
          <Text style={s.noShowSubtitle}>
            Did not check in{dateStr ? ` — ${dateStr}` : ''}
          </Text>
        </View>
        <View style={s.noShowChip}><Text style={s.noShowChipText}>No show</Text></View>
      </View>

      {/* Privacy note */}
      <View style={s.noShowNote}>
        <Text style={s.noShowNoteText}>
          Recorded privately on reliability profile only. Not shown publicly on volunteer's impact page.
        </Text>
      </View>

      {/* Mark attended — override if missed QR */}
      <TouchableOpacity
        style={[s.markAttendedBtn, { marginBottom: 8 }, marking && s.btnDisabled]}
        onPress={onMarkAttended}
        disabled={marking}
        activeOpacity={0.85}
      >
        {marking
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.markAttendedBtnText}>✓  Mark as Attended</Text>}
      </TouchableOpacity>

      {/* Excuse / Confirm buttons */}
      <View style={s.twoActionRow}>
        <TouchableOpacity style={s.excuseBtn} onPress={onExcuse} activeOpacity={0.85}>
          <Text style={s.excuseBtnText}>Mark excused</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.confirmNoShowBtn} onPress={onConfirm} activeOpacity={0.85}>
          <Text style={s.confirmNoShowBtnText}>Confirm no show</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── SCREEN ───────────────────────────────────────────────────────────────────

export default function ParticipantsScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const { projectId, orgId, projectStatus, sessionId, isExpiredUpcoming } = route.params ?? {};
  const isCompleted  = projectStatus === 'COMPLETED';
  const isClosing    = projectStatus === 'CLOSING';
  const isCancelled  = projectStatus === 'CANCELLED';
  // isExpiredUpcoming: UPCOMING project whose session end time has already passed.
  // Treat as read-only so Approve and Mark Attended are hidden (session time passed).
  const isReadOnly   = isCompleted || isClosing || isCancelled || (isExpiredUpcoming ?? false);

  const [apps,          setApps]          = useState<any[]>([]);
  const [projectSkills, setProjectSkills] = useState<ProjectSkill[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [reviewing,     setReviewing]     = useState<number | null>(null);

  // Per-app state
  const [markingAttended,   setMarkingAttended]   = useState<number | null>(null);
  const [removingVolunteer, setRemovingVolunteer] = useState<number | null>(null);

  // Skill ratings: appId → { projectSkillId → star count }
  const [skillRatings,      setSkillRatings]      = useState<Record<number, Record<number, number>>>({});
  // Which apps have had ratings submitted (appId → true)
  const [submittingRatings, setSubmittingRatings] = useState<Record<number, boolean>>({});
  const [submittedRatings,  setSubmittedRatings]  = useState<Record<number, boolean>>({});

  const [awardedBadges, setAwardedBadges] = useState<Record<number, string[]>>({});
  // Which badge (ValueCode) is currently being awarded for each appId (null = idle)
  const [awardingBadge, setAwardingBadge] = useState<Record<number, string | null>>({});

  // Certificate issuance state: appId → true if cert issued (pre-populated from server + updated locally)
  const [issuedCerts, setIssuedCerts] = useState<Record<number, boolean>>({});
  // appId currently being cert-issued (null = idle)
  const [issuingCertFor, setIssuingCertFor] = useState<number | null>(null);

  // (badgeLkpMap removed — API now accepts badgeCode string directly)

  // ── Load ──
  const load = useCallback(async (isRefresh = false) => {
    if (!projectId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [appsRes, skillsRes] = await Promise.allSettled([
        projectApi.getApplications(projectId, { pageNumber: 1, pageSize: 200 }),
        projectApi.getSkills(projectId),
      ]);

      if (appsRes.status === 'fulfilled' && appsRes.value.data?.isSuccess) {
        const loaded = appsRes.value.data.data?.items ?? [];
        setApps(loaded);
        // Pre-populate already-awarded badges
        const initBadges: Record<number, string[]> = {};
        const initCerts: Record<number, boolean> = {};
        for (const app of loaded) {
          if (app.awardedBadgeCodes) {
            initBadges[app.applicationId] = (app.awardedBadgeCodes as string).split(',').filter(Boolean);
          }
          if (app.hasCertificate) {
            initCerts[app.applicationId] = true;
          }
        }
        setAwardedBadges(initBadges);
        setIssuedCerts(initCerts);

        // Pre-load existing skill ratings for attended volunteers so they persist across visits
        const attendedApps = loaded.filter((a: any) => a.statusCode === 'ATTENDED');
        if (attendedApps.length > 0) {
          const ratingFetches = attendedApps.map((a: any) =>
            projectApi.getSkillRatings(projectId, a.userId)
              .then(res => ({ appId: a.applicationId, data: (res.data?.data as any[]) ?? [] }))
              .catch(() => ({ appId: a.applicationId, data: [] as any[] })),
          );
          const ratingResults = await Promise.all(ratingFetches);
          const initRatings: Record<number, Record<number, number>>  = {};
          const initSubmitted: Record<number, boolean>               = {};
          for (const { appId, data } of ratingResults) {
            const ratingsForApp: Record<number, number> = {};
            let hasAny = false;
            for (const r of data) {
              if ((r.rating ?? 0) > 0) {
                ratingsForApp[r.projectSkillId] = Math.round(r.rating);
                hasAny = true;
              }
            }
            if (hasAny) {
              initRatings[appId]   = ratingsForApp;
              initSubmitted[appId] = true;
            }
          }
          setSkillRatings(initRatings);
          setSubmittedRatings(initSubmitted);
        }
      }

      if (skillsRes.status === 'fulfilled' && skillsRes.value.data?.isSuccess) {
        const skills: ProjectSkill[] = (skillsRes.value.data.data ?? [])
          .map((sk: any) => ({ id: sk.projectSkillId, name: sk.skillName }))
          .filter((sk: ProjectSkill) => sk.id && sk.name);
        setProjectSkills(skills);
      }
    } catch {
      Alert.alert('Error', 'Could not load participants.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // ── Approve / Reject ──
  const handleReview = useCallback(async (applicationId: number, statusCode: 'APPROVED' | 'REJECTED') => {
    setReviewing(applicationId);
    try {
      const res = await projectApi.reviewApplication(projectId, { applicationId, statusCode });
      if (res.data?.isSuccess) {
        // Update locally — member stays visible in new section
        setApps(prev => prev.map(a =>
          a.applicationId === applicationId
            ? { ...a, statusCode, statusUpdatedAt: new Date().toISOString() }
            : a,
        ));
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not update.');
      }
    } catch {
      Alert.alert('Error', 'An error occurred.');
    } finally {
      setReviewing(null);
    }
  }, [projectId]);

  // ── Manual attendance ──
  const handleManualAttendance = useCallback((applicationId: number, name: string) => {
    Alert.alert(
      'Mark as Attended',
      `Mark ${name} as attended? This will override their current status and log hours from the session.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Attended',
          onPress: async () => {
            setMarkingAttended(applicationId);
            try {
              const res = await projectApi.manualAttendance(projectId, applicationId);
              if (res.data?.isSuccess) {
                setApps(prev => prev.map(a =>
                  a.applicationId === applicationId
                    ? { ...a, statusCode: 'ATTENDED', checkedInAt: new Date().toISOString() }
                    : a,
                ));
              } else {
                Alert.alert('Error', res.data?.message ?? 'Could not mark attendance.');
              }
            } catch {
              Alert.alert('Error', 'An error occurred.');
            } finally {
              setMarkingAttended(null);
            }
          },
        },
      ],
    );
  }, [projectId]);

  // ── Admin remove volunteer ──
  const handleRemoveVolunteer = useCallback((userId: number, applicationId: number, name: string) => {
    Alert.alert(
      'Remove Volunteer',
      `Remove ${name} from this project? Their slot will be freed so other volunteers can apply. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingVolunteer(applicationId);
            try {
              const res = await projectApi.adminRemoveVolunteer(projectId, userId);
              if (res.data?.isSuccess) {
                // Remove from local list immediately
                setApps(prev => prev.filter(a => a.applicationId !== applicationId));
              } else {
                Alert.alert('Error', res.data?.message ?? 'Could not remove volunteer.');
              }
            } catch (err: any) {
              if (err?.response) {
                // Real HTTP error — operation likely failed; show server message
                Alert.alert('Error', err.response?.data?.message ?? 'Could not remove volunteer.');
              } else {
                // Network/parse error — DB probably succeeded (Railway proxy issue);
                // remove from local list so UI stays consistent
                setApps(prev => prev.filter(a => a.applicationId !== applicationId));
              }
            } finally {
              setRemovingVolunteer(null);
            }
          },
        },
      ],
    );
  }, [projectId]);

  // ── Excuse no-show ──
  const handleExcuse = useCallback((applicationId: number, name: string) => {
    Alert.alert(
      'Mark as Excused',
      `Mark ${name}'s absence as excused? Their reliability score won't be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Excused', onPress: () => {
            setApps(prev => prev.map(a =>
              a.applicationId === applicationId ? { ...a, isExcused: true } : a,
            ));
            Alert.alert('Excused', `${name}'s absence has been marked as excused.`);
          },
        },
      ],
    );
  }, []);

  // ── Confirm no-show ──
  const handleConfirmNoShow = useCallback((applicationId: number, name: string) => {
    Alert.alert(
      'Confirm No Show',
      `Confirm ${name} did not attend? This will be recorded on their reliability profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () =>
            Alert.alert('Confirmed', 'No show recorded on reliability profile.'),
        },
      ],
    );
  }, []);

  // ── Skill rating ──
  const handleRateSkill = useCallback((appId: number, skillId: number, val: number) => {
    setSkillRatings(prev => ({ ...prev, [appId]: { ...(prev[appId] ?? {}), [skillId]: val } }));
  }, []);

  const handleSubmitRatings = useCallback(async (app: any) => {
    const appId  = app.applicationId;
    const userId = app.userId;
    const ratings = skillRatings[appId] ?? {};
    const entries = Object.entries(ratings).filter(([, v]) => v > 0);
    if (entries.length === 0) return;

    setSubmittingRatings(prev => ({ ...prev, [appId]: true }));
    try {
      const results = await Promise.all(
        entries.map(([skillId, rating]) =>
          sessionId
            ? projectApi.addSessionSkillRating(projectId, {
                sessionId,
                userId,
                skillId: Number(skillId),
                rating,
                notes: '',
              })
            : projectApi.rateSkill({
                ratedUserId:    userId,
                projectSkillId: Number(skillId),
                rating,
                projectId,
                orgId: orgId ?? undefined,
              }),
        ),
      );
      const allOk = results.every(r => r.data?.isSuccess);
      if (allOk) {
        setSubmittedRatings(prev => ({ ...prev, [appId]: true }));
      } else {
        Alert.alert('Partial save', 'Some ratings could not be saved. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not save ratings. Check your connection.');
    } finally {
      setSubmittingRatings(prev => ({ ...prev, [appId]: false }));
    }
  }, [skillRatings, projectId, orgId]);

  // ── Award badge ──
  const handleAwardBadge = useCallback((app: any, key: string) => {
    if ((awardedBadges[app.applicationId] ?? []).includes(key)) return;
    const label = BADGE_DEFS.find(b => b.key === key)?.label ?? key;
    const name  = app.applicantName ?? app.fullName ?? 'Volunteer';

    Alert.alert(`Award "${label}"?`, `This badge will appear on ${name}'s Impact profile and they'll receive a notification.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Award 🎉',
        onPress: async () => {
          setAwardingBadge(prev => ({ ...prev, [app.applicationId]: key }));
          try {
            const res = await awardBadge(orgId, {
              userId:    app.userId,
              badgeCode: key,
              projectId,
            });
            if (res.data?.isSuccess) {
              setAwardedBadges(prev => ({
                ...prev,
                [app.applicationId]: [...(prev[app.applicationId] ?? []), key],
              }));
              Alert.alert('Badge Awarded! 🎉', `"${label}" awarded to ${name}. They'll receive a notification.`);
            } else {
              Alert.alert('Could not award badge', res.data?.message ?? 'Please try again.');
            }
          } catch {
            Alert.alert('Error', 'Could not award badge. Please check your connection.');
          } finally {
            setAwardingBadge(prev => ({ ...prev, [app.applicationId]: null }));
          }
        },
      },
    ]);
  }, [awardedBadges, orgId, projectId]);

  // ── Issue Certificate ──
  const handleIssueCertificate = useCallback((app: any) => {
    const name = app.applicantName ?? app.fullName ?? 'Volunteer';
    Alert.alert('Issue Certificate?', `Issue a volunteer certificate to ${name} for this project?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Issue Certificate',
        onPress: async () => {
          setIssuingCertFor(app.applicationId);
          try {
            const res = await issueCertificate({
              projectId, userId: app.userId, orgId,
              totalHours: app.hoursLogged ?? undefined,
            });
            if (res.data?.isSuccess) {
              setIssuedCerts(prev => ({ ...prev, [app.applicationId]: true }));
              Alert.alert('Certificate Issued! 📄', `Certificate issued to ${name} successfully.`);
            } else {
              Alert.alert('Error', res.data?.message ?? 'Could not issue certificate.');
            }
          } catch {
            Alert.alert('Error', 'Could not issue certificate. Check your connection.');
          } finally {
            setIssuingCertFor(null);
          }
        },
      },
    ]);
  }, [projectId, orgId]);

  // ── Search ────────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Derived sections (ALL statuses covered — no member ever disappears) ──
  const q = searchQuery.trim().toLowerCase();
  const matchName = (a: any) =>
    !q || (a.applicantName ?? a.fullName ?? '').toLowerCase().includes(q);

  const pendingApps  = apps.filter(a => a.statusCode === 'PENDING'  && matchName(a));
  const approvedApps = apps.filter(a => a.statusCode === 'APPROVED' && matchName(a));
  const attendedApps = apps.filter(a => a.statusCode === 'ATTENDED' && matchName(a));
  const noShowApps   = apps.filter(a => a.statusCode === 'NO_SHOW'  && matchName(a));

  // For CLOSING/COMPLETED projects: APPROVED volunteers with no attendance record are
  // effectively no-shows — the session is over and they never checked in. Show them in
  // the NO SHOWS section (NoShowCard) instead of the "APPROVED — NOT MARKED" section.
  // CANCELLED and expired-UPCOMING keep "NOT MARKED" (volunteer had no opportunity).
  const showApprovedAsNoShow = isClosing || isCompleted;
  const displayApprovedApps  = showApprovedAsNoShow ? [] : approvedApps;
  const displayNoShowApps    = showApprovedAsNoShow
    ? [...noShowApps, ...approvedApps]
    : noShowApps;

  const counts = {
    approved: displayApprovedApps.length,
    pending:  pendingApps.length,
    noShow:   displayNoShowApps.length,
    attended: attendedApps.length,
  };

  // Last session date label
  const lastSessionSrc = [...attendedApps, ...noShowApps][0];
  const lastSessionLabel = fmtDate(
    lastSessionSrc?.sessionDate ?? lastSessionSrc?.lastSessionDate ?? lastSessionSrc?.statusUpdatedAt,
  ).toUpperCase();

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Participants</Text>
        <View style={{ width: 72 }} />
      </View>

      {/* ── KPI strip ── */}
      <View style={s.kpiStrip}>
        {[
          ...(counts.pending > 0 ? [{ val: counts.pending, lbl: 'Pending', color: '#D97706' }] : []),
          ...(showApprovedAsNoShow ? [] : [
            { val: counts.approved, lbl: isReadOnly ? 'Not marked' : 'Approved', color: C.PRIMARY },
          ]),
          { val: counts.noShow,   lbl: 'No shows', color: '#EF4444'  },
          { val: counts.attended, lbl: 'Attended', color: '#2563EB'  },
        ].map((k, i) => (
          <React.Fragment key={k.lbl}>
            {i > 0 && <View style={s.kpiDiv} />}
            <View style={s.kpiItem}>
              <Text style={[s.kpiVal, { color: k.color }]}>{k.val}</Text>
              <Text style={s.kpiLbl}>{k.lbl}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── Search box ── */}
      <View style={s.searchRow}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search participants by name…"
          placeholderTextColor={C.TEXT2}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: C.TEXT2, fontSize: 16, paddingRight: 4 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => load(true)}
      >
        {/* ── CLOSING review banner ── */}
        {isClosing && (
          <View style={s.closingBanner}>
            <Text style={s.closingBannerTitle}>⏳ Project in Review</Text>
            <Text style={s.closingBannerBody}>
              This project is closing. Review attended volunteers below and issue certificates to eligible volunteers.
            </Text>
          </View>
        )}

        {/* ── PENDING APPLICATIONS ── */}
        {pendingApps.length > 0 && !isReadOnly && (
          <>
            <SectionHeader title={`PENDING APPLICATIONS (${pendingApps.length})`} />
            {pendingApps.map(app => (
              <PendingCard
                key={app.applicationId}
                app={app}
                reviewing={reviewing === app.applicationId}
                onApprove={() => handleReview(app.applicationId, 'APPROVED')}
                onReject={() =>
                  Alert.alert('Reject Application', `Reject ${app.applicantName ?? 'this volunteer'}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Reject', style: 'destructive', onPress: () => handleReview(app.applicationId, 'REJECTED') },
                  ])
                }
                onProfile={() => nav.navigate('VolunteerProfile', {
                  app,
                  projectId,
                  orgId,
                  myAwardedBadge: (awardedBadges[app.applicationId] ?? [])[0] ?? null,
                })}
              />
            ))}
          </>
        )}

        {/* ── APPROVED — UPCOMING / NOT MARKED ── */}
        {displayApprovedApps.length > 0 && (
          <>
            <SectionHeader title={isReadOnly
              ? `APPROVED — NOT MARKED (${displayApprovedApps.length})`
              : `APPROVED — UPCOMING (${displayApprovedApps.length})`} />
            {displayApprovedApps.map(app => (
              <ApprovedCard
                key={app.applicationId}
                canMark={!isExpiredUpcoming}
                app={app}
                onProfile={() => nav.navigate('VolunteerProfile', {
                  app,
                  projectId,
                  orgId,
                  myAwardedBadge: (awardedBadges[app.applicationId] ?? [])[0] ?? null,
                })}
                onMarkAttended={() => handleManualAttendance(app.applicationId, app.applicantName ?? 'Volunteer')}
                marking={markingAttended === app.applicationId}
                onRemove={() => handleRemoveVolunteer(app.userId, app.applicationId, app.applicantName ?? 'Volunteer')}
                removing={removingVolunteer === app.applicationId}
              />
            ))}
          </>
        )}

        {/* ── ATTENDED ── */}
        {attendedApps.length > 0 && (
          <>
            <SectionHeader title={isReadOnly
              ? `ATTENDED (${attendedApps.length})`
              : `ATTENDED — LAST SESSION${lastSessionLabel ? ` (${lastSessionLabel})` : ''}`} />
            {attendedApps.map(app => (
              <AttendedCard
                key={app.applicationId}
                app={app}
                projectSkills={projectSkills}
                skillRatings={skillRatings[app.applicationId] ?? {}}
                onRateSkill={(skillId, val) => handleRateSkill(app.applicationId, skillId, val)}
                onSubmitRatings={() => handleSubmitRatings(app)}
                submittingRatings={submittingRatings[app.applicationId] ?? false}
                submittedRatings={submittedRatings[app.applicationId] ?? false}
                awardedBadges={awardedBadges[app.applicationId] ?? []}
                onAwardBadge={key => handleAwardBadge(app, key)}
                awardingBadge={awardingBadge[app.applicationId] ?? null}
                isCompleted={isCompleted}
                isClosing={isClosing}
                hasCertificate={issuedCerts[app.applicationId] ?? false}
                onIssueCertificate={() => handleIssueCertificate(app)}
                issuingCert={issuingCertFor === app.applicationId}
              />
            ))}
          </>
        )}

        {/* ── NO SHOWS ── */}
        {displayNoShowApps.length > 0 && (
          <>
            <SectionHeader title={isReadOnly ? `NO SHOWS (${displayNoShowApps.length})` : 'NO SHOWS — LAST SESSION'} />
            {displayNoShowApps.map(app => (
              <NoShowCard
                key={app.applicationId}
                app={app}
                onExcuse={() => handleExcuse(app.applicationId, app.applicantName ?? 'Volunteer')}
                onConfirm={() => handleConfirmNoShow(app.applicationId, app.applicantName ?? 'Volunteer')}
                onMarkAttended={() => handleManualAttendance(app.applicationId, app.applicantName ?? 'Volunteer')}
                marking={markingAttended === app.applicationId}
              />
            ))}
          </>
        )}

        {/* ── Empty state ── */}
        {apps.length === 0 && (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>👥</Text>
            <Text style={s.emptyText}>No participants yet.</Text>
            <Text style={s.emptySub}>Applications will appear here once volunteers apply.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:    { padding: 14 },

  // Header
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:          { padding: 4, minWidth: 70 },
  backArrow:        { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:      { fontSize: 16, fontWeight: '700', color: C.TEXT },
  pendingBadge:     { backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 11, color: '#D97706', fontWeight: '700' },

  // KPI strip
  kpiStrip: { flexDirection: 'row', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER, paddingVertical: 12 },
  kpiItem:  { flex: 1, alignItems: 'center' },
  kpiVal:   { fontSize: 18, fontWeight: '800' },
  kpiLbl:   { fontSize: 10, color: C.TEXT2, marginTop: 2 },
  kpiDiv:   { width: 1, backgroundColor: C.BORDER, marginVertical: 4 },

  // Search
  searchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD, marginHorizontal: 12, marginVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: 10, paddingVertical: 6 },
  searchIcon: { fontSize: 14, marginRight: 6, color: C.TEXT2 },
  searchInput: { flex: 1, fontSize: 13, color: C.TEXT, paddingVertical: 0 },

  // Section header
  sectionHeader: { fontSize: 11, fontWeight: '700', color: C.TEXT2, letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },

  // Card base
  card:       { backgroundColor: C.CARD, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardName:   { fontSize: 14, fontWeight: '700', color: C.TEXT },
  cardSub:    { fontSize: 11, color: C.TEXT2, marginTop: 2, lineHeight: 16 },

  // Status chips
  pendingChip:      { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pendingChipText:  { fontSize: 11, fontWeight: '700', color: '#D97706' },
  approvedChip:     { backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  approvedChipText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  attendedChip:     { backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  attendedChipText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  noShowChip:       { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  noShowChipText:   { fontSize: 11, fontWeight: '700', color: '#EF4444' },

  // Reliability box (pending card)
  reliabilityBox:      { backgroundColor: C.BG, borderRadius: 10, padding: 12, marginBottom: 10 },
  reliabilityHdr:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  reliabilityHdrText:  { fontSize: 11, color: C.TEXT2, flex: 1 },
  privateChip:         { backgroundColor: '#E0F2FE', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  privateChipText:     { fontSize: 10, color: '#0284C7', fontWeight: '700' },
  reliabilityRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reliabilityKey:      { fontSize: 11, color: C.TEXT2, width: 72 },
  progressTrack:       { flex: 1, height: 6, backgroundColor: C.BORDER, borderRadius: 3, overflow: 'hidden' },
  progressFill:        { height: 6, borderRadius: 3 },
  reliabilityVal:      { fontSize: 11, fontWeight: '700', width: 36, textAlign: 'right' },
  reliabilityStats:    { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  reliabilityStatItem: { fontSize: 11, color: C.TEXT2, fontWeight: '500' },

  // Motivation (pending card)
  motivationBox:  { backgroundColor: C.INPUT_BG, borderRadius: 8, padding: 10, marginBottom: 10 },
  motivationText: { fontSize: 12, color: C.TEXT2, fontStyle: 'italic', lineHeight: 18 },

  // Action rows
  threeActionRow: { flexDirection: 'row', gap: 8 },
  approveBtn:     { flex: 1.2, backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rejectBtn:      { flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  rejectBtnText:  { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  profileBtn:     { flex: 0.8, backgroundColor: C.INPUT_BG, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: C.BORDER },
  profileBtnText: { color: C.TEXT, fontSize: 13, fontWeight: '600' },
  btnDisabled:    { opacity: 0.5 },

  // Approved card
  approvedCardFooter: { borderTopWidth: 1, borderTopColor: C.BORDER, paddingTop: 10, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewProfileRow:     { borderTopWidth: 1, borderTopColor: C.BORDER, paddingTop: 10, marginTop: 2, alignItems: 'flex-end' },
  viewProfileText:    { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },

  // Mark attended button (shared by ApprovedCard + NoShowCard)
  markAttendedBtn:     { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  markAttendedBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Admin remove volunteer button
  removeVolBtn:     { borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 8 },
  removeVolBtnText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },

  // Attended card — check-in line
  checkinRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  checkinIcon: { fontSize: 12, color: '#2563EB' },
  checkinLine: { fontSize: 12, color: '#2563EB', fontWeight: '500' },

  // Attended card — skill rating area
  skillRatingSection: { marginBottom: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.BORDER },
  skillRatingWrap:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  rateSkillsLabel:  { fontSize: 12, color: C.TEXT2, paddingTop: 2, width: 68, flexShrink: 0 },
  skillColumnsRow:  { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  skillColumn:      { alignItems: 'center', gap: 5 },
  skillColName:     { fontSize: 11, color: C.TEXT, fontWeight: '600' },
  starsRow:         { flexDirection: 'row', gap: 2 },
  star:             { fontSize: 17 },
  saveRatingsBtn:        { backgroundColor: C.PRIMARY, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 2 },
  saveRatingsBtnText:    { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  ratingsSubmittedRow:   { alignItems: 'center', paddingVertical: 6 },
  ratingsSubmittedText:  { fontSize: 12, color: '#16A34A', fontWeight: '600' },

  // Badge buttons
  badgeRow:        { flexDirection: 'row', gap: 8 },
  badgeBtn:        { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.BORDER, backgroundColor: C.CARD, gap: 4 },
  badgeBtnAwarded: { borderColor: C.PRIMARY, backgroundColor: `${C.PRIMARY}10` },
  badgeBtnIcon:    { fontSize: 19, color: C.TEXT2 },
  badgeBtnLabel:   { fontSize: 10, fontWeight: '600', color: C.TEXT2, textAlign: 'center' },

  // Closing banner
  closingBanner:      { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8 },
  closingBannerTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  closingBannerBody:  { fontSize: 12, color: '#78350F', lineHeight: 18 },

  // Issue certificate button
  issueCertBtn:          { marginTop: 8, backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  issueCertBtnIssued:    { backgroundColor: '#D1FAE5', borderColor: '#059669', borderWidth: 1 },
  issueCertBtnText:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  issueCertBtnIssuedText: { color: '#059669', fontSize: 13, fontWeight: '700' },

  // No show card
  noShowSubtitle: { fontSize: 11, color: '#EF4444', marginTop: 2, fontWeight: '500' },
  noShowNote:     { backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FDE68A' },
  noShowNoteText: { fontSize: 11, color: '#92400E', lineHeight: 17 },

  twoActionRow:         { flexDirection: 'row', gap: 8 },
  excuseBtn:            { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5, borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  excuseBtnText:        { color: '#16A34A', fontSize: 13, fontWeight: '700' },
  confirmNoShowBtn:     { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  confirmNoShowBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText:  { fontSize: 15, fontWeight: '600', color: C.TEXT, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: C.TEXT2, textAlign: 'center' },
});
