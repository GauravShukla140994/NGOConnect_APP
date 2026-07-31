import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import AppConfig from '../../config/AppConfig';
import { getCommunityFeed, acknowledgePost, voteOnPoll, likePost } from '../../api/community.api';
import { feedApi } from '../../api/feed.api';
import { sosApi } from '../../api/sos.api';
import { getMyOrgs } from '../../api/user.api';
import { notificationApi } from '../../api/notification.api';
import { useAuthStore }  from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import NewPostModal             from '../../components/community/NewPostModal';
import CommunityCommentsModal   from '../../components/community/CommunityCommentsModal';
import ComposeFab               from '../../components/common/ComposeFab';
import CommunityPostCard        from '../../components/community/CommunityPostCard';
import type { CommunityPost } from '../../types/api.types';

const C = AppConfig.COLORS;

// ── SOS Alert card (active + history) ────────────────────────────────────────

const SOS_TYPE_META: Record<string, { emoji: string; color: string; bg: string }> = {
  SOS_ALERT:         { emoji: '🚨', color: '#EF4444', bg: '#FEF2F2' },
  HELP_REQUEST:      { emoji: '🆘', color: '#F59E0B', bg: '#FFFBEB' },
  MISSING_VOLUNTEER: { emoji: '🔍', color: '#6B4EFF', bg: '#EEF0FF' },
  SAFE_ARRIVAL:      { emoji: '✅', color: '#10B981', bg: '#ECFDF5' },
};

// Status badge config: ACTIVE gets a red pulsing badge; others get muted variants
const SOS_STATUS_META: Record<string, { label: string; dot: string; pillBg: string; dotColor: string; textColor: string }> = {
  ACTIVE:    { label: 'ACTIVE',     dot: '●', pillBg: '#FEF2F2', dotColor: '#EF4444', textColor: '#EF4444' },
  RESOLVED:  { label: 'RESOLVED',  dot: '✓', pillBg: '#ECFDF5', dotColor: '#10B981', textColor: '#059669' },
  CANCELLED: { label: 'CANCELLED', dot: '✕', pillBg: '#F3F4F6', dotColor: '#6B7280', textColor: '#6B7280' },
};

// Server returns UTC datetimes without 'Z'. Without this, JS treats them as local
// time causing wrong "time ago" on every timezone. Appending 'Z' forces UTC parse.
function asUtc(iso: string): Date {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
}

function timeAgoShort(iso: string | undefined): string {
  if (!iso) { return ''; }
  const diff = Math.floor((Date.now() - asUtc(iso).getTime()) / 1000);
  if (diff < 60)    { return 'just now'; }
  if (diff < 3600)  { return `${Math.floor(diff / 60)}m ago`; }
  if (diff < 86400) { return `${Math.floor(diff / 3600)}h ago`; }
  const d = Math.floor(diff / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

// ── Distance helpers ──────────────────────────────────────────────────────────

/** Haversine formula — returns distance in metres between two GPS coordinates */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R  = 6371000; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format metres → "400 m away" or "2.3 km away" */
function formatDistance(metres: number): string {
  if (metres < 1000) {
    // Round to nearest 50 m so it doesn't look falsely precise
    const rounded = Math.max(50, Math.round(metres / 50) * 50);
    return `${rounded} m away`;
  }
  return `${(metres / 1000).toFixed(1)} km away`;
}

type UserLocation = { latitude: number; longitude: number };

// ── SOS Alert card ────────────────────────────────────────────────────────────

function SosAlertCard({ incident, onAssist, onViewDetails, onViewMap, userLocation, currentUserId }: {
  incident:      any;
  onAssist:      (id: number) => void;
  onViewDetails: (id: number) => void;
  onViewMap:     (id: number) => void;
  userLocation:  UserLocation | null;
  currentUserId: number | null | undefined;
}) {
  const typeMeta    = SOS_TYPE_META[incident.alertType]  ?? { emoji: '⚠️', color: '#EF4444', bg: '#FEF2F2' };
  const statusCode  = (incident.status as string)?.toUpperCase() ?? 'ACTIVE';
  const statusMeta  = SOS_STATUS_META[statusCode] ?? SOS_STATUS_META.ACTIVE;
  const isActive    = statusCode === 'ACTIVE';
  // Current user's responder status for this incident
  const myStatus    = (incident.myApprovalStatus as string | null | undefined)?.toUpperCase() ?? null;
  // Hide assist controls if the current user IS the SOS victim
  const isOwnAlert  = currentUserId != null && Number(incident.userId) === currentUserId;

  // ── Distance calculation (only for active cards with known coordinates) ──────
  let distanceLine: string | null = null;
  if (
    isActive &&
    userLocation &&
    incident.latitude  != null && incident.latitude  !== 0 &&
    incident.longitude != null && incident.longitude !== 0
  ) {
    const metres = haversineDistance(
      userLocation.latitude,  userLocation.longitude,
      Number(incident.latitude), Number(incident.longitude),
    );
    distanceLine = `📍 ${formatDistance(metres)}  ·  ${timeAgoShort(incident.createdAt)}`;
  }

  const borderColor = isActive ? typeMeta.color : '#D1D5DB';

  return (
    <View style={[sosStyles.card, { borderLeftColor: borderColor, opacity: isActive ? 1 : 0.88 }]}>
      {/* Top row: type pill + status badge */}
      <View style={sosStyles.topRow}>
        <View style={[sosStyles.typePill, { backgroundColor: typeMeta.bg }]}>
          <Text style={sosStyles.typeEmoji}>{typeMeta.emoji}</Text>
          <Text style={[sosStyles.typeLabel, { color: typeMeta.color }]}>
            {incident.alertTypeName ?? incident.alertType}
          </Text>
        </View>
        <View style={[sosStyles.statusPill, { backgroundColor: statusMeta.pillBg }]}>
          <Text style={[sosStyles.statusDot, { color: statusMeta.dotColor }]}>{statusMeta.dot}</Text>
          <Text style={[sosStyles.statusText, { color: statusMeta.textColor }]}>{statusMeta.label}</Text>
        </View>
      </View>

      {/* Who */}
      <Text style={sosStyles.authorName}>
        {incident.userName ?? 'A member'}
        {isActive ? ' needs help' : '  ·  ' + timeAgoShort(incident.createdAt)}
      </Text>

      {/* Distance + time ago — shown for active cards with known coordinates */}
      {distanceLine
        ? <Text style={sosStyles.distanceLine}>{distanceLine}</Text>
        : null}
      {/* Location name — always shown when available (below distance, or alone as fallback) */}
      {incident.approxLocation
        ? <Text style={sosStyles.location}>
            {distanceLine ? '' : '📍 '}{incident.approxLocation}
          </Text>
        : null}

      {incident.description
        ? <Text style={sosStyles.description} numberOfLines={2}>{incident.description}</Text>
        : null}

      {/* History-only notes */}
      {!isActive && statusCode === 'CANCELLED' && incident.cancelReason
        ? <Text style={sosStyles.historyNote}>Reason: {incident.cancelReason}</Text>
        : null}
      {!isActive && statusCode === 'RESOLVED' && incident.resolvedAt
        ? <Text style={sosStyles.historyNote}>Resolved {timeAgoShort(incident.resolvedAt)}</Text>
        : null}

      {/* Actions */}
      <View style={sosStyles.actionRow}>
        {/* Assist / Map button — only for active alerts that aren't the user's own */}
        {isActive && !isOwnAlert && (
          myStatus === 'APPROVED'
            ? <TouchableOpacity
                style={[sosStyles.assistBtn, { backgroundColor: '#3B82F6' }]}
                onPress={() => onViewMap(incident.sosIncidentId)}
                accessibilityLabel="View map"
              >
                <Text style={sosStyles.assistBtnTxt}>🗺️ View Map</Text>
              </TouchableOpacity>
            : myStatus === 'PENDING'
              ? <View style={[sosStyles.assistBtn, { backgroundColor: '#9CA3AF' }]}>
                  <Text style={sosStyles.assistBtnTxt}>⏳ Requested</Text>
                </View>
              : myStatus === 'REJECTED'
                ? <View style={[sosStyles.assistBtn, { backgroundColor: '#F3F4F6' }]}>
                    <Text style={[sosStyles.assistBtnTxt, { color: '#9CA3AF' }]}>Declined</Text>
                  </View>
                : <TouchableOpacity
                    style={[sosStyles.assistBtn, { backgroundColor: typeMeta.color }]}
                    onPress={() => onAssist(incident.sosIncidentId)}
                    accessibilityLabel="I can assist"
                  >
                    <Text style={sosStyles.assistBtnTxt}>🙋 I Can Assist</Text>
                  </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[sosStyles.detailBtn, (!isActive || isOwnAlert) && { flex: 1 }]}
          onPress={() => onViewDetails(incident.sosIncidentId)}
          accessibilityLabel="View details"
        >
          <Text style={sosStyles.detailBtnTxt}>View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sosStyles = StyleSheet.create({
  card:         { backgroundColor: C.CARD, borderRadius: 14, marginBottom: 10, padding: 14, borderLeftWidth: 4, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  topRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  typePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  typeEmoji:    { fontSize: 14 },
  typeLabel:    { fontSize: 12, fontWeight: '700' },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusDot:    { fontSize: 9, fontWeight: '800' },
  statusText:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  authorName:   { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 3 },
  distanceLine: { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 4 },
  location:     { fontSize: 12, color: C.TEXT2, marginBottom: 4 },
  description:  { fontSize: 13, color: C.TEXT, lineHeight: 18, marginBottom: 10 },
  historyNote:  { fontSize: 12, color: C.TEXT2, fontStyle: 'italic', marginBottom: 10 },
  actionRow:    { flexDirection: 'row', gap: 8 },
  assistBtn:    { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  assistBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  detailBtn:    { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center', backgroundColor: C.BG, borderWidth: 1, borderColor: C.BORDER },
  detailBtnTxt: { color: C.TEXT, fontWeight: '600', fontSize: 13 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const insets    = useSafeAreaInsets();
  const nav       = useNavigation<any>();
  const route     = useRoute<any>();
  const user      = useAuthStore((s) => s.user);
  const { selectedOrg, activeOrg: storeActiveOrg, setActiveOrg } = useAdminStore();

  // ── Org switcher state ────────────────────────────────────────────────────────
  const [userOrgs,        setUserOrgs]        = useState<any[]>([]);
  const [activeOrgId,     setActiveOrgId]     = useState<number | null>(
    // Use volunteer-scoped activeOrg only; selectedOrg is the admin org and may be suspended
    storeActiveOrg?.orgId ?? null,
  );
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);

  // Derived from local state (mirrors HomeScreen pattern)
  // Only consider orgs where both membership AND org status are APPROVED (suspended orgs excluded)
  // Never fall back to selectedOrg (admin org — may be suspended)
  // storeActiveOrg is set by HomeScreen from approvedOrgs only, so it's always approved
  const activeOrg   = userOrgs.find((o) => o.orgId === activeOrgId && o.orgStatusCode === 'APPROVED')
                   ?? userOrgs.find((o) => o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'APPROVED')
                   ?? storeActiveOrg;
  const orgId       = (route.params?.orgId as number | undefined) ?? activeOrg?.orgId ?? 0;
  const orgName     = activeOrg?.orgName ?? activeOrg?.name ?? 'Community';
  const orgInitials = orgName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const approvedOrgs = userOrgs.filter((o) => o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'APPROVED');

  // ── Notification unread count ─────────────────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(useCallback(() => {
    notificationApi.getUnreadCount()
      .then(r => { if (r.data?.isSuccess) { setUnreadCount(r.data.data?.unreadCount ?? 0); } })
      .catch(() => {});
  }, []));

  // Derived user initials for avatar
  const userInitials = ((user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')).toUpperCase() || '?';

  // ── Search state ──────────────────────────────────────────────────────────────
  const [showSearch,  setShowSearch]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

  // ── Feed / SOS state ──────────────────────────────────────────────────────────
  const [posts,       setPosts]       = useState<CommunityPost[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,        setPage]        = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);
  const [showModal,         setShowModal]         = useState(false);
  const [communityPermChecking, setCommunityPermChecking] = useState(false);
  const [commentPostId,     setCommentPostId]     = useState<number | null>(null);
  const [sosAlerts,         setSosAlerts]         = useState<any[]>([]);
  const [sosHistory,        setSosHistory]        = useState<any[]>([]);
  const [showSosHistory,    setShowSosHistory]    = useState(false);
  const [userLocation,      setUserLocation]      = useState<UserLocation | null>(null);

  // Fetch user's org list once on mount (same as HomeScreen)
  useEffect(() => {
    getMyOrgs().then((r) => {
      if (r.data?.isSuccess) {
        const orgs = r.data.data ?? [];
        setUserOrgs(orgs);
        setActiveOrgId((prev) => {
          if (prev) { return prev; }
          const first = orgs.find((o: any) => o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'APPROVED');
          return first?.orgId ?? null;
        });
      }
    }).catch(() => {});
  }, []);

  // Keep the shared store in sync whenever local org changes
  useEffect(() => {
    if (activeOrg) { setActiveOrg(activeOrg); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Sync FROM store when another tab (e.g. HomeScreen) switches the active org
  useEffect(() => {
    if (storeActiveOrg?.orgId && storeActiveOrg.orgId !== activeOrgId) {
      setActiveOrgId(storeActiveOrg.orgId);
      // Clear stale posts — feed reloads automatically via fetchFeed dep chain
      setPosts([]);
      setPage(1);
      setTotalCount(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeActiveOrg?.orgId]);

  // ── Community FAB: check CanCommunityPost before opening modal ───────────────
  const handleComposeFabPress = useCallback(async () => {
    if (!orgId || communityPermChecking) return;
    setCommunityPermChecking(true);
    try {
      const res = await feedApi.getPostPermissions(orgId);
      const p   = res.data?.data;
      if (!p?.isMember) {
        Alert.alert('Not a Member', 'You must be an approved member to post in this community.');
        return;
      }
      if (!p.canCommunityPost) {
        Alert.alert('Posting Disabled', 'The admin has disabled community posting for members. Contact your organisation admin.');
        return;
      }
    } catch { /* server will enforce anyway — open modal optimistically */ }
    finally { setCommunityPermChecking(false); }
    setShowModal(true);
  }, [orgId, communityPermChecking]);

  /** Get current viewer's GPS once — used to show distance to active SOS incidents.
   *  Low-accuracy is fine here (cell/wifi), maximumAge 5 min prevents repeated requests. */
  const fetchUserLocation = useCallback(() => {
    Geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => { /* permission denied or unavailable — distance column simply won't render */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

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

  const fetchSosAlerts = useCallback(async () => {
    if (!orgId) { return; }
    try {
      const res = await sosApi.getOrgAlerts(orgId, 30);
      if (res.data?.isSuccess && res.data.data) {
        const all: any[] = res.data.data;
        const active = all.filter((i) => (i.status ?? i.Status ?? '').toUpperCase() === 'ACTIVE');

        // When the new SP patch has NOT been deployed yet, myApprovalStatus comes back as null.
        // Preserve any optimistic status we already set (PENDING / APPROVED / REJECTED)
        // so the button doesn't flip back to "I Can Assist" between polls.
        setSosAlerts((current) =>
          active.map((incoming) => {
            if (incoming.myApprovalStatus != null) {
              // SP returned a real status — use it (new SP deployed ✓)
              return incoming;
            }
            // SP returned null — check if we have a local optimistic value to keep
            const existing = current.find((a) => a.sosIncidentId === incoming.sosIncidentId);
            return existing?.myApprovalStatus != null
              ? { ...incoming, myApprovalStatus: existing.myApprovalStatus }
              : incoming;
          }),
        );
        setSosHistory(all.filter((i) => (i.status ?? i.Status ?? '').toUpperCase() !== 'ACTIVE'));
      }
    } catch { /* silent */ }
  }, [orgId]);

  useEffect(() => {
    fetchUserLocation();
    fetchFeed(1);
    fetchSosAlerts();
    // Poll SOS alerts every 30s — lightweight safety check
    const id = setInterval(fetchSosAlerts, 30000);
    return () => clearInterval(id);
  }, [fetchFeed, fetchSosAlerts, fetchUserLocation]);

  // Refresh SOS alerts immediately each time the Community screen comes into focus.
  // This makes the SOS card disappear right away after the victim resolves/cancels
  // and taps "Go to Community" — no waiting for the 30s poll cycle.
  useFocusEffect(
    useCallback(() => {
      fetchSosAlerts();
      // Refresh location on focus — user may have moved since last visit
      fetchUserLocation();
    }, [fetchSosAlerts, fetchUserLocation]),
  );

  const handleLike = useCallback(async (postId: number) => {
    // Optimistic update
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === postId
        ? { ...p, isLiked: !p.isLiked, likeCount: Math.max(0, (p.likeCount ?? 0) + (p.isLiked ? -1 : 1)) }
        : p,
    ));
    try {
      const res = await likePost(postId);
      if (res.data?.isSuccess && res.data.data) {
        const { isLiked, likeCount } = res.data.data as { isLiked: boolean; likeCount: number };
        setPosts((prev) => prev.map((p) =>
          p.communityPostId === postId ? { ...p, isLiked, likeCount } : p,
        ));
      }
    } catch { /* keep optimistic */ }
  }, []);

  const handleAck = useCallback(async (communityPostId: number) => {
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === communityPostId
        ? { ...p, isAcknowledgedByMe: !(p.isAcknowledgedByMe ?? p.isAcknowledged), isAcknowledged: !(p.isAcknowledgedByMe ?? p.isAcknowledged), acknowledgeCount: (p.isAcknowledgedByMe ?? p.isAcknowledged) ? p.acknowledgeCount - 1 : p.acknowledgeCount + 1 }
        : p,
    ));
    try { await acknowledgePost(communityPostId); } catch { /* silent */ }
  }, []);

  const handleVote = useCallback(async (postId: number, pollOptionId: number) => {
    setPosts((prev) => prev.map((p) => {
      if (p.communityPostId !== postId || !p.pollOptions) { return p; }
      const isMulti = !!(p.pollIsMultiChoice);

      // Build updated options
      const updatedOpts = p.pollOptions.map((o) => {
        if (isMulti) {
          // Multi-choice: toggle just the tapped option, leave all others unchanged
          if (o.pollOptionId !== pollOptionId) { return o; }
          return { ...o, isVoted: !o.isVoted, voteCount: o.voteCount + (o.isVoted ? -1 : 1) };
        } else {
          // Single-choice: only one option can be voted; unvote anything else
          const nowVoted  = o.pollOptionId === pollOptionId;
          const wasVoted  = o.isVoted;
          return {
            ...o,
            isVoted:   nowVoted,
            voteCount: o.voteCount + (nowVoted && !wasVoted ? 1 : 0) - (!nowVoted && wasVoted ? 1 : 0),
          };
        }
      });

      const total = Math.max(1, updatedOpts.reduce((s, o) => s + o.voteCount, 0));
      return {
        ...p,
        pollOptions: updatedOpts.map((o) => ({
          ...o,
          votePct: (o.voteCount / total) * 100,
        })),
      };
    }));
    try { await voteOnPoll(postId, pollOptionId); } catch { /* silent */ }
  }, []);

  const handleComment = useCallback((postId: number) => {
    setCommentPostId(postId);
  }, []);

  const handleCommentCountChange = useCallback((postId: number, delta: number) => {
    setPosts((prev) => prev.map((p) =>
      p.communityPostId === postId
        ? { ...p, commentCount: Math.max(0, (p.commentCount ?? 0) + delta) }
        : p,
    ));
  }, []);

  const handleSosAssist = useCallback(async (sosIncidentId: number) => {
    // Optimistic update — show "⏳ Requested" immediately so the user gets instant feedback
    setSosAlerts((prev) => prev.map((a) =>
      a.sosIncidentId === sosIncidentId ? { ...a, myApprovalStatus: 'PENDING' } : a,
    ));
    try {
      const res = await sosApi.respond(sosIncidentId);
      if (!res.data?.isSuccess) {
        // Rollback on server error
        setSosAlerts((prev) => prev.map((a) =>
          a.sosIncidentId === sosIncidentId ? { ...a, myApprovalStatus: null } : a,
        ));
        Alert.alert('Could Not Register', res.data?.message ?? 'Please try again.');
      }
      // On success: keep the optimistic PENDING state.
      // The 30s poll (or next focus) will refresh with the real DB value once
      // NGOConnect_Patch_SosGetOrgAlertsWithUserId.sql has been run and backend rebuilt.
    } catch {
      // Rollback on network error
      setSosAlerts((prev) => prev.map((a) =>
        a.sosIncidentId === sosIncidentId ? { ...a, myApprovalStatus: null } : a,
      ));
    }
  }, []);

  const handleViewMap = useCallback((sosIncidentId: number) => {
    nav.navigate('LiveLocation', { sosIncidentId });
  }, [nav]);

  const handleSosViewDetails = useCallback((sosIncidentId: number) => {
    nav.navigate('SosActive', { sosIncidentId, isVictim: false });
  }, [nav]);

  const handlePosted = useCallback(() => {
    setShowModal(false);
    fetchFeed(1, true);
  }, [fetchFeed]);

  const handleLoadMore = () => {
    if (!loadingMore && posts.length < totalCount) { fetchFeed(page + 1); }
  };

  const userName = user
    ? ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || 'Member'
    : 'Member';

  // Client-side search filter
  const q = searchQuery.trim().toLowerCase();
  const displayedPosts = q
    ? posts.filter((p) =>
        (p.content        ?? '').toLowerCase().includes(q) ||
        (p.authorName     ?? '').toLowerCase().includes(q) ||
        (p.postTypeName   ?? '').toLowerCase().includes(q) ||
        (p.postType ?? p.postTypeLkpCode ?? '').toLowerCase().includes(q),
      )
    : posts;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Row 1: org selector + search icon + menu */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.orgSelector}
            onPress={() => setShowOrgSwitcher(true)}
            accessibilityLabel="Switch organization"
          >
            {activeOrg?.logoUrl || activeOrg?.orgLogoUrl ? (
              <Image
                source={{ uri: (activeOrg.logoUrl ?? activeOrg.orgLogoUrl)! }}
                style={styles.orgAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.orgAvatar}>
                <Text style={styles.orgAvatarText}>{orgInitials}</Text>
              </View>
            )}
            <Text style={styles.orgName} numberOfLines={1}>{orgName}</Text>
            <Text style={styles.orgChevron}>▾</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            {/* Search toggle */}
            <TouchableOpacity
              onPress={() => {
                setShowSearch((v) => {
                  if (!v) { setTimeout(() => searchRef.current?.focus(), 80); }
                  else     { setSearchQuery(''); }
                  return !v;
                });
              }}
              accessibilityLabel="Search community"
              style={styles.headerIconBtn}
            >
              <Text style={styles.headerIcon}>{showSearch ? '✕' : '🔍'}</Text>
            </TouchableOpacity>

            {/* Notification bell */}
            <TouchableOpacity
              onPress={() => {
                setUnreadCount(0);
                nav.navigate('Notifications' as never);
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

            {/* User avatar */}
            <TouchableOpacity
              onPress={() => nav.navigate('Profile' as never)}
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

        {/* Row 2: search bar (toggled) */}
        {showSearch && (
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search posts, members..."
              placeholderTextColor={C.TEXT3}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={displayedPosts}
          keyExtractor={(p) => String(p.communityPostId)}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          ListHeaderComponent={
            <>
              {/* ── Active SOS alerts — pinned at top ─────────────────────── */}
              {sosAlerts.length > 0 && (
                <View style={{ marginBottom: 4 }}>
                  <Text style={styles.sosSection}>{'🚨 Active Alerts'}</Text>
                  {sosAlerts.map((alert) => (
                    <SosAlertCard
                      key={String(alert.sosIncidentId)}
                      incident={alert}
                      onAssist={handleSosAssist}
                      onViewDetails={handleSosViewDetails}
                      onViewMap={handleViewMap}
                      userLocation={userLocation}
                      currentUserId={user?.userId}
                    />
                  ))}
                </View>
              )}

              {/* ── SOS History — resolved + cancelled alerts ──────────────── */}
              {sosHistory.length > 0 && (
                <View style={{ marginBottom: 4 }}>
                  {/* Collapsible header */}
                  <TouchableOpacity
                    style={styles.historyHeader}
                    onPress={() => setShowSosHistory((v) => !v)}
                    accessibilityLabel="Toggle SOS history"
                  >
                    <Text style={styles.sosSection}>
                      {'📋 SOS History  (' + sosHistory.length + ')'}
                    </Text>
                    <Text style={styles.historyChevron}>{showSosHistory ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {showSosHistory && sosHistory.map((alert) => (
                    <SosAlertCard
                      key={String(alert.sosIncidentId)}
                      incident={alert}
                      onAssist={handleSosAssist}
                      onViewDetails={handleSosViewDetails}
                      onViewMap={handleViewMap}
                      userLocation={userLocation}
                      currentUserId={user?.userId}
                    />
                  ))}
                </View>
              )}

              <View style={styles.privacyBanner}>
                <Text style={styles.privacyText}>
                  {`Private space for your ${orgName} members. Content here is never shown on the public Feed.`}
                </Text>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <CommunityPostCard
              item={item}
              onLike={handleLike}
              onAck={handleAck}
              onVote={handleVote}
              onComment={handleComment}
            />
          )}
          onRefresh={() => { fetchFeed(1, true); fetchSosAlerts(); }}
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
              <Text style={styles.emptyEmoji}>{'💬'}</Text>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>Be the first to start a conversation!</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setShowModal(true)}
                accessibilityLabel="Create first post"
              >
                <Text style={styles.emptyBtnText}>Create Post</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* FAB — gated by CanCommunityPost permission */}
      <ComposeFab onPress={handleComposeFabPress} />

      {/* New Post Modal */}
      <NewPostModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onPosted={handlePosted}
        orgId={orgId}
        orgName={orgName}
        userName={userName}
        userRole={selectedOrg ? 'Member' : 'Member'}
      />

      {/* Comments Modal */}
      <CommunityCommentsModal
        visible={commentPostId !== null}
        communityPostId={commentPostId}
        onClose={() => setCommentPostId(null)}
        onCommentCountChange={handleCommentCountChange}
      />

      {/* ── Org Switcher Modal (mirrors HomeScreen pattern) ──────────────────── */}
      <Modal
        visible={showOrgSwitcher}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOrgSwitcher(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowOrgSwitcher(false)}>
          <Pressable style={styles.orgSwitcherSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />

            <View style={styles.orgSwitcherHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgSwitcherTitle}>Switch Organisation</Text>
                <Text style={styles.orgSwitcherSubtitle}>Community feed will reload for selected org</Text>
              </View>
              <Pressable onPress={() => setShowOrgSwitcher(false)} hitSlop={10}>
                <Text style={styles.orgSwitcherClose}>✕</Text>
              </Pressable>
            </View>

            {approvedOrgs.map((org) => {
              const oName    = org.orgName ?? org.name ?? 'NGO';
              const isActive = org.orgId === activeOrgId;
              const initials = oName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              const role     = org.myRole ?? org.role ?? 'Member';
              const members  = org.memberCount ? `${org.memberCount.toLocaleString()} members` : '';
              const subtitle = [role, members].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={org.orgId}
                  style={[styles.orgSwitcherItem, isActive && styles.orgSwitcherItemActive]}
                  onPress={() => {
                    setActiveOrgId(org.orgId);
                    setActiveOrg(org);
                    setShowOrgSwitcher(false);
                    // Reload feed for the new org
                    setPosts([]);
                    setPage(1);
                    setTotalCount(0);
                    fetchFeed(1);
                    fetchSosAlerts();
                  }}
                  accessibilityLabel={`Switch to ${oName}`}
                >
                  {org.logoUrl || org.orgLogoUrl ? (
                    <Image
                      source={{ uri: (org.logoUrl ?? org.orgLogoUrl)! }}
                      style={styles.orgSwitcherAvatar}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.orgSwitcherAvatar, isActive && { backgroundColor: C.PRIMARY }]}>
                      <Text style={styles.orgSwitcherAvatarText}>{initials}</Text>
                    </View>
                  )}
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

            <View style={{ height: insets.bottom + 8 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.BG },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Header ──────────────────────────────────────────────────────────────────
  header:               { backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  headerRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orgSelector:          { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  orgAvatar:            { width: 36, height: 36, borderRadius: 10, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  orgAvatarText:        { fontSize: 12, fontWeight: '800', color: '#fff' },
  orgName:              { fontSize: 15, fontWeight: '700', color: C.TEXT, maxWidth: 170 },
  orgChevron:           { fontSize: 12, color: C.TEXT2 },
  headerActions:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon:           { fontSize: 18, color: C.TEXT2 },
  notifBadge:           { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16,
                          borderRadius: 8, backgroundColor: C.RED, alignItems: 'center',
                          justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5,
                          borderColor: C.CARD },
  notifBadgeText:       { fontSize: 9, color: '#FFF', fontWeight: '700', lineHeight: 12 },
  userAvatar:           { width: 32, height: 32, borderRadius: 16, backgroundColor: C.PRIMARY_LIGHT,
                          alignItems: 'center', justifyContent: 'center' },
  userAvatarImg:        { width: 32, height: 32, borderRadius: 16 },
  userAvatarText:       { fontSize: 12, fontWeight: '700', color: C.PRIMARY },
  searchBar:            { flexDirection: 'row', alignItems: 'center', backgroundColor: C.BG, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, gap: 6 },
  searchIcon:           { fontSize: 14 },
  searchInput:          { flex: 1, fontSize: 14, color: C.TEXT, padding: 0 },
  searchClear:          { fontSize: 13, color: C.TEXT3, paddingHorizontal: 4 },

  listContent:          { padding: 10 },
  sosSection:           { fontSize: 12, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 2 },
  historyHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 2 },
  historyChevron:       { fontSize: 10, color: '#9CA3AF', paddingRight: 2 },
  privacyBanner:        { backgroundColor: `${C.PRIMARY}10`, borderRadius: 10, padding: 10, marginBottom: 10 },
  privacyText:          { fontSize: 12, color: C.TEXT2, lineHeight: 16 },

  emptyContainer:       { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji:           { fontSize: 40, marginBottom: 12 },
  emptyTitle:           { fontSize: 18, fontWeight: '700', color: C.TEXT2, marginBottom: 6 },
  emptySub:             { fontSize: 14, color: C.TEXT3, marginBottom: 16 },
  emptyBtn:             { backgroundColor: C.PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  emptyBtnText:         { color: '#fff', fontSize: 14, fontWeight: '700' },
  modalOverlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalHandle:          { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginTop: 10, marginBottom: 4 },

  // Org switcher
  orgSwitcherSheet:      { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  orgSwitcherHeader:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  orgSwitcherTitle:      { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  orgSwitcherSubtitle:   { fontSize: 12, color: C.TEXT2 },
  orgSwitcherClose:      { fontSize: 18, color: C.TEXT2, paddingLeft: 12 },
  orgSwitcherItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  orgSwitcherItemActive: { backgroundColor: C.PRIMARY + '08' },
  orgSwitcherAvatar:     { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  orgSwitcherAvatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  orgSwitcherName:       { fontSize: 14, fontWeight: '600', color: C.TEXT },
  orgSwitcherMeta:       { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  orgSwitcherActiveBadge:    { width: 22, height: 22, borderRadius: 11, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  orgSwitcherActiveBadgeText:{ color: '#fff', fontSize: 11, fontWeight: '700' },
});