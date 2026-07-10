import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
  View,
} from 'react-native';
import VideoFeedPlayer from '../../components/home/VideoFeedPlayer';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import ComposeFab from '../../components/common/ComposeFab';
import CreateFeedPostModal from '../../components/home/CreateFeedPostModal';
import FeedCommentsModal from '../../components/home/FeedCommentsModal';
import ApplyModal from '../../components/project/ApplyModal';
import { feedApi, getFeed, likePost, unlikePost } from '../../api/feed.api';
import { list as listProjects } from '../../api/project.api';
import { getMyOrgs } from '../../api/user.api';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import type { Post, Project, Organisation } from '../../types/api.types';

const SCREEN_W = Dimensions.get('window').width;
const C = AppConfig.COLORS;

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
        {project.distanceKm != null ? (
          <Text style={styles.distText}>{Number(project.distanceKm).toFixed(1)} km</Text>
        ) : null}
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
                ? `${String(p.recurDays).split(',').map((d: string) => d.trim().slice(0, 3)).join(' & ')}${p.sessionStartTime ? ` · ${p.sessionStartTime}${p.sessionEndTime ? `–${p.sessionEndTime}` : ''}` : ''}`
                : p.oneTimeDate
                  ? p.oneTimeDate
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
              ? `${spotsLeft} spots!`
              : `${spotsLeft} spots left`}
        </Text>
      ) : null}

      {/* Progress bar */}
      {max > 0 ? (
        <View style={styles.capBarOuter}>
          <View style={[styles.capBarFill, { width: `${pct}%` as any, backgroundColor: spotColor }]} />
        </View>
      ) : null}

      {/* Apply button */}
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
  const nav  = useNavigation<any>();
  const { user } = useAuthStore();
  const meta = TYPE_META[post.postTypeLkpCode ?? 'GENERAL'] ?? TYPE_META.GENERAL;
  const [bookmarked,    setBookmarked]    = useState(false);
  const [expanded,      setExpanded]      = useState(false);
  const [activeSlide,   setActiveSlide]   = useState(0);

  // ── Post options menu ──────────────────────────────────────────────────────
  const [showMenu,         setShowMenu]         = useState(false);
  const [showReport,       setShowReport]       = useState(false);
  const [selectedReason,   setSelectedReason]   = useState<ReportReason | null>(null);
  const [reportDetails,    setReportDetails]    = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone,       setReportDone]       = useState(false);

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
      await feedApi.reportPost(post.postId!, {
        reasonCode: selectedReason.code,
        details: reportDetails.trim() || undefined,
      });
      setReportDone(true);
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
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            {[
              { icon: '➕', label: 'Follow NGO',  onPress: () => setShowMenu(false) },
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
                  <TouchableOpacity style={styles.reportSubmitBtn} onPress={() => setShowReport(false)}>
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
                      ? <ActivityIndicator color="#DC2626" />
                      : <Text style={styles.reportSubmitText}>Submit Report</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
                width={SCREEN_W}
                height={SCREEN_W}
              />
            ) : (
              <Image source={{ uri: mediaUrls[0] }} style={styles.igMedia} resizeMode="cover" />
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
                    width={SCREEN_W}
                    height={SCREEN_W}
                  />
                ) : (
                  <Image key={i} source={{ uri: url }} style={styles.igMedia} resizeMode="cover" />
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
        <TouchableOpacity style={styles.igActionBtn} accessibilityLabel="Share">
          <Text style={styles.igActionIcon}>↗</Text>
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
  const { setActiveOrg } = useAdminStore();

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
  const [page,           setPage]           = useState(1);
  const [hasMore,        setHasMore]        = useState(true);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [showCreatePost,   setShowCreatePost]   = useState(false);
  const [commentPost,      setCommentPost]      = useState<Post | null>(null);
  const [applyProject,     setApplyProject]     = useState<Project | null>(null);
  const [showOrgSwitcher,  setShowOrgSwitcher]  = useState(false);
  const [activeOrgId,      setActiveOrgId]      = useState<number | null>(null);
  const [locationLabel,    setLocationLabel]    = useState<string>(user?.city ?? '');
  const [locationLoading,  setLocationLoading]  = useState(false);
  const [userCoords,       setUserCoords]       = useState<{ lat: number; lon: number } | null>(null);

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
              setUserCoords({ lat: latitude, lon: longitude });
              const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
                { headers: { 'Accept-Language': 'en', 'User-Agent': 'NGOConnect/1.0' } },
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

  // Re-fetch nearby projects whenever GPS coords arrive/update
  useEffect(() => {
    if (!userCoords) return;
    listProjects({ pageNumber: 1, pageSize: 5, userLat: userCoords.lat, userLon: userCoords.lon })
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

  const loadFeed = useCallback(async (pageNum: number, reset = false) => {
    try {
      const res = await getFeed(pageNum, AppConfig.DEFAULT_PAGE_SIZE);
      if (res.data?.isSuccess) {
        const items = res.data.data?.items ?? [];
        setFeed(prev => {
          const next = reset ? items : [...prev, ...items];
          // Auto-activate first post so video plays immediately on load
          if (reset && next.length > 0) {
            setActivePostId(String(next[0].postId));
          }
          return next;
        });
        setHasMore(items.length === AppConfig.DEFAULT_PAGE_SIZE);
      }
    } catch {
      setError('Could not load feed. Pull to refresh.');
    }
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([
      loadFeed(1, true),
      listProjects({ pageNumber: 1, pageSize: 5 }).then(r => {
        if (r.data?.isSuccess) setProjects(r.data.data?.items ?? []);
      }).catch(() => {}),
      getMyOrgs().then(r => {
        if (r.data?.isSuccess) {
          const orgs = r.data.data ?? [];
          setUserOrgs(orgs);
          // Set first APPROVED org as active if not already set
          setActiveOrgId(prev => {
            if (prev) return prev;
            const first = orgs.find((o: Organisation) => o.memberStatusCode === 'APPROVED');
            return first?.orgId ?? orgs[0]?.orgId ?? null;
          });
        }
      }).catch(() => {}),
    ]);
    setPage(1);
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
    const next = page + 1;
    setPage(next);
    await loadFeed(next);
  }, [hasMore, loading, page, loadFeed]);

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

  const userInitials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || 'ME';

  const activeOrg   = userOrgs.find(o => o.orgId === activeOrgId)
                   ?? userOrgs.find(o => o.memberStatusCode === 'APPROVED');
  const orgName     = activeOrg?.orgName ?? activeOrg?.name ?? 'NGO Connect';
  const orgInitials = orgName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const approvedOrgs = userOrgs.filter(o => o.memberStatusCode === 'APPROVED');

  // Sync the currently active org into the shared store so other screens
  // (Community, etc.) can read it without their own API call.
  useEffect(() => { setActiveOrg(activeOrg ?? null); }, [activeOrg, setActiveOrg]);

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
            <View style={styles.orgAvatar}>
              <Text style={styles.orgAvatarText}>{orgInitials}</Text>
            </View>
            <Text style={styles.orgName} numberOfLines={1}>{orgName}</Text>
            <Text style={styles.orgChevron}>▾</Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => nav.navigate('Notifications')}
              style={styles.headerIconBtn}
              accessibilityLabel="Notifications"
            >
              <Text style={styles.headerIcon}>🔔</Text>
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
                        onApply={setApplyProject}
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
              onCommentPress={p => setCommentPost(p)}
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


      {/* ── FAB ────────────────────────────────────────────────────────── */}
      <ComposeFab onPress={() => setShowCreatePost(true)} />

      {/* ── Create Post Modal ───────────────────────────────────────────── */}
      <CreateFeedPostModal
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onPosted={init}
        user={user}
        activeOrg={activeOrg ?? null}
        roleLabel={activeOrg ? 'Admin' : undefined}
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
            {approvedOrgs.map((org) => {
              const oName    = org.orgName ?? (org as any).name ?? 'NGO';
              const isActive = org.orgId === activeOrgId;
              const initials = oName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              const role     = org.myRole ?? (org as any).role ?? 'Member';
              const members  = org.memberCount ? `${org.memberCount.toLocaleString()} members` : '';
              const subtitle = [role, members].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={org.orgId}
                  style={[styles.orgSwitcherItem, isActive && styles.orgSwitcherItemActive]}
                  onPress={() => { setActiveOrgId(org.orgId); setActiveOrg(org); setShowOrgSwitcher(false); }}
                  accessibilityLabel={`Switch to ${oName}`}
                >
                  <View style={[styles.orgSwitcherAvatar, isActive && { backgroundColor: C.PRIMARY }]}>
                    <Text style={styles.orgSwitcherAvatarText}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orgSwitcherName, isActive && { color: C.PRIMARY }]}>{oName}</Text>
                    {subtitle ? <Text style={styles.orgSwitcherMeta}>{subtitle}</Text> : null}
                  </View>
                  {isActive && (
                    <View style={styles.orgSwitcherActiveBadge}>
                      <Text style={styles.orgSwitcherActiveBadgeText}>Active</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}

            {/* Create New Organisation */}
            <Pressable
              style={styles.orgSwitcherItem}
              onPress={() => { setShowOrgSwitcher(false); nav.navigate('CreateOrg' as never); }}
              accessibilityLabel="Create new organisation"
            >
              <View style={[styles.orgSwitcherAvatar, { backgroundColor: C.BORDER }]}>
                <Text style={[styles.orgSwitcherAvatarText, { color: C.TEXT2, fontSize: 20 }]}>+</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgSwitcherName}>Create New Organisation</Text>
                <Text style={styles.orgSwitcherMeta}>Register a new NGO</Text>
              </View>
              <Text style={{ fontSize: 20, color: C.TEXT3 }}>›</Text>
            </Pressable>

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
  orgAvatar: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.PRIMARY,
    alignItems: 'center', justifyContent: 'center',
  },
  orgAvatarText:  { fontSize: 12, fontWeight: '800', color: '#fff' },
  orgName:        { fontSize: 15, fontWeight: '700', color: C.TEXT, maxWidth: 160 },
  orgChevron:     { fontSize: 12, color: C.TEXT2 },
  headerActions:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon:     { fontSize: 20 },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  oppCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillText:    { fontSize: 10, fontWeight: '700' },
  distText:    { fontSize: 11, color: C.TEXT3 },
  oppTitle:    { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 3, lineHeight: 19 },
  oppOrg:      { fontSize: 12, color: C.TEXT2, marginBottom: 7 },
  oppMeta:     { gap: 3, marginBottom: 7 },
  oppMetaItem: { fontSize: 11, color: C.TEXT3 },
  capBarOuter: { height: 4, backgroundColor: C.BG, borderRadius: 2, overflow: 'hidden', marginBottom: 5 },
  capBarFill:  { height: '100%' as any, borderRadius: 2 },
  spotsText:   { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  applyBtn: {
    backgroundColor: C.PRIMARY,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
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
    textTransform: 'uppercase' as const,
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
  },
  orgSwitcherHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  orgSwitcherTitle:    { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  orgSwitcherSubtitle: { fontSize: 12, color: C.TEXT2 },
  orgSwitcherClose:    { fontSize: 18, color: C.TEXT2, paddingLeft: 12, paddingTop: 2 },
  orgSwitcherItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  orgSwitcherItemActive: { backgroundColor: `${C.PRIMARY}08` },
  orgSwitcherAvatar: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: C.PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  orgSwitcherAvatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  orgSwitcherName:       { fontSize: 14, fontWeight: '600', color: C.TEXT },
  orgSwitcherMeta:       { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  orgSwitcherActiveBadge: {
    backgroundColor: C.PRIMARY_LIGHT,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  orgSwitcherActiveBadgeText: { fontSize: 11, fontWeight: '700', color: C.PRIMARY },

  // ── Post options menu sheet ──────────────────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: C.CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  menuHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.BORDER,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  menuRowReport: { borderBottomWidth: 0 },
  menuIcon:  { fontSize: 18 },
  menuLabel: { fontSize: 15, color: C.TEXT, fontWeight: '500' },

  // ── Report Post modal ────────────────────────────────────────────────────────
  reportSheet: {
    backgroundColor: C.CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  reportTitle:    { fontSize: 17, fontWeight: '700', color: C.TEXT },
  reportClose:    { fontSize: 18, color: C.TEXT2, paddingLeft: 8 },
  reportSubtitle: { fontSize: 13, color: C.TEXT2, paddingHorizontal: 20, paddingVertical: 10 },
  reportReason: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    gap: 10,
  },
  reportReasonSelected: { backgroundColor: `${C.PRIMARY}08` },
  reportReasonText:     { fontSize: 14, fontWeight: '600', color: C.TEXT },
  reportReasonSub:      { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  reportDetailsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.TEXT2,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  reportDetailsInput: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: C.TEXT,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: C.BG,
  },
  reportSubmitBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitText: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  reportSuccess: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  reportSuccessTitle: { fontSize: 17, fontWeight: '700', color: C.TEXT, marginBottom: 8 },
  reportSuccessSub:   { fontSize: 13, color: C.TEXT2, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
});
