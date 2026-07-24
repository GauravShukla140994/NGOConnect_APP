import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fmtDate, fmtTime, fmtDateTime } from '../../utils/dateUtils';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import VideoFeedPlayer from '../../components/home/VideoFeedPlayer';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import ComposeFab from '../../components/common/ComposeFab';
import CreateFeedPostModal from '../../components/home/CreateFeedPostModal';
import FeedCommentsModal from '../../components/home/FeedCommentsModal';
import ApplyModal from '../../components/project/ApplyModal';
import { feedApi, getPersonalizedFeed, likePost, unlikePost } from '../../api/feed.api';
import { notificationApi } from '../../api/notification.api';
import { getNearbyFeed } from '../../api/project.api';
import { getMyOrgs, getMyDocuments } from '../../api/user.api';
import ProfileIncompleteSheet from '../../components/profile/ProfileIncompleteSheet';
import { haversineKm, formatDistance } from '../../utils/geo';
import { orgApi } from '../../api/org.api';
import { inviteApi, PendingInviteItem } from '../../api/invite.api';
import { storage } from '../../api/apiClient';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import type { Post, Project, Organisation } from '../../types/api.types';

const SCREEN_W = Dimensions.get('window').width;
const C = AppConfig.COLORS;

// ── Persist the selected org across sessions ──────────────────────────────────
const ACTIVE_ORG_KEY = 'home_active_org_id';

// Deterministic avatar color per org name (same palette as MyOrgsScreen)
const ORG_PALETTE = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#D97706', '#16A34A', '#7C3AED'];
function orgColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % ORG_PALETTE.length;
  return ORG_PALETTE[Math.abs(h)];
}

/* Category pill colors — matches prototype category chips */
const CAT_PILL: Record<string, { bg: string; text: string }> = {
  'Community':          { bg: '#FFF0E6', text: '#F97316' },
  'Community Service':  { bg: '#FFF0E6', text: '#F97316' },
  'Environment':        { bg: '#ECFDF5', text: '#10B981' },
  'Education':          { bg: '#F5F3FF', text: '#8B5CF6' },
  'Healthcare':         { bg: '#FFF7ED', text: '#F59E0B' },
  'Animal Welfare':     { bg: '#FEF2F2', text: '#EF4444' },
  'Sports':             { bg: '#EFF6FF', text: '#2563EB' },
};
function catColors(name?: string | null) {
  return CAT_PILL[name ?? ''] ?? { bg: '#F3F4F6', text: '#6B7280' };
}

/* Schedule icon — recurring gets arrow icon, one-time gets calendar */
function scheduleIcon(project: Project): string {
  const type = (project.scheduleType ?? '').toUpperCase();
  if (type === 'RECURRING') return '↻';
  const p = project as any;
  if (p.recurDays || p.recurStart) return '↻';
  return '📅';
}

const TYPE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  PINNED:             { label: 'PINNED',            icon: '📌', color: '#6B4EFF', bg: '#EEF0FF' },
  ANNOUNCEMENT:       { label: 'ANNOUNCEMENT',      icon: '📢', color: '#2563EB', bg: '#EFF6FF' },
  EVENT:              { label: 'EVENT',              icon: '📅', color: '#D97706', bg: '#FFF4EE' },
  VOLUNTEER_REQUIRED: { label: 'VOLUNTEER REQUIRED', icon: '🙋', color: '#7C3AED', bg: '#F5F3FF' },
  FUNDRAISING:        { label: 'FUNDRAISING',        icon: '💚', color: '#16A34A', bg: '#EDFAF3' },
  SUCCESS_STORY:      { label: 'SUCCESS STORY',      icon: '⭐', color: '#B45309', bg: '#FFF9F0' },
  ACHIEVEMENT:        { label: 'ACHIEVEMENT',        icon: '🏆', color: '#CA8A04', bg: '#FFFBEB' },
  GENERAL:            { label: 'POST',               icon: '',   color: '#6B7280', bg: '#F3F4F6' },
};

type ReportReason = { code: string; label: string; sub: string };

const REPORT_REASONS: ReportReason[] = [
  { code: 'SPAM',          label: 'Spam or misleading information', sub: 'False claims or promotional content' },
  { code: 'HATE',          label: 'Hate speech or harassment',      sub: 'Offensive or threatening content'   },
  { code: 'INAPPROPRIATE', label: 'Inappropriate content',           sub: 'Violates community guidelines'     },
  { code: 'SCAM',          label: 'Scam or fraudulent activity',    sub: ''                                   },
  { code: 'OTHER',         label: 'Other',                          sub: ''                                   },
];

/* ─── Pending Invite Banner ─────────────────────────────────────────────────── */

interface PendingInviteBannerProps {
  invite:     PendingInviteItem;
  onAccept:   () => Promise<void>;
  onDecline:  () => Promise<void>;
  onDismiss:  () => void;          // ✕ button — just hides locally for this session
  onViewOrg:  () => void;          // tap card body → open org profile
}

function PendingInviteBanner({ invite, onAccept, onDecline, onDismiss, onViewOrg }: PendingInviteBannerProps) {
  const [accepting,  setAccepting]  = React.useState(false);
  const [declining,  setDeclining]  = React.useState(false);
  const busy = accepting || declining;

  const handleAccept = async () => {
    setAccepting(true);
    await onAccept();
    setAccepting(false);
  };

  const handleDecline = async () => {
    setDeclining(true);
    await onDecline();
    setDeclining(false);
  };

  return (
    <View style={invBannerStyles.card}>
      {/* Tapping the info row opens org profile */}
      <TouchableOpacity
        style={invBannerStyles.row}
        activeOpacity={0.7}
        onPress={onViewOrg}
        disabled={busy}>
        <View style={invBannerStyles.iconWrap}>
          <Text style={invBannerStyles.icon}>✉️</Text>
        </View>
        <View style={invBannerStyles.body}>
          <Text style={invBannerStyles.title} numberOfLines={1}>
            You've been invited to join
          </Text>
          <Text style={invBannerStyles.orgName} numberOfLines={1}>
            {invite.orgName}
          </Text>
          {invite.invitedByName ? (
            <Text style={invBannerStyles.sub} numberOfLines={1}>
              From {invite.invitedByName}
              {invite.orgCity ? ` · ${invite.orgCity}` : ''}
            </Text>
          ) : null}
          <Text style={invBannerStyles.viewProfile}>View profile →</Text>
        </View>
        {/* ✕ = local dismiss only; user can still accept later via notification */}
        <TouchableOpacity onPress={onDismiss} disabled={busy} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Text style={invBannerStyles.dismiss}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
      <View style={invBannerStyles.actions}>
        <TouchableOpacity
          style={[invBannerStyles.btn, invBannerStyles.acceptBtn, busy && { opacity: 0.6 }]}
          onPress={handleAccept}
          disabled={busy}>
          <Text style={invBannerStyles.acceptText}>
            {accepting ? 'Joining…' : 'Accept'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[invBannerStyles.btn, invBannerStyles.declineBtn, busy && { opacity: 0.6 }]}
          onPress={handleDecline}
          disabled={busy}>
          <Text style={invBannerStyles.declineText}>
            {declining ? 'Declining…' : 'Decline'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const invBannerStyles = StyleSheet.create({
  card:       { marginHorizontal: 14, marginTop: 10, backgroundColor: '#EEF4FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#C7D9F7' },
  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap:   { width: 38, height: 38, borderRadius: 19, backgroundColor: '#D6E6FF', alignItems: 'center', justifyContent: 'center' },
  icon:       { fontSize: 18 },
  body:       { flex: 1 },
  title:      { fontSize: 12, color: '#5A6A85', fontWeight: '500' },
  orgName:    { fontSize: 15, fontWeight: '700', color: '#1A2340', marginTop: 1 },
  sub:        { fontSize: 12, color: '#7A8CA8', marginTop: 2 },
  viewProfile: { fontSize: 11, color: C.PRIMARY, fontWeight: '600', marginTop: 4 },
  dismiss:    { fontSize: 16, color: '#9AAFC5', lineHeight: 22 },
  actions:    { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn:         { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#C7D9F7' },
  acceptBtn:   { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  acceptText:  { fontSize: 13, fontWeight: '700', color: '#FFF' },
  declineBtn:  { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  declineText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },
});

/* ─── Opportunity Card ──────────────────────────────────────────────────────── */
function OppCard({ project, onApply }: { project: Project; onApply?: (p: Project) => void }) {
  const nav      = useNavigation<any>();
  const max      = project.maxParticipants ?? project.maxVolunteers ?? 0;
  const curr     = project.currentParticipants ?? project.approvedCount ?? 0;
  const spotsLeft = max > 0 ? max - curr : null;
  const pct       = max > 0 ? Math.min(Math.round((curr / max) * 100), 100) : 0;
  const isFull    = spotsLeft !== null && spotsLeft <= 0;
  const spotColor = isFull
    ? C.RED
    : spotsLeft !== null && spotsLeft <= 5
      ? C.ORANGE
      : C.TEAL;
  const { bg: pillBg, text: pillText } = catColors(project.categoryName);
  const sIcon = scheduleIcon(project);

  return (
    <View style={[styles.oppCard, isFull && { opacity: 0.65 }]}>
      {/* Row 1: category pill + distance */}
      <View style={styles.oppCardTopRow}>
        <View style={[styles.pill, { backgroundColor: pillBg }]}>
          <Text style={[styles.pillText, { color: pillText }]}>
            {project.categoryName ?? 'General'}
          </Text>
        </View>
        {project.distanceKm != null
          ? <Text style={styles.distText}>📍 {formatDistance(Number(project.distanceKm))}</Text>
          : null}
      </View>

      {/* Title + org */}
      <Text style={styles.oppTitle} numberOfLines={2}>
        {project.title ?? project.projectName ?? 'Volunteer Opportunity'}
      </Text>
      <Text style={styles.oppOrg} numberOfLines={1}>{project.orgName}</Text>

      {/* Icon rows */}
      <View style={styles.oppMeta}>
        {(() => {
          const p = project as any;
          const summary = project.scheduleSummary
            ?? (p.recurDays
                ? `${String(p.recurDays).split(',').map((d: string) => d.trim().slice(0, 3)).join(' & ')}${p.sessionStartTime ? ` · ${fmtTime(p.sessionStartTime)}${p.sessionEndTime ? `–${fmtTime(p.sessionEndTime)}` : ''}` : ''}`
                : p.oneTimeDate
                  ? fmtDateTime(p.oneTimeDate, p.sessionStartTime ?? null)
                  : p.recurStart
                    ? fmtDateTime(p.recurStart, p.sessionStartTime ?? null)
                    : p.flexFromDate
                      ? fmtDate(p.flexFromDate)
                      : null);
          return summary ? (
            <Text style={styles.oppMetaItem}>{sIcon} {summary}</Text>
          ) : null;
        })()}
        {max > 0 ? (
          <Text style={styles.oppMetaItem}>👥 {curr}/{max} Volunteers</Text>
        ) : null}
      </View>

      {/* Spots text */}
      {spotsLeft !== null ? (
        <Text style={[styles.spotsText, { color: spotColor }]}>
          {isFull
            ? 'Capacity Full'
            : spotsLeft <= 5
              ? `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'}!`
              : `${spotsLeft} spots left`}
        </Text>
      ) : null}

      {/* Divider + Apply button — pinned together to card bottom */}
      <View style={styles.oppCardFooter}>
        <View style={styles.oppCardDivider} />
        <Pressable
          style={({ pressed }) => [
            styles.applyBtn,
            isFull && styles.applyBtnDisabled,
            pressed && !isFull && { opacity: 0.85 },
          ]}
          disabled={isFull}
          onPress={() => onApply ? onApply(project) : nav.navigate('ProjectDetail', { projectId: project.projectId })}
          android_ripple={isFull ? undefined : { color: 'rgba(255,255,255,0.2)', borderless: false }}
          accessibilityLabel={isFull ? 'No spots available' : `Apply to ${project.title ?? 'opportunity'}`}
        >
          <Text style={isFull ? styles.applyBtnDisabledText : styles.applyBtnText}>
            {isFull ? 'No spots available' : 'Apply Now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ─── Post Card (Instagram style) ──────────────────────────────────────────── */
const PostCard = React.memo(function PostCard({
  post,
  onLike,
  onCommentPress,
  isActive,
  globalMuted,
  onToggleMute,
}: {
  post: Post;
  onLike: (id: number, liked: boolean) => void;
  onCommentPress: (post: Post) => void;
  isActive:      boolean;
  globalMuted:   boolean;
  onToggleMute:  () => void;
}) {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const meta = TYPE_META[post.postTypeLkpCode ?? 'GENERAL'] ?? TYPE_META.GENERAL;
  const [bookmarked,       setBookmarked]       = useState(!!post.isSaved);
  const [expanded,         setExpanded]         = useState(false);
  const [activeSlide,      setActiveSlide]      = useState(0);

  // ── Double-tap like animation ───────────────────────────────────────────────
  const heartOpacity  = useRef(new Animated.Value(0)).current;
  const heartScale    = useRef(new Animated.Value(0.3)).current;
  const heartY        = useRef(new Animated.Value(0)).current;
  const lastImageTap  = useRef(0);

  const triggerHeartAnim = useCallback(() => {
    heartOpacity.setValue(0);
    heartScale.setValue(0.3);
    heartY.setValue(0);
    Animated.parallel([
      Animated.timing(heartOpacity, {
        toValue: 1, duration: 150, useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 1.2, duration: 220,
        easing: Easing.out(Easing.elastic(1.5)),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(heartOpacity, { toValue: 0,   duration: 350, useNativeDriver: true }),
          Animated.timing(heartY,       { toValue: -65, duration: 350, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, [heartOpacity, heartScale, heartY]);

  const handleDoubleTap = useCallback(() => {
    triggerHeartAnim();
    if (!post.isLiked) onLike(post.postId!, false); // false = wasLiked → like it now
  }, [triggerHeartAnim, post.isLiked, post.postId, onLike]);

  // For image posts — detect double-tap timing manually
  const handleImageTap = useCallback(() => {
    const now = Date.now();
    if (now - lastImageTap.current < 300) {
      lastImageTap.current = 0;
      handleDoubleTap();
    } else {
      lastImageTap.current = now;
    }
  }, [handleDoubleTap]);
  const [isFollowingOrg,   setIsFollowingOrg]   = useState(!!post.isFollowing);
  const [followingOrgLoad, setFollowingOrgLoad] = useState(false);

  // ── Post options menu ──────────────────────────────────────────────────────
  const [showMenu,         setShowMenu]         = useState(false);
  const [showReport,       setShowReport]       = useState(false);
  const [selectedReason,   setSelectedReason]   = useState<ReportReason | null>(null);
  const [reportDetails,    setReportDetails]    = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone,       setReportDone]       = useState(false);

  const handleFollowNGO = async () => {
    setShowMenu(false);
    if (!post.orgId || followingOrgLoad) return;
    setFollowingOrgLoad(true);
    try {
      if (isFollowingOrg) {
        const res = await orgApi.unfollowOrg(post.orgId);
        if (res.data?.isSuccess) setIsFollowingOrg(false);
      } else {
        const res = await orgApi.followOrg(post.orgId);
        if (res.data?.isSuccess) setIsFollowingOrg(true);
      }
    } catch { /* silent */ }
    finally { setFollowingOrgLoad(false); }
  };

  const openReport = () => {
    setShowMenu(false);
    setSelectedReason(null);
    setReportDetails('');
    setReportDone(false);
    // Wait for menu slide-out animation before opening report modal
    setTimeout(() => setShowReport(true), 350);
  };

  const submitReport = async () => {
    if (!selectedReason) return;
    setReportSubmitting(true);
    try {
      const res = await feedApi.reportPost(post.postId!, {
        reasonCode: selectedReason.code,
        details: reportDetails.trim() || undefined,
      });
      if (res.data?.isSuccess) {
        setReportDone(true);
      } else {
        Alert.alert('Error', res.data?.message || 'Could not submit report. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const initials = (post.authorName ?? 'NA')
    .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const avatarColors = ['#6B4EFF', '#2563EB', '#16A34A', '#D97706', '#7C3AED'];
  const avatarBg = avatarColors[(post.postId ?? 0) % avatarColors.length];

  // SP returns MediaUrls + MediaTypes as GROUP_CONCAT CSV → normalize to string[]
  const rawMedia = post.mediaUrls as unknown;
  const mediaUrls: string[] = Array.isArray(rawMedia)
    ? (rawMedia as string[])
    : typeof rawMedia === 'string' && rawMedia
      ? (rawMedia as string).split(',').map((u: string) => u.trim()).filter(Boolean)
      : [];

  // Parallel array of media types ('IMAGE' | 'VIDEO') — defaults to 'IMAGE' if missing
  const rawTypes = post.mediaTypes as unknown;
  const mediaTypes: string[] = typeof rawTypes === 'string' && rawTypes
    ? rawTypes.split(',').map((t: string) => t.trim())
    : [];
  const isVideo = (i: number) => (mediaTypes[i] ?? 'IMAGE') === 'VIDEO';

  const isLongCaption = (post.content?.length ?? 0) > 150;

  return (
    <View style={styles.postCard}>

      {/* ── Author row ─────────────────────────────────────────────── */}
      <View style={styles.igAuthorRow}>
        {post.profilePhoto
          ? <Image source={{ uri: post.profilePhoto }} style={styles.igAvatar} />
          : (
            <View style={[styles.igAvatar, styles.igAvatarFallback, { backgroundColor: avatarBg }]}>
              <Text style={styles.igAvatarText}>{initials}</Text>
            </View>
          )
        }
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.igAuthorName}>{post.authorName ?? post.orgName ?? 'NGO'}</Text>
            {meta.label !== 'POST' ? (
              <View style={[styles.igTypePill, { backgroundColor: meta.bg }]}>
                <Text style={[styles.igTypePillText, { color: meta.color }]}>
                  {meta.icon}{meta.icon ? ' ' : ''}{meta.label}
                </Text>
              </View>
            ) : null}
          </View>
          {post.orgName ? (
            <Text style={styles.igAuthorSub}>{post.orgName}</Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Post options">
          <Text style={styles.igMore}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* ── Post options sheet ─────────────────────────────────────── */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.menuHandle} />
            {[
              ...(post.orgId ? [{
                icon: isFollowingOrg ? '✓' : '➕',
                label: isFollowingOrg ? 'Unfollow NGO' : 'Follow NGO',
                onPress: handleFollowNGO,
              }] : []),
              { icon: '↗️', label: 'Share',        onPress: () => setShowMenu(false) },
              { icon: '🔖', label: 'Save',         onPress: () => { setBookmarked(b => !b); setShowMenu(false); } },
            ].map(item => (
              <TouchableOpacity key={item.label} style={styles.menuRow} onPress={item.onPress}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text style={styles.menuLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.menuRow, styles.menuRowReport]} onPress={openReport}>
              <Text style={styles.menuIcon}>🚩</Text>
              <Text style={[styles.menuLabel, { color: '#DC2626' }]}>Report</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Report Post modal ──────────────────────────────────────── */}
      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <SafeAreaProvider>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.menuOverlay} onPress={() => !reportSubmitting && setShowReport(false)}>
            <Pressable style={styles.reportSheet} onPress={e => e.stopPropagation()}>
              <View style={styles.menuHandle} />

              {/* Header */}
              <View style={styles.reportHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>🚩</Text>
                  <Text style={styles.reportTitle}>Report Post</Text>
                </View>
                <TouchableOpacity onPress={() => setShowReport(false)} disabled={reportSubmitting}>
                  <Text style={styles.reportClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {reportDone ? (
                /* ── Success state ── */
                <View style={styles.reportSuccess}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
                  <Text style={styles.reportSuccessTitle}>Report Submitted</Text>
                  <Text style={styles.reportSuccessSub}>Our team will review this post and take appropriate action.</Text>
                  <TouchableOpacity style={[styles.reportSubmitBtn, { alignSelf: 'stretch' }]} onPress={() => setShowReport(false)}>
                    <Text style={styles.reportSubmitText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.reportSubtitle}>Help us understand what's wrong with this post</Text>

                  {/* Reason list */}
                  <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                    {REPORT_REASONS.map(r => (
                      <TouchableOpacity
                        key={r.code}
                        style={[styles.reportReason, selectedReason?.code === r.code && styles.reportReasonSelected]}
                        onPress={() => setSelectedReason(r)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.reportReasonText, selectedReason?.code === r.code && { color: C.PRIMARY }]}>
                            {r.label}
                          </Text>
                          {r.sub ? <Text style={styles.reportReasonSub}>{r.sub}</Text> : null}
                        </View>
                        {selectedReason?.code === r.code && (
                          <Text style={{ color: C.PRIMARY, fontSize: 16 }}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Additional details */}
                  <Text style={styles.reportDetailsLabel}>Additional details (optional)</Text>
                  <TextInput
                    style={styles.reportDetailsInput}
                    placeholder="Describe the issue in more detail…"
                    placeholderTextColor={C.TEXT3}
                    multiline
                    numberOfLines={3}
                    value={reportDetails}
                    onChangeText={setReportDetails}
                  />

                  <TouchableOpacity
                    style={[styles.reportSubmitBtn, (!selectedReason || reportSubmitting) && styles.reportSubmitBtnDisabled]}
                    onPress={submitReport}
                    disabled={!selectedReason || reportSubmitting}
                  >
                    {reportSubmitting
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={styles.reportSubmitText}>Submit Report</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
              {/* Safe-area spacer — replaces hardcoded paddingBottom: 32.
                  useSafeAreaInsets() returns 0 inside Modal on Android;
                  native SafeAreaView reads the real inset at the native layer. */}
              <SafeAreaView edges={['bottom']} style={{ minHeight: 16 }} />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
        </SafeAreaProvider>
      </Modal>

      {/* ── Media carousel ─────────────────────────────────────────── */}
      {mediaUrls.length > 0 ? (
        <View>
          {/* Single item — no scroll wrapper (avoids unnecessary scroll jank) */}
          {mediaUrls.length === 1 ? (
            isVideo(0) ? (
              <VideoFeedPlayer
                uri={mediaUrls[0]}
                isActive={isActive}
                muted={globalMuted}
                onToggleMute={onToggleMute}
                onDoubleTap={handleDoubleTap}
                width={SCREEN_W}
                height={SCREEN_W}
              />
            ) : (
              <TouchableWithoutFeedback onPress={handleImageTap}>
                <Image source={{ uri: mediaUrls[0] }} style={styles.igMedia} resizeMode="cover" />
              </TouchableWithoutFeedback>
            )
          ) : (
            /* Multi-item horizontal carousel */
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              decelerationRate="fast"
              onScroll={e => {
                const slide = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                setActiveSlide(slide);
              }}
            >
              {mediaUrls.map((url, i) =>
                isVideo(i) ? (
                  <VideoFeedPlayer
                    key={i}
                    uri={url}
                    isActive={isActive && activeSlide === i}
                    muted={globalMuted}
                    onToggleMute={onToggleMute}
                    onDoubleTap={handleDoubleTap}
                    width={SCREEN_W}
                    height={SCREEN_W}
                  />
                ) : (
                  <TouchableWithoutFeedback key={i} onPress={handleImageTap}>
                    <Image source={{ uri: url }} style={styles.igMedia} resizeMode="cover" />
                  </TouchableWithoutFeedback>
                )
              )}
            </ScrollView>
          )}

          {/* Page dots — only when more than 1 item */}
          {mediaUrls.length > 1 && (
            <View style={styles.igDots}>
              {mediaUrls.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.igDot,
                    i === activeSlide && styles.igDotActive,
                    isVideo(i) && styles.igDotVideo,
                  ]}
                />
              ))}
            </View>
          )}

          {/* ── Double-tap heart overlay ─────────────────────────────── */}
          <Animated.Text
            style={[
              styles.heartAnim,
              {
                opacity:   heartOpacity,
                transform: [
                  { scale: heartScale },
                  { translateY: heartY },
                ],
              },
            ]}
            pointerEvents="none"
          >
            ❤️
          </Animated.Text>
        </View>
      ) : null}

      {/* ── Action row ─────────────────────────────────────────────── */}
      <View style={styles.igActionRow}>
        <TouchableOpacity
          style={styles.igActionBtn}
          onPress={() => onLike(post.postId, !!post.isLiked)}
          accessibilityLabel="Like post"
        >
          <Text style={[styles.igActionIcon, post.isLiked && styles.igActionIconLiked]}>
            {post.isLiked ? '❤️' : '🤍'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.igActionBtn}
          onPress={() => onCommentPress(post)}
          accessibilityLabel="Comment"
        >
          <Text style={styles.igActionIcon}>💬</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.igActionBtn, { marginLeft: 'auto' }]}
          onPress={() => setBookmarked(b => !b)}
          accessibilityLabel="Bookmark post"
        >
          <Text style={[styles.igActionIcon, bookmarked && { color: C.PRIMARY }]}>
            {bookmarked ? '🔖' : '🏷️'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Likes count ────────────────────────────────────────────── */}
      {(post.likeCount ?? 0) > 0 ? (
        <Text style={styles.igLikesCount}>
          {post.likeCount.toLocaleString('en-IN')} {post.likeCount === 1 ? 'like' : 'likes'}
        </Text>
      ) : null}

      {/* ── Caption ────────────────────────────────────────────────── */}
      <View style={styles.igCaption}>
        {post.title ? <Text style={styles.igPostTitle}>{post.title}</Text> : null}
        <Text
          style={styles.igCaptionText}
          numberOfLines={expanded ? undefined : 3}
        >
          <Text style={styles.igCaptionAuthor}>{post.authorName ?? 'NGO'}{' '}</Text>
          {post.content}
        </Text>
        {isLongCaption && !expanded ? (
          <TouchableOpacity onPress={() => setExpanded(true)}>
            <Text style={styles.igMoreLink}>...more</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Campaign / Fundraise box ────────────────────────────────── */}
      {post.campaignGoal ? (
        <View style={styles.igFundraiseBox}>
          <View style={styles.fundraiseRow}>
            <Text style={styles.fundraiseAmount}>
              ₹{(post.campaignRaised ?? 0).toLocaleString('en-IN')}
            </Text>
            <Text style={styles.fundraiseMeta}>
              of ₹{post.campaignGoal.toLocaleString('en-IN')} goal
            </Text>
          </View>
          <View style={styles.capBarOuter}>
            <View style={[styles.capBarFill, {
              width: `${Math.min(Math.round(((post.campaignRaised ?? 0) / post.campaignGoal) * 100), 100)}%` as any,
              backgroundColor: C.TEAL,
            }]} />
          </View>
          <Pressable
            style={[styles.applyBtn, { backgroundColor: C.TEAL, marginTop: 10 }]}
            onPress={() => nav.navigate('Donate', { orgId: post.orgId })}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            accessibilityLabel="Donate now"
          >
            <Text style={styles.applyBtnText}>Donate Now 💚</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── View comments link ─────────────────────────────────────── */}
      {(post.commentCount ?? 0) > 0 ? (
        <TouchableOpacity
          style={styles.igViewComments}
          onPress={() => onCommentPress(post)}
          accessibilityLabel={`View all ${post.commentCount} comments`}
        >
          <Text style={styles.igViewCommentsText}>
            View all {post.commentCount} comment{post.commentCount !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Timestamp ──────────────────────────────────────────────── */}
      {post.timeAgo ? (
        <Text style={styles.igTimestamp}>{post.timeAgo}</Text>
      ) : null}
    </View>
  );
});  // React.memo

/* ─── Main Screen ───────────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const nav         = useNavigation<any>();
  const insets      = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { setActiveOrg, activeOrg: storeActiveOrg } = useAdminStore();

  // ── Video auto-play state ────────────────────────────────────────────────
  // activePostId: postId (as string) of the post currently in viewport
  // globalMuted:  single mute state shared by all videos (Instagram behaviour)
  const [activePostId,   setActivePostId]   = useState<string | null>(null);
  const [globalMuted,    setGlobalMuted]    = useState(true);

  // Viewability handler MUST be a stable ref — FlatList freezes it on mount.
  // Never pass an inline arrow function here or video auto-play breaks on scroll.
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const first = viewableItems.find((v: any) => v.isViewable);
    setActivePostId(first?.item?.postId != null ? String(first.item.postId) : null);
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,   // 55 % of post visible → auto-play
  }).current;

  const toggleMute = useCallback(() => setGlobalMuted(m => !m), []);

  const [feed,           setFeed]           = useState<Post[]>([]);
  const [projects,       setProjects]       = useState<Project[]>([]);
  const [userOrgs,       setUserOrgs]       = useState<Organisation[]>([]);
  // Cursor-based pagination — replaces page number for personalised feed
  const [cursorPostId,   setCursorPostId]   = useState<number | null>(null);
  const [cursorScore,    setCursorScore]    = useState<number | null>(null);
  const [hasMore,        setHasMore]        = useState(true);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  // ── Pending invite banners ────────────────────────────────────────────────
  const [pendingInvites,    setPendingInvites]    = useState<PendingInviteItem[]>([]);
  const [dismissedInviteIds, setDismissedInviteIds] = useState<Set<number>>(new Set());
  const [showCreatePost,   setShowCreatePost]   = useState(false);
  const [permChecking,     setPermChecking]     = useState(false);
  const [commentPost,      setCommentPost]      = useState<Post | null>(null);
  // Cache fetched permissions per org so comment gate doesn't need a separate API call
  const postPermsCache = useRef<{ [orgId: number]: import('../../types/api.types').PostPermissions }>({});
  const [applyProject,     setApplyProject]     = useState<Project | null>(null);
  const [gateVisible,      setGateVisible]      = useState(false);
  const [gateMissing,      setGateMissing]      = useState<string[]>([]);
  const [gateTargetStep,   setGateTargetStep]   = useState(0);
  const [showOrgSwitcher,  setShowOrgSwitcher]  = useState(false);
  // Initialise from MMKV so the last-selected org is remembered across sessions
  const [activeOrgId, setActiveOrgId] = useState<number | null>(() => {
    const saved = storage.getNumber(ACTIVE_ORG_KEY);
    return saved ?? null;
  });
  const [locationLabel,    setLocationLabel]    = useState<string>(user?.city ?? '');
  const [locationLoading,  setLocationLoading]  = useState(false);
  const [userCoords,       setUserCoords]       = useState<{ lat: number; lon: number } | null>(null);
  const userCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
  const [unreadCount,      setUnreadCount]      = useState(0);

  // ── Unread notification count — refresh on every focus ───────────────────────
  useFocusEffect(useCallback(() => {
    let cancelled = false;

    // Refresh unread count every time screen gains focus
    notificationApi.getUnreadCount()
      .then(res => {
        if (!cancelled && res.data?.isSuccess) {
          setUnreadCount(res.data.data?.unreadCount ?? 0);
        }
      })
      .catch(() => {});

    // Re-fetch pending invites on every focus so a re-invite after a decline
    // shows the banner without requiring a full pull-to-refresh
    inviteApi.getPending()
      .then(r => {
        if (!cancelled && r.data?.isSuccess) {
          setPendingInvites(r.data.data ?? []);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []));

  // ── Profile gate ────────────────────────────────────────────────────────────
  const checkProfileComplete = useCallback(async () => {
    const u = useAuthStore.getState().user as any;
    const missing: string[] = [];
    if (!u?.firstName || !u?.lastName) missing.push('Full name');
    if (!u?.city)                       missing.push('City');
    if (!u?.mobile)                     missing.push('Mobile number');
    // Default: assume docs are OK — only block if we can confirm they're absent.
    // If the API call fails (network/timeout), don't block the user falsely.
    let hasGovtId = true, hasAddrProof = true;
    try {
      const docRes = await getMyDocuments();
      if (docRes.data?.isSuccess && Array.isArray(docRes.data.data)) {
        const docs = docRes.data.data as Array<{ docTypeCode: string }>;
        const GOVT_ID_CODES = ['PHOTO_ID', 'AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LIC'];
        hasGovtId    = docs.some(d => GOVT_ID_CODES.includes(d.docTypeCode));
        hasAddrProof = docs.some(d => d.docTypeCode === 'ADDR_PROOF');
      }
      // If isSuccess=0 or data is not an array, keep defaults (true) — API issue, not missing docs
    } catch { /* API unreachable — skip doc check, don't block user */ }
    if (!hasGovtId)    missing.push('Government Photo ID');
    if (!hasAddrProof) missing.push('Address Proof');
    if (missing.length === 0) return { passed: true, missing: [], targetStep: 0 };
    const onlyDocsMissing = missing.every(m => m === 'Government Photo ID' || m === 'Address Proof');
    return { passed: false, missing, targetStep: onlyDocsMissing ? 4 : 0 };
  }, []);

  const handleApplyProject = useCallback(async (project: Project) => {
    const result = await checkProfileComplete();
    if (result.passed) {
      setApplyProject(project);
    } else {
      setGateMissing(result.missing);
      setGateTargetStep(result.targetStep);
      setGateVisible(true);
    }
  }, [checkProfileComplete]);

  // Fetch GPS location → reverse-geocode to city via OpenStreetMap Nominatim (free, no key)
  const refreshLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      // @react-native-community/geolocation — install with:
      //   npm install @react-native-community/geolocation
      // + add permissions (see comment below)
      const Geolocation = require('@react-native-community/geolocation').default;
      await new Promise<void>((resolve) => {
        Geolocation.getCurrentPosition(
          async (pos: { coords: { latitude: number; longitude: number } }) => {
            try {
              const { latitude, longitude } = pos.coords;
              userCoordsRef.current = { lat: latitude, lon: longitude };
              setUserCoords({ lat: latitude, lon: longitude });
              const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
                { headers: { 'Accept-Language': 'en', 'User-Agent': 'RippleHub/1.0' } },
              );
              const json = await resp.json();
              const addr = json?.address ?? {};
              const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
              const state = addr.state ?? '';
              setLocationLabel(city ? (state ? `${city}, ${state}` : city) : (user?.city ?? 'Your location'));
            } catch {
              if (user?.city) { setLocationLabel(user.city); }
            }
            resolve();
          },
          () => {
            // Permission denied or GPS unavailable — fall back to profile city
            if (user?.city) { setLocationLabel(user.city); }
            resolve();
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        );
      });
    } catch {
      // Package not installed — show profile city
      if (user?.city) { setLocationLabel(user.city); }
    } finally {
      setLocationLoading(false);
    }
  }, [user]);

  // When GPS coords arrive: immediately stamp distanceKm on existing cards (no flicker),
  // then refetch so server can re-order by distance+relevance.
  useEffect(() => {
    if (!userCoords) return;
    // Step 1 — instant client-side distance (badge appears right away)
    setProjects(prev => prev.map(p => {
      const lat = (p as any).latitude ?? p.latitude;
      const lon = (p as any).longitude ?? p.longitude;
      if (lat != null && lon != null) {
        return { ...p, distanceKm: Math.round(haversineKm(userCoords.lat, userCoords.lon, Number(lat), Number(lon)) * 10) / 10 };
      }
      return p;
    }));
    // Step 2 — refetch with GPS for correct relevance-ordered list from server
    getNearbyFeed({ pageNumber: 1, pageSize: 5, userLat: userCoords.lat, userLon: userCoords.lon })
      .then(r => { if (r.data?.isSuccess) setProjects(r.data.data?.items ?? []); })
      .catch(() => {});
  }, [userCoords]);

  // Load location on mount
  useEffect(() => {
    if (user?.city) {
      setLocationLabel(user.city);   // show profile city instantly
    }
    refreshLocation();               // then try GPS for real-time update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFeed = useCallback(async (
    nextCursorPostId: number | null,
    nextCursorScore:  number | null,
    reset = false,
  ) => {
    try {
      const res = await getPersonalizedFeed({
        cursorPostId: nextCursorPostId,
        cursorScore:  nextCursorScore,
        pageSize:     AppConfig.DEFAULT_PAGE_SIZE,
      });
      if (res.data?.isSuccess) {
        const data  = res.data.data;
        const items = data?.items ?? [];
        setFeed(prev => {
          const next = reset ? items : [...prev, ...items];
          // Auto-activate first post so video plays immediately on load
          if (reset && next.length > 0) {
            setActivePostId(String(next[0].postId));
          }
          return next;
        });
        setHasMore(data?.hasMore ?? false);
        setCursorPostId(data?.nextCursorPostId ?? null);
        setCursorScore(data?.nextCursorScore ?? null);
      }
    } catch {
      setError('Could not load feed. Pull to refresh.');
    }
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Reset cursor state so first page loads fresh
    setCursorPostId(null);
    setCursorScore(null);
    // Fetch pending invites here so pull-to-refresh also refreshes the banner
    inviteApi.getPending().then(r => {
      if (r.data?.isSuccess) setPendingInvites(r.data.data ?? []);
    }).catch(() => {});

    await Promise.all([
      loadFeed(null, null, true),
      getNearbyFeed({
        pageNumber: 1, pageSize: 5,
        ...(userCoordsRef.current
          ? { userLat: userCoordsRef.current.lat, userLon: userCoordsRef.current.lon }
          : {}),
      }).then(r => {
        if (r.data?.isSuccess) setProjects(r.data.data?.items ?? []);
      }).catch(() => {}),
      getMyOrgs().then(r => {
        if (r.data?.isSuccess) {
          const orgs = r.data.data ?? [];
          setUserOrgs(orgs);
          // Only show orgs where BOTH the user's membership AND the org itself are approved
          const approvedOrgs = orgs.filter((o: Organisation) =>
            o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'APPROVED'
          );
          // Try to restore the previously selected org (validate it's still approved)
          const savedId  = storage.getNumber(ACTIVE_ORG_KEY);
          const restored = savedId ? approvedOrgs.find((o: Organisation) => o.orgId === savedId) : null;
          const chosen   = restored ?? approvedOrgs[0] ?? orgs[0];
          if (chosen) {
            setActiveOrgId(chosen.orgId);
            // Always write back so the key stays fresh
            storage.set(ACTIVE_ORG_KEY, chosen.orgId);
          }
        }
      }).catch(() => {}),
    ]);
    setLoading(false);
  }, [loadFeed]);

  useEffect(() => { init(); }, [init]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await init();
    setRefreshing(false);
  }, [init]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loading) return;
    await loadFeed(cursorPostId, cursorScore);
  }, [hasMore, loading, cursorPostId, cursorScore, loadFeed]);

  const handleCommentAdded = useCallback((postId: number) => {
    setFeed(prev =>
      prev.map(p =>
        p.postId === postId
          ? { ...p, commentCount: (p.commentCount ?? 0) + 1 }
          : p
      )
    );
  }, []);

  const handleLike = useCallback(async (postId: number, wasLiked: boolean) => {
    // Optimistic update
    setFeed(prev =>
      prev.map(p =>
        p.postId === postId
          ? { ...p, likeCount: (p.likeCount ?? 0) + (wasLiked ? -1 : 1), isLiked: !wasLiked }
          : p
      )
    );
    try {
      if (wasLiked) {
        await unlikePost(postId);
      } else {
        await likePost(postId);
      }
    } catch {
      // Revert on failure
      setFeed(prev =>
        prev.map(p =>
          p.postId === postId
            ? { ...p, likeCount: (p.likeCount ?? 0) + (wasLiked ? 1 : -1), isLiked: wasLiked }
            : p
        )
      );
    }
  }, []);

  // Derive active-org values BEFORE the FAB callback — required so activeOrg
  // is in scope when useCallback evaluates its dependency array.
  // An org is active-eligible only when BOTH the user's membership AND the org itself are approved
  const isFullyApproved = (o: Organisation) =>
    o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'APPROVED';
  const activeOrg    = userOrgs.find(o => o.orgId === activeOrgId && isFullyApproved(o))
                    ?? userOrgs.find(isFullyApproved);
  const orgName      = activeOrg?.orgName ?? activeOrg?.name ?? 'RippleHub';
  const orgInitials  = orgName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const approvedOrgs = userOrgs
    .filter(isFullyApproved)
    .sort((a, b) => {
      if (a.orgId === activeOrgId) return -1;
      if (b.orgId === activeOrgId) return  1;
      return (a.orgName ?? '').localeCompare(b.orgName ?? '');
    });

  // ── Create Post: permission gate ──────────────────────────────────────────
  // Called when FAB is tapped. Checks org-level posting rules before opening modal.
  const handleComposeFabPress = useCallback(async () => {
    if (!activeOrg) {
      Alert.alert('No Organisation', 'Please select an organisation from the header first.');
      return;
    }
    if (permChecking) return;
    setPermChecking(true);
    try {
      const res = await feedApi.getPostPermissions(activeOrg.orgId);
      const p   = res.data?.data;

      if (!res.data?.isSuccess || !p) {
        Alert.alert('Error', 'Could not verify posting permissions. Please try again.');
        return;
      }
      if (!p.isMember) {
        Alert.alert('Not a Member', `You are not an approved member of ${activeOrg.orgName}. Join the organisation first.`);
        return;
      }
      if (!p.canPost) {
        Alert.alert('Posting Disabled', `${activeOrg.orgName} has disabled posting for members. Contact your organisation admin.`);
        return;
      }
      if (p.maxPostsPerDay > 0 && p.todayPostCount >= p.maxPostsPerDay) {
        Alert.alert(
          'Daily Limit Reached',
          `You have reached your daily posting limit for ${activeOrg.orgName} (${p.todayPostCount}/${p.maxPostsPerDay} posts today).`
        );
        return;
      }
      // Cache for comment gate reuse
      postPermsCache.current[activeOrg.orgId] = p;
      // All checks passed — open the modal
      setShowCreatePost(true);
    } catch {
      Alert.alert('Error', 'Could not verify posting permissions. Please try again.');
    } finally {
      setPermChecking(false);
    }
  }, [activeOrg, permChecking]);

  // ── Comment gate ─────────────────────────────────────────────────────────────
  // Uses cached permissions if available (populated by FAB press).
  // Server enforces CanComment too, so this is a UX-only fast path.
  const handleCommentPress = useCallback(async (post: Post) => {
    const orgId = (post as any).orgId as number | undefined;
    if (!orgId) { setCommentPost(post); return; }  // non-org post — allow freely

    const cached = postPermsCache.current[orgId];
    if (cached !== undefined) {
      // We have a cached result — use it immediately
      if (!cached.canComment) {
        Alert.alert('Comments Disabled', 'The admin of this organisation has disabled commenting for members.');
        return;
      }
      setCommentPost(post);
      return;
    }

    // No cache — fetch permissions (first comment tap for this org today)
    try {
      const res = await feedApi.getPostPermissions(orgId);
      const p   = res.data?.data;
      if (p) postPermsCache.current[orgId] = p;
      if (p && !p.canComment) {
        Alert.alert('Comments Disabled', 'The admin of this organisation has disabled commenting for members.');
        return;
      }
    } catch { /* server will enforce anyway */ }
    setCommentPost(post);
  }, []);

  const userInitials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || 'ME';

  // Push local active org into the shared store whenever it changes
  useEffect(() => { setActiveOrg(activeOrg ?? null); }, [activeOrg, setActiveOrg]);

  // Sync FROM store when Community/Explore switches the active org
  useEffect(() => {
    if (storeActiveOrg?.orgId && storeActiveOrg.orgId !== activeOrgId) {
      setActiveOrgId(storeActiveOrg.orgId);
      storage.set(ACTIVE_ORG_KEY, storeActiveOrg.orgId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeActiveOrg?.orgId]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Row 1: org selector + bell + user avatar */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.orgSelector}
            onPress={() => setShowOrgSwitcher(true)}
            accessibilityLabel="Switch organization"
          >
            {activeOrg?.logoUrl || activeOrg?.orgLogoUrl ? (
              <Image
                source={{ uri: (activeOrg.logoUrl ?? activeOrg.orgLogoUrl)! }}
                style={styles.orgAvatarImg}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.orgAvatar, { backgroundColor: orgColor(orgName) }]}>
                <Text style={styles.orgAvatarText}>{orgInitials}</Text>
              </View>
            )}
            <Text style={styles.orgName} numberOfLines={1}>{orgName}</Text>
            <Text style={styles.orgChevron}>▾</Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => {
                setUnreadCount(0);   // optimistic clear so badge disappears instantly
                nav.navigate('Notifications');
              }}
              style={styles.headerIconBtn}
              accessibilityLabel="Notifications"
            >
              <Text style={styles.headerIcon}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => nav.navigate('Profile')}
              accessibilityLabel="My profile"
            >
              {user?.profilePhoto
                ? <Image source={{ uri: user.profilePhoto }} style={styles.userAvatarImg} />
                : (
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{userInitials}</Text>
                  </View>
                )
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: location + update */}
        <View style={styles.locationRow}>
          <Text style={styles.locationText} numberOfLines={1}>
            📍 {locationLabel || 'Detecting location…'}
          </Text>
          <TouchableOpacity
            onPress={refreshLocation}
            disabled={locationLoading}
            accessibilityLabel="Refresh location"
          >
            <Text style={[styles.updateLink, locationLoading && { opacity: 0.4 }]}>
              {locationLoading ? 'Locating…' : 'Update'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Feed ───────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={init}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={item => String(item.postId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          // ── Video auto-play ─────────────────────────────────────────────────
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // ── Performance ─────────────────────────────────────────────────────
          removeClippedSubviews={true}   // unmount off-screen cells (pauses videos too)
          maxToRenderPerBatch={3}        // render 3 posts per JS batch → smooth scroll
          updateCellsBatchingPeriod={50} // batch interval (ms)
          windowSize={5}                 // keep 2 posts above + 2 below in memory
          initialNumToRender={4}
          ListHeaderComponent={
            <>
              {/* ── Pending Invite Banners ──────────────────────────────────── */}
              {pendingInvites
                .filter(inv => !dismissedInviteIds.has(inv.orgInvitationId))
                .map(inv => (
                  <PendingInviteBanner
                    key={inv.orgInvitationId}
                    invite={inv}
                    onAccept={async () => {
                      try {
                        const r = await inviteApi.accept(inv.orgInvitationId);
                        if (r.data?.isSuccess) {
                          // Remove from list permanently so it never re-appears
                          setPendingInvites(prev =>
                            prev.filter(i => i.orgInvitationId !== inv.orgInvitationId)
                          );
                          Alert.alert(
                            'Welcome! 🎉',
                            r.data?.message ?? `You have joined ${inv.orgName} as a member.`,
                          );
                          // Refresh orgs list so newly joined org appears in switcher
                          getMyOrgs().then(res => {
                            if (res.data?.isSuccess) setUserOrgs(res.data.data ?? []);
                          }).catch(() => {});
                        } else {
                          Alert.alert('Error', r.data?.message ?? 'Could not accept invitation.');
                        }
                      } catch {
                        Alert.alert('Error', 'Network error. Please try again.');
                      }
                    }}
                    onDecline={async () => {
                      try {
                        const r = await inviteApi.decline(inv.orgInvitationId);
                        if (r.data?.isSuccess) {
                          // Remove from list — backend marked it CANCELLED, won't return on next fetch
                          setPendingInvites(prev =>
                            prev.filter(i => i.orgInvitationId !== inv.orgInvitationId)
                          );
                        } else {
                          Alert.alert('Error', r.data?.message ?? 'Could not decline invitation.');
                        }
                      } catch {
                        Alert.alert('Error', 'Network error. Please try again.');
                      }
                    }}
                    onDismiss={() =>
                      // ✕ = hide locally for this session only; invite stays PENDING on server
                      setDismissedInviteIds(prev => new Set(prev).add(inv.orgInvitationId))
                    }
                    onViewOrg={() => nav.navigate('NgoProfile', { orgId: inv.orgId })}
                  />
                ))
              }

              {projects.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>📍 Nearby Opportunities</Text>
                    <TouchableOpacity onPress={() => nav.navigate('AllOpportunities')}>
                      <Text style={styles.viewAll}>View All</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingRight: 16, gap: 9 }}
                  >
                    {projects.map(p => (
                      <OppCard
                        key={p.projectId}
                        project={p}
                        onApply={handleApplyProject}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={styles.feedDivider}>
                <View style={styles.feedDividerLine} />
                <Text style={styles.feedLabel}>FEED</Text>
                <View style={styles.feedDividerLine} />
              </View>
            </>
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={handleLike}
              onCommentPress={handleCommentPress}
              isActive={String(item.postId) === activePostId}
              globalMuted={globalMuted}
              onToggleMute={toggleMute}
            />
          )}
          ListFooterComponent={
            hasMore ? <ActivityIndicator style={{ margin: 20 }} color={C.PRIMARY} /> : null
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🌱</Text>
              <Text style={styles.emptyText}>
                No posts yet.{'\n'}Follow some NGOs to see their updates.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        />
      )}


      {/* ── FAB — only visible when user has at least one approved org ─── */}
      {approvedOrgs.length > 0 && (
        <ComposeFab
          onPress={handleComposeFabPress}
          accessibilityLabel={permChecking ? 'Checking permissions…' : 'Create new post'}
        />
      )}

      {/* ── Create Post Modal ───────────────────────────────────────────── */}
      <CreateFeedPostModal
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onPosted={init}
        user={user}
        activeOrg={activeOrg ?? null}
        roleLabel={activeOrg ? (activeOrg.myRole ?? (activeOrg as any).role ?? 'Member') : undefined}
      />

      {/* ── Comments Modal ──────────────────────────────────────────────── */}
      <FeedCommentsModal
        visible={commentPost !== null}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        onCommentAdded={handleCommentAdded}
      />

      {/* ── Apply Modal ─────────────────────────────────────────────────── */}
      <ApplyModal
        visible={applyProject !== null}
        project={applyProject}
        onClose={() => setApplyProject(null)}
        onProfileIncomplete={(missing, targetStep) => {
          setApplyProject(null);
          setGateMissing(missing);
          setGateTargetStep(targetStep);
          setGateVisible(true);
        }}
      />

      {/* ── Profile Incomplete Gate ──────────────────────────────────────── */}
      <ProfileIncompleteSheet
        visible={gateVisible}
        onClose={() => setGateVisible(false)}
        missingItems={gateMissing}
        targetStep={gateTargetStep}
      />

         {/* ── Org Switcher Modal ──────────────────────────────────── */}
      <Modal
        visible={showOrgSwitcher}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOrgSwitcher(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowOrgSwitcher(false)}>
          <Pressable style={styles.orgSwitcherSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />

            {/* Header */}
            <View style={styles.orgSwitcherHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgSwitcherTitle}>Switch Organisation</Text>
                <Text style={styles.orgSwitcherSubtitle}>Select an organization or create a new one</Text>
              </View>
              <Pressable onPress={() => setShowOrgSwitcher(false)} hitSlop={10}>
                <Text style={styles.orgSwitcherClose}>✕</Text>
              </Pressable>
            </View>

            {/* Org rows */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
            {approvedOrgs.map((org) => {
              const oName    = org.orgName ?? (org as any).name ?? 'NGO';
              const isActive = org.orgId === activeOrgId;
              const avatarBg = orgColor(oName);
              const initials = oName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              const role     = org.myRole ?? (org as any).role ?? 'Member';
              const members  = org.memberCount ? `${org.memberCount.toLocaleString()} members` : '';
              const subtitle = [role, members].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={org.orgId}
                  style={[styles.orgSwitcherItem, isActive && styles.orgSwitcherItemActive]}
                  onPress={() => {
                    setActiveOrgId(org.orgId);
                    setActiveOrg(org);
                    storage.set(ACTIVE_ORG_KEY, org.orgId);  // ← persist across sessions
                    setShowOrgSwitcher(false);
                  }}
                  accessibilityLabel={`Switch to ${oName}`}
                >
                  {/* Logo or initials */}
                  {org.logoUrl || org.orgLogoUrl ? (
                    <Image
                      source={{ uri: (org.logoUrl ?? org.orgLogoUrl)! }}
                      style={styles.orgSwitcherAvatar}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.orgSwitcherAvatar, { backgroundColor: avatarBg }]}>
                      <Text style={styles.orgSwitcherAvatarText}>{initials}</Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orgSwitcherName, isActive && { color: C.PRIMARY }]}
                          numberOfLines={1}>
                      {oName}
                    </Text>
                    {subtitle ? <Text style={styles.orgSwitcherMeta} numberOfLines={1}>{subtitle}</Text> : null}
                  </View>

                  {/* Active checkmark */}
                  {isActive ? (
                    <View style={styles.orgSwitcherCheck}>
                      <Text style={styles.orgSwitcherCheckText}>✓</Text>
                    </View>
                  ) : (
                    <Text style={styles.orgSwitcherChevron}>›</Text>
                  )}
                </Pressable>
              );
            })}

            {/* Create New Organisation */}
            <Pressable
              style={styles.orgSwitcherItem}
              onPress={async () => {
                setShowOrgSwitcher(false);
                const result = await checkProfileComplete();
                if (result.passed) {
                  nav.navigate('CreateOrg' as never);
                } else {
                  setGateMissing(result.missing);
                  setGateTargetStep(result.targetStep);
                  setGateVisible(true);
                }
              }}
              accessibilityLabel="Create new organisation"
            >
              <View style={[styles.orgSwitcherAvatar, styles.orgSwitcherAvatarCreate]}>
                <Text style={styles.orgSwitcherCreatePlus}>+</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgSwitcherName}>Create New Organisation</Text>
                <Text style={styles.orgSwitcherMeta}>Register a new NGO</Text>
              </View>
              <Text style={styles.orgSwitcherChevron}>›</Text>
            </Pressable>
            </ScrollView>

            <View style={{ height: insets.bottom + 8 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: C.CARD,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orgSelector: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  // Header org avatar — shared shape for both Image and View variants
  orgAvatar: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  orgAvatarImg: {
    width: 36, height: 36, borderRadius: 10,
    overflow: 'hidden',
  },
  orgAvatarText:  { fontSize: 12, fontWeight: '800', color: '#fff' },
  orgName:        { fontSize: 15, fontWeight: '700', color: C.TEXT, maxWidth: 160 },
  orgChevron:     { fontSize: 12, color: C.TEXT2 },
  headerActions:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon:     { fontSize: 20 },
  notifBadge:     { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16,
                    borderRadius: 8, backgroundColor: C.RED, alignItems: 'center',
                    justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5,
                    borderColor: C.CARD },
  notifBadgeText: { fontSize: 9, color: '#FFF', fontWeight: '700', lineHeight: 12 },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarImg:  { width: 36, height: 36, borderRadius: 18 },
  userAvatarText: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },
  locationRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationText:   { fontSize: 12, color: C.TEXT2, flex: 1 },
  updateLink:     { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },

  // ── Error / Retry ────────────────────────────────────────────────────────────
  errorText: { color: C.RED, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn:  { backgroundColor: C.PRIMARY, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyText: { color: C.TEXT2, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // ── Feed / Sections ──────────────────────────────────────────────────────────
  section:         { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle:    { fontSize: 14, fontWeight: '700', color: C.TEXT },
  viewAll:         { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  feedDivider:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  feedDividerLine: { flex: 1, height: 1, backgroundColor: C.BORDER },
  feedLabel:       { fontSize: 10, fontWeight: '700', color: C.TEXT3, letterSpacing: 1.5 },

  // ── Opportunity Card ─────────────────────────────────────────────────────────
  oppCard: {
    width: Math.min(200, SCREEN_W * 0.6),
    backgroundColor: C.CARD,
    borderRadius: 14,
    padding: 13,
    flexDirection: 'column', // explicit — required for marginTop:'auto' on button
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  oppCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillText:    { fontSize: 10, fontWeight: '700' },
  distText: {
    fontSize: 10, fontWeight: '700', color: C.TEAL,
    backgroundColor: C.TEAL + '20',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  oppTitle:    { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 3, lineHeight: 19 },
  oppOrg:      { fontSize: 12, color: C.TEXT2, marginBottom: 7 },
  oppMeta:     { gap: 3, marginBottom: 7 },
  oppMetaItem: { fontSize: 11, color: C.TEXT3 },
  capBarOuter: { height: 4, backgroundColor: C.BG, borderRadius: 2, overflow: 'hidden', marginBottom: 5 },
  capBarFill:  { height: '100%' as any, borderRadius: 2 },
  spotsText:   { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  oppCardFooter: {
    marginTop: 'auto' as any, // pins divider + button together to card bottom
  },
  oppCardDivider: {
    height: 1,
    backgroundColor: C.BORDER,
    marginBottom: 10,
  },
  applyBtn: {
    backgroundColor: C.PRIMARY,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyBtnDisabled:     { backgroundColor: C.BORDER },
  applyBtnText:         { color: '#fff', fontSize: 11, fontWeight: '700' },
  applyBtnDisabledText: { color: C.TEXT3, fontSize: 11, fontWeight: '600' },

  // ── Post Card (Instagram style) ──────────────────────────────────────────────
  postCard: {
    backgroundColor: C.CARD,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  igAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  igAvatar:         { width: 38, height: 38, borderRadius: 19 },
  igAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  igAvatarText:     { fontSize: 13, fontWeight: '700', color: '#fff' },
  igAuthorName:     { fontSize: 14, fontWeight: '700', color: C.TEXT },
  igAuthorSub:      { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  igTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  igTypePillText: { fontSize: 10, fontWeight: '700' },
  igMore:         { fontSize: 17, color: C.TEXT3, letterSpacing: 1.5 },
  igMedia:        { width: SCREEN_W, height: SCREEN_W },
  heartAnim:      {
    position:  'absolute',
    alignSelf: 'center',
    top:       '35%',
    fontSize:  80,
    zIndex:    10,
  },
  igDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 5,
  },
  igDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.BORDER },
  igDotActive: { backgroundColor: C.PRIMARY, width: 8, height: 8, borderRadius: 4 },
  igDotVideo:  { backgroundColor: '#FF6B35' },  // orange tint for video carousel dots
  igActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  igActionBtn:       { paddingHorizontal: 6, paddingVertical: 6 },
  igActionIcon:      { fontSize: 22 },
  igActionIconLiked: { color: C.RED },
  igLikesCount: {
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: '700',
    color: C.TEXT,
    marginBottom: 4,
  },
  igCaption:       { paddingHorizontal: 14, paddingBottom: 4 },
  igPostTitle:     { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  igCaptionAuthor: { fontSize: 13, fontWeight: '700', color: C.TEXT },
  igCaptionText:   { fontSize: 13, color: C.TEXT, lineHeight: 20 },
  igMoreLink:      { fontSize: 13, color: C.TEXT3, marginTop: 2 },
  igFundraiseBox: {
    marginHorizontal: 14,
    marginVertical: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
  },
  fundraiseRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
  fundraiseAmount: { fontSize: 18, fontWeight: '700', color: C.TEAL },
  fundraiseMeta:   { fontSize: 12, color: C.TEXT2 },
  igViewComments:     { paddingHorizontal: 14, paddingBottom: 4 },
  igViewCommentsText: { fontSize: 13, color: C.TEXT2 },
  igTimestamp: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    fontSize: 10,
    color: C.TEXT3,
    letterSpacing: 0.5,
  },

  // ── Modals (org switcher backdrop + handle) ──────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.BORDER,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },

  // ── Org Switcher ─────────────────────────────────────────────────────────────
  orgSwitcherSheet: {
    backgroundColor: C.CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 0,
    maxHeight: '75%',
  },
  orgSwitcherHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  orgSwitcherTitle:    { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  orgSwitcherSubtitle: { fontSize: 12, color: C.TEXT2 },
  orgSwitcherClose:    { fontSize: 18, color: C.TEXT2, paddingLeft: 12 },
  orgSwitcherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  orgSwitcherItemActive: { backgroundColor: C.PRIMARY + '08' },
  orgSwitcherAvatar: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orgSwitcherAvatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  orgSwitcherName:       { fontSize: 14, fontWeight: '600', color: C.TEXT, marginBottom: 2 },
  orgSwitcherMeta:       { fontSize: 12, color: C.TEXT2 },
  orgSwitcherCheck: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.PRIMARY,
    alignItems: 'center', justifyContent: 'center',
  },
  orgSwitcherCheckText:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  orgSwitcherChevron:    { fontSize: 18, color: C.TEXT3 },
  orgSwitcherAvatarCreate: { backgroundColor: C.PRIMARY },
  orgSwitcherCreatePlus:   { fontSize: 22, color: '#fff', fontWeight: '700', lineHeight: 28 },
  // ── Post menu (3-dot) ──────────────────────────────────────────────────
  menuOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet:      { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 0 },
  menuHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  menuRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 14, borderTopWidth: 1, borderTopColor: C.BORDER },
  menuIcon:       { fontSize: 20, width: 26, textAlign: 'center' },
  menuLabel:      { fontSize: 15, color: C.TEXT },
  menuRowReport:  { borderTopColor: '#FEE2E2' },

  // ── Report sheet ───────────────────────────────────────────────────────
  reportSheet:            { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  reportHeader:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  reportTitle:            { fontSize: 16, fontWeight: '700', color: C.TEXT },
  reportClose:            { fontSize: 18, color: C.TEXT2, padding: 4 },
  reportSubtitle:         { fontSize: 13, color: C.TEXT2, paddingHorizontal: 16, paddingVertical: 10 },
  reportReason:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.BORDER, gap: 12 },
  reportReasonSelected:   { backgroundColor: C.PRIMARY + '0D' },
  reportReasonText:       { fontSize: 14, fontWeight: '600', color: C.TEXT },
  reportReasonSub:        { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  reportDetailsLabel:     { fontSize: 12, fontWeight: '600', color: C.TEXT2, paddingHorizontal: 16, marginTop: 12, marginBottom: 6 },
  reportDetailsInput:     { marginHorizontal: 16, backgroundColor: C.BG, borderRadius: 10, padding: 12, fontSize: 13, color: C.TEXT, minHeight: 72, textAlignVertical: 'top', borderWidth: 1, borderColor: C.BORDER },
  reportSubmitBtn:        { backgroundColor: C.PRIMARY, margin: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  reportSubmitBtnDisabled:{ opacity: 0.5 },
  reportSubmitText:       { color: '#fff', fontSize: 15, fontWeight: '700' },
  reportSuccess:          { alignItems: 'center', padding: 24 },
  reportSuccessTitle:     { fontSize: 18, fontWeight: '700', color: C.TEXT, marginBottom: 6 },
  reportSuccessSub:       { fontSize: 13, color: C.TEXT2, textAlign: 'center', lineHeight: 18, marginBottom: 16 },

});