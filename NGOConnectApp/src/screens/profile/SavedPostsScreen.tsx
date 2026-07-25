/**
 * SavedPostsScreen
 *
 * Read-only list of posts the current user has saved.
 * Accessible from Profile → MY ACTIVITY → Saved Posts.
 *
 * Features:
 *  - Loads saved posts via GET /api/v1/feed/saved (Post_GetSaved SP)
 *  - Pull-to-refresh
 *  - Infinite scroll pagination
 *  - Optimistic unsave with revert on error
 *  - Graceful empty state
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { feedApi } from '../../api/feed.api';
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

function fmtSavedAt(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `Saved ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } catch { return ''; }
}

// ─── SavedPostCard ────────────────────────────────────────────────────────────
function SavedPostCard({
  item,
  onUnsave,
}: {
  item: Post;
  onUnsave: (postId: number) => void;
}) {
  const meta      = TYPE_META[item.postTypeLkpCode ?? 'GENERAL'] ?? TYPE_META.GENERAL;
  const initials  = (item.authorName ?? 'NA').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const bgColor   = avatarBg(item.postId ?? 0);
  const savedDate = fmtSavedAt(item.savedAt);

  const { width: windowWidth } = useWindowDimensions();
  // card inner width = windowWidth − list padding (12×2) − card padding (14×2)
  const cardInnerWidth = windowWidth - 52;

  // Normalise GROUP_CONCAT CSV → string[]
  const rawMedia  = item.mediaUrls as unknown;
  const mediaUrls: string[] = Array.isArray(rawMedia)
    ? (rawMedia as string[])
    : typeof rawMedia === 'string' && rawMedia
      ? (rawMedia as string).split(',').map((u: string) => u.trim()).filter(Boolean)
      : [];

  // Parallel array of media types ('IMAGE' | 'VIDEO') — defaults to 'IMAGE' if missing
  const rawTypes = item.mediaTypes as unknown;
  const mediaTypes: string[] = typeof rawTypes === 'string' && rawTypes
    ? rawTypes.split(',').map((t: string) => t.trim())
    : [];
  const isVideo = (idx: number) => (mediaTypes[idx] ?? 'IMAGE') === 'VIDEO';

  const content     = item.content ?? '';
  const isLong      = content.length > 200;
  const [expanded,  setExpanded]  = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);   // single-video play state
  const [muted,     setMuted]     = useState(true);    // muted until user unmutes
  const preview     = isLong && !expanded ? content.slice(0, 200) + '…' : content;

  return (
    <View style={s.card}>
      {/* ── Author row ─────────────────────────────────────────────── */}
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
            <Text style={s.authorName}>{item.authorName ?? item.orgName ?? 'NGO'}</Text>
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
          <Text style={s.timeAgo}>{item.timeAgo ?? ''}</Text>
        </View>

        {/* Unsave button */}
        <TouchableOpacity
          style={s.unsaveBtn}
          onPress={() => onUnsave(item.postId!)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Unsave post"
        >
          <Text style={s.unsaveBtnText}>🔖 Unsave</Text>
        </TouchableOpacity>
      </View>

      {/* ── Content ────────────────────────────────────────────────── */}
      {content.length > 0 && (
        <View style={{ marginBottom: mediaUrls.length > 0 ? 8 : 0 }}>
          <Text style={s.content}>{preview}</Text>
          {isLong && (
            <TouchableOpacity onPress={() => setExpanded(e => !e)}>
              <Text style={s.readMore}>{expanded ? 'Show less' : 'Read more'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Media (images + videos) ────────────────────────────────── */}
      {mediaUrls.length > 0 && (
        mediaUrls.length === 1 && isVideo(0) ? (
          /* ── Single video — tap to play/pause, mute toggle when playing ── */
          <TouchableOpacity
            style={[s.singleVideoWrap, { height: Math.round(cardInnerWidth * 9 / 16) }]}
            onPress={() => setIsPlaying(p => !p)}
            activeOpacity={1}
            accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
          >
            <Video
              source={{ uri: mediaUrls[0] }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              paused={!isPlaying}
              muted={muted}
              repeat={true}
              controls={false}
            />
            {/* Play button shown when paused — centered by singleVideoWrap flex */}
            {!isPlaying && (
              <View style={s.videoPlayCircle}>
                <Text style={s.videoPlayIcon}>▶</Text>
              </View>
            )}
            {/* Mute toggle shown while playing */}
            {isPlaying && (
              <TouchableOpacity
                style={s.muteBtn}
                onPress={e => { e.stopPropagation(); setMuted(m => !m); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
              >
                <Text style={s.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ) : (
          /* ── Image(s) or multi-media thumbnail grid ────────────────── */
          <View style={s.mediaRow}>
            {mediaUrls.slice(0, 3).map((url, idx) => (
              <View key={idx} style={[s.mediaThumbnail, mediaUrls.length === 1 && { flex: 1 }]}>
                {isVideo(idx) ? (
                  <>
                    {/* Static first-frame preview for video in a grid thumbnail */}
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
                {/* "+N more" overlay for 4th+ items */}
                {idx === 2 && mediaUrls.length > 3 && (
                  <View style={s.moreOverlay}>
                    <Text style={s.moreText}>+{mediaUrls.length - 3}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )
      )}

      {/* ── Footer: stats + saved date ─────────────────────────────── */}
      <View style={s.footer}>
        <View style={s.stats}>
          <Text style={s.statText}>❤️ {item.likeCount ?? 0}</Text>
          <Text style={s.statText}>💬 {item.commentCount ?? 0}</Text>
        </View>
        {savedDate ? <Text style={s.savedDate}>{savedDate}</Text> : null}
      </View>
    </View>
  );
}

// ─── SavedPostsScreen ─────────────────────────────────────────────────────────
export default function SavedPostsScreen() {
  const nav = useNavigation<any>();

  const [posts,       setPosts]       = useState<Post[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,        setPage]        = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);
  const PAGE_SIZE = 30;

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
      const res = await feedApi.getSavedPosts({ pageNumber: pg, pageSize: PAGE_SIZE });
      if (res.data?.isSuccess && res.data.data) {
        const { items, totalCount: tc } = res.data.data;
        setPosts(pg === 1 ? items : prev => [...prev, ...items]);
        setTotalCount(tc);
        setPage(pg);
      } else {
        if (pg === 1) setPosts([]);
      }
    } catch {
      if (pg === 1) Alert.alert('Error', 'Could not load saved posts. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const onRefresh   = useCallback(() => load(1, true), [load]);
  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) load(page + 1);
  }, [loadingMore, hasMore, page, load]);

  // ── Unsave (optimistic) ───────────────────────────────────────────
  const handleUnsave = useCallback((postId: number) => {
    Alert.alert(
      'Unsave Post',
      'Remove this post from your saved collection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsave',
          style: 'destructive',
          onPress: async () => {
            // Optimistic: remove immediately
            setPosts(prev => prev.filter(p => p.postId !== postId));
            setTotalCount(t => Math.max(0, t - 1));
            try {
              await feedApi.unsavePost(postId);
            } catch {
              // Revert and reload on failure
              load(1);
            }
          },
        },
      ],
    );
  }, [load]);

  // ── Render ────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <SavedPostCard item={item} onUnsave={handleUnsave} />
    ),
    [handleUnsave],
  );

  const ListEmpty = loading ? null : (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🔖</Text>
      <Text style={s.emptyTitle}>No saved posts yet</Text>
      <Text style={s.emptySub}>
        Tap the ••• menu on any post and choose "Save" to bookmark it here.
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

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Saved Posts</Text>
        {totalCount > 0 ? (
          <Text style={s.headerCount}>{totalCount}</Text>
        ) : (
          <View style={s.headerRight} />
        )}
      </View>

      {/* ── Content ────────────────────────────────────────────────── */}
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
  authorRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  avatar:     { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  authorName: { fontSize: 14, fontWeight: '700', color: C.TEXT },
  authorSub:  { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  timeAgo:    { fontSize: 11, color: C.TEXT3 ?? C.TEXT2, marginTop: 1 },

  // type pill
  typePill:     { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  typePillText: { fontSize: 10, fontWeight: '700' },

  // unsave
  unsaveBtn:     { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: `${C.PRIMARY}15` },
  unsaveBtnText: { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },

  // content
  content:   { fontSize: 14, color: C.TEXT, lineHeight: 20 },
  readMore:  { fontSize: 13, color: C.PRIMARY, fontWeight: '600', marginTop: 4 },

  // media
  mediaRow: { flexDirection: 'row', gap: 4, marginBottom: 4, height: 120 },
  mediaThumbnail: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: C.BORDER,
  },
  mediaImage: { width: '100%', height: '100%' },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText:  { color: '#fff', fontSize: 18, fontWeight: '700' },

  // single-video playable container
  singleVideoWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
    backgroundColor: '#000',
    // centers the play circle (Video is absoluteFill → out of flex flow)
    alignItems: 'center',
    justifyContent: 'center',
  },

  // video play indicator (grid thumbnails use the overlay wrapper; single video uses flex centering)
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayIcon: { color: '#fff', fontSize: 18, marginLeft: 3 },

  // mute toggle — bottom-right corner while video is playing
  muteBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtnText: { fontSize: 16 },

  // footer
  footer:    { flexDirection: 'row', alignItems: 'center', marginTop: 10, justifyContent: 'space-between' },
  stats:     { flexDirection: 'row', gap: 12 },
  statText:  { fontSize: 12, color: C.TEXT2 },
  savedDate: { fontSize: 11, color: C.TEXT3 ?? C.TEXT2, fontStyle: 'italic' },

  // empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, marginTop: 60 },
  emptyIcon:  { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.TEXT, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },

  // footer loader
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
});
