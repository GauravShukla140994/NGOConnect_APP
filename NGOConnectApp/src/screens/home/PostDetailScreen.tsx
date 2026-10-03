/**
 * PostDetailScreen — single post opened from notification taps.
 *
 * Renders the post card in the exact same visual format as the home feed,
 * with "View all comments" opening FeedCommentsModal (same bottom-sheet
 * as the feed). Like and save are wired identically to HomeScreen.
 *
 * Route params: { postId: number }
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import {
  feedApi,
  likePost, unlikePost,
} from '../../api/feed.api';
import type { Post } from '../../types/api.types';
import FeedCommentsModal from '../../components/home/FeedCommentsModal';
import VideoFeedPlayer  from '../../components/home/VideoFeedPlayer';
import { fmtDate } from '../../utils/dateUtils';

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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={s.igAuthorName}>{authorName}</Text>
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
          </View>

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
                  <Image
                    source={{ uri: mediaUrls[0] }}
                    style={{ width: SCREEN_W, height: CAROUSEL_H }}
                    resizeMode="cover"
                  />
                )
              ) : (
                <>
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
                        <Image
                          key={i}
                          source={{ uri: url }}
                          style={{ width: SCREEN_W, height: CAROUSEL_H }}
                          resizeMode="cover"
                        />
                      )
                    )}
                  </ScrollView>
                  <View style={s.igDots}>
                    {mediaUrls.map((_, i) => (
                      <View key={i} style={[s.igDot, i === activeSlide && s.igDotActive]} />
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* Action row — ❤️  💬  */}
          <View style={s.igActionRow}>
            <TouchableOpacity style={s.igActionBtn} onPress={handleLike} accessibilityLabel="Like post">
              <Text style={[s.igActionIcon, liked && s.igActionIconLiked]}>
                {liked ? '❤️' : '🤍'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.igActionBtn} onPress={() => setCommentOpen(true)} accessibilityLabel="Comment">
              <Text style={s.igActionIcon}>💬</Text>
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
            <Text style={s.igCaptionText} numberOfLines={expanded ? undefined : 3}>
              <Text style={s.igCaptionAuthor}>{authorName}{' '}</Text>
              {post.content}
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

  igLikesCount:  { paddingHorizontal: 14, fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  igCaption:     { paddingHorizontal: 14, paddingBottom: 4 },
  igPostTitle:   { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  igCaptionAuthor: { fontSize: 13, fontWeight: '700', color: C.TEXT },
  igCaptionText:   { fontSize: 13, color: C.TEXT, lineHeight: 20 },
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
});
