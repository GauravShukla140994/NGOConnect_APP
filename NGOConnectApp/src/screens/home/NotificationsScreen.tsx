import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtDate } from '../../utils/dateUtils';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { notificationApi } from '../../api/notification.api';
import type { Notification } from '../../types/api.types';

const C   = AppConfig.COLORS;
const PAGE = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Map notifType → { emoji, color } for the icon dot
// ─────────────────────────────────────────────────────────────────────────────
function notifMeta(type: string): { emoji: string; color: string } {
  switch (type) {
    case 'APPLICATION_APPROVED':    return { emoji: '✅', color: '#2ECC71' };
    case 'APPLICATION_REJECTED':    return { emoji: '❌', color: C.RED };
    case 'NEW_APPLICATION':         return { emoji: '📋', color: C.PRIMARY };
    case 'MEMBERSHIP_REQUEST':      return { emoji: '👋', color: C.PRIMARY };
    case 'MEMBERSHIP_CANCELLED':    return { emoji: '↩️', color: C.TEXT2 };
    case 'MEMBERSHIP_APPROVED':     return { emoji: '✅', color: '#2ECC71' };
    case 'MEMBERSHIP_REJECTED':     return { emoji: '❌', color: C.RED };
    case 'MEMBER_REMOVED':          return { emoji: '🚫', color: C.RED };
    case 'ORG_APPROVED':            return { emoji: '🏆', color: '#2ECC71' };
    case 'ORG_REJECTED':            return { emoji: '❌', color: C.RED };
    case 'ORG_SUSPENDED':           return { emoji: '⚠️', color: C.YELLOW };
    case 'SOS_TRIGGERED':           return { emoji: '🆘', color: C.RED };
    case 'SOS_RESPONDER_INCOMING':  return { emoji: '🙋', color: '#F97316' };  // victim: someone wants to help — orange urgency
    case 'SOS_RESPONDER_APPROVED':  return { emoji: '🤝', color: '#2ECC71' };
    case 'SOS_RESOLVED':            return { emoji: '✅', color: '#2ECC71' };
    case 'DONATION_CONFIRMED':      return { emoji: '💚', color: '#16A34A' };
    case 'DONATION_RECEIVED_ADMIN': return { emoji: '💰', color: '#16A34A' };
    case 'NEW_FEED_POST':              return { emoji: '📝', color: C.PRIMARY };
    case 'POST_LIKED':                 return { emoji: '❤️', color: '#E74C3C' };
    case 'POST_COMMENTED':             return { emoji: '💬', color: C.PRIMARY };
    case 'POST_REPORTED':              return { emoji: '⚠️', color: '#D97706' };
    case 'POST_REPORTED_ADMIN':        return { emoji: '🚨', color: '#DC2626' };
    case 'CAMPAIGN':                   return { emoji: '📣', color: '#7C3AED' };
    case 'COMMUNITY_POST':             return { emoji: '📢', color: C.PRIMARY };
    case 'NEW_POLL':                   return { emoji: '📊', color: C.TEAL };
    case 'COMMUNITY_POST_LIKED':       return { emoji: '❤️', color: '#E74C3C' };
    case 'COMMUNITY_POST_COMMENTED':   return { emoji: '💬', color: C.PRIMARY };
    case 'BADGE_AWARDED':           return { emoji: '🏅', color: '#D97706' };
    case 'SKILL_RATING':            return { emoji: '⭐', color: '#F59E0B' };
    case 'PROFILE_VERIFIED':        return { emoji: '✅', color: '#2ECC71' };
    case 'ACCOUNT_SUSPENDED':       return { emoji: '⚠️', color: C.YELLOW };
    case 'INVITE_ACCEPTED':         return { emoji: '✅', color: '#2ECC71' };
    case 'INVITE_DECLINED':         return { emoji: '❌', color: C.RED };
    // Reviews
    case 'REVIEW_NEW':              return { emoji: '⭐', color: '#F59E0B' };
    case 'REVIEW_RESPONSE':         return { emoji: '💬', color: C.PRIMARY };
    case 'REVIEW_DELETED':          return { emoji: '🗑️', color: '#6B7280' };
    default:                        return { emoji: '🔔', color: C.PRIMARY };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep-link routing: notifType → app screen (mirrors RootNavigator.resolveScreen)
// ─────────────────────────────────────────────────────────────────────────────
function resolveScreen(notif: Notification): { screen: string; params?: object } | null {
  const refId = notif.refId;
  switch (notif.notifType) {
    // Admin receives this — open the specific project's participants list
    case 'NEW_APPLICATION':
      return refId ? { screen: 'Participants', params: { projectId: refId } } : { screen: 'AdminProjects' };
    // Volunteer receives these — open their project list
    case 'APPLICATION_APPROVED':
    case 'APPLICATION_REJECTED':
      return { screen: 'MyProjects' };
    case 'MEMBERSHIP_REQUEST':
    case 'MEMBERSHIP_CANCELLED':
    case 'MEMBERSHIP_APPROVED':
    case 'MEMBERSHIP_REJECTED':
    case 'MEMBER_REMOVED':
    case 'ORG_APPROVED':
    case 'ORG_REJECTED':
    case 'ORG_SUSPENDED':
      return { screen: 'MyOrgs' };
    case 'SOS_TRIGGERED':
    case 'SOS_RESPONDER_APPROVED':
    case 'SOS_RESOLVED':
      return refId ? { screen: 'SosActive', params: { sosIncidentId: refId } } : null;
    // Victim-only: must open SosActive with isVictim:true so they can Approve/Decline
    case 'SOS_RESPONDER_INCOMING':
      return refId ? { screen: 'SosActive', params: { sosIncidentId: refId, isVictim: true } } : null;
    case 'DONATION_CONFIRMED':
      return { screen: 'MyDonations' };
    case 'DONATION_RECEIVED_ADMIN':
      return refId ? { screen: 'NgoProfile', params: { orgId: refId } } : { screen: 'MyOrgs' };
    case 'NEW_FEED_POST':
      return { screen: 'Home' };
    case 'POST_LIKED':
    case 'POST_COMMENTED':
    case 'POST_REPORTED':
      return refId
        ? { screen: 'Home', params: { focusPostId: refId } }
        : { screen: 'Home' };
    // Sent to org admins — open Posts tab on Reported sub-tab
    case 'POST_REPORTED_ADMIN':
      return { screen: 'AdminVolunteers', params: { initialTab: 'posts', initialPostsTab: 'reported' } };
    // CAMPAIGN: deep link handled separately in onPressNotif; no screen fallback needed here
    // because tapping a CAMPAIGN row with no deepLink is a no-op (unusual but safe).
    case 'COMMUNITY_POST':
    case 'NEW_POLL':
      return { screen: 'Community' };
    case 'COMMUNITY_POST_LIKED':
    case 'COMMUNITY_POST_COMMENTED':
      return refId
        ? { screen: 'Community', params: { focusCommunityPostId: refId } }
        : { screen: 'Community' };
    case 'BADGE_AWARDED':
    case 'SKILL_RATING':
    case 'PROFILE_VERIFIED':
      return { screen: 'Impact' };
    case 'MEMBER_INVITE':
      return refId
        ? { screen: 'InviteAccept', params: { orgId: refId } }
        : { screen: 'MyOrgs' };
    // Admin-facing: user accepted/declined their invitation
    case 'INVITE_ACCEPTED':
      return refId
        ? { screen: 'AdminVolunteers', params: { orgId: refId } }
        : { screen: 'MyOrgs' };
    case 'INVITE_DECLINED':
      return { screen: 'MyOrgs' };
    // Reviews — admin receives NEW + DELETED → open NGO reviews tab
    //           reviewer receives RESPONSE   → open NGO profile reviews tab
    case 'REVIEW_NEW':
    case 'REVIEW_DELETED':
      return notif.orgId
        ? { screen: 'NgoProfile', params: { orgId: notif.orgId, initialTab: 'reviews' } }
        : { screen: 'MyOrgs' };
    case 'REVIEW_RESPONSE':
      return notif.orgId
        ? { screen: 'NgoProfile', params: { orgId: notif.orgId, initialTab: 'reviews' } }
        : { screen: 'MyOrgs' };
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp helper
// ─────────────────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  // MySQL DATETIME has no timezone suffix — JavaScript would parse it as LOCAL time.
  // Normalise to UTC by replacing the space separator and appending 'Z'.
  const utc  = iso.endsWith('Z') || iso.includes('+') ? iso : iso.replace(' ', 'T') + 'Z';
  const diff = Math.floor((Date.now() - new Date(utc).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(utc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Row component
// ─────────────────────────────────────────────────────────────────────────────
type RowProps = {
  item: Notification;
  onPress: (item: Notification) => void;
};

const NotifRow = React.memo(({ item, onPress }: RowProps) => {
  const { emoji, color } = notifMeta(item.notifType);
  // Pomelo returns TINYINT(1) as boolean true/false, not number 1/0.
  // !item.isRead handles false, 0, null, undefined all correctly.
  const unread = !item.isRead;

  return (
    <TouchableOpacity
      style={[s.row, unread && s.rowUnread]}
      activeOpacity={0.7}
      onPress={() => onPress(item)}
    >
      {/* Icon bubble */}
      <View style={[s.iconBubble, { backgroundColor: color + '1A' }]}>
        <Text style={s.iconEmoji}>{emoji}</Text>
      </View>

      {/* Content */}
      <View style={s.rowContent}>
        <View style={s.rowTop}>
          <Text style={[s.rowTitle, unread && s.rowTitleBold]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={s.rowTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={s.rowBody} numberOfLines={2}>{item.body}</Text>
        {!!item.orgName && (
          <View style={s.orgTag}>
            <Text style={s.orgTagText} numberOfLines={1}>🏢 {item.orgName}</Text>
          </View>
        )}
      </View>

      {/* Unread dot */}
      {unread && <View style={[s.unreadDot, { backgroundColor: color }]} />}
    </TouchableOpacity>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
const NotificationsScreen = () => {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route  = useRoute<any>();

  // CAMPAIGN push with actionLabel and no deepLink lands here.
  // Show a dismissible CTA banner so the user sees the intended call-to-action.
  const [ctaLabel, setCtaLabel] = useState<string | null>(
    route.params?.actionLabel ?? null,
  );

  const [items, setItems]           = useState<Notification[]>([]);
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // track read locally so the dot disappears instantly without a re-fetch
  const readIds = useRef<Set<number>>(new Set());

  const fetch = useCallback(async (pageNum: number, replace: boolean) => {
    try {
      const res = await notificationApi.getAll({ pageNumber: pageNum, pageSize: PAGE });
      if (res.data?.isSuccess && res.data.data) {
        const incoming = res.data.data.items ?? [];
        setTotal(res.data.data.totalCount ?? 0);
        setItems(prev => replace ? incoming : [...prev, ...incoming]);
        setPage(pageNum);
      }
    } catch { /* swallow */ }
  }, []);

  // initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetch(1, true);
      setLoading(false);
    })();
  }, [fetch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    readIds.current.clear();
    await fetch(1, true);
    setRefreshing(false);
  }, [fetch]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || items.length >= total) { return; }
    setLoadingMore(true);
    await fetch(page + 1, false);
    setLoadingMore(false);
  }, [loadingMore, items.length, total, page, fetch]);

  const onMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await notificationApi.markAllRead();
      // visually mark all as read
      setItems(prev => prev.map(n => ({ ...n, isRead: 1 })));
      readIds.current.clear();
    } catch { /* swallow */ } finally {
      setMarkingAll(false);
    }
  }, []);

  const onPressNotif = useCallback(async (item: Notification) => {
    // Optimistic mark-as-read; revert if the API call fails
    const wasUnread = !item.isRead && !readIds.current.has(item.notificationId);
    if (wasUnread) {
      readIds.current.add(item.notificationId);
      setItems(prev =>
        prev.map(n => n.notificationId === item.notificationId ? { ...n, isRead: 1 } : n)
      );
      try {
        await notificationApi.markRead(item.notificationId);
      } catch {
        // API failed — revert so the server state stays consistent
        readIds.current.delete(item.notificationId);
        setItems(prev =>
          prev.map(n => n.notificationId === item.notificationId ? { ...n, isRead: 0 } : n)
        );
      }
    }

    // CAMPAIGN: open deepLink (ngoconnect:// or https://) if present
    if (item.notifType === 'CAMPAIGN' && item.deepLink) {
      Linking.openURL(item.deepLink).catch(() => {});
      return;
    }

    // Navigate to relevant screen
    const target = resolveScreen(item);
    if (target) {
      nav.navigate(target.screen, target.params ?? {});
    }
  }, [nav]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const hasUnread = items.some(n => !n.isRead);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
            <Text style={s.backIcon}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Notifications</Text>
          <View style={s.headerRight} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
          <Text style={s.backIcon}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        {hasUnread ? (
          <TouchableOpacity
            style={s.markAllBtn}
            onPress={onMarkAllRead}
            disabled={markingAll}
          >
            <Text style={s.markAllText}>{markingAll ? '…' : 'Mark all read'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.headerRight} />
        )}
      </View>

      {/* ── Campaign CTA banner ────────────────────────────────────────── */}
      {!!ctaLabel && (
        <View style={s.ctaBanner}>
          <Text style={s.ctaBannerText}>📣 {ctaLabel}</Text>
          <TouchableOpacity onPress={() => setCtaLabel(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.ctaBannerClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── List ───────────────────────────────────────────────────────── */}
      <FlatList
        data={items}
        keyExtractor={item => String(item.notificationId)}
        renderItem={({ item }) => <NotifRow item={item} onPress={onPressNotif} />}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🔔</Text>
            <Text style={s.emptyTitle}>No notifications yet</Text>
            <Text style={s.emptySub}>
              You'll see activity here when something happens — applications, posts, donations, and more.
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={s.footerLoader}>
              <ActivityIndicator size="small" color={C.PRIMARY} />
            </View>
          ) : null
        }
        contentContainerStyle={
          items.length === 0
            ? s.emptyContainer
            : { paddingBottom: insets.bottom + 24 }
        }
      />
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.BG },

  // header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                  paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1,
                  borderBottomColor: C.BORDER },
  backBtn:      { minWidth: 70, height: 36, justifyContent: 'center', marginRight: 4 },
  backIcon:     { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:  { flex: 1, fontSize: 18, fontWeight: '700', color: C.TEXT },
  headerRight:  { width: 80 },
  markAllBtn:   { paddingHorizontal: 10, paddingVertical: 6 },
  markAllText:  { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },

  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // row
  row:          { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16,
                  paddingVertical: 14, backgroundColor: C.CARD },
  rowUnread:    { backgroundColor: C.PRIMARY_LIGHT + '55' },
  iconBubble:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center',
                  justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  iconEmoji:    { fontSize: 20 },
  rowContent:   { flex: 1 },
  rowTop:       { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  rowTitle:     { flex: 1, fontSize: 14, color: C.TEXT, fontWeight: '500' },
  rowTitleBold: { fontWeight: '700' },
  rowTime:      { fontSize: 11, color: C.TEXT3, marginLeft: 8 },
  rowBody:      { fontSize: 13, color: C.TEXT2, lineHeight: 18 },
  orgTag:       { alignSelf: 'flex-start', marginTop: 5, backgroundColor: C.BG,
                  borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
                  borderWidth: 1, borderColor: C.BORDER },
  orgTagText:   { fontSize: 11, color: C.TEXT3, fontWeight: '500' },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, marginLeft: 10, marginTop: 4, flexShrink: 0 },

  separator:    { height: 1, backgroundColor: C.BORDER, marginLeft: 72 },

  // empty state
  emptyContainer: { flex: 1 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 40, paddingVertical: 80 },
  emptyIcon:    { fontSize: 56, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: C.TEXT, marginBottom: 8 },
  emptySub:     { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },

  footerLoader: { paddingVertical: 20, alignItems: 'center' },

  // CAMPAIGN CTA banner — shown when actionLabel nav param is set
  ctaBanner:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                    paddingVertical: 12, backgroundColor: '#7C3AED',
                    borderBottomWidth: 1, borderBottomColor: '#6D28D9' },
  ctaBannerText:  { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' },
  ctaBannerClose: { fontSize: 16, color: 'rgba(255,255,255,0.8)', paddingLeft: 12 },
});

export default NotificationsScreen;
