/**
 * PostDetailScreen — single post opened from notification taps.
 *
 * Renders the post card in the exact same visual format as the home feed,
 * with "View all comments" opening FeedCommentsModal (same bottom-sheet
 * as the feed). Like and save are wired identically to HomeScreen.
 *
 * Route params: { postId: number }
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { parseRichSegments } from '../../utils/richText';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { shareApi } from '../../api/share.api';
import ShareIcon from '../../components/common/ShareIcon';
import {
  feedApi,
  likePost, unlikePost,
} from '../../api/feed.api';
import { orgApi } from '../../api/org.api';
import { useAuthStore } from '../../store/authStore';
import type { Post } from '../../types/api.types';
import FeedCommentsModal from '../../components/home/FeedCommentsModal';
import VideoFeedPlayer  from '../../components/home/VideoFeedPlayer';
import VerifiedBadge    from '../../components/common/VerifiedBadge';
import { fmtDate } from '../../utils/dateUtils';

// ── Report reasons (mirrors HomeScreen) ──────────────────────────────────────
type ReportReason = { code: string; label: string; sub: string };
const REPORT_REASONS: ReportReason[] = [
  { code: 'SPAM',          label: 'Spam or misleading information', sub: 'False claims or promotional content' },
  { code: 'HARASSMENT',    label: 'Harassment or bullying',         sub: 'Targeted abuse or threats' },
  { code: 'HATE_SPEECH',   label: 'Hate speech',                    sub: 'Content that promotes hate' },
  { code: 'INAPPROPRIATE', label: 'Inappropriate content',          sub: 'Graphic or adult content' },
  { code: 'FRAUD',         label: 'Fraud or scam',                  sub: 'Fake fundraising or deceptive' },
  { code: 'OTHER',         label: 'Other',                          sub: 'Something else entirely' },
];

const C        = AppConfig.COLORS;
const SCREEN_W = Dimensions.get('window').width;

// ── helpers (mirrors HomeScreen) ─────────────────────────────────────────────

function asUtc(iso: string): Date {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
}
function timeAgoStr(iso: string | undefined | null): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - asUtc(iso).getTime()) / 1000);
  if (diff < 60)        return 'Just now';
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso);
}

const ORG_PALETTE = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#D97706', '#16A34A', '#7C3AED'];
function avatarBgFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % ORG_PALETTE.length;
  return ORG_PALETTE[Math.abs(h)];
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

// ── PostDetailScreen ──────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { postId } = route.params as { postId: number };

  const [post,        setPost]        = useState<Post | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [postError,   setPostError]   = useState(false);

  // local optimistic UI — mirrors HomeScreen PostCard
  const [liked,       setLiked]       = useState(false);
  const [likeCount,   setLikeCount]   = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [expanded,    setExpanded]    = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [commentOpen, setCommentOpen] = useState(false);
  const [muted,       setMuted]       = useState(true);

  // ── menu / report / save / follow state (mirrors HomeScreen PostCard) ──────
  const { user }                               = useAuthStore();
  const insets                                 = useSafeAreaInsets();
  const [bookmarked,       setBookmarked]      = useState(false);
  const [isFollowingOrg,   setIsFollowingOrg]  = useState(false);
  const [followingOrgLoad, setFollowingOrgLoad]= useState(false);
  const [showMenu,         setShowMenu]        = useState(false);
  const [showReport,       setShowReport]      = useState(false);
  const [selectedReason,   setSelectedReason]  = useState<ReportReason | null>(null);
  const [reportDetails,    setReportDetails]   = useState('');
  const [reportSubmitting, setReportSubmitting]= useState(false);
  const [reportDone,       setReportDone]      = useState(false);

  // ── double-tap to like (mirrors HomeScreen PostCard) ─────────────────────
  const lastTapRef  = useRef<number>(0);
  const [heartPos,  setHeartPos]  = useState<{ x: number; y: number } | null>(null);
  const heartAnim   = useRef(new Animated.Value(0)).current;
  const heartScale  = heartAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.3, 1.3, 1] });

  const handleMediaTap = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // double-tap — trigger like + floating heart
      lastTapRef.current = 0;
      if (!liked) {
        setLiked(true);
        setLikeCount(c => c + 1);
        likePost(post?.postId).catch(() => {
          setLiked(false);
          setLikeCount(c => Math.max(0, c - 1));
        });
      }
      setHeartPos({ x, y });
      heartAnim.setValue(0);
      Animated.sequence([
        Animated.spring(heartAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }),
        Animated.delay(400),
        Animated.timing(heartAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => setHeartPos(null));
    } else {
      lastTapRef.current = now;
    }
  }, [liked, post?.postId, heartAnim]);

  // ── fetch post ────────────────────────────────────────────────────────────
  const fetchPost = useCallback(async () => {
    setPostLoading(true);
    setPostError(false);
    try {
      const res = await feedApi.getPost(postId);
      const p   = res.data?.data;
      if (p) {
        setPost(p);
        setLiked(!!p.isLiked);
        setLikeCount(p.likeCount ?? 0);
        setCommentCount(p.commentCount ?? 0);
        setBookmarked(!!p.isSaved);
        setIsFollowingOrg(!!(p as any).isFollowing);
      } else {
        setPostError(true);
      }
    } catch {
      setPostError(true);
    } finally {
      setPostLoading(false);
    }
  }, [postId]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  // ── share ─────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    setShowMenu(false);
    if (!post) return;
    try {
      const res = await shareApi.getToken('POST', post.postId!);
      const url = res.data?.data?.url;
      if (!url) throw new Error('no url');
      const snippet = (post.content ?? '').trim().slice(0, 100);
      const who     = post.orgName ? `${post.orgName} on RippleHub` : 'A post on RippleHub';
      await Share.share({
        message: snippet ? `${who}: ${snippet}\n\n${url}` : `${who}\n${url}`,
      });
    } catch {
      Alert.alert('Could not share', 'Please try again.');
    }
  }, [post]);

  // ── follow/unfollow org ───────────────────────────────────────────────────
  const handleFollowNGO = useCallback(async () => {
    setShowMenu(false);
    if (!post?.orgId || followingOrgLoad) return;
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
  }, [post?.orgId, isFollowingOrg, followingOrgLoad]);

  // ── save / unsave toggle ──────────────────────────────────────────────────
  const handleSaveToggle = useCallback(async () => {
    setShowMenu(false);
    if (!post) return;
    const wasSaved = bookmarked;
    setBookmarked(!wasSaved);
    try {
      wasSaved ? await feedApi.unsavePost(post.postId!) : await feedApi.savePost(post.postId!);
    } catch {
      setBookmarked(wasSaved);
    }
  }, [bookmarked, post]);

  // ── delete post ───────────────────────────────────────────────────────────
  const handleDeletePost = useCallback(() => {
    setShowMenu(false);
    setTimeout(() => {
      Alert.alert(
        'Delete Post',
        'Are you sure you want to delete this post? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await feedApi.deletePost(post!.postId!);
                nav.goBack();
              } catch {
                Alert.alert('Error', 'Could not delete post. Please try again.');
              }
            },
          },
        ],
      );
    }, 350);
  }, [post, nav]);

  // ── report ────────────────────────────────────────────────────────────────
  const openReport = () => {
    setShowMenu(false);
    setSelectedReason(null);
    setReportDetails('');
    setReportDone(false);
    setTimeout(() => setShowReport(true), 350);
  };

  const submitReport = async () => {
    if (!selectedReason || !post) return;
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

  // ── like (optimistic) ─────────────────────────────────────────────────────
  const handleLike = async () => {
    if (!post) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? Math.max(0, c - 1) : c + 1);
    try {
      wasLiked ? await unlikePost(post.postId) : await likePost(post.postId);
    } catch {
      setLiked(wasLiked);
      setLikeCount(c => wasLiked ? c + 1 : Math.max(0, c - 1));
    }
  };

  // ── media — mirrors HomeScreen PostCard ──────────────────────────────────
  const mediaUrls: string[] = post
    ? (Array.isArray(post.mediaUrls)
        ? post.mediaUrls
        : typeof post.mediaUrls === 'string' && post.mediaUrls
          ? (post.mediaUrls as string).split(',').map(u => u.trim()).filter(Boolean)
          : [])
    : [];

  // Post_GetById returns MediaTypes (GROUP_CONCAT CSV after patch).
  // Fall back to mediaType (singular) for installs still on the old SP that
  // returned only the first media item's type via LIMIT 1.
  const rawTypes = (post?.mediaTypes ?? (post as any)?.mediaType) as unknown;
  const mediaTypes: string[] = typeof rawTypes === 'string' && rawTypes
    ? rawTypes.split(',').map((t: string) => t.trim())
    : [];
  const isVideo = (i: number) => (mediaTypes[i] ?? 'IMAGE') === 'VIDEO';

  const CAROUSEL_H = Math.min(Math.round(SCREEN_W * 1.25), 500);

  // ── render ────────────────────────────────────────────────────────────────

  if (postLoading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} activeOpacity={0.7}>
            <Text style={s.backIcon}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Post</Text>
          <View style={s.headerRight} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  if (postError || !post) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} activeOpacity={0.7}>
            <Text style={s.backIcon}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Post</Text>
          <View style={s.headerRight} />
        </View>
        <View style={s.center}>
          <Text style={s.errorText}>Could not load post.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchPost}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const authorName = post.authorName ?? post.orgName ?? 'NGO';
  const initials   = authorName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const avatarBg   = avatarBgFor(authorName);
  const meta       = TYPE_META[post.postTypeLkpCode ?? 'GENERAL'] ?? TYPE_META.GENERAL;
  const isLong     = (post.content?.length ?? 0) > 150;

  return (
    <SafeAreaView style={s.root} edges={['top']}>

      {/* ── Header — identical to NotificationsScreen ───────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} activeOpacity={0.7}>
          <Text style={s.backIcon}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>Post</Text>
        <View style={s.headerRight} />
      </View>

      {/* ── Post card (same structure as HomeScreen PostCard) ────────────── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={s.postCard}>

          {/* Author row */}
          <View style={s.igAuthorRow}>
            {post.profilePhoto ? (
              <Image source={{ uri: post.profilePhoto }} style={s.igAvatar} />
            ) : (
              <View style={[s.igAvatar, s.igAvatarFallback, { backgroundColor: avatarBg }]}>
                <Text style={s.igAvatarText}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <Text style={s.igAuthorName}>{authorName}</Text>
                {post.isAuthorVerified ? <VerifiedBadge size={14} /> : null}
                {meta.label !== 'POST' && (
                  <View style={[s.igTypePill, { backgroundColor: meta.bg }]}>
                    <Text style={[s.igTypePillText, { color: meta.color }]}>
                      {meta.icon}{meta.icon ? ' ' : ''}{meta.label}
                    </Text>
                  </View>
                )}
              </View>
              {!!post.orgName && post.orgName !== authorName && (
                <Text style={s.igAuthorSub}>{post.orgName}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Post options">
              <Text style={s.igMore}>•••</Text>
            </TouchableOpacity>
          </View>

          {/* ── Post options sheet ────────────────────────────────────── */}
          {showMenu && (
            <Modal visible transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
              <Pressable style={s.menuOverlay} onPress={() => setShowMenu(false)}>
                <View style={[s.menuSheet, { paddingBottom: insets.bottom + 8 }]}>
                  <View style={s.menuHandle} />
                  {[
                    ...(post.orgId ? [{
                      icon: '🏢',
                      label: 'View Organisation Profile',
                      onPress: () => { setShowMenu(false); nav.navigate('NgoProfile', { orgId: post.orgId }); },
                    }] : []),
                    ...(post.orgId ? [{
                      icon: isFollowingOrg ? '✓' : '➕',
                      label: isFollowingOrg ? 'Unfollow NGO' : 'Follow NGO',
                      onPress: handleFollowNGO,
                    }] : []),
                    { icon: '🔖', label: bookmarked ? 'Unsave' : 'Save', onPress: handleSaveToggle },
                  ].map(item => (
                    <TouchableOpacity key={item.label} style={s.menuRow} onPress={item.onPress}>
                      <Text style={s.menuIcon}>{item.icon}</Text>
                      <Text style={s.menuLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={s.menuRow} onPress={handleShare}>
                    <View style={s.menuIconSvg}><ShareIcon size={20} color="#808080" /></View>
                    <Text style={s.menuLabel}>Share</Text>
                  </TouchableOpacity>
                  {!!user?.userId && Number(user.userId) === Number(post.userId) && (
                    <TouchableOpacity style={[s.menuRow, s.menuRowReport]} onPress={handleDeletePost}>
                      <Text style={s.menuIcon}>🗑️</Text>
                      <Text style={[s.menuLabel, { color: '#DC2626' }]}>Delete Post</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.menuRow, s.menuRowReport]} onPress={openReport}>
                    <Text style={s.menuIcon}>🚩</Text>
                    <Text style={[s.menuLabel, { color: '#DC2626' }]}>Report</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Modal>
          )}

          {/* ── Report Post modal ─────────────────────────────────────── */}
          {showReport && (
            <Modal visible transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
              <SafeAreaProvider>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                  <Pressable style={s.menuOverlay} onPress={() => !reportSubmitting && setShowReport(false)}>
                    <Pressable style={s.reportSheet} onPress={e => e.stopPropagation()}>
                      <View style={s.menuHandle} />
                      <View style={s.reportHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 16 }}>🚩</Text>
                          <Text style={s.reportTitle}>Report Post</Text>
                        </View>
                        <TouchableOpacity onPress={() => setShowReport(false)} disabled={reportSubmitting}>
                          <Text style={s.reportClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      {reportDone ? (
                        <View style={s.reportSuccess}>
                          <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
                          <Text style={s.reportSuccessTitle}>Report Submitted</Text>
                          <Text style={s.reportSuccessSub}>Our team will review this post and take appropriate action.</Text>
                          <TouchableOpacity style={[s.reportSubmitBtn, { alignSelf: 'stretch' }]} onPress={() => setShowReport(false)}>
                            <Text style={s.reportSubmitText}>Done</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <Text style={s.reportSubtitle}>Help us understand what's wrong with this post</Text>
                          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                            {REPORT_REASONS.map(r => (
                              <TouchableOpacity
                                key={r.code}
                                style={[s.reportReason, selectedReason?.code === r.code && s.reportReasonSelected]}
                                onPress={() => setSelectedReason(r)}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={[s.reportReasonText, selectedReason?.code === r.code && { color: C.PRIMARY }]}>{r.label}</Text>
                                  {r.sub ? <Text style={s.reportReasonSub}>{r.sub}</Text> : null}
                                </View>
                                {selectedReason?.code === r.code && <Text style={{ color: C.PRIMARY, fontSize: 16 }}>✓</Text>}
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                          <Text style={s.reportDetailsLabel}>Additional details (optional)</Text>
                          <TextInput
                            style={s.reportDetailsInput}
                            placeholder="Describe the issue in more detail…"
                            placeholderTextColor={C.TEXT3}
                            multiline
                            numberOfLines={3}
                            value={reportDetails}
                            onChangeText={setReportDetails}
                          />
                          <TouchableOpacity
                            style={[s.reportSubmitBtn, (!selectedReason || reportSubmitting) && s.reportSubmitBtnDisabled]}
                            onPress={submitReport}
                            disabled={!selectedReason || reportSubmitting}
                          >
                            {reportSubmitting
                              ? <ActivityIndicator color="#FFFFFF" />
                              : <Text style={s.reportSubmitText}>Submit Report</Text>
                            }
                          </TouchableOpacity>
                        </>
                      )}
                      <SafeAreaView edges={['bottom']} style={{ minHeight: 16 }} />
                    </Pressable>
                  </Pressable>
                </KeyboardAvoidingView>
              </SafeAreaProvider>
            </Modal>
          )}

          {/* Media */}
          {mediaUrls.length > 0 && (
            <>
              {mediaUrls.length === 1 ? (
                isVideo(0) ? (
                  <VideoFeedPlayer
                    uri={mediaUrls[0]}
                    isActive={!commentOpen}
                    muted={muted}
                    onToggleMute={() => setMuted(m => !m)}
                    width={SCREEN_W}
                    height={CAROUSEL_H}
                  />
                ) : (
                  <Pressable
                    onPress={e => handleMediaTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
                    style={{ width: SCREEN_W, height: CAROUSEL_H }}
                  >
                    <Image
                      source={{ uri: mediaUrls[0] }}
                      style={{ width: SCREEN_W, height: CAROUSEL_H }}
                      resizeMode="cover"
                    />
                    {/* Floating heart on double-tap */}
                    {heartPos && (
                      <Animated.Text style={[s.floatingHeart, {
                        left: heartPos.x - 36,
                        top:  heartPos.y - 36,
                        opacity: heartAnim,
                        transform: [{ scale: heartScale }],
                      }]}>❤️</Animated.Text>
                    )}
                  </Pressable>
                )
              ) : (
                <>
                  <View style={{ height: CAROUSEL_H }}>
                    <ScrollView
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      decelerationRate="fast"
                      style={{ height: CAROUSEL_H }}
                      onScroll={e => {
                        const slide = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                        setActiveSlide(slide);
                      }}
                      scrollEventThrottle={16}
                    >
                      {mediaUrls.map((url, i) =>
                        isVideo(i) ? (
                          <VideoFeedPlayer
                            key={i}
                            uri={url}
                            isActive={!commentOpen && activeSlide === i}
                            muted={muted}
                            onToggleMute={() => setMuted(m => !m)}
                            width={SCREEN_W}
                            height={CAROUSEL_H}
                          />
                        ) : (
                          <Pressable
                            key={i}
                            onPress={e => handleMediaTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
                            style={{ width: SCREEN_W, height: CAROUSEL_H }}
                          >
                            <Image
                              source={{ uri: url }}
                              style={{ width: SCREEN_W, height: CAROUSEL_H }}
                              resizeMode="cover"
                            />
                          </Pressable>
                        )
                      )}
                    </ScrollView>
                    {/* Floating heart overlaid on carousel */}
                    {heartPos && (
                      <Animated.Text pointerEvents="none" style={[s.floatingHeart, {
                        left: heartPos.x - 36,
                        top:  heartPos.y - 36,
                        opacity: heartAnim,
                        transform: [{ scale: heartScale }],
                      }]}>❤️</Animated.Text>
                    )}
                  </View>
                  <View style={s.igDots}>
                    {mediaUrls.map((_, i) => (
                      <View key={i} style={[s.igDot, i === activeSlide && s.igDotActive]} />
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* Action row — ❤️  💬  ✈️  */}
          <View style={s.igActionRow}>
            <TouchableOpacity style={s.igActionBtn} onPress={handleLike} accessibilityLabel="Like post">
              <Text style={[s.igActionIcon, liked && s.igActionIconLiked]}>
                {liked ? '❤️' : '🤍'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.igActionBtn} onPress={() => setCommentOpen(true)} accessibilityLabel="Comment">
              <Text style={s.igActionIcon}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.igActionBtn} onPress={handleShare} accessibilityLabel="Share post">
              <ShareIcon size={24} color="#808080" />
            </TouchableOpacity>
          </View>

          {/* Likes count */}
          {likeCount > 0 && (
            <Text style={s.igLikesCount}>
              {likeCount.toLocaleString('en-IN')} {likeCount === 1 ? 'like' : 'likes'}
            </Text>
          )}

          {/* Caption */}
          <View style={s.igCaption}>
            {!!post.title && <Text style={s.igPostTitle}>{post.title}</Text>}
            <Text style={s.igCaptionText} numberOfLines={expanded ? undefined : 3} selectable>
              <Text style={s.igCaptionAuthor}>{authorName}{' '}</Text>
              {parseRichSegments(post.content ?? '').map((seg, i) =>
                seg.type === 'url'
                  ? (
                    <Text
                      key={i}
                      style={s.igCaptionLink}
                      onPress={() =>
                        Linking.openURL(seg.value).catch(() =>
                          Alert.alert('Cannot open link', seg.value),
                        )
                      }
                    >
                      {seg.value}
                    </Text>
                  )
                  : <React.Fragment key={i}>{seg.value}</React.Fragment>
              )}
            </Text>
            {isLong && !expanded && (
              <TouchableOpacity onPress={() => setExpanded(true)}>
                <Text style={s.igMoreLink}>...more</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Campaign / Fundraise */}
          {!!post.campaignGoal && (
            <View style={s.igFundraiseBox}>
              <View style={s.fundraiseRow}>
                <Text style={s.fundraiseAmount}>
                  ₹{(post.campaignRaised ?? 0).toLocaleString('en-IN')}
                </Text>
                <Text style={s.fundraiseMeta}>
                  of ₹{post.campaignGoal.toLocaleString('en-IN')} goal
                </Text>
              </View>
              <View style={s.capBarOuter}>
                <View style={[s.capBarFill, {
                  width: `${Math.min(Math.round(((post.campaignRaised ?? 0) / post.campaignGoal) * 100), 100)}%` as any,
                }]} />
              </View>
              <TouchableOpacity
                style={s.donateBtn}
                onPress={() => nav.navigate('Donate', { orgId: post.orgId })}
                activeOpacity={0.8}
              >
                <Text style={s.donateBtnText}>Donate Now 💚</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* View all comments */}
          {commentCount > 0 && (
            <TouchableOpacity
              style={s.igViewComments}
              onPress={() => setCommentOpen(true)}
              accessibilityLabel={`View all ${commentCount} comments`}
            >
              <Text style={s.igViewCommentsText}>
                View all {commentCount} comment{commentCount !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}

          {/* Timestamp */}
          {!!post.createdAt && (
            <Text style={s.igTimestamp}>{timeAgoStr(post.createdAt)}</Text>
          )}
        </View>
      </ScrollView>

      {/* FeedCommentsModal — same bottom sheet as in HomeScreen */}
      <FeedCommentsModal
        visible={commentOpen}
        post={post}
        onClose={() => setCommentOpen(false)}
        onCommentAdded={() => setCommentCount(c => c + 1)}
      />
    </SafeAreaView>
  );
}

// ── Styles — copied 1-to-1 from HomeScreen postCard styles ───────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header (matches NotificationsScreen)
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   C.CARD,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  backBtn:     { minWidth: 70, height: 36, justifyContent: 'center', marginRight: 4 },
  backIcon:    { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.TEXT },
  headerRight: { width: 70 },

  // Error / retry
  errorText: { color: C.TEXT2, fontSize: 15, marginBottom: 12 },
  retryBtn:  { backgroundColor: C.PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Post card — same as HomeScreen
  postCard: { backgroundColor: C.CARD, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: C.BORDER },

  igAuthorRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  igAvatar:         { width: 38, height: 38, borderRadius: 19 },
  igAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  igAvatarText:     { fontSize: 13, fontWeight: '700', color: '#fff' },
  igAuthorName:     { fontSize: 14, fontWeight: '700', color: C.TEXT },
  igAuthorSub:      { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  igTypePill:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  igTypePillText: { fontSize: 10, fontWeight: '700' },

  igDots:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 6, gap: 5 },
  igDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: C.BORDER },
  igDotActive: { backgroundColor: C.PRIMARY, width: 8, height: 8, borderRadius: 4 },

  igActionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  igActionBtn:       { paddingHorizontal: 6, paddingVertical: 6 },
  igActionIcon:      { fontSize: 22 },
  igActionIconLiked: { color: C.RED },
  floatingHeart:     { position: 'absolute', fontSize: 72, zIndex: 99 },

  igLikesCount:  { paddingHorizontal: 14, fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  igCaption:     { paddingHorizontal: 14, paddingBottom: 4 },
  igPostTitle:   { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  igCaptionAuthor: { fontSize: 13, fontWeight: '700', color: C.TEXT },
  igCaptionText:   { fontSize: 13, color: C.TEXT, lineHeight: 20 },
  igCaptionLink:   { fontSize: 13, color: C.PRIMARY, textDecorationLine: 'underline' },
  igMoreLink:      { fontSize: 13, color: C.TEXT3, marginTop: 2 },

  igFundraiseBox: { marginHorizontal: 14, marginVertical: 8, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12 },
  fundraiseRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
  fundraiseAmount: { fontSize: 18, fontWeight: '700', color: C.TEAL },
  fundraiseMeta:   { fontSize: 12, color: C.TEXT2 },
  capBarOuter: { height: 6, backgroundColor: C.BORDER, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  capBarFill:  { height: 6, backgroundColor: C.TEAL, borderRadius: 3 },
  donateBtn:    { backgroundColor: C.TEAL, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  donateBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  igViewComments:     { paddingHorizontal: 14, paddingBottom: 4 },
  igViewCommentsText: { fontSize: 13, color: C.TEXT2 },
  igTimestamp: { paddingHorizontal: 14, paddingBottom: 10, fontSize: 10, color: C.TEXT3, letterSpacing: 0.5 },

  igMore: { fontSize: 18, color: C.TEXT3, paddingHorizontal: 4, paddingVertical: 4, letterSpacing: 2 },

  // ── Post menu (3-dot) ──────────────────────────────────────────────────
  menuOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet:     { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 0 },
  menuHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  menuRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 14, borderTopWidth: 1, borderTopColor: C.BORDER },
  menuIcon:      { fontSize: 20, width: 26, textAlign: 'center' },
  menuIconSvg:   { width: 26, alignItems: 'center', justifyContent: 'center' },
  menuLabel:     { fontSize: 15, color: C.TEXT, flex: 1 },
  menuRowReport: { borderTopColor: '#FEE2E2' },

  // ── Report sheet ───────────────────────────────────────────────────────
  reportSheet:             { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  reportHeader:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  reportTitle:             { fontSize: 16, fontWeight: '700', color: C.TEXT },
  reportClose:             { fontSize: 18, color: C.TEXT2, padding: 4 },
  reportSubtitle:          { fontSize: 13, color: C.TEXT2, paddingHorizontal: 16, paddingVertical: 10 },
  reportReason:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.BORDER, gap: 12 },
  reportReasonSelected:    { backgroundColor: C.PRIMARY + '0D' },
  reportReasonText:        { fontSize: 14, fontWeight: '600', color: C.TEXT },
  reportReasonSub:         { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  reportDetailsLabel:      { fontSize: 12, fontWeight: '600', color: C.TEXT2, paddingHorizontal: 16, marginTop: 12, marginBottom: 6 },
  reportDetailsInput:      { marginHorizontal: 16, backgroundColor: C.BG, borderRadius: 10, padding: 12, fontSize: 13, color: C.TEXT, minHeight: 72, textAlignVertical: 'top', borderWidth: 1, borderColor: C.BORDER },
  reportSubmitBtn:         { backgroundColor: C.PRIMARY, margin: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  reportSuccess:           { alignItems: 'center', padding: 24 },
  reportSuccessTitle:      { fontSize: 18, fontWeight: '700', color: C.TEXT, marginBottom: 6 },
  reportSuccessSub:        { fontSize: 13, color: C.TEXT2, textAlign: 'center', lineHeight: 18, marginBottom: 16 },
});
