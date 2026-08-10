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
  pinAdminCommunityPost,
  deleteCommunityPost,
} from '../../api/community.api';
import { useAdminStore } from '../../store/adminStore';
import { useAuthStore }  from '../../store/authStore';
import NewPostModal      from '../../components/community/NewPostModal';
import type { CommunityPost } from '../../types/api.types';

const C = AppConfig.COLORS;

// ── Post type meta ────────────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ANNOUNCEMENT:      { label: 'Announcement',      icon: '📢', color: '#7C3AED', bg: '#F5F3FF' },
  DISCUSSION:        { label: 'Discussion',        icon: '💬', color: '#374151', bg: '#F3F4F6' },
  QUESTION:          { label: 'Question',          icon: '❓', color: '#0369A1', bg: '#EFF6FF' },
  POLL:              { label: 'Poll',              icon: '📊', color: '#0D9488', bg: '#F0FDFA' },
  EVENT_UPDATE:      { label: 'Event Update',      icon: '📅', color: '#047857', bg: '#ECFDF5' },
  VOLUNTEER_REQUEST: { label: 'Volunteer Request', icon: '🙋', color: C.PRIMARY,  bg: `${C.PRIMARY}15` },
  TASK:              { label: 'Task',              icon: '✅', color: '#92400E', bg: '#FFFBEB' },
  RESOURCE:          { label: 'Resource',          icon: '📎', color: '#6B7280', bg: '#F9FAFB' },
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
  item, onAck, onVote, onPin, onDelete,
}: {
  item:     CommunityPost;
  onAck:    (id: number) => void;
  onVote:   (postId: number, optionId: number) => void;
  onPin:    (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const typeCode = item.postTypeLkpCode ?? item.postType ?? 'DISCUSSION';
  const meta     = TYPE_META[typeCode] ?? TYPE_META.DISCUSSION;
  const isAnn    = typeCode === 'ANNOUNCEMENT';
  const isPoll   = typeCode === 'POLL';
  const avColor  = avatarColor(item.fullName ?? 'NG');
  const avInit   = initials(item.fullName ?? 'NG');
  const totalVotes = item.pollOptions?.reduce((s, o) => s + (o.voteCount ?? 0), 0) ?? 0;

  return (
    <View style={styles.card}>

      {/* ── Pinned banner ───────────────────────────────────────────────── */}
      {item.isPinned && (
        <View style={styles.pinnedBanner}>
          <Text style={styles.pinnedBannerText}>📌  Pinned Post</Text>
        </View>
      )}

      {/* ── Type chip row ────────────────────────────────────────────────── */}
      <View style={[styles.typeRow, { backgroundColor: meta.bg }]}>
        <View style={styles.typeChip}>
          <Text style={styles.typeIcon}>{meta.icon}</Text>
          <Text style={[styles.typeText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
        </View>

        {/* Admin action buttons */}
        <View style={styles.adminActions}>
          <TouchableOpacity
            style={[styles.actionBtn, item.isPinned ? styles.actionBtnPinActive : styles.actionBtnPin]}
            onPress={() => onPin(item.communityPostId)}
            accessibilityLabel={item.isPinned ? 'Unpin post' : 'Pin post'}
          >
            <Text style={styles.actionBtnIcon}>📌</Text>
            <Text style={[styles.actionBtnLabel, item.isPinned && { color: '#B45309' }]}>
              {item.isPinned ? 'Unpin' : 'Pin'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnDelete}
            onPress={() => onDelete(item.communityPostId)}
            accessibilityLabel="Delete post"
          >
            <Text style={styles.actionBtnIcon}>🗑️</Text>
            <Text style={styles.actionBtnDeleteLabel}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Card body ────────────────────────────────────────────────────── */}
      <View style={styles.cardBody}>

        {/* Author row */}
        <View style={styles.authorRow}>
          <View style={[styles.avatar, { backgroundColor: avColor }]}>
            <Text style={styles.avatarText}>{avInit}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Text style={styles.authorName}>{item.fullName}</Text>
              {item.roleName ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{item.roleName}</Text>
                </View>
              ) : null}
              {item.audienceCode === 'ADMINS_ONLY' ? (
                <View style={styles.audienceBadge}>
                  <Text style={styles.audienceBadgeText}>Admins only</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.postTime}>{item.timeAgo ?? item.createdAt?.slice(0, 10)}</Text>
          </View>
        </View>

        {/* Title */}
        {item.title ? <Text style={styles.postTitle}>{item.title}</Text> : null}

        {/* Content */}
        {item.content ? (
          <Text style={styles.postContent}>{item.content}</Text>
        ) : null}

        {/* ── Poll options ─────────────────────────────────────────────────── */}
        {isPoll && item.pollOptions && item.pollOptions.length > 0 && (
          <View style={styles.pollBlock}>
            <Text style={styles.pollMeta}>
              {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
              {item.expiresAt ? `  ·  Ends ${item.expiresAt?.slice(0, 10)}` : ''}
            </Text>
            {item.pollOptions.map((opt) => {
              const pct = totalVotes > 0 ? Math.round(((opt.voteCount ?? 0) / totalVotes) * 100) : 0;
              return (
                <TouchableOpacity
                  key={opt.pollOptionId}
                  style={styles.pollOption}
                  onPress={() => onVote(item.communityPostId, opt.pollOptionId)}
                  accessibilityLabel={opt.optionText}
                >
                  <View style={[styles.pollFill, {
                    width: `${pct}%` as any,
                    backgroundColor: opt.isVoted ? `${C.PRIMARY}28` : `${C.BORDER}80`,
                  }]} />
                  <Text style={[styles.pollLabel, opt.isVoted && { color: C.PRIMARY, fontWeight: '700' }]}>
                    {opt.isVoted ? '✓ ' : ''}{opt.optionText}
                  </Text>
                  <Text style={[styles.pollPct, opt.isVoted && { color: C.PRIMARY }]}>{pct}%</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Announcement: acknowledge ────────────────────────────────────── */}
        {isAnn && (
          <View style={styles.ackRow}>
            <TouchableOpacity
              style={[styles.ackBtn, item.isAcknowledged && styles.ackBtnDone]}
              onPress={() => onAck(item.communityPostId)}
            >
              <Text style={[styles.ackBtnText, item.isAcknowledged && { color: '#15803D' }]}>
                {item.isAcknowledged ? '✓  Acknowledged' : 'Acknowledge'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.ackCount}>{(item.acknowledgeCount ?? 0)} acknowledged</Text>
          </View>
        )}
      </View>

      {/* ── Footer: read-only stats ───────────────────────────────────────── */}
      <View style={styles.cardFooter}>
        <View style={styles.statChip}>
          <Text style={[styles.statChipText, (item.likeCount ?? 0) > 0 && styles.statChipActive]}>
            {'❤️  ' + (item.likeCount ?? 0) + ' Like' + ((item.likeCount ?? 0) !== 1 ? 's' : '')}
          </Text>
        </View>
        <View style={styles.footerDivider} />
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>
            {'💬  ' + (item.commentCount ?? 0) + ' Comment' + ((item.commentCount ?? 0) !== 1 ? 's' : '')}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AdminCommunityScreen() {
  const insets          = useSafeAreaInsets();
  const { selectedOrg } = useAdminStore();
  const user            = useAuthStore((s) => s.user);

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

  const handleAck = useCallback(async (communityPostId: number) => {
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === communityPostId
        ? { ...p,
            isAcknowledged:   !p.isAcknowledged,
            acknowledgeCount: p.isAcknowledged ? (p.acknowledgeCount ?? 1) - 1 : (p.acknowledgeCount ?? 0) + 1,
          }
        : p,
    ));
    try { await acknowledgePost(communityPostId); } catch { /* silent */ }
  }, []);

  const handleVote = useCallback(async (postId: number, pollOptionId: number) => {
    setPosts((prev) => prev.map((p) => {
      if (p.communityPostId !== postId || !p.pollOptions) { return p; }
      const alreadyVoted = p.pollOptions.some((o) => o.isVoted);
      if (alreadyVoted) { return p; }
      const newTotal = p.pollOptions.reduce((s, o) => s + (o.voteCount ?? 0), 0) + 1;
      return {
        ...p,
        pollOptions: p.pollOptions.map((o) => ({
          ...o,
          isVoted:   o.pollOptionId === pollOptionId,
          voteCount: o.pollOptionId === pollOptionId ? (o.voteCount ?? 0) + 1 : (o.voteCount ?? 0),
          votePct:   ((o.pollOptionId === pollOptionId ? (o.voteCount ?? 0) + 1 : (o.voteCount ?? 0)) / newTotal) * 100,
        })),
      };
    }));
    try { await voteOnPoll(postId, pollOptionId); } catch { /* silent */ }
  }, []);

  // ── Pin — correct endpoint: POST /org/{orgId}/community-posts/{postId}/pin ──
  const handlePin = useCallback(async (postId: number) => {
    // Optimistic toggle
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === postId ? { ...p, isPinned: !p.isPinned } : p,
    ));
    try {
      const res = await pinAdminCommunityPost(orgId, postId);
      if (res.data?.isSuccess !== 1) {
        // Revert on API failure
        setPosts((prev) => prev.map((p) =>
          p.communityPostId === postId ? { ...p, isPinned: !p.isPinned } : p,
        ));
        Alert.alert('Error', res.data?.message ?? 'Could not update pin.');
      }
    } catch {
      setPosts((prev) => prev.map((p) =>
        p.communityPostId === postId ? { ...p, isPinned: !p.isPinned } : p,
      ));
      Alert.alert('Error', 'Network error. Please try again.');
    }
  }, [orgId]);

  const handleDelete = useCallback((postId: number) => {
    Alert.alert(
      'Delete Post',
      'This will permanently remove the post for all members. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setPosts((prev) => prev.filter((p) => p.communityPostId !== postId));
            setTotalCount((n) => Math.max(0, n - 1));
            try {
              const res = await deleteCommunityPost(postId);
              if (res.data?.isSuccess !== 1) {
                Alert.alert('Error', res.data?.message ?? 'Could not delete.');
                fetchFeed(1);
              }
            } catch {
              Alert.alert('Error', 'Network error. Please try again.');
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Community</Text>
          <Text style={styles.headerSub}>Admin · {orgName}</Text>
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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <CommunityCard
              item={item}
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
              ? <ActivityIndicator size="small" color={C.PRIMARY} style={{ marginVertical: 14 }} />
              : null
          }
          ListHeaderComponent={
            posts.length > 0 ? (
              <Text style={styles.feedCount}>
                {totalCount} post{totalCount !== 1 ? 's' : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📢</Text>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>
                Create announcements, polls, or discussions for your community members
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setShowModal(true)}
                accessibilityLabel="Create Post"
              >
                <Text style={styles.emptyBtnText}>+ Create Post</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* ── New Post Modal ──────────────────────────────────────────────── */}
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

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  headerTitle:    { fontSize: 16, fontWeight: '800', color: C.TEXT },
  headerSub:      { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  newPostBtn:     { backgroundColor: C.PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newPostBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // List
  list:      { padding: 12 },
  feedCount: { fontSize: 12, color: C.TEXT2, marginBottom: 6, marginLeft: 2 },

  // Card shell
  card: {
    backgroundColor: C.CARD,
    borderRadius:    14,
    marginBottom:    12,
    overflow:        'hidden',
    elevation:       2,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.07,
    shadowRadius:    4,
  },

  // Pinned banner
  pinnedBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  pinnedBannerText: { fontSize: 11, color: '#92400E', fontWeight: '700' },

  // Type chip row
  typeRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  typeChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  typeIcon:     { fontSize: 12 },
  typeText:     { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Admin action buttons
  adminActions:        { flexDirection: 'row', gap: 8 },
  actionBtn:           { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  actionBtnPin:        { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  actionBtnPinActive:  { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  actionBtnDelete:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  actionBtnIcon:       { fontSize: 11 },
  actionBtnLabel:      { fontSize: 11, color: '#92400E', fontWeight: '700' },
  actionBtnDeleteLabel:{ fontSize: 11, color: '#DC2626', fontWeight: '700' },

  // Card body
  cardBody:   { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6 },

  // Author
  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  avatar:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  authorName: { fontSize: 12, fontWeight: '700', color: C.TEXT },
  postTime:   { fontSize: 10, color: C.TEXT2, marginTop: 1 },

  roleBadge:     { backgroundColor: `${C.YELLOW ?? '#F59E0B'}22`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, color: '#92400E', fontWeight: '700' },
  audienceBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  audienceBadgeText: { fontSize: 10, color: '#1D4ED8', fontWeight: '600' },

  // Content
  postTitle:   { fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  postContent: { fontSize: 13, color: C.TEXT2, lineHeight: 18, marginBottom: 6 },

  // Poll
  pollBlock:   { marginBottom: 8, marginTop: 4 },
  pollMeta:    { fontSize: 11, color: C.TEXT2, marginBottom: 8 },
  pollOption:  { position: 'relative', borderWidth: 1, borderColor: C.BORDER, borderRadius: 10, padding: 10, marginBottom: 6, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', minHeight: 40 },
  pollFill:    { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 10 },
  pollLabel:   { flex: 1, fontSize: 12, color: C.TEXT, zIndex: 1 },
  pollPct:     { fontSize: 11, color: C.TEXT2, fontWeight: '700', minWidth: 32, textAlign: 'right', zIndex: 1 },

  // Acknowledge
  ackRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  ackBtn:     { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  ackBtnDone: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  ackBtnText: { fontSize: 12, fontWeight: '700', color: '#15803D' },
  ackCount:   { fontSize: 11, color: C.TEXT2 },

  // Footer — read-only stats
  cardFooter:    { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.BORDER },
  statChip:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  statChipText:  { fontSize: 12, color: C.TEXT2, fontWeight: '500' },
  statChipActive:{ color: '#EF4444' },
  footerDivider: { width: 1, backgroundColor: C.BORDER, marginVertical: 6 },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 28 },
  emptyIcon:      { fontSize: 44, marginBottom: 14 },
  emptyTitle:     { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 6, textAlign: 'center' },
  emptySub:       { fontSize: 13, color: C.TEXT2, textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  emptyBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
});
