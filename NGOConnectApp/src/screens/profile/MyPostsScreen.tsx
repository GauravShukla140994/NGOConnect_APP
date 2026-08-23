/**
 * MyPostsScreen
 *
 * All posts created by the current user, newest first.
 * Accessible from Profile → MY ACTIVITY → My Posts.
 *
 * Features:
 *  - Loads posts via GET /api/v1/feed/myposts (Post_GetByUser SP)
 *  - Pull-to-refresh
 *  - Infinite scroll pagination
 *  - Optimistic delete with revert on error
 *  - Fullscreen image/video preview (MediaPreviewModal)
 *  - Graceful empty state
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Video from 'react-native-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { fmtDate } from '../../utils/dateUtils';
import { feedApi } from '../../api/feed.api';
import MediaPreviewModal, { MediaItem } from '../../components/MediaPreviewModal';
import FeedCommentsModal from '../../components/home/FeedCommentsModal';
import type { Post } from '../../types/api.types';

const C = AppConfig.COLORS;

const TYPE_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  GENERAL:      { icon: '',   color: C.TEXT2,    bg: `${C.TEXT2}18`,    label: 'POST'        },
  ANNOUNCEMENT: { icon: '📢', color: '#7C3AED',  bg: '#EDE9FE',         label: 'Announcement'},
  EVENT:        { icon: '📅', color: '#D97706',  bg: '#FEF3C7',         label: 'Event'       },
  FUNDRAISING:  { icon: '💚', color: '#16A34A',  bg: '#DCFCE7',         label: 'Fundraising' },
  PINNED:       { icon: '📌', color: '#059669',  bg: '#D1FAE5',         label: 'Pinned'      },
  EMERGENCY:    { icon: '🚨', color: '#DC2626',  bg: '#FEE2E2',         label: 'Emergency'   },
};

const AVATAR_PALETTE = ['#6B4EFF', '#2563EB', '#16A34A', '#D97706', '#7C3AED'];
function avatarBg(postId: number) {
  return AVATAR_PALETTE[postId % AVATAR_PALETTE.length];
}

// ─── MyPostCard ───────────────────────────────────────────────────────────────
function MyPostCard({
  item,
  onDelete,
  onMediaPress,
  onCommentPress,
}: {
  item: Post;
  onDelete: (postId: number) => void;
  onMediaPress: (items: MediaItem[], index: number) => void;
  onCommentPress: (post: Post) => void;
}) {
  const meta    = TYPE_META[item.postTypeLkpCode ?? 'GENERAL'] ?? TYPE_META.GENERAL;
  const initials = (item.authorName ?? 'ME').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const bgColor  = avatarBg(item.postId ?? 0);
  const postedOn = fmtDate(item.createdAt);

  const { width: windowWidth } = useWindowDimensions();
  const cardInnerWidth = windowWidth - 52;

  // Normalise GROUP_CONCAT CSV → string[]
  const rawMedia  = item.mediaUrls as unknown;
  const mediaUrls: string[] = Array.isArray(rawMedia)
    ? (rawMedia as string[])
    : typeof rawMedia === 'string' && rawMedia
      ? (rawMedia as string).split(',').map((u: string) => u.trim()).filter(Boolean)
      : [];

  const rawTypes = item.mediaTypes as unknown;
  const mediaTypes: string[] = typeof rawTypes === 'string' && rawTypes
    ? rawTypes.split(',').map((t: string) => t.trim())
    : [];
  const isVideo = (idx: number) => (mediaTypes[idx] ?? 'IMAGE') === 'VIDEO';

  const content  = item.content ?? '';
  const isLong   = content.length > 120;
  const [expanded, setExpanded] = useState(false);

  const mediaItems: MediaItem[] = mediaUrls.map((uri, i) => ({
    uri,
    type: isVideo(i) ? 'VIDEO' : 'IMAGE',
  }));

  return (
    <View style={s.card}>
      {/* ── Author row ──────────────────────────────────────────────── */}
      <View style={s.authorRow}>
        {item.profilePhoto ? (
          <Image source={{ uri: item.profilePhoto }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback, { backgroundColor: bgColor }]}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={s.authorName}>{item.authorName ?? 'Me'}</Text>
            {meta.label !== 'POST' ? (
              <View style={[s.typePill, { backgroundColor: meta.bg }]}>
                <Text style={[s.typePillText, { color: meta.color }]}>
                  {meta.icon ? `${meta.icon} ` : ''}{meta.label}
                </Text>
              </View>
            ) : null}
          </View>
          {item.orgName ? (
            <Text style={s.authorSub}>{item.orgName}</Text>
          ) : null}
          <Text style={s.timeAgo}>{item.timeAgo ?? (postedOn ? `Posted ${postedOn}` : '')}</Text>
        </View>

        {/* Delete button */}
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={() => onDelete(item.postId!)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Delete post"
        >
          <Text style={s.deleteBtnIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {content.length > 0 && (
        <View style={{ marginBottom: mediaUrls.length > 0 ? 8 : 0 }}>
          <Text style={s.content} numberOfLines={expanded ? undefined : 4}>
            {content}
          </Text>
          {isLong && (
            <TouchableOpacity onPress={() => setExpanded(e => !e)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Text style={s.readMore}>{expanded ? 'Show less' : 'Read more'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Media — tap to open fullscreen preview ───────────────────── */}
      {mediaUrls.length === 1 ? (
        <TouchableOpacity
          style={[s.mediaSingle, { height: Math.round(cardInnerWidth * 9 / 16) }]}
          onPress={() => onMediaPress(mediaItems, 0)}
          activeOpacity={0.85}
          accessibilityLabel="Open media fullscreen"
        >
          {isVideo(0) ? (
            <>
              <Video
                source={{ uri: mediaUrls[0] }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                paused={true}
                muted={true}
                repeat={false}
              />
              <View style={s.videoPlayOverlay}>
                <View style={s.videoPlayCircle}>
                  <Text style={s.videoPlayIcon}>▶</Text>
                </View>
              </View>
            </>
          ) : (
            <Image source={{ uri: mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
        </TouchableOpacity>
      ) : mediaUrls.length > 1 ? (
        <View style={s.mediaRow}>
          {mediaUrls.slice(0, 3).map((url, idx) => (
            <TouchableOpacity
              key={idx}
              style={s.mediaThumbnail}
              onPress={() => onMediaPress(mediaItems, idx)}
              activeOpacity={0.85}
              accessibilityLabel="Open media fullscreen"
            >
              {isVideo(idx) ? (
                <>
                  <Video
                    source={{ uri: url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    paused={true}
                    muted={true}
                    repeat={false}
                  />
                  <View style={s.videoPlayOverlay}>
                    <View style={s.videoPlayCircle}>
                      <Text style={s.videoPlayIcon}>▶</Text>
                    </View>
                  </View>
                </>
              ) : (
                <Image source={{ uri: url }} style={s.mediaImage} resizeMode="cover" />
              )}
              {idx === 2 && mediaUrls.length > 3 && (
                <View style={s.moreOverlay}>
                  <Text style={s.moreText}>+{mediaUrls.length - 3}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* ── Footer: stats ───────────────────────────────────────────── */}
      <View style={s.footer}>
        <View style={s.stats}>
          <Text style={s.statText}>❤️ {item.likeCount ?? 0}</Text>
          <TouchableOpacity
            onPress={() => onCommentPress(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.statText}>💬 {item.commentCount ?? 0}</Text>
          </TouchableOpacity>
          <Text style={s.statText}>👁 {item.viewCount ?? 0}</Text>
        </View>
      </View>

      {/* ── View comments link ──────────────────────────────────────── */}
      {(item.commentCount ?? 0) > 0 && (
        <TouchableOpacity onPress={() => onCommentPress(item)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={s.viewComments}>
            View all {item.commentCount} comment{item.commentCount === 1 ? '' : 's'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── MyPostsScreen ────────────────────────────────────────────────────────────
export default function MyPostsScreen() {
  const nav = useNavigation<any>();

  const [posts,       setPosts]       = useState<Post[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,        setPage]        = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);
  const PAGE_SIZE = 30;

  // ── Media preview modal ────────────────────────────────────────────
  const [previewItems,   setPreviewItems]   = useState<MediaItem[]>([]);
  const [previewIndex,   setPreviewIndex]   = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);

  // ── Comments modal ────────────────────────────────────────────────
  const [commentPost, setCommentPost] = useState<Post | null>(null);

  const handleCommentPress = useCallback((post: Post) => setCommentPost(post), []);

  const handleCommentAdded = useCallback((postId: number) => {
    setPosts(prev =>
      prev.map(p =>
        p.postId === postId ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p,
      ),
    );
  }, []);

  const handleMediaPress = useCallback((items: MediaItem[], index: number) => {
    setPreviewItems(items);
    setPreviewIndex(index);
    setPreviewVisible(true);
  }, []);

  const hasMore = posts.length < totalCount;

  // ── Load / refresh ────────────────────────────────────────────────
  const load = useCallback(async (pg: number, refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else if (pg === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await feedApi.getMyPosts({ pageNumber: pg, pageSize: PAGE_SIZE });
      if (res.data?.isSuccess && res.data.data) {
        const { items, totalCount: tc } = res.data.data;
        setPosts(pg === 1 ? items : prev => [...prev, ...items]);
        setTotalCount(tc);
        setPage(pg);
      } else {
        if (pg === 1) setPosts([]);
      }
    } catch {
      if (pg === 1) Alert.alert('Error', 'Could not load your posts. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const onRefresh    = useCallback(() => load(1, true), [load]);
  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) load(page + 1);
  }, [loadingMore, hasMore, page, load]);

  // ── Delete (optimistic) ───────────────────────────────────────────
  const handleDelete = useCallback((postId: number) => {
    Alert.alert(
      'Delete Post',
      'This will permanently delete your post. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic: remove immediately
            setPosts(prev => prev.filter(p => p.postId !== postId));
            setTotalCount(t => Math.max(0, t - 1));
            try {
              await feedApi.deletePost(postId);
            } catch {
              // Revert and reload on failure
              load(1);
              Alert.alert('Error', 'Could not delete the post. Please try again.');
            }
          },
        },
      ],
    );
  }, [load]);

  // ── Render ────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <MyPostCard
        item={item}
        onDelete={handleDelete}
        onMediaPress={handleMediaPress}
        onCommentPress={handleCommentPress}
      />
    ),
    [handleDelete, handleMediaPress, handleCommentPress],
  );

  const ListEmpty = loading ? null : (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>✍️</Text>
      <Text style={s.emptyTitle}>No posts yet</Text>
      <Text style={s.emptySub}>
        Posts you create on the Home feed will appear here.
      </Text>
    </View>
  );

  const ListFooter = loadingMore ? (
    <View style={s.footerLoader}>
      <ActivityIndicator size="small" color={C.PRIMARY} />
    </View>
  ) : null;

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Posts</Text>
        {totalCount > 0 ? (
          <Text style={s.headerCount}>{totalCount}</Text>
        ) : (
          <View style={s.headerRight} />
        )}
      </View>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => String(item.postId)}
          renderItem={renderItem}
          contentContainerStyle={[s.list, posts.length === 0 && s.listEmpty]}
          onRefresh={onRefresh}
          refreshing={refreshing}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={ListFooter}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Fullscreen media preview ─────────────────────────────────── */}
      <MediaPreviewModal
        visible={previewVisible}
        items={previewItems}
        initialIndex={previewIndex}
        onClose={() => setPreviewVisible(false)}
      />

      {/* ── Comments modal ───────────────────────────────────────────── */}
      {commentPost && (
        <FeedCommentsModal
          visible={commentPost !== null}
          post={commentPost}
          onClose={() => setCommentPost(null)}
          onCommentAdded={handleCommentAdded}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   C.CARD,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  backBtn:     { minWidth: 70, height: 36, justifyContent: 'center' },
  backText:    { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.TEXT },
  headerCount: {
    fontSize: 13, color: C.TEXT2, fontWeight: '600',
    backgroundColor: C.BORDER, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },
  headerRight: { width: 40 },

  // list
  list:      { padding: 12, paddingBottom: 40 },
  listEmpty: { flex: 1 },

  // card
  card: {
    backgroundColor:  C.CARD,
    borderRadius:     14,
    marginBottom:     12,
    padding:          14,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.07,
    shadowRadius:     8,
    elevation:        3,
  },

  // author row
  authorRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  avatar:         { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  authorName:     { fontSize: 14, fontWeight: '700', color: C.TEXT },
  authorSub:      { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  timeAgo:        { fontSize: 11, color: C.TEXT3 ?? C.TEXT2, marginTop: 1 },

  // type pill
  typePill:     { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  typePillText: { fontSize: 10, fontWeight: '700' },

  // delete button
  deleteBtn:     { paddingVertical: 4, paddingHorizontal: 6 },
  deleteBtnIcon: { fontSize: 18 },

  // content
  content:  { fontSize: 14, color: C.TEXT, lineHeight: 20 },
  readMore: { fontSize: 13, color: C.PRIMARY, fontWeight: '600', marginTop: 4 },

  // media — single item (16:9, full width)
  mediaSingle: {
    borderRadius:    8,
    overflow:        'hidden',
    backgroundColor: C.BORDER,
    marginBottom:    4,
  },
  // media — multi-item thumbnail grid
  mediaRow:       { flexDirection: 'row', gap: 4, marginBottom: 4, height: 120 },
  mediaThumbnail: { flex: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: C.BORDER },
  mediaImage:     { width: '100%', height: '100%' },
  moreOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // video play indicator
  videoPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  videoPlayCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoPlayIcon: { color: '#fff', fontSize: 18, marginLeft: 3 },

  // footer
  footer:   { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  stats:    { flexDirection: 'row', gap: 12 },
  statText: { fontSize: 12, color: C.TEXT2 },

  // empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, marginTop: 60 },
  emptyIcon:  { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.TEXT, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },

  // footer loader
  footerLoader: { paddingVertical: 16, alignItems: 'center' },

  // comments link
  viewComments: { fontSize: 12, color: C.PRIMARY, fontWeight: '600', marginTop: 6 },
});
