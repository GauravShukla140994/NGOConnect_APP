import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { list as listOrgs, getRecommended, orgApi } from '../../api/org.api';
import { getMyOrgs } from '../../api/user.api';
import { notificationApi } from '../../api/notification.api';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import type { Organisation } from '../../types/api.types';

const C = AppConfig.COLORS;

// ── Haversine distance ────────────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// ── Category list — label shown in UI, code sent to API / used for filtering ──
const CATEGORIES: { label: string; code: string }[] = [
  { label: 'All',           code: 'ALL'          },
  { label: 'Education',     code: 'EDUCATION'    },
  { label: 'Environment',   code: 'ENVIRONMENT'  },
  { label: 'Healthcare',    code: 'HEALTHCARE'   },
  { label: 'Animal Welfare',code: 'ANIMAL_WELFARE'},
  { label: 'Community',     code: 'COMMUNITY'    },
  { label: 'Welfare',       code: 'WELFARE'      },
];

type TabKey = 'recommended' | 'trending' | 'all';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'trending',    label: 'Trending'    },
  { key: 'all',         label: 'All NGOs'    },
];

const AVATAR_COLORS = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#D97706', '#16A34A', '#7C3AED'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length; }
  return AVATAR_COLORS[Math.abs(h)];
}
function initials(name: string) {
  return (name || 'NG').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Row card — Recommended tab ────────────────────────────────────────────────
function OrgRowCard({ org, distKm, onPress }: { org: Organisation; distKm?: number; onPress: () => void }) {
  const name   = org.orgName ?? org.name ?? 'NGO';
  const color  = avatarColor(name);
  const rating = org.avgRating ?? org.rating ?? 0;
  const meta = [
    org.categoryName ?? org.category ?? 'NGO',
    rating > 0 ? `⭐ ${rating.toFixed(1)}` : null,
    org.memberCount ? `${org.memberCount.toLocaleString('en-IN')} members` : null,
    distKm !== undefined ? formatDist(distKm) : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.rowCard}>
      {org.logoUrl || org.orgLogoUrl
        ? <Image source={{ uri: (org.logoUrl ?? org.orgLogoUrl)! }} style={styles.rowAvatar} resizeMode="cover" />
        : <View style={[styles.rowAvatar, { backgroundColor: color }]}><Text style={styles.rowAvatarText}>{initials(name)}</Text></View>
      }
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
          {org.verificationStatusCode === 'VERIFIED' && (
            <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓</Text></View>
          )}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <TouchableOpacity style={styles.viewBtn} onPress={onPress} accessibilityLabel={`View ${name}`}>
        <Text style={styles.viewBtnText}>View</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Grid card — All NGOs tab ──────────────────────────────────────────────────
function OrgGridCard({ org, onPress }: { org: Organisation; onPress: () => void }) {
  const name   = org.orgName ?? org.name ?? 'NGO';
  const color  = avatarColor(name);
  const rating = org.avgRating ?? org.rating ?? 0;
  return (
    <TouchableOpacity style={styles.gridCard} onPress={onPress} activeOpacity={0.8} accessibilityLabel={`View ${name}`}>
      {org.logoUrl || org.orgLogoUrl
        ? <Image source={{ uri: (org.logoUrl ?? org.orgLogoUrl)! }} style={styles.gridAvatar} resizeMode="cover" />
        : <View style={[styles.gridAvatar, { backgroundColor: color }]}><Text style={styles.gridAvatarText}>{initials(name)}</Text></View>
      }
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 3 }}>
        <Text style={[styles.gridName, { marginBottom: 0 }]} numberOfLines={2}>{name}</Text>
        {org.verificationStatusCode === 'VERIFIED' && (
          <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓</Text></View>
        )}
      </View>
      <Text style={styles.gridMeta} numberOfLines={1}>
        {(org.categoryName ?? org.category ?? 'NGO')}{rating > 0 ? ` · ⭐${rating.toFixed(1)}` : ''}
      </Text>
      <TouchableOpacity style={styles.joinBtn} onPress={onPress} accessibilityLabel={`Join ${name}`}>
        <Text style={styles.joinBtnText}>Join</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Trending campaign card ────────────────────────────────────────────────────
function TrendingCard({ campaign, onPress }: { campaign: any; onPress: () => void }) {
  const progress = Math.min(100, campaign.progressPct ?? 0);
  const raised = (campaign.raisedAmount ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const target = (campaign.targetAmount ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  return (
    <TouchableOpacity style={styles.trendCard} onPress={onPress} activeOpacity={0.8} accessibilityLabel={campaign.campaignName}>
      {campaign.isEmergency === 1 && (
        <View style={styles.emergencyBadge}>
          <Text style={styles.emergencyText}>🚨 Emergency</Text>
        </View>
      )}
      <View style={styles.trendHeader}>
        {campaign.orgLogoUrl
          ? <Image source={{ uri: campaign.orgLogoUrl }} style={styles.trendAvatar} resizeMode="cover" />
          : <View style={[styles.trendAvatar, { backgroundColor: avatarColor(campaign.orgName ?? 'NGO') }]}><Text style={styles.trendAvatarText}>{initials(campaign.orgName ?? 'NGO')}</Text></View>
        }
        <View style={{ flex: 1 }}>
          <Text style={styles.trendCampaign} numberOfLines={2}>{campaign.campaignName}</Text>
          <Text style={styles.trendOrg}>{campaign.orgName}</Text>
        </View>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>
      <View style={styles.trendFooter}>
        <Text style={styles.trendRaised}>{raised}</Text>
        <Text style={styles.trendOf}> of {target}</Text>
        <Text style={styles.trendDonors}> · {campaign.donorCount ?? 0} donors</Text>
      </View>
      <TouchableOpacity style={styles.donateBtn} onPress={onPress} accessibilityLabel="Donate">
        <Text style={styles.donateBtnText}>Donate Now</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ExploreScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // ── Auth / Admin store ────────────────────────────────────────────────────────
  const user                                              = useAuthStore((s) => s.user);
  const { selectedOrg, activeOrg: storeActiveOrg, setActiveOrg } = useAdminStore();

  // ── Org switcher state (mirrors CommunityScreen pattern) ──────────────────────
  const [userOrgs,        setUserOrgs]        = useState<any[]>([]);
  const [activeOrgId,     setActiveOrgId]     = useState<number | null>(
    selectedOrg?.orgId ?? storeActiveOrg?.orgId ?? null,
  );
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);

  // Derived
  const activeOrg    = userOrgs.find((o) => o.orgId === activeOrgId)
                    ?? userOrgs.find((o) => o.memberStatusCode === 'APPROVED')
                    ?? selectedOrg ?? storeActiveOrg;
  const exploreOrgName = activeOrg?.orgName ?? activeOrg?.name ?? 'Explore';
  const orgInitials  = exploreOrgName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const approvedOrgs = userOrgs.filter((o) => o.memberStatusCode === 'APPROVED');

  // Deterministic color for org avatar
  const ORG_COLORS   = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#D97706', '#16A34A', '#7C3AED'];
  const orgAvatarColor = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % ORG_COLORS.length; }
    return ORG_COLORS[Math.abs(h)];
  };

  // User initials for avatar
  const userInitials = ((user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')).toUpperCase() || '?';

  // ── Fetch user orgs once ──────────────────────────────────────────────────────
  useEffect(() => {
    getMyOrgs().then((r) => {
      if (r.data?.isSuccess) {
        const orgs = r.data.data ?? [];
        setUserOrgs(orgs);
        setActiveOrgId((prev) => {
          if (prev) { return prev; }
          const first = orgs.find((o: any) => o.memberStatusCode === 'APPROVED');
          return first?.orgId ?? orgs[0]?.orgId ?? null;
        });
      }
    }).catch(() => {});
  }, []);

  // Keep store in sync when local org changes
  useEffect(() => {
    if (activeOrg) { setActiveOrg(activeOrg); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Sync FROM store when another tab (e.g. HomeScreen) switches the active org
  useEffect(() => {
    if (storeActiveOrg?.orgId && storeActiveOrg.orgId !== activeOrgId) {
      setActiveOrgId(storeActiveOrg.orgId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeActiveOrg?.orgId]);

  // ── Notification unread count ─────────────────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(useCallback(() => {
    notificationApi.getUnreadCount()
      .then(r => { if (r.data?.isSuccess) { setUnreadCount(r.data.data?.count ?? 0); } })
      .catch(() => {});
  }, []));

  const [tab,         setTab]         = useState<TabKey>('recommended');
  const [categoryCode,setCategoryCode]= useState<string>('ALL');   // stores DB code
  const [search,      setSearch]      = useState('');

  const [recommended, setRecommended] = useState<Organisation[]>([]);
  const [recLoading,  setRecLoading]  = useState(false);

  const [trendingAll,  setTrendingAll]  = useState<any[]>([]);   // all fetched campaigns (unfiltered)
  const [trendLoading, setTrendLoading] = useState(false);

  const [orgs,       setOrgs]       = useState<Organisation[]>([]);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const [allLoading, setAllLoading] = useState(false);
  const [allError,   setAllError]   = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [userLat,    setUserLat]    = useState<number | null>(null);
  const [userLng,    setUserLng]    = useState<number | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE   = AppConfig.DEFAULT_PAGE_SIZE ?? 20;

  // ── Geolocation — @react-native-community/geolocation ────────────────────
  useEffect(() => {
    try {
      const Geolocation = require('@react-native-community/geolocation').default;
      Geolocation.getCurrentPosition(
        (pos: { coords: { latitude: number; longitude: number } }) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => { /* denied — proceed without distance */ },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      );
    } catch { /* package not available */ }
  }, []);

  // ── Distance helper ───────────────────────────────────────────────────────
  const distFor = useCallback((org: Organisation): number | undefined => {
    if (userLat === null || userLng === null || !org.latitude || !org.longitude) { return undefined; }
    return haversine(userLat, userLng, Number(org.latitude), Number(org.longitude));
  }, [userLat, userLng]);

  // ── Load Recommended ─────────────────────────────────────────────────────
  const loadRecommended = useCallback(async () => {
    setRecLoading(true);
    try {
      const res = await getRecommended();
      if (res.data?.isSuccess) {
        let data: Organisation[] = res.data.data ?? [];
        if (userLat !== null && userLng !== null) {
          data = [...data].sort((a, b) => (distFor(a) ?? 99999) - (distFor(b) ?? 99999));
        }
        setRecommended(data);
      }
    } catch { /* silent */ } finally { setRecLoading(false); }
  }, [distFor, userLat, userLng]);

  // ── Load Trending ─────────────────────────────────────────────────────────
  const loadTrending = useCallback(async () => {
    setTrendLoading(true);
    try {
      const res = await orgApi.getTrendingCampaigns(30);   // fetch more, filter client-side
      const d = (res as any).data;
      if (d?.isSuccess) { setTrendingAll(d.data ?? []); }
    } catch { /* silent */ } finally { setTrendLoading(false); }
  }, []);

  // ── Load All NGOs (paged, server-side filter) ─────────────────────────────
  const loadAll = useCallback(async (
    pageNum: number,
    reset = false,
    q     = search,
    code  = categoryCode,
  ) => {
    if (pageNum === 1) { setAllLoading(true); setAllError(false); }
    try {
      const res = await listOrgs({
        pageNumber: pageNum,
        pageSize:   PAGE_SIZE,
        keyword:  q    || undefined,
        category: code !== 'ALL' ? code : undefined,
        ...(userLat !== null && userLng !== null ? { lat: userLat, lng: userLng } : {}),
      });
      if (res.data?.isSuccess) {
        const items = res.data.data?.items ?? [];
        setOrgs(prev => reset ? items : [...prev, ...items]);
        setHasMore(items.length === PAGE_SIZE);
        setPage(pageNum);
      } else {
        if (reset) { setAllError(true); }
      }
    } catch {
      if (reset) { setAllError(true); }
    } finally { setAllLoading(false); }
  }, [search, categoryCode, PAGE_SIZE, userLat, userLng]);

  // ── Tab switch — load corresponding data ──────────────────────────────────
  useEffect(() => {
    if (tab !== 'all' && search) { setSearch(''); } // clear search when leaving All tab
    if (tab === 'recommended') { loadRecommended(); }
    else if (tab === 'trending') { loadTrending(); }
    else { loadAll(1, true, search, categoryCode); }
  }, [tab]); // eslint-disable-line

  // Re-sort recommended when location arrives
  useEffect(() => {
    if (userLat !== null && tab === 'recommended') { loadRecommended(); }
  }, [userLat]); // eslint-disable-line

  // ── Category change — applies to ALL tabs ────────────────────────────────
  // Recommended + Trending filter client-side (no reload needed)
  // All NGOs reloads from API with new category code
  useEffect(() => {
    if (tab === 'all') { loadAll(1, true, search, categoryCode); }
  }, [categoryCode]); // eslint-disable-line

  // ── Search (All NGOs only) ────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (tab !== 'all') { return; }
    if (searchTimer.current) { clearTimeout(searchTimer.current); }
    searchTimer.current = setTimeout(() => loadAll(1, true, text, categoryCode), 500);
  }, [tab, loadAll, categoryCode]);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === 'recommended') { await loadRecommended(); }
    else if (tab === 'trending') { await loadTrending(); }
    else { await loadAll(1, true, search, categoryCode); }
    setRefreshing(false);
  }, [tab, loadRecommended, loadTrending, loadAll, search, categoryCode]);

  const onEndReached = useCallback(() => {
    if (!hasMore || allLoading || tab !== 'all') { return; }
    loadAll(page + 1, false, search, categoryCode);
  }, [hasMore, allLoading, tab, page, loadAll, search, categoryCode]);

  // ── Client-side filtered slices ───────────────────────────────────────────
  // Recommended: filter by category code (org.category = DB code)
  const filteredRecommended = useMemo(() => {
    if (categoryCode === 'ALL') { return recommended; }
    return recommended.filter(o => (o.category ?? '').toUpperCase() === categoryCode.toUpperCase());
  }, [recommended, categoryCode]);

  // Trending: filter by orgCategory returned from SP (o.Category AS OrgCategory → camelCase orgCategory)
  const filteredTrending = useMemo(() => {
    if (categoryCode === 'ALL') { return trendingAll; }
    return trendingAll.filter(c => (c.orgCategory ?? '').toUpperCase() === categoryCode.toUpperCase());
  }, [trendingAll, categoryCode]);

  const goToNgo   = (orgId: number) => nav.navigate('NgoProfile', { orgId });
  const goToDonate= (orgId: number) => nav.navigate('Donate', { orgId });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {/* Left: org selector */}
          <TouchableOpacity
            style={styles.orgSelector}
            onPress={() => setShowOrgSwitcher(true)}
            accessibilityLabel="Switch organization"
          >
            {activeOrg?.logoUrl || activeOrg?.orgLogoUrl ? (
              <Image
                source={{ uri: (activeOrg.logoUrl ?? activeOrg.orgLogoUrl)! }}
                style={styles.orgAvatarImg}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.orgAvatar, { backgroundColor: orgAvatarColor(exploreOrgName) }]}>
                <Text style={styles.orgAvatarText}>{orgInitials}</Text>
              </View>
            )}
            <Text style={styles.orgName} numberOfLines={1}>{exploreOrgName}</Text>
            <Text style={styles.orgChevron}>▾</Text>
          </TouchableOpacity>

          {/* Right: bell + user avatar */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => {
                setUnreadCount(0);
                nav.navigate('Notifications');
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
      </View>

      {/* ── Org Switcher Modal ──────────────────────────────────────────── */}
      <Modal
        visible={showOrgSwitcher}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrgSwitcher(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowOrgSwitcher(false)}>
          <Pressable style={styles.orgSwitcherSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.orgSwitcherHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgSwitcherTitle}>Switch Organisation</Text>
                <Text style={styles.orgSwitcherSubtitle}>Select an active organisation</Text>
              </View>
              <Pressable onPress={() => setShowOrgSwitcher(false)} hitSlop={10}>
                <Text style={styles.orgSwitcherClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
              {approvedOrgs.map((org) => {
                const oName    = org.orgName ?? org.name ?? 'NGO';
                const isActive = org.orgId === activeOrgId;
                const oInitials = oName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
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
                      <View style={[styles.orgSwitcherAvatar, { backgroundColor: orgAvatarColor(oName) }]}>
                        <Text style={styles.orgSwitcherAvatarText}>{oInitials}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.orgSwitcherName, isActive && { color: C.PRIMARY }]} numberOfLines={1}>
                        {oName}
                      </Text>
                      {subtitle ? <Text style={styles.orgSwitcherMeta} numberOfLines={1}>{subtitle}</Text> : null}
                    </View>
                    {isActive
                      ? <View style={styles.orgSwitcherCheck}><Text style={styles.orgSwitcherCheckText}>✓</Text></View>
                      : <Text style={styles.orgSwitcherChevron}>›</Text>
                    }
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ height: insets.bottom + 8 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Search — All NGOs tab only */}
      {tab === 'all' && (
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>&#128269;</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search NGOs, causes..."
            placeholderTextColor={C.TEXT3}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            onSubmitEditing={() => loadAll(1, true, search, categoryCode)}
            accessibilityLabel="Search NGOs"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => { setSearch(''); loadAll(1, true, '', categoryCode); }}
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Category chips — applies to all 3 tabs */}
      <View style={styles.catWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          {CATEGORIES.map((cat, i) => (
            <TouchableOpacity
              key={cat.code}
              style={[
                styles.catChip,
                categoryCode === cat.code && styles.catChipOn,
                i < CATEGORIES.length - 1 && { marginRight: 6 },
              ]}
              onPress={() => setCategoryCode(cat.code)}
              accessibilityLabel={`Filter ${cat.label}`}
            >
              <Text style={[styles.catText, categoryCode === cat.code && styles.catTextOn]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabOn]}
            onPress={() => setTab(t.key)}
            accessibilityLabel={t.label}
          >
            <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── RECOMMENDED ── */}
      {tab === 'recommended' && (recLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      ) : (
        <FlatList
          data={filteredRecommended}
          keyExtractor={item => String(item.orgId)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
          ListHeaderComponent={
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>Recommended for You</Text>
              <Text style={styles.secSub}>
                {categoryCode !== 'ALL'
                  ? `${CATEGORIES.find(c => c.code === categoryCode)?.label} NGOs near you`
                  : userLat ? 'NGOs matching your interests & location' : 'NGOs matching your interests'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <OrgRowCard org={item} distKm={distFor(item)} onPress={() => goToNgo(item.orgId)} />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTxt}>
                {categoryCode !== 'ALL'
                  ? `No ${CATEGORIES.find(c => c.code === categoryCode)?.label} NGOs in your recommendations.\nTry a different category.`
                  : 'No recommendations yet.\nUpdate your interests in your profile.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        />
      ))}

      {/* ── TRENDING ── */}
      {tab === 'trending' && (trendLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      ) : (
        <FlatList
          data={filteredTrending}
          keyExtractor={item => String(item.campaignId)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
          ListHeaderComponent={
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>Trending Campaigns</Text>
              <Text style={styles.secSub}>
                {categoryCode !== 'ALL'
                  ? `${CATEGORIES.find(c => c.code === categoryCode)?.label} fundraisers`
                  : 'Most active fundraisers right now'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TrendingCard campaign={item} onPress={() => goToDonate(item.orgId)} />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTxt}>
                {categoryCode !== 'ALL'
                  ? `No trending ${CATEGORIES.find(c => c.code === categoryCode)?.label} campaigns right now.`
                  : 'No trending campaigns at the moment.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        />
      ))}

      {/* ── ALL NGOs ── */}
      {tab === 'all' && (allLoading && orgs.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      ) : allError && orgs.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 32, marginBottom: 10 }}>⚠️</Text>
          <Text style={styles.emptyTxt}>
            {'Could not load NGOs.\nPlease check your connection and try again.'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadAll(1, true)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={item => String(item.orgId)}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>
                {categoryCode !== 'ALL'
                  ? `${CATEGORIES.find(c => c.code === categoryCode)?.label} NGOs`
                  : orgs.length > 0 ? `${orgs.length}+ NGOs` : 'All NGOs'}
              </Text>
              {userLat && <Text style={styles.secSub}>Sorted by distance</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <OrgGridCard org={item} onPress={() => goToNgo(item.orgId)} />
          )}
          ListFooterComponent={
            hasMore && orgs.length > 0
              ? <ActivityIndicator style={{ margin: 16 }} color={C.PRIMARY} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTxt}>No NGOs found. Try a different search or category.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        />
      ))}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: C.BG },
  // ── Header ──────────────────────────────────────────────────────────────────
  header:             { backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER,
                        paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  headerRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orgSelector:        { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  orgAvatar:          { width: 36, height: 36, borderRadius: 10, alignItems: 'center',
                        justifyContent: 'center', overflow: 'hidden' },
  orgAvatarImg:       { width: 36, height: 36, borderRadius: 10, overflow: 'hidden' },
  orgAvatarText:      { fontSize: 12, fontWeight: '800', color: '#fff' },
  orgName:            { fontSize: 15, fontWeight: '700', color: C.TEXT, maxWidth: 160 },
  orgChevron:         { fontSize: 12, color: C.TEXT2 },
  headerActions:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon:         { fontSize: 20 },
  notifBadge:         { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16,
                        borderRadius: 8, backgroundColor: C.RED, alignItems: 'center',
                        justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5,
                        borderColor: C.CARD },
  notifBadgeText:     { fontSize: 9, color: '#FFF', fontWeight: '700', lineHeight: 12 },
  userAvatar:         { width: 36, height: 36, borderRadius: 18, backgroundColor: C.PRIMARY_LIGHT,
                        alignItems: 'center', justifyContent: 'center' },
  userAvatarImg:      { width: 36, height: 36, borderRadius: 18 },
  userAvatarText:     { fontSize: 13, fontWeight: '700', color: C.PRIMARY },
  // ── Org Switcher Modal ───────────────────────────────────────────────────────
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalHandle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER,
                        alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  orgSwitcherSheet:   { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  orgSwitcherHeader:  { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16,
                        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  orgSwitcherTitle:   { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  orgSwitcherSubtitle:{ fontSize: 12, color: C.TEXT2 },
  orgSwitcherClose:   { fontSize: 18, color: C.TEXT2, paddingLeft: 12 },
  orgSwitcherItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                        paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  orgSwitcherItemActive:{ backgroundColor: C.PRIMARY + '08' },
  orgSwitcherAvatar:  { width: 40, height: 40, borderRadius: 10, alignItems: 'center',
                        justifyContent: 'center', overflow: 'hidden' },
  orgSwitcherAvatarText:{ fontSize: 13, fontWeight: '800', color: '#fff' },
  orgSwitcherName:    { fontSize: 14, fontWeight: '600', color: C.TEXT },
  orgSwitcherMeta:    { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  orgSwitcherCheck:   { width: 22, height: 22, borderRadius: 11, backgroundColor: C.PRIMARY,
                        alignItems: 'center', justifyContent: 'center' },
  orgSwitcherCheckText:{ color: '#fff', fontSize: 11, fontWeight: '700' },
  orgSwitcherChevron: { fontSize: 16, color: C.TEXT3 },
  searchBox:     { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 12, backgroundColor: C.INPUT_BG, borderRadius: 12, borderWidth: 1.5, borderColor: C.BORDER, gap: 8 },
  searchIcon:    { fontSize: 16 },
  searchInput:   { flex: 1, paddingVertical: 10, fontSize: 14, color: C.TEXT },
  clearBtn:      { fontSize: 13, color: C.TEXT3, padding: 4 },
  catWrapper:    { height: 46, backgroundColor: C.BG },
  catChip:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.CARD, borderWidth: 1.5, borderColor: C.BORDER },
  catChipOn:     { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  catText:       { fontSize: 12, fontWeight: '500', color: C.TEXT2 },
  catTextOn:     { color: '#fff', fontWeight: '700' },
  tabs:          { flexDirection: 'row', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tabItem:       { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn:         { borderBottomColor: C.PRIMARY },
  tabTxt:        { fontSize: 13, fontWeight: '500', color: C.TEXT2 },
  tabTxtOn:      { color: C.PRIMARY, fontWeight: '700' },
  secHead:       { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  secTitle:      { fontSize: 16, fontWeight: '700', color: C.TEXT },
  secSub:        { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  rowCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD, marginHorizontal: 12, marginTop: 8, borderRadius: 14, padding: 12, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  rowAvatar:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowAvatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowName:       { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  verifiedBadge:     { backgroundColor: '#ECFDF5', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#6EE7B7' },
  verifiedBadgeText: { fontSize: 10, fontWeight: '700', color: '#059669' },
  rowMeta:       { fontSize: 11, color: C.TEXT2 },
  viewBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  viewBtnText:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  gridRow:       { paddingHorizontal: 8 },
  gridCard:      { flex: 1, margin: 6, backgroundColor: C.CARD, borderRadius: 14, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  gridAvatar:    { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' },
  gridAvatarText:{ color: '#fff', fontSize: 15, fontWeight: '800' },
  gridName:      { fontSize: 13, fontWeight: '700', color: C.TEXT, textAlign: 'center', marginBottom: 3 },
  gridMeta:      { fontSize: 11, color: C.TEXT2, textAlign: 'center', marginBottom: 10 },
  joinBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 20, paddingVertical: 7, borderRadius: 20, width: '100%', alignItems: 'center' },
  joinBtnText:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  trendCard:     { backgroundColor: C.CARD, marginHorizontal: 12, marginTop: 10, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  emergencyBadge:{ alignSelf: 'flex-start', backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 8 },
  emergencyText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  trendHeader:   { flexDirection: 'row', gap: 10, marginBottom: 10 },
  trendAvatar:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  trendAvatarText:{ color: '#fff', fontSize: 13, fontWeight: '800' },
  trendOrg:      { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  trendCampaign: { fontSize: 13, color: C.TEXT2 },
  trendRaised:   { fontSize: 18, fontWeight: '800', color: C.TEAL, marginBottom: 2 },
  trendOf:       { fontSize: 12, color: C.TEXT2, marginBottom: 10 },
  progressBg:    { height: 6, backgroundColor: C.BG, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill:  { height: '100%' as any, borderRadius: 3, backgroundColor: C.TEAL },
  trendDonors:   { fontSize: 12, color: C.TEXT2 },
  trendFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  donateBtn:     { backgroundColor: C.TEAL, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  donateBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTxt:     { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },
  retryBtn:     { marginTop: 12, backgroundColor: C.PRIMARY, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20 },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
