import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtDate } from '../../utils/dateUtils';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { notificationApi } from '../../api/notification.api';
import type { Notification } from '../../types/api.types';

const C    = AppConfig.COLORS;
const PAGE = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Filter tab definitions
// ─────────────────────────────────────────────────────────────────────────────
type TabKey = 'All' | 'Unread' | 'Posts' | 'Members' | 'Donations';

const POST_TYPES = new Set([
  'NEW_FEED_POST', 'POST_LIKED', 'POST_COMMENTED', 'POST_REPORTED',
  'POST_REPORTED_ADMIN', 'COMMUNITY_POST', 'NEW_POLL',
  'COMMUNITY_POST_LIKED', 'COMMUNITY_POST_COMMENTED',
]);
const MEMBER_TYPES = new Set([
  'MEMBERSHIP_REQUEST', 'MEMBERSHIP_CANCELLED', 'MEMBERSHIP_APPROVED',
  'MEMBERSHIP_REJECTED', 'MEMBER_REMOVED', 'NEW_APPLICATION',
  'APPLICATION_APPROVED', 'APPLICATION_REJECTED',
  'INVITE_ACCEPTED', 'INVITE_DECLINED', 'MEMBER_INVITE',
  'BADGE_AWARDED', 'SKILL_RATING', 'NO_SHOW_EXCUSED', 'MEMBER_ROLE_CHANGED',
]);
const DONATION_TYPES = new Set([
  'DONATION_CONFIRMED', 'DONATION_RECEIVED_ADMIN', 'CAMPAIGN',
]);

function filterByTab(items: Notification[], tab: TabKey): Notification[] {
  switch (tab) {
    case 'Unread':    return items.filter(n => !n.isRead);
    case 'Posts':     return items.filter(n => POST_TYPES.has(n.notifType));
    case 'Members':   return items.filter(n => MEMBER_TYPES.has(n.notifType));
    case 'Donations': return items.filter(n => DONATION_TYPES.has(n.notifType));
    default:          return items;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date-bucket helpers
// ─────────────────────────────────────────────────────────────────────────────
type BucketKey = 'RECENT' | 'YESTERDAY' | 'LAST WEEK' | 'LAST MONTH' | 'OLDER';

function getBucket(iso: string): BucketKey {
  const utc  = iso.endsWith('Z') || iso.includes('+') ? iso : iso.replace(' ', 'T') + 'Z';
  const diff = (Date.now() - new Date(utc).getTime()) / 1000;
  if (diff < 86400)    return 'RECENT';
  if (diff < 172800)   return 'YESTERDAY';
  if (diff < 604800)   return 'LAST WEEK';
  if (diff < 2592000)  return 'LAST MONTH';
  return 'OLDER';
}

const BUCKET_ORDER: BucketKey[] = ['RECENT', 'YESTERDAY', 'LAST WEEK', 'LAST MONTH', 'OLDER'];

function groupIntoSections(items: Notification[]): { title: BucketKey; data: Notification[] }[] {
  const map = new Map<BucketKey, Notification[]>();
  for (const item of items) {
    const key = getBucket(item.createdAt);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return BUCKET_ORDER
    .filter(k => map.has(k))
    .map(k => ({ title: k, data: map.get(k)! }));
}

// ─────────────────────────────────────────────────────────────────────────────
// notifMeta — icon + accent colour per type
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
    case 'SOS_RESPONDER_INCOMING':  return { emoji: '🙋', color: '#F97316' };
    case 'SOS_RESPONDER_APPROVED':  return { emoji: '🤝', color: '#2ECC71' };
    case 'SOS_RESOLVED':            return { emoji: '✅', color: '#2ECC71' };
    case 'DONATION_CONFIRMED':      return { emoji: '💚', color: '#16A34A' };
    case 'DONATION_RECEIVED_ADMIN': return { emoji: '💰', color: '#16A34A' };
    case 'NEW_FEED_POST':           return { emoji: '📝', color: C.PRIMARY };
    case 'POST_LIKED':              return { emoji: '❤️', color: '#E74C3C' };
    case 'POST_COMMENTED':          return { emoji: '💬', color: C.PRIMARY };
    case 'POST_REPORTED':           return { emoji: '⚠️', color: '#D97706' };
    case 'POST_REPORTED_ADMIN':     return { emoji: '🚨', color: '#DC2626' };
    case 'CAMPAIGN':                return { emoji: '📣', color: '#7C3AED' };
    case 'COMMUNITY_POST':          return { emoji: '📢', color: C.PRIMARY };
    case 'NEW_POLL':                return { emoji: '📊', color: C.TEAL };
    case 'COMMUNITY_POST_LIKED':    return { emoji: '❤️', color: '#E74C3C' };
    case 'COMMUNITY_POST_COMMENTED':return { emoji: '💬', color: C.PRIMARY };
    case 'BADGE_AWARDED':           return { emoji: '🏅', color: '#D97706' };
    case 'SKILL_RATING':            return { emoji: '⭐', color: '#F59E0B' };
    case 'PROFILE_VERIFIED':        return { emoji: '✅', color: '#2ECC71' };
    case 'PROFILE_UPDATE_REQUIRED': return { emoji: '⚠️', color: C.YELLOW };
    case 'ACCOUNT_SUSPENDED':       return { emoji: '⚠️', color: C.YELLOW };
    case 'INVITE_ACCEPTED':         return { emoji: '✅', color: '#2ECC71' };
    case 'INVITE_DECLINED':         return { emoji: '❌', color: C.RED };
    case 'REVIEW_NEW':              return { emoji: '⭐', color: '#F59E0B' };
    case 'REVIEW_RESPONSE':         return { emoji: '💬', color: C.PRIMARY };
    case 'REVIEW_DELETED':          return { emoji: '🗑️', color: '#6B7280' };
    case 'NO_SHOW_EXCUSED':         return { emoji: '✅', color: '#2ECC71' };
    case 'MEMBER_ROLE_CHANGED':     return { emoji: '🔄', color: C.PRIMARY };
    default:                        return { emoji: '🔔', color: C.PRIMARY };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveScreen
// ─────────────────────────────────────────────────────────────────────────────
function resolveScreen(notif: Notification): { screen: string; params?: object } | null {
  const refId = notif.refId;
  switch (notif.notifType) {
    case 'NEW_APPLICATION':
      return refId ? { screen: 'Participants', params: { projectId: refId } } : { screen: 'AdminProjects' };
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
    case 'SOS_RESPONDER_INCOMING':
      return refId ? { screen: 'SosActive', params: { sosIncidentId: refId, isVictim: true } } : null;
    case 'DONATION_CONFIRMED':
      return { screen: 'MyDonations' };
    case 'DONATION_RECEIVED_ADMIN':
      return refId ? { screen: 'NgoProfile', params: { orgId: refId } } : { screen: 'MyOrgs' };
    case 'NEW_FEED_POST':
    case 'POST_LIKED':
    case 'POST_COMMENTED':
    case 'POST_REPORTED':
      return refId ? { screen: 'PostDetail', params: { postId: refId } } : { screen: 'Home' };
    case 'POST_REPORTED_ADMIN':
      return { screen: 'AdminVolunteers', params: { initialTab: 'posts', initialPostsTab: 'reported' } };
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
    case 'PROFILE_UPDATE_REQUIRED':
    case 'PROFILE_UPDATE_REQUESTED':
      return { screen: 'Profile' };
    case 'MEMBER_INVITE':
      return refId ? { screen: 'InviteAccept', params: { orgId: refId } } : { screen: 'MyOrgs' };
    case 'INVITE_ACCEPTED':
      return refId ? { screen: 'AdminVolunteers', params: { orgId: refId } } : { screen: 'MyOrgs' };
    case 'INVITE_DECLINED':
      return { screen: 'MyOrgs' };
    case 'REVIEW_NEW':
    case 'REVIEW_DELETED':
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
  const utc  = iso.endsWith('Z') || iso.includes('+') ? iso : iso.replace(' ', 'T') + 'Z';
  const diff = Math.floor((Date.now() - new Date(utc).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(utc);
}

// ─────────────────────────────────────────────────────────────────────────────
// NotifRow
// ─────────────────────────────────────────────────────────────────────────────
type RowProps = { item: Notification; onPress: (item: Notification) => void };

const NotifRow = React.memo(({ item, onPress }: RowProps) => {
  const { emoji, color } = notifMeta(item.notifType);
  const unread = !item.isRead;

  return (
    <TouchableOpacity
      style={[s.row, unread && s.rowUnread]}
      activeOpacity={0.72}
      onPress={() => onPress(item)}
    >
      {/* Left accent bar for unread */}
      {unread && <View style={[s.accentBar, { backgroundColor: color }]} />}

      {/* Icon bubble */}
      <View style={[s.iconBubble, { backgroundColor: color + '20' }]}>
        <Text style={s.iconEmoji}>{emoji}</Text>
      </View>

      {/* Content */}
      <View style={s.rowContent}>
        <View style={s.rowTop}>
          <Text
            style={[s.rowTitle, unread && s.rowTitleUnread]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={s.rowTime}>{timeAgo(item.createdAt)}</Text>
        </View>

        <Text style={[s.rowBody, unread && s.rowBodyUnread]} numberOfLines={2}>
          {item.body}
        </Text>

        {!!item.orgName && (
          <View style={s.orgTag}>
            <View style={[s.orgTagDot, { backgroundColor: color }]} />
            <Text style={s.orgTagText} numberOfLines={1}>{item.orgName}</Text>
          </View>
        )}
      </View>

      {/* Unread indicator dot */}
      {unread && <View style={[s.unreadDot, { backgroundColor: color }]} />}
    </TouchableOpacity>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────
type SectionHeaderProps = { title: BucketKey; count: number };

const SectionHeader = ({ title, count }: SectionHeaderProps) => {
  const isRecent = title === 'RECENT';
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {isRecent && count > 0 ? (
        <View style={s.newBadge}>
          <Text style={s.newBadgeText}>{count} new</Text>
        </View>
      ) : (
        <Text style={s.sectionCount}>{count} notification{count !== 1 ? 's' : ''}</Text>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Filter Tab
// ─────────────────────────────────────────────────────────────────────────────
type TabProps = {
  label: string;
  badge?: number;
  active: boolean;
  onPress: () => void;
};

const FilterTab = ({ label, badge, active, onPress }: TabProps) => (
  <TouchableOpacity
    style={[s.tab, active && s.tabActive]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    {badge !== undefined && badge > 0 && (
      <View style={[s.tabBadge, active ? s.tabBadgeActive : s.tabBadgeInactive]}>
        <Text style={[s.tabBadgeText, active && s.tabBadgeTextActive]}>
          {badge > 99 ? '99+' : badge}
        </Text>
      </View>
    )}
  </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
const NotificationsScreen = () => {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route  = useRoute<any>();

  const [ctaLabel, setCtaLabel] = useState<string | null>(
    route.params?.actionLabel ?? null,
  );

  const [items,      setItems]      = useState<Notification[]>([]);
  const [page,       setPage]       = useState(1);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore,setLoadingMore]= useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeTab,  setActiveTab]  = useState<TabKey>('All');

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
      setItems(prev => prev.map(n => ({ ...n, isRead: 1 })));
      readIds.current.clear();
    } catch { /* swallow */ } finally {
      setMarkingAll(false);
    }
  }, []);

  const onPressNotif = useCallback(async (item: Notification) => {
    const wasUnread = !item.isRead && !readIds.current.has(item.notificationId);
    if (wasUnread) {
      readIds.current.add(item.notificationId);
      setItems(prev =>
        prev.map(n => n.notificationId === item.notificationId ? { ...n, isRead: 1 } : n)
      );
      try {
        await notificationApi.markRead(item.notificationId);
      } catch {
        readIds.current.delete(item.notificationId);
        setItems(prev =>
          prev.map(n => n.notificationId === item.notificationId ? { ...n, isRead: 0 } : n)
        );
      }
    }

    if (item.notifType === 'CAMPAIGN' && item.deepLink) {
      Linking.openURL(item.deepLink).catch(() => {});
      return;
    }

    const TAB_SCREENS = new Set(['Home', 'Explore', 'Impact', 'Community', 'Profile']);
    const target = resolveScreen(item);
    if (target) {
      if (TAB_SCREENS.has(target.screen)) {
        nav.navigate('Tabs' as never, { screen: target.screen, params: target.params } as never);
      } else {
        nav.navigate(target.screen as never, (target.params ?? {}) as never);
      }
    }
  }, [nav]);

  // ── Derived counts ────────────────────────────────────────────────────────
  const unreadCount    = useMemo(() => items.filter(n => !n.isRead).length, [items]);
  const postCount      = useMemo(() => items.filter(n => POST_TYPES.has(n.notifType)).length, [items]);
  const memberCount    = useMemo(() => items.filter(n => MEMBER_TYPES.has(n.notifType)).length, [items]);
  const donationCount  = useMemo(() => items.filter(n => DONATION_TYPES.has(n.notifType)).length, [items]);

  const filteredItems  = useMemo(() => filterByTab(items, activeTab), [items, activeTab]);
  const sections       = useMemo(() => groupIntoSections(filteredItems), [filteredItems]);

  const hasUnread = unreadCount > 0;

  // ─────────────────────────────────────────────────────────────────────────
  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: BucketKey; data: Notification[] } }) => (
      <SectionHeader title={section.title} count={section.data.length} />
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotifRow item={item} onPress={onPressNotif} />
    ),
    [onPressNotif],
  );

  const keyExtractor = useCallback(
    (item: Notification) => String(item.notificationId),
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Notifications</Text>
          <View style={{ width: 80 }} />
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
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backChevron}>‹</Text>
        </TouchableOpacity>

        <View style={s.headerTitleRow}>
          <Text style={s.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>

        {hasUnread ? (
          <TouchableOpacity style={s.markAllBtn} onPress={onMarkAllRead} disabled={markingAll}>
            <Text style={s.markAllText}>{markingAll ? '…' : 'Mark all read'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 88 }} />
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

      {/* ── Filter tabs ───────────────────────────────────────────────── */}
      <View style={s.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabsScroll}
        >
          <FilterTab label="All"       active={activeTab === 'All'}       onPress={() => setActiveTab('All')} />
          <FilterTab label="Unread"    active={activeTab === 'Unread'}    badge={unreadCount}   onPress={() => setActiveTab('Unread')} />
          <FilterTab label="Posts"     active={activeTab === 'Posts'}     onPress={() => setActiveTab('Posts')} />
          <FilterTab label="Members"   active={activeTab === 'Members'}   onPress={() => setActiveTab('Members')} />
          <FilterTab label="Donations" active={activeTab === 'Donations'} onPress={() => setActiveTab('Donations')} />
        </ScrollView>
      </View>

      {/* ── Section list ──────────────────────────────────────────────── */}
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        SectionSeparatorComponent={() => <View style={s.sectionSeparator} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🔔</Text>
            <Text style={s.emptyTitle}>
              {activeTab === 'All' ? 'No notifications yet' : `No ${activeTab.toLowerCase()} notifications`}
            </Text>
            <Text style={s.emptySub}>
              {activeTab === 'All'
                ? "You'll see activity here — applications, posts, donations, and more."
                : `Switch to "All" to see every notification.`}
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore
            ? <View style={s.footerLoader}><ActivityIndicator size="small" color={C.PRIMARY} /></View>
            : items.length > 0
              ? <Text style={s.footerNote}>Notifications older than 90 days are cleared automatically.</Text>
              : null
        }
        contentContainerStyle={
          sections.length === 0 ? s.emptyContainer : { paddingBottom: insets.bottom + 24 }
        }
      />
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.CARD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  backChevron:  { fontSize: 28, color: C.PRIMARY, fontWeight: '300', lineHeight: 32, marginTop: -2 },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: C.TEXT },
  headerBadge:  {
    backgroundColor: C.PRIMARY, borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  markAllBtn:   { paddingHorizontal: 8, paddingVertical: 6, minWidth: 88, alignItems: 'flex-end' },
  markAllText:  { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },

  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Filter tabs ──────────────────────────────────────────────────────────
  tabsWrapper:  { backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tabsScroll:   { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    borderColor: C.BORDER, backgroundColor: C.BG,
  },
  tabActive:    { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  tabText:      { fontSize: 13, fontWeight: '500', color: C.TEXT2 },
  tabTextActive:{ color: '#fff', fontWeight: '600' },
  tabBadge:     { borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  tabBadgeActive:   { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeInactive: { backgroundColor: C.PRIMARY },
  tabBadgeText:     { fontSize: 10, fontWeight: '700', color: '#fff' },
  tabBadgeTextActive: { color: '#fff' },

  // ── Section header ───────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
    backgroundColor: C.BG,
  },
  sectionTitle:  { fontSize: 11, fontWeight: '700', color: C.TEXT3, letterSpacing: 0.8 },
  sectionCount:  { fontSize: 11, color: C.TEXT3 },
  newBadge:      {
    backgroundColor: C.PRIMARY + '1A', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  newBadgeText:  { fontSize: 11, fontWeight: '700', color: C.PRIMARY },

  // ── Notification row ─────────────────────────────────────────────────────
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingRight: 16, paddingVertical: 13,
    backgroundColor: C.CARD,
  },
  rowUnread:    { backgroundColor: C.PRIMARY_LIGHT ? C.PRIMARY_LIGHT + '18' : '#EEF2FF' },
  accentBar:    { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: 13, marginLeft: 0 },
  iconBubble: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginLeft: 13, flexShrink: 0,
  },
  iconEmoji:    { fontSize: 20 },
  rowContent:   { flex: 1 },
  rowTop:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  rowTitle:     { flex: 1, fontSize: 13, color: C.TEXT, fontWeight: '500', lineHeight: 18 },
  rowTitleUnread: { fontWeight: '700', color: C.TEXT },
  rowTime:      { fontSize: 11, color: C.TEXT3, marginLeft: 8, marginTop: 1, flexShrink: 0 },
  rowBody:      { fontSize: 13, color: C.TEXT2, lineHeight: 18 },
  rowBodyUnread:{ color: C.TEXT },
  orgTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: C.BG, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: C.BORDER,
  },
  orgTagDot:    { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  orgTagText:   { fontSize: 11, color: C.TEXT2, fontWeight: '500', maxWidth: 180 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, marginLeft: 10, marginTop: 5, flexShrink: 0 },

  separator:        { height: 1, backgroundColor: C.BORDER, marginLeft: 72 },
  sectionSeparator: { height: 0 },

  // ── Empty state ──────────────────────────────────────────────────────────
  emptyContainer: { flex: 1 },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, paddingVertical: 80,
  },
  emptyIcon:  { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.TEXT, marginBottom: 8, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: C.TEXT2, textAlign: 'center', lineHeight: 19 },

  footerLoader: { paddingVertical: 20, alignItems: 'center' },
  footerNote: {
    fontSize: 11, color: C.TEXT3, textAlign: 'center',
    paddingHorizontal: 24, paddingVertical: 16, lineHeight: 16,
  },

  // ── Campaign CTA banner ──────────────────────────────────────────────────
  ctaBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#7C3AED',
    borderBottomWidth: 1, borderBottomColor: '#6D28D9',
  },
  ctaBannerText:  { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' },
  ctaBannerClose: { fontSize: 16, color: 'rgba(255,255,255,0.8)', paddingLeft: 12 },
});

export default NotificationsScreen;
