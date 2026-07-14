import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { list as listProjects } from '../../api/project.api';
import ApplyModal from '../../components/project/ApplyModal';
import type { Project } from '../../types/api.types';

const C = AppConfig.COLORS;

const LOCATION_CHIPS = ['Nearby', 'Mumbai', 'Pune', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad'] as const;
const CATEGORY_CHIPS = ['All', 'Community', 'Environment', 'Education', 'Healthcare', 'Animal Welfare'] as const;
const TYPE_CHIPS     = ['Any Schedule', 'Recurring', 'One-time', 'Flexible'] as const;

/* Category pill — bg + text color matching prototype */
const CAT_PILL: Record<string, { bg: string; text: string }> = {
  'Community':          { bg: '#FFF0E6', text: '#F97316' },
  'Community Service':  { bg: '#FFF0E6', text: '#F97316' },
  'Environment':        { bg: '#ECFDF5', text: '#10B981' },
  'Education':          { bg: '#F5F3FF', text: '#8B5CF6' },
  'Healthcare':         { bg: '#FFF7ED', text: '#F59E0B' },
  'Animal Welfare':     { bg: '#FEF2F2', text: '#EF4444' },
  'Sports':             { bg: '#EFF6FF', text: '#2563EB' },
};
function catColors(name?: string | null) {
  return CAT_PILL[name ?? ''] ?? { bg: '#F3F4F6', text: '#6B7280' };
}

/* Schedule type pill — bg + text color matching prototype */
const SCHED_PILL: Record<string, { bg: string; text: string }> = {
  'Recurring': { bg: '#ECFDF5', text: '#10B981' },
  'One-time':  { bg: '#F3F4F6', text: '#6B7280' },
  'Flexible':  { bg: '#FFFBEB', text: '#F59E0B' },
};
function schedColors(type?: string | null) {
  return SCHED_PILL[type ?? ''] ?? { bg: '#F3F4F6', text: '#6B7280' };
}

/** Derive a human-readable schedule label from raw SP fields */
function deriveScheduleType(item: Project): string | null {
  if (item.scheduleType) {
    // Normalize DB codes → display labels
    const code = item.scheduleType.toUpperCase();
    if (code === 'RECURRING') return 'Recurring';
    if (code === 'ONE_TIME')  return 'One-time';
    if (code === 'FLEXIBLE')  return 'Flexible';
    return item.scheduleType;
  }
  const p = item as any;
  if (p.recurDays || p.recurStart) return 'Recurring';
  if (p.oneTimeDate)               return 'One-time';
  if (p.flexFromDate)              return 'Flexible';
  return null;
}

/** Build a date/time summary line from raw SP fields */
function buildDateLine(item: Project): string | null {
  if (item.scheduleSummary) return item.scheduleSummary;
  const p = item as any;
  if (p.recurDays) {
    const days = String(p.recurDays).split(',').map((d: string) => d.trim().slice(0, 3)).join(' & ');
    const range = p.recurStart ? ` · ${p.recurStart}${p.recurEnd ? ` – ${p.recurEnd}` : ''}` : '';
    return `${days}${range}`;
  }
  if (p.oneTimeDate) return p.oneTimeDate;
  if (p.flexFromDate) return `${p.flexFromDate}${p.flexToDate ? ` – ${p.flexToDate}` : ''}`;
  if (item.startDate) return `${item.startDate}${item.endDate && item.endDate !== item.startDate ? ` – ${item.endDate}` : ''}`;
  return null;
}

/** Build a time line from raw SP fields */
function buildTimeLine(item: Project): string | null {
  const st = item.startTime ?? (item as any).sessionStartTime;
  const et = item.endTime   ?? (item as any).sessionEndTime;
  if (!st) return null;
  return et ? `${st} – ${et}` : st;
}


// ── Share URL helper ─────────────────────────────────────────────────────────
function buildShareUrl(projectId: number): string {
  return `https://ngoconnect.app/opportunity/${projectId}`;
}

// ── Share sheet ──────────────────────────────────────────────────────────────
function ShareSheet({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (project) {
      setCopied(false);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start();
    }
  }, [project, fadeAnim, slideAnim]);

  const close = () => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 500, duration: 240, useNativeDriver: true }),
    ]).start(onClose);
  };

  if (!project) return null;

  const url   = buildShareUrl(project.projectId);
  const title = project.title ?? project.projectName ?? 'Volunteer Opportunity';
  const org   = project.orgName ?? '';
  const schedType = deriveScheduleType(project);
  const dateLine  = buildDateLine(project);
  const meta  = [org, schedType, dateLine].filter(Boolean).join(' · ');

  const handleCopy = async () => {
    try {
      // Opens native share sheet which includes "Copy" — no native clipboard package needed
      await Share.share({ message: url, title });
    } catch { /* cancelled */ }
  };


  return (
    <Modal transparent visible={!!project} animationType="none" onRequestClose={close}>
      {/* Backdrop */}
      <Animated.View style={[ss.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[ss.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 20 }]}>
        {/* Handle bar */}
        <View style={ss.handle} />

        {/* Colored header banner */}
        <View style={ss.sheetBanner}>
          <View style={ss.sheetBannerIcon}>
            <Text style={{ fontSize: 22 }}>↗</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ss.sheetTitle}>Share Opportunity</Text>
            <Text style={ss.sheetSub}>Share with friends and networks</Text>
          </View>
          <TouchableOpacity onPress={close} accessibilityLabel="Close" style={ss.closeBtn}>
            <Text style={ss.closeX}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Project preview card */}
        <View style={ss.previewCard}>
          <Text style={ss.previewTitle} numberOfLines={1}>{title}</Text>
          <Text style={ss.previewMeta} numberOfLines={1}>{meta}</Text>
        </View>

        {/* URL row */}
        <View style={ss.urlRow}>
          <Text style={ss.urlText} numberOfLines={1} ellipsizeMode="tail">{url}</Text>
          <TouchableOpacity style={ss.copyBtn} onPress={handleCopy}>
            <Text style={ss.copyBtnText}>{copied ? '✓ Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>

        {/* Done button */}
        <TouchableOpacity style={ss.doneBtn} onPress={close}>
          <Text style={ss.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ── OppCard ───────────────────────────────────────────────────────────────────
function OppCard({ item, onApply, onShare, onPress }: { item: Project; onApply: () => void; onShare: () => void; onPress: () => void }) {
  const max    = item.maxParticipants ?? item.maxVolunteers ?? 0;
  const curr   = item.currentParticipants ?? item.approvedCount ?? 0;
  const spots  = item.spotsLeft ?? (max > 0 ? max - curr : null);
  const pct    = max > 0 ? Math.min(curr / max, 1) : 0;
  const isFull = spots !== null && spots <= 0;

  const barColor = pct >= 1 ? '#EF4444' : pct >= 0.85 ? C.ORANGE : C.TEAL;
  const spotsTxt =
    isFull              ? 'Full'
    : spots !== null && spots <= 3  ? `${spots} spots!`
    : spots !== null                ? `${spots} spots left`
    : null;
  const spotsClr = isFull ? '#EF4444' : (spots ?? 99) <= 3 ? C.ORANGE : C.TEAL;

  const { bg: catBg, text: catTxt } = catColors(item.categoryName);
  const schedType = deriveScheduleType(item);
  const { bg: sBg, text: sTxt } = schedColors(schedType);
  const dateLine = buildDateLine(item);
  const timeLine = buildTimeLine(item);

  return (
    <TouchableOpacity style={[styles.oppCard, isFull && { opacity: 0.65 }]} onPress={onPress} activeOpacity={0.85}>
      {/* Top row: category pill (left) | schedule type + spots (right) */}
      <View style={styles.oppRow}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={[styles.catPill, { backgroundColor: catBg }]}>
            <Text style={[styles.catPillText, { color: catTxt }]}>
              {item.categoryName ?? 'General'}
            </Text>
          </View>
          <Text style={styles.oppTitle} numberOfLines={2}>
            {item.title ?? item.projectName ?? 'Volunteer Opportunity'}
          </Text>
          <Text style={styles.oppSub} numberOfLines={1}>
            {item.orgName}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {item.distanceKm != null ? (() => {
            const km = Number(item.distanceKm);
            const label = km < 1 ? `${Math.round(km * 1000)} M` : `${km.toFixed(1)} KM`;
            return <Text style={styles.distChip}>📍 {label}</Text>;
          })() : null}
          {schedType ? (
            <View style={[styles.typePill, { backgroundColor: sBg, marginTop: item.distanceKm != null ? 4 : 0 }]}>
              <Text style={[styles.typePillText, { color: sTxt }]}>{schedType}</Text>
            </View>
          ) : null}
          {spotsTxt ? (
            <Text style={[styles.spotsText, { color: spotsClr }]}>{spotsTxt}</Text>
          ) : null}
        </View>
      </View>

      {/* Info rows: date, time, location */}
      <View style={styles.infoRows}>
        {dateLine ? <Text style={styles.infoRow}>📅 {dateLine}</Text> : null}
        {timeLine  ? <Text style={styles.infoRow}>🕐 {timeLine}</Text>  : null}
        {(item.locationName || item.address || item.city) ? (
          <Text style={styles.infoRow} numberOfLines={1}>
            📍 {item.locationName || [item.address, item.city].filter(Boolean).join(', ')}
          </Text>
        ) : null}
      </View>

      {/* Skill tags */}
      {item.skills?.length ? (
        <View style={styles.tagRow}>
          {item.skills.slice(0, 3).map((s, i) => (
            <View key={i} style={styles.skillTag}>
              <Text style={styles.skillTagText}>{s.skillName}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Capacity */}
      {max > 0 ? (
        <>
          <Text style={styles.capText}>{curr} / {max} filled</Text>
          <View style={styles.capBar}>
            <View style={[styles.capFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }]} />
          </View>
        </>
      ) : null}

      {/* Actions */}
      <View style={styles.cardActions}>
        {isFull ? (
          <View style={[styles.applyBtn, { backgroundColor: '#F0F2F8', flex: 2 }]}>
            <Text style={{ color: C.TEXT2, fontSize: 13 }}>No spots available</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.applyBtn, { flex: 2 }]} onPress={onApply} accessibilityLabel="Apply">
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.shareBtn} onPress={onShare} accessibilityLabel="Share">
          <Text style={styles.shareBtnText}>↗ Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function AllOpportunitiesScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]             = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch]         = useState('');
  const [activeLocation, setActiveLocation] = useState<string>('Nearby');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeType, setActiveType] = useState<string>('Any Schedule');
  const [applyProject, setApplyProject] = useState<Project | null>(null);
  const [shareProject, setShareProject] = useState<Project | null>(null);
  const [userCoords, setUserCoords]     = useState<{ lat: number; lon: number } | null>(null);
  const searchRef = useRef('');

  // Capture GPS on mount so Nearby results are sorted by distance
  useEffect(() => {
    try {
      const Geolocation = require('@react-native-community/geolocation').default;
      Geolocation.getCurrentPosition(
        (pos: { coords: { latitude: number; longitude: number } }) => {
          setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => { /* permission denied — no coords, city filter still works */ },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    } catch { /* package not installed */ }
  }, []);

  const fetchData = useCallback(async (pg: number, refresh = false) => {
    if (pg === 1) { refresh ? setRefreshing(true) : setLoading(true); }
    else { setLoadingMore(true); }
    try {
      const keyword = searchRef.current.trim() || undefined;
      const cityFilter = activeLocation !== 'Nearby' ? activeLocation : undefined;
      const categoryFilter = activeCategory !== 'All' ? activeCategory : undefined;
      const nearbyCoords = activeLocation === 'Nearby' && userCoords
        ? { userLat: userCoords.lat, userLon: userCoords.lon }
        : {};
      const res = await listProjects({
        keyword,
        city: cityFilter,
        category: categoryFilter,
        pageNumber: pg,
        pageSize: 15,
        ...nearbyCoords,
      });
      if (res.data?.isSuccess && res.data.data) {
        const { items, totalCount: tc } = res.data.data;
        setProjects(pg === 1 ? items : (prev) => [...prev, ...items]);
        setTotalCount(tc);
        setPage(pg);
      }
    } catch {
      Alert.alert('Error', 'Could not load opportunities.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [activeType, activeLocation, activeCategory, userCoords]);

  useEffect(() => { fetchData(1); }, [fetchData, activeLocation, activeCategory]);

  const handleSearch = () => {
    searchRef.current = search;
    fetchData(1);
  };

  const handleApply = useCallback((project: Project) => {
    setApplyProject(project);
  }, []);

  const handleShare = useCallback((project: Project) => {
    setShareProject(project);
  }, []);

  const handleLoadMore = () => {
    if (!loadingMore && projects.length < totalCount) {
      fetchData(page + 1);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>All Opportunities</Text>
        <Text style={styles.filterText}>Filter</Text>
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        {/* Search */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search opportunities..."
            placeholderTextColor={C.TEXT3}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            accessibilityLabel="Search opportunities"
          />
        </View>
        {/* Location chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 5 }}>
          <View style={styles.chipRow}>
            {LOCATION_CHIPS.map((loc) => (
              <TouchableOpacity
                key={loc}
                style={[styles.filterChip, activeLocation === loc && styles.filterChipActive]}
                onPress={() => setActiveLocation(loc)}
                accessibilityLabel={loc}
              >
                {loc === 'Nearby' && (
                  <Text style={[styles.chipLocIcon, activeLocation === loc && { color: '#fff' }]}>📍 </Text>
                )}
                <Text style={[styles.filterChipText, activeLocation === loc && styles.filterChipTextActive]}>{loc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          <View style={styles.chipRow}>
            {CATEGORY_CHIPS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.filterChip, activeCategory === c && styles.filterChipActive]}
                onPress={() => setActiveCategory(c)}
                accessibilityLabel={c}
              >
                <Text style={[styles.filterChipText, activeCategory === c && styles.filterChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {/* Schedule type chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {TYPE_CHIPS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.filterChip, activeType === t && styles.filterChipActive]}
                onPress={() => setActiveType(t)}
                accessibilityLabel={t}
              >
                <Text style={[styles.filterChipText, activeType === t && styles.filterChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Results */}
      <FlatList
        data={projects}
        keyExtractor={(p) => String(p.projectId)}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={
          <Text style={styles.resultCount}>{totalCount} opportunities found</Text>
        }
        renderItem={({ item }) => (
          <OppCard
            item={item}
            onApply={() => handleApply(item)}
            onShare={() => handleShare(item)}
            onPress={() => nav.navigate('ProjectDetail', { projectId: item.projectId })}
          />
        )}
        onRefresh={() => fetchData(1, true)}
        refreshing={refreshing}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={C.PRIMARY} style={{ marginVertical: 12 }} /> : null}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No opportunities found.</Text>
            <Text style={styles.emptySubText}>Try changing filters or search terms.</Text>
          </View>
        }
      />

      <ApplyModal
        visible={applyProject !== null}
        project={applyProject}
        onClose={() => setApplyProject(null)}
      />

      <ShareSheet
        project={shareProject}
        onClose={() => setShareProject(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.BG },
  centered:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:          { color: C.PRIMARY, fontSize: 15 },
  topBarTitle:       { fontSize: 16, fontWeight: '700', color: C.TEXT },
  filterText:        { color: C.PRIMARY, fontSize: 13 },
  filterContainer:   { backgroundColor: C.CARD, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  searchBar:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.BG, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 7, gap: 6 },
  searchIcon:        { fontSize: 14 },
  searchInput:       { flex: 1, fontSize: 13, color: C.TEXT },
  chipRow:           { flexDirection: 'row', gap: 6, paddingRight: 12 },
  filterChip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, backgroundColor: C.BG, borderWidth: 1, borderColor: C.BORDER },
  filterChipActive:  { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  filterChipText:    { fontSize: 11, color: C.TEXT2, fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },
  chipLocIcon:           { fontSize: 11, marginRight: 3 },
  listContent:       { padding: 12 },
  resultCount:       { fontSize: 13, color: C.TEXT2, marginBottom: 10 },
  oppCard:           { backgroundColor: C.CARD, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  oppRow:            { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 7 },
  catPill:           { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginBottom: 4 },
  catPillText:       { fontSize: 11, fontWeight: '600' },
  oppTitle:          { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  oppSub:            { fontSize: 12, color: C.TEXT2 },
  distChip:          { fontSize: 10, fontWeight: '700', color: C.TEAL, backgroundColor: `${C.TEAL}20`, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', marginBottom: 2 },
  typePill:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginBottom: 4 },
  typePillText:      { fontSize: 10, color: C.TEXT2, fontWeight: '600' },
  spotsText:         { fontSize: 12, fontWeight: '700', marginTop: 2 },
  infoRows:          { gap: 3, marginBottom: 7 },
  infoRow:           { fontSize: 12, color: C.TEXT2 },
  tagRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 7 },
  skillTag:          { backgroundColor: `${C.PRIMARY}15`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  skillTagText:      { fontSize: 11, color: C.PRIMARY, fontWeight: '500' },
  capText:           { fontSize: 11, color: C.TEXT2, marginBottom: 3 },
  capBar:            { height: 5, backgroundColor: C.BORDER, borderRadius: 3, overflow: 'hidden', marginBottom: 9 },
  capFill:           { height: '100%', borderRadius: 3 },
  cardActions:       { flexDirection: 'row', gap: 7 },
  applyBtn:          { backgroundColor: C.PRIMARY, borderRadius: 9, padding: 12, alignItems: 'center', justifyContent: 'center' },
  applyBtnText:      { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareBtn:          { flex: 1, borderWidth: 1, borderColor: C.BORDER, borderRadius: 9, padding: 8, alignItems: 'center', justifyContent: 'center' },
  shareBtnText:      { fontSize: 14, color: C.TEXT2 },
  emptyText:         { fontSize: 16, color: C.TEXT2, fontWeight: '600', marginBottom: 4 },
  emptySubText:      { fontSize: 13, color: C.TEXT3, textAlign: 'center' },
});

// ── Share sheet styles (separate object keeps main styles clean) ─────────────
const ss = StyleSheet.create({
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.CARD, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 10 },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginBottom: 14 },
  sheetBanner:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: `${C.PRIMARY}12`, borderRadius: 14, padding: 14, marginBottom: 16 },
  sheetBannerIcon:{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  sheetTitle:     { fontSize: 16, fontWeight: '800', color: C.PRIMARY },
  sheetSub:       { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  closeBtn:       { padding: 4 },
  closeX:         { fontSize: 16, color: C.TEXT2, fontWeight: '600' },
  previewCard:    { backgroundColor: C.BG, borderRadius: 12, padding: 14, marginBottom: 14 },
  previewTitle:   { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  previewMeta:    { fontSize: 12, color: C.TEXT2 },
  urlRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.BG, borderRadius: 10, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, marginBottom: 20, gap: 8 },
  urlText:        { flex: 1, fontSize: 12, color: C.PRIMARY, fontWeight: '500' },
  copyBtn:        { backgroundColor: C.PRIMARY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  copyBtnText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  shareViaLabel:  { fontSize: 12, color: C.TEXT3, fontWeight: '600', marginBottom: 14, letterSpacing: 0.5 },
  shareIconRow:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
  shareIconWrap:  { alignItems: 'center', gap: 6 },
  shareIconBg:    { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  shareIconEmoji: { fontSize: 26 },
  shareIconLabel: { fontSize: 11, color: C.TEXT2, fontWeight: '500' },
  doneBtn:        { backgroundColor: C.PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  doneBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});