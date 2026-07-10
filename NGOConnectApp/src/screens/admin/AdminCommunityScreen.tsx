import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppConfig from '../../config/AppConfig';
import {
  getCommunityFeed,
  acknowledgePost,
  voteOnPoll,
  pinCommunityPost,
  deleteCommunityPost,
} from '../../api/community.api';
import { useAdminStore } from '../../store/adminStore';
import { useAuthStore }  from '../../store/authStore';
import NewPostModal      from '../../components/community/NewPostModal';
import type { CommunityPost } from '../../types/api.types';

const C = AppConfig.COLORS;

// ── Post type colour map ──────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  ANNOUNCEMENT:      { label: 'Announcement',      color: '#7C3AED', bg: '#F5F3FF' },
  DISCUSSION:        { label: 'Discussion',        color: '#374151', bg: '#F3F4F6' },
  QUESTION:          { label: 'Question',          color: '#0369A1', bg: '#EFF6FF' },
  POLL:              { label: 'Poll',              color: '#0D9488', bg: '#F0FDFA' },
  EVENT_UPDATE:      { label: 'Event Update',      color: '#047857', bg: '#ECFDF5' },
  VOLUNTEER_REQUEST: { label: 'Volunteer Request', color: C.PRIMARY, bg: `${C.PRIMARY}15` },
  TASK:              { label: 'Task',              color: '#92400E', bg: '#FFFBEB' },
  RESOURCE:          { label: 'Resource',          color: '#6B7280', bg: '#F9FAFB' },
};

const AVATAR_COLORS = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#16A34A'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length; }
  return AVATAR_COLORS[Math.abs(h)];
}
function initials(name: string) {
  return (name || 'NG').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Community card ────────────────────────────────────────────────────────────
function CommunityCard({
  item, onLike, onAck, onVote, onPin, onDelete,
}: {
  item: CommunityPost;
  onLike:   (id: number) => void;
  onAck:    (id: number) => void;
  onVote:   (postId: number, optionId: number) => void;
  onPin:    (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const typeCode = item.postTypeLkpCode ?? item.postType ?? 'DISCUSSION';
  const meta     = TYPE_META[typeCode] ?? TYPE_META.DISCUSSION;
  const isAnn    = typeCode === 'ANNOUNCEMENT';
  const isPoll   = typeCode === 'POLL';
  const avColor  = avatarColor(item.fullName);
  const avInit   = initials(item.fullName);

  const totalVotes = item.pollOptions?.reduce((s, o) => s + o.voteCount, 0) ?? 0;

  return (
    <View style={styles.card}>
      {/* Type chip + admin actions */}
      <View style={[styles.typeRow, { backgroundColor: meta.bg }]}>
        <Text style={[styles.typeText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
        {item.isPinned && <Text style={styles.pinnedBadge}>Pinned</Text>}
        <View style={styles.adminActions}>
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => onPin(item.communityPostId, !item.isPinned)}
            accessibilityLabel={item.isPinned ? 'Unpin post' : 'Pin post'}
          >
            <Text style={[styles.adminBtnText, item.isPinned && { color: '#D97706' }]}>
              {item.isPinned ? 'Unpin' : 'Pin'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => onDelete(item.communityPostId)}
            accessibilityLabel="Delete post"
          >
            <Text style={[styles.adminBtnText, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardBody}>
        {/* Author */}
        <View style={styles.authorRow}>
          <View style={[styles.avatar, { backgroundColor: avColor }]}>
            <Text style={styles.avatarText}>{avInit}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Text style={styles.authorName}>{item.fullName}</Text>
              {item.roleName && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{item.roleName}</Text>
                </View>
              )}
            </View>
            <Text style={styles.postTime}>{item.timeAgo ?? item.createdAt?.slice(0, 10)}</Text>
          </View>
        </View>

        {/* Title */}
        {item.title ? <Text style={styles.postTitle}>{item.title}</Text> : null}

        {/* Content */}
        {item.content ? <Text style={styles.postContent} numberOfLines={4}>{item.content}</Text> : null}

        {/* Poll options */}
        {isPoll && item.pollOptions && (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.pollSubtext}>{totalVotes + ' votes'}</Text>
            {item.pollOptions.map((opt) => (
              <TouchableOpacity
                key={opt.pollOptionId}
                style={styles.pollOption}
                onPress={() => onVote(item.communityPostId, opt.pollOptionId)}
                accessibilityLabel={opt.optionText}
              >
                <View style={[styles.pollFill, {
                  width: `${opt.votePct}%` as any,
                  backgroundColor: opt.isVoted ? `${C.PRIMARY}30` : C.BG,
                }]} />
                <Text style={[styles.pollLabel, opt.isVoted && { color: C.PRIMARY, fontWeight: '700' }]}>
                  {opt.optionText}
                </Text>
                <Text style={styles.pollPct}>{Math.round(opt.votePct) + '%'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Acknowledge for announcements */}
        {isAnn && (
          <View style={styles.ackRow}>
            <TouchableOpacity
              style={[styles.ackBtn, item.isAcknowledged && styles.ackBtnDone]}
              onPress={() => onAck(item.communityPostId)}
            >
              <Text style={[styles.ackBtnText, item.isAcknowledged && { color: '#15803D' }]}>
                {item.isAcknowledged ? 'Acknowledged' : 'Acknowledge'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.ackCount}>{item.acknowledgeCount + ' acknowledged'}</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => onLike(item.communityPostId)}
          accessibilityLabel="Like"
        >
          <Text style={[styles.footerBtnText, item.isLiked && { color: '#EF4444' }]}>
            {item.isLiked ? 'Liked' : 'Like'} {item.likeCount}
          </Text>
        </TouchableOpacity>
        <View style={styles.footerDivider} />
        <TouchableOpacity style={styles.footerBtn} accessibilityLabel="Comments">
          <Text style={styles.footerBtnText}>Comments {item.commentCount}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AdminCommunityScreen() {
  const insets         = useSafeAreaInsets();
  const { selectedOrg } = useAdminStore();
  const user           = useAuthStore((s) => s.user);

  const orgId   = selectedOrg?.orgId ?? 0;
  const orgName = selectedOrg?.orgName ?? (selectedOrg as any)?.name ?? 'NGO';

  const [posts,       setPosts]       = useState<CommunityPost[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,        setPage]        = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);
  const [showModal,   setShowModal]   = useState(false);

  const fetchFeed = useCallback(async (pg: number, refresh = false) => {
    if (!orgId) { setLoading(false); return; }
    if (pg === 1) { refresh ? setRefreshing(true) : setLoading(true); }
    else          { setLoadingMore(true); }
    try {
      const res = await getCommunityFeed(orgId, { pageNumber: pg, pageSize: 15 });
      if (res.data?.isSuccess && res.data.data) {
        const { items, totalCount: tc } = res.data.data;
        setPosts(pg === 1 ? items : (prev) => [...prev, ...items]);
        setTotalCount(tc);
        setPage(pg);
      }
    } catch { /* silent */ }
    finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [orgId]);

  useEffect(() => { fetchFeed(1); }, [fetchFeed]);

  const handleLike = useCallback((postId: number) => {
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === postId
        ? { ...p, isLiked: !p.isLiked, likeCount: p.isLiked ? p.likeCount - 1 : p.likeCount + 1 }
        : p,
    ));
  }, []);

  const handleAck = useCallback(async (communityPostId: number) => {
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === communityPostId
        ? { ...p, isAcknowledged: !p.isAcknowledged, acknowledgeCount: p.isAcknowledged ? p.acknowledgeCount - 1 : p.acknowledgeCount + 1 }
        : p,
    ));
    try { await acknowledgePost(communityPostId); } catch { /* silent */ }
  }, []);

  const handleVote = useCallback(async (postId: number, pollOptionId: number) => {
    setPosts((prev) => prev.map((p) => {
      if (p.communityPostId !== postId || !p.pollOptions) { return p; }
      const total = p.pollOptions.reduce((s, o) => s + o.voteCount, 0) + 1;
      return {
        ...p,
        pollOptions: p.pollOptions.map((o) => ({
          ...o,
          isVoted: o.pollOptionId === pollOptionId,
          voteCount: o.pollOptionId === pollOptionId ? o.voteCount + 1 : o.voteCount,
          votePct: ((o.pollOptionId === pollOptionId ? o.voteCount + 1 : o.voteCount) / total) * 100,
        })),
      };
    }));
    try { await voteOnPoll(postId, pollOptionId); } catch { /* silent */ }
  }, []);

  const handlePin = useCallback(async (postId: number, pinned: boolean) => {
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === postId ? { ...p, isPinned: pinned } : p,
    ));
    try {
      const res = await pinCommunityPost(postId, pinned);
      if (res.data?.isSuccess !== 1) {
        Alert.alert('Error', res.data?.message || 'Could not update pin.');
        setPosts((prev) => prev.map((p) =>
          p.communityPostId === postId ? { ...p, isPinned: !pinned } : p,
        ));
      }
    } catch {
      Alert.alert('Error', 'Network error. Try again.');
      setPosts((prev) => prev.map((p) =>
        p.communityPostId === postId ? { ...p, isPinned: !pinned } : p,
      ));
    }
  }, []);

  const handleDelete = useCallback((postId: number) => {
    Alert.alert(
      'Delete Post',
      'This will permanently remove the post. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setPosts((prev) => prev.filter((p) => p.communityPostId !== postId));
            setTotalCount((n) => n - 1);
            try {
              const res = await deleteCommunityPost(postId);
              if (res.data?.isSuccess !== 1) {
                Alert.alert('Error', res.data?.message || 'Could not delete.');
                fetchFeed(1); // reload if API failed
              }
            } catch {
              Alert.alert('Error', 'Network error. Try again.');
              fetchFeed(1);
            }
          },
        },
      ],
    );
  }, [fetchFeed]);

  const handlePosted = useCallback(() => {
    setShowModal(false);
    fetchFeed(1, true);
  }, [fetchFeed]);

  const handleLoadMore = () => {
    if (!loadingMore && posts.length < totalCount) { fetchFeed(page + 1); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Community</Text>
          <Text style={styles.headerSub}>{'Admin - ' + orgName}</Text>
        </View>
        <TouchableOpacity
          style={styles.newPostBtn}
          onPress={() => setShowModal(true)}
          accessibilityLabel="New Post"
        >
          <Text style={styles.newPostBtnText}>+ New Post</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => String(p.communityPostId)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          renderItem={({ item }) => (
            <CommunityCard
              item={item}
              onLike={handleLike}
              onAck={handleAck}
              onVote={handleVote}
              onPin={handlePin}
              onDelete={handleDelete}
            />
          )}
          onRefresh={() => fetchFeed(1, true)}
          refreshing={refreshing}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator size="small" color={C.PRIMARY} style={{ marginVertical: 12 }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{'📢'}</Text>
              <Text style={styles.emptyTitle}>Create your next announcement</Text>
              <Text style={styles.emptySub}>Notify all members about updates, events and news</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setShowModal(true)}
                accessibilityLabel="Create Announcement"
              >
                <Text style={styles.emptyBtnText}>Create Announcement</Text>
              </TouchableOpacity>
            </View>
          }
          ListHeaderComponent={
            posts.length > 0 ? (
              <View style={styles.feedHeader}>
                <Text style={styles.feedHeaderText}>
                  {totalCount + ' post' + (totalCount !== 1 ? 's' : '')}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* New Post Modal */}
      <NewPostModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onPosted={handlePosted}
        orgId={orgId}
        orgName={orgName}
        userName={user ? ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || 'Admin' : 'Admin'}
        userRole="Admin"
        isAdmin
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.BG },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  headerTitle:    { fontSize: 16, fontWeight: '800', color: C.TEXT },
  headerSub:      { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  newPostBtn:     { backgroundColor: C.PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newPostBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  list:       { padding: 10 },
  feedHeader: { marginBottom: 4 },
  feedHeaderText: { fontSize: 12, color: C.TEXT2 },

  card:       { backgroundColor: C.CARD, borderRadius: 14, marginBottom: 10, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  typeRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 },
  typeText:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  pinnedBadge: { fontSize: 10, color: '#D97706', fontWeight: '600', marginRight: 8 },
  adminActions: { flexDirection: 'row', gap: 10 },
  adminBtn:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.CARD },
  adminBtnText: { fontSize: 11, color: C.TEXT2, fontWeight: '600' },

  cardBody:   { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4 },
  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  avatar:     { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  authorName: { fontSize: 12, fontWeight: '700', color: C.TEXT },
  roleBadge:  { backgroundColor: `${C.YELLOW ?? '#F59E0B'}25`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, color: '#92400E', fontWeight: '700' },
  postTime:   { fontSize: 10, color: C.TEXT2 },
  postTitle:  { fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  postContent: { fontSize: 12, color: C.TEXT2, lineHeight: 17, marginBottom: 8 },

  pollSubtext: { fontSize: 11, color: C.TEXT2, marginBottom: 6 },
  pollOption: { position: 'relative', borderWidth: 1, borderColor: C.BORDER, borderRadius: 8, padding: 9, marginBottom: 5, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  pollFill:   { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 8 },
  pollLabel:  { flex: 1, fontSize: 12, color: C.TEXT },
  pollPct:    { fontSize: 11, color: C.TEXT2, fontWeight: '700', minWidth: 30, textAlign: 'right' },

  ackRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  ackBtn:     { backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  ackBtnDone: { backgroundColor: '#DCFCE7' },
  ackBtnText: { fontSize: 12, fontWeight: '700', color: '#15803D' },
  ackCount:   { fontSize: 11, color: C.TEXT2 },

  cardFooter:    { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.BORDER },
  footerBtn:     { flex: 1, alignItems: 'center', paddingVertical: 10 },
  footerBtnText: { fontSize: 12, color: C.TEXT2 },
  footerDivider: { width: 1, backgroundColor: C.BORDER, marginVertical: 6 },

  emptyContainer: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon:      { fontSize: 40, marginBottom: 12, color: C.TEXT2 },
  emptyTitle:     { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 6, textAlign: 'center' },
  emptySub:       { fontSize: 13, color: C.TEXT2, textAlign: 'center', marginBottom: 18 },
  emptyBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
});
