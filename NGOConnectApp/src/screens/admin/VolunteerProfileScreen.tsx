/**
 * VolunteerProfileScreen.tsx
 * Admin-only view of a volunteer's profile — opened from Participants screen.
 *
 * Prototype: s-vol-profile
 * Shows: hero card, Reliability Score (admin-only bars), Rated Skills, Award a Badge,
 *        Approve / Reject actions (only when application is PENDING).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { userApi } from '../../api/user.api';
import { projectApi } from '../../api/project.api';
import { orgApi } from '../../api/org.api';
import { UserAvatar } from '../../components/ui';
import type { OrgVolunteerProfile } from '../../types/api.types';

const C = AppConfig.COLORS;

// ─── Badge definitions ────────────────────────────────────────────────────────

const BADGE_DEFS = [
  { key: 'STAR_VOL',      icon: '☆',  label: 'Star Vol.'     },
  { key: 'TEAM_PLAYER',   icon: '♡',  label: 'Team Player'   },
  { key: 'GO_GETTER',     icon: '⚡', label: 'Go-getter'     },
  { key: 'TOP_PERFORMER', icon: '🏆', label: 'Top Performer' },
];

// ─── Star display (read-only, supports half-stars) ───────────────────────────

function StarDisplay({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const frac = rating - full;
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => {
        const isFull = i <= full;
        const isHalf = !isFull && i === full + 1 && frac >= 0.25;
        return (
          <Text
            key={i}
            style={[
              s.star,
              { color: isFull ? '#F59E0B' : isHalf ? '#FCD34D' : '#D1D5DB' },
            ]}
          >
            ★
          </Text>
        );
      })}
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={s.progressTrack}>
      <View
        style={[
          s.progressFill,
          { width: `${Math.min(Math.max(pct, 0), 100)}%` as any, backgroundColor: color },
        ]}
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function VolunteerProfileScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();

  // app: full participant record from ParticipantsScreen or member object from AdminVolunteersScreen
  const { app: routeApp = {}, projectId, orgId, userId: paramUserId } = route.params ?? {};

  const [profile,        setProfile]       = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [orgProfile,     setOrgProfile]     = useState<OrgVolunteerProfile | null>(null);

  // Pre-select Star Vol. as default (or use awarded badges from SP when available)
  const [awardedBadges, setAwardedBadges] = useState<string[]>(
    routeApp.awardedBadges ?? ['STAR_VOL'],
  );
  const [reviewing, setReviewing] = useState(false);

  const uid = routeApp.userId ?? routeApp.applicantUserId ?? routeApp.volunteerId ?? paramUserId;

  // ── Load public profile for extra enrichment ──
  useEffect(() => {
    if (!uid) return;
    setProfileLoading(true);
    userApi.getPublicProfile(uid)
      .then(res => { if (res.data?.isSuccess) setProfile(res.data.data); })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [uid]);

  // ── Load org-specific volunteer profile (reliability, role, request details) ──
  useEffect(() => {
    if (!orgId || !uid) return;
    orgApi.getVolunteerProfile(orgId, uid)
      .then(res => {
        const d = (res.data as any);
        if (d?.isSuccess && d?.data) setOrgProfile(d.data as OrgVolunteerProfile);
      })
      .catch(() => {});
  }, [orgId, uid]);

  // ── Merged display data: orgProfile > public profile > route app fallback ──
  const name       = orgProfile?.fullName   ?? profile?.fullName      ?? routeApp.applicantName ?? routeApp.fullName ?? 'Volunteer';
  const city       = orgProfile?.city       ?? profile?.city          ?? routeApp.city       ?? '';
  const state      = orgProfile?.state      ?? routeApp.state         ?? '';
  const profession = orgProfile?.occupation ?? profile?.profession    ?? routeApp.profession ?? '';
  const totalHours = orgProfile?.totalHours    ?? profile?.totalHours    ?? routeApp.totalHours  ?? 0;
  const totalProjs = orgProfile?.projectCount  ?? profile?.totalProjects ?? routeApp.totalProjects ?? 0;
  const ngosJoined = orgProfile?.orgCount      ?? profile?.ngosJoined    ?? routeApp.ngosJoined  ?? 0;

  // Bio & volunteer experience (from orgProfile / public profile)
  const bio          = orgProfile?.bio         ?? profile?.bio         ?? '';
  const volunteerExp = orgProfile?.volunteerExp ?? profile?.volunteerExp ?? '';

  // Reliability (admin-only)
  const attendancePct   = orgProfile?.reliabilityPct  ?? routeApp.attendancePct  ?? null;
  const avgRating       = orgProfile ? (orgProfile.avgRating > 0 ? orgProfile.avgRating : null) : (routeApp.avgSkillRating ?? null);
  const peerRating      = routeApp.peerRating ?? null;
  const noShowCount     = orgProfile?.noShowCount     ?? routeApp.noShowCount     ?? 0;
  const isExcused       = (orgProfile?.excusedCount ?? 0) > 0 || (routeApp.isExcused ?? false);
  const complaintsCount = orgProfile?.complaintCount  ?? routeApp.complaintsCount ?? 0;
  const hasReliability  = orgProfile != null || attendancePct != null || avgRating != null || peerRating != null;

  // Membership request details
  const whyJoin           = orgProfile?.whyJoin           ?? routeApp.whyJoin           ?? '';
  const prevNgoExperience = orgProfile?.prevNgoExperience ?? routeApp.prevNgoExperience ?? '';
  const volunteerSkills   = orgProfile?.volunteerSkills   ?? routeApp.volunteerSkills   ?? '';
  const areasOfInterest   = orgProfile?.areasOfInterest   ?? routeApp.areasOfInterest   ?? '';
  const requestedAt       = orgProfile?.requestedAt       ?? routeApp.requestedAt       ?? '';
  const hasMembershipInfo = !!(whyJoin || prevNgoExperience || volunteerSkills || areasOfInterest);

  // Role in this org
  const memberRoleName = orgProfile?.roleName ?? '';
  const memberJoinedAt = orgProfile?.joinedAt ?? routeApp.joinedAt ?? '';

  // Skill ratings — { skillName, avgRating, ratingCount }[]
  const skillRatings: { skillName: string; avgRating: number; ratingCount: number }[] =
    routeApp.skillRatings ?? profile?.skillRatings ?? [];

  const isPending    = routeApp.statusCode === 'PENDING';
  const locationLine = [city, state ? state : null, profession].filter(Boolean).join(' · ');

  const statsLine = [
    totalHours ? `${totalHours} hrs`       : null,
    totalProjs ? `${totalProjs} projects`  : null,
    ngosJoined ? `${ngosJoined} NGOs`      : null,
  ].filter(Boolean).join('   ');

  // ── Approve / Reject ──
  const handleReview = useCallback(async (statusCode: 'APPROVED' | 'REJECTED') => {
    if (!projectId || !routeApp.applicationId) return;
    setReviewing(true);
    try {
      const res = await projectApi.reviewApplication(projectId, {
        applicationId: routeApp.applicationId,
        statusCode,
      });
      if (res.data?.isSuccess) {
        Alert.alert(
          statusCode === 'APPROVED' ? 'Approved ✓' : 'Rejected',
          res.data.message ?? `Application ${statusCode.toLowerCase()}.`,
          [{ text: 'OK', onPress: () => nav.goBack() }],
        );
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not update.');
      }
    } catch {
      Alert.alert('Error', 'An error occurred.');
    } finally {
      setReviewing(false);
    }
  }, [projectId, routeApp.applicationId, nav]);

  // ── Award badge ──
  const handleAwardBadge = useCallback((key: string) => {
    if (awardedBadges.includes(key)) return;
    const label = BADGE_DEFS.find(b => b.key === key)?.label ?? key;
    Alert.alert('Award Badge', `Award "${label}" to ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Award', onPress: () => {
          setAwardedBadges(prev => [...prev, key]);
          // TODO: projectApi.awardBadge(projectId, routeApp.applicationId, { badgeKey: key })
          Alert.alert('Badge Awarded! 🎉', `"${label}" has been awarded to ${name}.`);
        },
      },
    ]);
  }, [awardedBadges, name]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => nav.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Volunteer Profile</Text>
        <View style={s.adminChip}>
          <Text style={s.adminChipText}>Admin view</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card (gradient: purple → teal) ── */}
        <View style={s.heroCard}>
          {/* Layer 1 — deep purple base */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#4C1D95' }]} />
          {/* Layer 2 — teal overlay from bottom-right */}
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: '#0D9488', opacity: 0.58, top: '32%', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
            ]}
          />
          {/* Layer 3 — dark scrim for text contrast */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.22)' }]} />

          {/* Avatar */}
          <UserAvatar
            name={name}
            photoUrl={profile?.profilePhoto ?? routeApp.profilePhoto}
            size={68}
            style={s.heroAvatar}
          />

          {/* Name */}
          <Text style={s.heroName}>{name}</Text>

          {/* Location · Profession */}
          {!!locationLine && <Text style={s.heroSub}>{locationLine}</Text>}

          {/* Stats row */}
          {!!statsLine && <Text style={s.heroStats}>{statsLine}</Text>}

          {profileLoading && (
            <ActivityIndicator
              color="rgba(255,255,255,0.7)"
              size="small"
              style={{ marginTop: 8 }}
            />
          )}
        </View>

        {/* ── About (bio + volunteer experience) ── */}
        {(bio || volunteerExp) && (
          <View style={s.card}>
            <Text style={[s.cardTitle, { marginBottom: 10 }]}>About</Text>
            {!!bio && <Text style={s.aboutText}>{bio}</Text>}
            {!!volunteerExp && (
              <>
                {!!bio && <View style={s.divider} />}
                <Text style={s.infoLabel}>Volunteer Experience</Text>
                <Text style={s.aboutText}>{volunteerExp}</Text>
              </>
            )}
          </View>
        )}

        {/* ── Membership Application ── */}
        {hasMembershipInfo && (
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <Text style={s.cardTitle}>Membership Application</Text>
              {!!requestedAt && (
                <Text style={s.adminOnlyText}>
                  {new Date(requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              )}
            </View>

            {!!whyJoin && (
              <View style={s.infoBlock}>
                <Text style={s.infoLabel}>Why do you want to join?</Text>
                <Text style={s.infoValue}>{whyJoin}</Text>
              </View>
            )}
            {!!prevNgoExperience && (
              <View style={s.infoBlock}>
                <Text style={s.infoLabel}>Previous NGO Experience</Text>
                <Text style={s.infoValue}>{prevNgoExperience}</Text>
              </View>
            )}
            {!!volunteerSkills && (
              <View style={s.infoBlock}>
                <Text style={s.infoLabel}>Skills Offered</Text>
                <View style={s.skillTagsRow}>
                  {volunteerSkills.split(',').map((sk, i) => (
                    <View key={i} style={s.skillTag}>
                      <Text style={s.skillTagText}>{sk.trim()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {!!areasOfInterest && (
              <View style={[s.infoBlock, { marginBottom: 0 }]}>
                <Text style={s.infoLabel}>Areas of Interest</Text>
                <View style={s.skillTagsRow}>
                  {areasOfInterest.split(',').map((a, i) => (
                    <View key={i} style={[s.skillTag, s.skillTagInterest]}>
                      <Text style={[s.skillTagText, { color: '#6D28D9' }]}>{a.trim()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Role chip (if already a member) */}
            {!!memberRoleName && (
              <View style={s.membershipFooter}>
                <Text style={s.membershipFooterText}>
                  Role: <Text style={{ color: C.PRIMARY, fontWeight: '700' }}>{memberRoleName}</Text>
                  {!!memberJoinedAt ? `  ·  Joined ${new Date(memberJoinedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Reliability Score (admin only) ── */}
        <View style={s.card}>
          {/* Title: "Reliability Score"  + plain amber text "Admin only · Not public" */}
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Reliability Score</Text>
            <Text style={s.adminOnlyText}>Admin only · Not public</Text>
          </View>

          {hasReliability ? (
            <>
              {attendancePct != null && (
                <View style={s.reliabilityRow}>
                  <Text style={s.reliabilityKey}>Attendance</Text>
                  <ProgressBar pct={attendancePct} color="#16A34A" />
                  <Text style={[s.reliabilityVal, { color: '#16A34A' }]}>
                    {attendancePct}%
                  </Text>
                </View>
              )}
              {avgRating != null && (
                <View style={s.reliabilityRow}>
                  <Text style={s.reliabilityKey}>Avg rating</Text>
                  <ProgressBar pct={(avgRating / 5) * 100} color={C.PRIMARY} />
                  <Text style={[s.reliabilityVal, { color: C.PRIMARY }]}>
                    {Number(avgRating).toFixed(1)}★
                  </Text>
                </View>
              )}
              {peerRating != null && (
                <View style={s.reliabilityRow}>
                  <Text style={s.reliabilityKey}>Peer rating</Text>
                  <ProgressBar pct={(peerRating / 5) * 100} color="#2563EB" />
                  <Text style={[s.reliabilityVal, { color: '#2563EB' }]}>
                    {Number(peerRating).toFixed(1)}★
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={s.reliabilityPlaceholder}>
              <Text style={s.reliabilityPlaceholderText}>
                Reliability data will appear after the volunteer's first completed session.
              </Text>
            </View>
          )}

          {/* Tags row */}
          <View style={s.tagsRow}>
            {/* No-show chip — border only, transparent background */}
            <View style={[
              s.tag,
              {
                borderColor:     noShowCount > 0 && !isExcused ? '#FCA5A5' : '#86EFAC',
                backgroundColor: 'transparent',
              },
            ]}>
              <Text style={[s.tagText, { color: noShowCount > 0 && !isExcused ? '#EF4444' : '#16A34A' }]}>
                {noShowCount} no show{noShowCount !== 1 ? 's' : ''}{isExcused ? ' (excused)' : ''}
              </Text>
            </View>

            {/* Complaints chip — solid fill */}
            <View style={[
              s.tag,
              {
                borderColor:     complaintsCount > 0 ? '#FCA5A5' : '#86EFAC',
                backgroundColor: complaintsCount > 0 ? '#FEF2F2' : '#DCFCE7',
              },
            ]}>
              <Text style={[s.tagText, { color: complaintsCount > 0 ? '#EF4444' : '#15803D' }]}>
                {complaintsCount} complaint{complaintsCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Rated Skills ── */}
        {skillRatings.length > 0 && (
          <View style={s.card}>
            <Text style={[s.cardTitle, { marginBottom: 2 }]}>Rated Skills</Text>
            {skillRatings.map((sr, i) => (
              <View
                key={i}
                style={[
                  s.skillRow,
                  i < skillRatings.length - 1 && s.skillRowBorder,
                ]}
              >
                <Text style={s.skillName}>{sr.skillName}</Text>
                <View style={s.skillRight}>
                  <StarDisplay rating={sr.avgRating} />
                  <Text style={s.skillMeta}>
                    {Number(sr.avgRating).toFixed(1)} · {sr.ratingCount} rating{sr.ratingCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Award a Badge ── */}
        <View style={s.card}>
          <Text style={[s.cardTitle, { marginBottom: 12 }]}>Award a Badge</Text>
          <View style={s.badgeGrid}>
            {BADGE_DEFS.map(b => {
              const awarded = awardedBadges.includes(b.key);
              return (
                <TouchableOpacity
                  key={b.key}
                  style={[s.badgeBtn, awarded && s.badgeBtnAwarded]}
                  onPress={() => handleAwardBadge(b.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.badgeBtnIcon, awarded && { color: C.PRIMARY }]}>
                    {b.icon}
                  </Text>
                  <Text style={[s.badgeBtnLabel, awarded && { color: C.PRIMARY }]}>
                    {b.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Approve / Reject (PENDING only) — side-by-side row ── */}
        {isPending && (
          <View style={s.actionSection}>
            <TouchableOpacity
              style={[s.approveBtn, reviewing && s.btnDisabled]}
              onPress={() =>
                Alert.alert('Approve Application', `Approve ${name} for this project?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Approve', onPress: () => handleReview('APPROVED') },
                ])
              }
              disabled={reviewing}
              activeOpacity={0.85}
            >
              {reviewing
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.approveBtnText}>✓  Approve</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.rejectBtn, reviewing && s.btnDisabled]}
              onPress={() =>
                Alert.alert('Reject Application', `Reject ${name}'s application?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reject', style: 'destructive', onPress: () => handleReview('REJECTED') },
                ])
              }
              disabled={reviewing}
              activeOpacity={0.85}
            >
              <Text style={s.rejectBtnText}>✕  Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scroll:    { padding: 14, gap: 12 },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 11,
    backgroundColor: C.CARD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  backBtn:       { minWidth: 60, justifyContent: 'center' },
  backText:      { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: C.TEXT },
  adminChip:     {
    backgroundColor: '#EDE9FE', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  adminChipText: { fontSize: 11, color: '#6D28D9', fontWeight: '700' },

  // ── Hero ──
  heroCard: {
    borderRadius: 16, overflow: 'hidden',
    alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20,
    minHeight: 190,
    backgroundColor: '#4C1D95',   // deep purple base — guarantees bg even if absolute children miss
  },
  heroAvatar: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.4)',
    zIndex: 1,
  },
  heroName:       {
    color: '#fff', fontSize: 18, fontWeight: '700',
    marginBottom: 4, zIndex: 1, textAlign: 'center',
  },
  heroSub:        {
    color: 'rgba(255,255,255,0.8)', fontSize: 13,
    marginBottom: 10, zIndex: 1, textAlign: 'center',
  },
  heroStats:      {
    color: 'rgba(255,255,255,0.92)', fontSize: 12,
    fontWeight: '600', letterSpacing: 0.5, zIndex: 1,
  },

  // ── Card ──
  card: {
    backgroundColor: C.CARD, borderRadius: 14, padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.TEXT },

  // ── "Admin only · Not public" — plain amber text, no chip ──
  adminOnlyText: { fontSize: 11, color: '#D97706', fontWeight: '600' },

  // ── Reliability bars ──
  reliabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  reliabilityKey: { fontSize: 12, color: C.TEXT2, width: 74 },
  progressTrack:  { flex: 1, height: 7, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  progressFill:   { height: 7, borderRadius: 4 },
  reliabilityVal: { fontSize: 12, fontWeight: '700', width: 42, textAlign: 'right' },
  reliabilityPlaceholder:     { paddingVertical: 10 },
  reliabilityPlaceholderText: { fontSize: 12, color: C.TEXT3, fontStyle: 'italic', textAlign: 'center' },

  // ── Tag chips ──
  tagsRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  tag:     { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: '600' },

  // ── Rated Skills ──
  skillRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  skillRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  skillName:      { flex: 1, fontSize: 13, fontWeight: '600', color: C.TEXT },
  skillRight:     { alignItems: 'flex-end', gap: 3 },
  skillMeta:      { fontSize: 11, color: C.TEXT2 },
  star:           { fontSize: 14 },

  // ── Badge grid (2×2 on narrow screen, 4-in-row on wider) ──
  badgeGrid:       { flexDirection: 'row', gap: 8 },
  badgeBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, paddingHorizontal: 2,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: C.CARD,
  },
  badgeBtnAwarded: {
    borderColor: C.PRIMARY,
    backgroundColor: `${C.PRIMARY}12`,
  },
  badgeBtnIcon:  { fontSize: 20, color: '#9CA3AF', marginBottom: 5 },
  badgeBtnLabel: { fontSize: 10, fontWeight: '600', color: '#6B7280', textAlign: 'center' },

  // ── Action buttons — side-by-side row ──
  actionSection: { flexDirection: 'row', gap: 10, marginTop: 4 },
  approveBtn: {
    flex: 1, backgroundColor: C.PRIMARY,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28, shadowRadius: 6, elevation: 4,
  },
  approveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rejectBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  rejectBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  btnDisabled:   { opacity: 0.55 },

  // ── About card ──
  aboutText: { fontSize: 13, color: C.TEXT2, lineHeight: 20 },
  divider:   { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },

  // ── Membership Application card ──
  infoBlock: { marginBottom: 14 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: C.TEXT3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  infoValue: { fontSize: 13, color: C.TEXT, lineHeight: 20 },

  skillTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  skillTag: {
    backgroundColor: `${C.PRIMARY}12`, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: `${C.PRIMARY}30`,
  },
  skillTagInterest: {
    backgroundColor: '#EDE9FE', borderColor: '#C4B5FD',
  },
  skillTagText: { fontSize: 12, fontWeight: '600', color: C.PRIMARY },

  membershipFooter: {
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  membershipFooterText: { fontSize: 12, color: C.TEXT2 },
});
