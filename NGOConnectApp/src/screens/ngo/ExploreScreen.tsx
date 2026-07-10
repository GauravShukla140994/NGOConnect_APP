import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { list as listOrgs, getRecommended, orgApi } from '../../api/org.api';
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
      <View style={[styles.rowAvatar, { backgroundColor: color }]}>
        <Text style={styles.rowAvatarText}>{initials(name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
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
      <View style={[styles.gridAvatar, { backgroundColor: color }]}>
        <Text style={styles.gridAvatarText}>{initials(name)}</Text>
      </View>
      <Text style={styles.gridName} numberOfLines={2}>{name}</Text>
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
        <View style={[styles.trendAvatar, { backgroundColor: avatarColor(campaign.orgName ?? 'NGO') }]}>
          <Text style={styles.trendAvatarText}>{initials(campaign.orgName ?? 'NGO')}</Text>
        </View>
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
    return recommended.filter(o => (o.category ?? '') === categoryCode);
  }, [recommended, categoryCode]);

  // Trending: filter by orgCategory returned from SP (o.Category AS OrgCategory → camelCase orgCategory)
  const filteredTrending = useMemo(() => {
    if (categoryCode === 'ALL') { return trendingAll; }
    return trendingAll.filter(c => (c.orgCategory ?? '') === categoryCode);
  }, [trendingAll, categoryCode]);

  const goToNgo   = (orgId: number) => nav.navigate('NgoProfile', { orgId });
  const goToDonate= (orgId: number) => nav.navigate('Donate', { orgId });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>&#128269;</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search NGOs, causes..."
          placeholderTextColor={C.TEXT3}
          value={search}
          onChangeText={handleSearchChange}
          returnKeyType="search"
          onSubmitEditing={() => tab === 'all' && loadAll(1, true, search, categoryCode)}
          accessibilityLabel="Search NGOs"
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => { setSearch(''); if (tab === 'all') { loadAll(1, true, '', categoryCode); } }}
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

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
  container:     { flex: 1, backgroundColor: C.BG },
  header:        { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  headerTitle:   { fontSize: 20, fontWeight: '800', color: C.TEXT },
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
  rowAvatar:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowName:       { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  rowMeta:       { fontSize: 11, color: C.TEXT2 },
  viewBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  viewBtnText:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  gridRow:       { paddingHorizontal: 8 },
  gridCard:      { flex: 1, margin: 6, backgroundColor: C.CARD, borderRadius: 14, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  gridAvatar:    { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gridAvatarText:{ color: '#fff', fontSize: 15, fontWeight: '800' },
  gridName:      { fontSize: 13, fontWeight: '700', color: C.TEXT, textAlign: 'center', marginBottom: 3 },
  gridMeta:      { fontSize: 11, color: C.TEXT2, textAlign: 'center', marginBottom: 10 },
  joinBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 20, paddingVertical: 7, borderRadius: 20, width: '100%', alignItems: 'center' },
  joinBtnText:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  trendCard:     { backgroundColor: C.CARD, marginHorizontal: 12, marginTop: 10, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  emergencyBadge:{ alignSelf: 'flex-start', backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 8 },
  emergencyText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  trendHeader:   { flexDirection: 'row', gap: 10, marginBottom: 10 },
  trendAvatar:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  trendAvatarText:{ color: '#fff', fontSize: 13, fontWeight: '800' },
  trendCampaign: { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  trendOrg:      { fontSize: 12, color: C.TEXT2 },
  progressBg:    { height: 7, backgroundColor: C.BORDER, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill:  { height: '100%', backgroundColor: C.PRIMARY, borderRadius: 4 },
  trendFooter:   { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap' },
  trendRaised:   { fontSize: 15, fontWeight: '800', color: C.TEXT },
  trendOf:       { fontSize: 12, color: C.TEXT2 },
  trendDonors:   { fontSize: 12, color: C.TEXT2 },
  donateBtn:     { backgroundColor: '#FFF8EC', borderWidth: 1.5, borderColor: '#F59E0B', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  donateBtnText: { color: '#92400E', fontWeight: '700', fontSize: 14 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTxt:      { color: C.TEXT2, textAlign: 'center', fontSize: 14, lineHeight: 22 },
  retryBtn:      { marginTop: 16, backgroundColor: C.PRIMARY, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
});
