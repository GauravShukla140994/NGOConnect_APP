import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { getNearbyFeed, apply } from '../../api/project.api';
import { getMyDocuments } from '../../api/user.api';
import { useAuthStore } from '../../store/authStore';
import type { Project } from '../../types/api.types';
import { haversineKm, formatDistance } from '../../utils/geo';
import ProfileIncompleteSheet from '../../components/profile/ProfileIncompleteSheet';

const C = AppConfig.COLORS;

const CATEGORY_CHIPS = ['All', 'Community', 'Environment', 'Education', 'Healthcare', 'Animal Welfare'] as const;
const TYPE_CHIPS     = ['Any Schedule', 'Recurring', 'One-time', 'Flexible'] as const;

// Maps chip label → ValueCode returned by Project_GetNearbyFeed SP (ptv.ValueCode AS ProjectTypeCode)
const TYPE_CODE_MAP: Record<string, string> = {
  'One-time':  'ONE_TIME',
  'Recurring': 'RECURRING',
  'Flexible':  'FLEXIBLE',
};

const CATEGORY_COLOR: Record<string, string> = {
  Community:        C.TEAL,
  Environment:      C.TEAL,
  Education:        C.PRIMARY,
  Healthcare:       '#F59E0B',
  'Animal Welfare': '#8B5CF6',
};

function spotsColor(spots: number) {
  if (spots <= 3)  return '#EF4444';
  if (spots <= 10) return C.YELLOW;
  return C.TEAL;
}

function capacityBarColor(pct: number) {
  if (pct >= 1)    return '#EF4444';
  if (pct >= 0.85) return C.YELLOW;
  return C.TEAL;
}

function OppCard({ item, onApply, onPress }: { item: Project; onApply: () => void; onPress: () => void }) {
  const max    = item.maxParticipants ?? item.maxVolunteers ?? 0;
  const curr   = item.currentParticipants ?? item.approvedCount ?? 0;
  const spots  = item.spotsLeft ?? (max - curr);
  const pct    = max > 0 ? curr / max : 0;
  const isFull = spots <= 0;

  return (
    <TouchableOpacity style={[styles.oppCard, isFull && { opacity: 0.6 }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.oppRow}>
        <View style={{ flex: 1 }}>
          <View style={[styles.catPill, { backgroundColor: `${CATEGORY_COLOR[item.categoryName ?? ''] ?? C.PRIMARY}20` }]}>
            <Text style={[styles.catPillText, { color: CATEGORY_COLOR[item.categoryName ?? ''] ?? C.PRIMARY }]}>
              {item.categoryName ?? 'Volunteer'}
            </Text>
          </View>
          <Text style={styles.oppTitle}>{item.title ?? item.projectName}</Text>
          <Text style={styles.oppSub}>
            {item.orgName}
            {item.distanceKm != null ? ` · 📍 ${formatDistance(Number(item.distanceKm))}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.typePill, { backgroundColor: '#F3F4F6' }]}>
            <Text style={styles.typePillText}>{(item as any).projectType ?? item.scheduleType ?? 'One-time'}</Text>
          </View>
          {!isFull && (
            <Text style={[styles.spotsText, { color: spotsColor(spots) }]}>
              {spots <= 3 ? `${spots} ${spots === 1 ? 'spot' : 'spots'}!` : `${spots} spots left`}
            </Text>
          )}
          {isFull && <Text style={[styles.spotsText, { color: '#EF4444' }]}>Full</Text>}
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.infoRows}>
        {item.oneTimeDate && (
          <Text style={styles.infoRow}>📅 {item.oneTimeDate}</Text>
        )}
        {item.recurStart && (
          <Text style={styles.infoRow}>📅 {item.recurStart}{item.recurEnd ? ` – ${item.recurEnd}` : ''}</Text>
        )}
        {item.sessionStartTime && (
          <Text style={styles.infoRow}>🕐 {item.sessionStartTime}{item.sessionEndTime ? ` – ${item.sessionEndTime}` : ''}</Text>
        )}
        {(item.locationName ?? item.landmark) && (
          <Text style={styles.infoRow}>📍 {item.locationName ?? item.landmark}</Text>
        )}
      </View>

      {/* Skills */}
      {item.skills?.length ? (
        <View style={styles.tagRow}>
          {item.skills.slice(0, 3).map((s, i) => (
            <View key={i} style={styles.skillTag}>
              <Text style={styles.skillTagText}>{s.skillName}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Capacity bar */}
      {max > 0 && (
        <>
          <Text style={styles.capText}>{curr} / {max} filled</Text>
          <View style={styles.capBar}>
            <View style={[styles.capFill, { width: `${Math.min(pct, 1) * 100}%` as any, backgroundColor: capacityBarColor(pct) }]} />
          </View>
        </>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        {isFull ? (
          <View style={[styles.applyBtn, { backgroundColor: '#F0F2F8', flex: 2 }]}>
            <Text style={{ color: C.TEXT2, fontSize: 12 }}>No spots available</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.applyBtn, { flex: 2 }]} onPress={onApply} accessibilityLabel="Apply">
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.shareBtn} accessibilityLabel="Share">
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function AllOpportunitiesScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // All fetched projects (full list for client-side filtering)
  const [allProjects, setAllProjects]     = useState<Project[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [page, setPage]                   = useState(1);
  const [totalCount, setTotalCount]       = useState(0);
  const [applying, setApplying]           = useState<number | null>(null);

  // Profile gate state
  const [gateVisible, setGateVisible]     = useState(false);
  const [gateMissing, setGateMissing]     = useState<string[]>([]);
  const [gateTargetStep, setGateTargetStep] = useState(0);
  const [pendingProjectId, setPendingProjectId] = useState<number | null>(null);

  // GPS
  const [userCoords, setUserCoords]       = useState<{ lat: number; lon: number } | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const userCoordsRef = useRef<{ lat: number; lon: number } | null>(null);

  // Client-side filters
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeType, setActiveType]         = useState<string>('Any Schedule');

  // Fetch GPS on mount — non-blocking, feed loads with or without coords
  useEffect(() => {
    try {
      const Geolocation = require('@react-native-community/geolocation').default;
      Geolocation.getCurrentPosition(
        (pos: { coords: { latitude: number; longitude: number } }) => {
          const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          userCoordsRef.current = coords;
          setUserCoords(coords);
          setLocationReady(true);
        },
        () => { setLocationReady(true); },   // no GPS → still load without coords
        { enableHighAccuracy: false, timeout: 8000 },
      );
    } catch {
      setLocationReady(true);
    }
  }, []);

  const fetchData = useCallback(async (pg: number, refresh = false) => {
    if (pg === 1) { refresh ? setRefreshing(true) : setLoading(true); }
    else { setLoadingMore(true); }
    try {
      const coords = userCoordsRef.current;
      const res = await getNearbyFeed({
        pageNumber: pg,
        pageSize:   20,
        ...(coords ? { userLat: coords.lat, userLon: coords.lon } : {}),
      });
      if (res.data?.isSuccess && res.data.data) {
        const coords = userCoordsRef.current;
        // Stamp client-side distance for any project that has lat/lon but no server-side distanceKm
        const stamped = res.data.data.items.map((p: any) => {
          if (p.distanceKm != null) return p;
          if (coords && p.latitude != null && p.longitude != null) {
            return { ...p, distanceKm: Math.round(haversineKm(coords.lat, coords.lon, Number(p.latitude), Number(p.longitude)) * 10) / 10 };
          }
          return p;
        });
        setAllProjects(pg === 1 ? stamped : prev => [...prev, ...stamped]);
        setTotalCount(res.data.data.totalCount);
        setPage(pg);
      }
    } catch {
      Alert.alert('Error', 'Could not load opportunities.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  // Wait for location attempt before first fetch so page 1 always has coords
  useEffect(() => {
    if (locationReady) fetchData(1);
  }, [locationReady, fetchData]);

  /** Returns { passed: true } or { passed: false, missing: string[], targetStep: number } */
  const checkProfileComplete = useCallback(async () => {
    const user = useAuthStore.getState().user as any;
    const missing: string[] = [];

    if (!user?.firstName || !user?.lastName) missing.push('Full name');
    if (!user?.city)                          missing.push('City');
    if (!user?.mobile)                        missing.push('Mobile number');

    // Check documents
    let hasGovtId   = false;
    let hasAddrProof = false;
    try {
      const docRes = await getMyDocuments();
      if (docRes.data?.isSuccess && Array.isArray(docRes.data.data)) {
        const docs = docRes.data.data as Array<{ docTypeCode: string }>;
        const GOVT_ID_CODES = ['PHOTO_ID', 'AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LIC'];
        hasGovtId    = docs.some(d => GOVT_ID_CODES.includes(d.docTypeCode));
        hasAddrProof = docs.some(d => d.docTypeCode === 'ADDR_PROOF');
      }
    } catch {
      // If doc fetch fails, assume missing so user is guided to complete profile
    }
    if (!hasGovtId)    missing.push('Government Photo ID');
    if (!hasAddrProof) missing.push('Address Proof');

    if (missing.length === 0) return { passed: true, missing: [], targetStep: 0 };

    // targetStep: if only docs missing → step 4 (Documents); else step 0 (Basic Info)
    const onlyDocsMissing = missing.every(m => m === 'Government Photo ID' || m === 'Address Proof');
    return { passed: false, missing, targetStep: onlyDocsMissing ? 4 : 0 };
  }, []);

  const handleApply = useCallback(async (projectId: number) => {
    // Gate check first
    const gate = await checkProfileComplete();
    if (!gate.passed) {
      setGateMissing(gate.missing);
      setGateTargetStep(gate.targetStep);
      setPendingProjectId(projectId);
      setGateVisible(true);
      return;
    }

    setApplying(projectId);
    try {
      const res = await apply(projectId);
      if (res.data?.isSuccess) {
        Alert.alert('Applied!', 'Your application has been submitted.');
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not apply.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setApplying(null);
    }
  }, [checkProfileComplete]);

  const handleLoadMore = () => {
    if (!loadingMore && allProjects.length < totalCount) {
      fetchData(page + 1);
    }
  };

  // Client-side filter on fetched results
  // projectTypeCode comes from ptv.ValueCode AS ProjectTypeCode in Project_GetNearbyFeed SP
  // It is ONE_TYPE, RECURRING, or FLEXIBLE — exact match against TYPE_CODE_MAP
  const displayed = allProjects.filter(p => {
    const cat      = (p.categoryName ?? (p as any).category ?? '').toLowerCase();
    const typeCode = ((p as any).projectTypeCode ?? p.scheduleType ?? '').toUpperCase();

    const catMatch  = activeCategory === 'All' || cat.includes(activeCategory.toLowerCase());
    const typeMatch = activeType === 'Any Schedule' || typeCode === (TYPE_CODE_MAP[activeType] ?? '');

    return catMatch && typeMatch;
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
          <Text style={styles.loadingText}>Finding opportunities near you…</Text>
        </View>
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
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.topBarTitle}>Nearby Opportunities</Text>
          {userCoords && (
            <Text style={styles.topBarSub}>Sorted nearest first</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter chips */}
      <View style={styles.filterContainer}>
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

      {/* List */}
      <FlatList
        data={displayed}
        keyExtractor={(p) => String(p.projectId)}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={
          <View style={styles.resultHeader}>
            <Text style={styles.resultCount}>
              {displayed.length} of {totalCount} opportunities
            </Text>
            {!userCoords && (
              <Text style={styles.noGpsNote}>📍 Enable location for distance sorting</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <OppCard
            item={item}
            onApply={() => handleApply(item.projectId)}
            onPress={() => nav.navigate('ProjectDetail', { projectId: item.projectId })}
          />
        )}
        onRefresh={() => fetchData(1, true)}
        refreshing={refreshing}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator size="small" color={C.PRIMARY} style={{ marginVertical: 12 }} />
            : null
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No opportunities found.</Text>
            <Text style={styles.emptySubText}>Try changing filters or check back later.</Text>
          </View>
        }
      />

      <ProfileIncompleteSheet
        visible={gateVisible}
        onClose={() => { setGateVisible(false); setPendingProjectId(null); }}
        missingItems={gateMissing}
        targetStep={gateTargetStep}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: C.BG },
  centered:             { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText:          { fontSize: 13, color: C.TEXT2, marginTop: 10 },
  topBar:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:             { color: C.PRIMARY, fontSize: 16, fontWeight: '600', minWidth: 70 },
  topBarTitle:          { fontSize: 16, fontWeight: '700', color: C.TEXT },
  topBarSub:            { fontSize: 11, color: C.TEXT3, marginTop: 1 },
  filterContainer:      { backgroundColor: C.CARD, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  chipRow:              { flexDirection: 'row', gap: 6, paddingRight: 12 },
  filterChip:           { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: C.BG, borderWidth: 1, borderColor: C.BORDER },
  filterChipActive:     { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  filterChipText:       { fontSize: 12, color: C.TEXT2, fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  resultHeader:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  resultCount:          { fontSize: 13, color: C.TEXT2, fontWeight: '500' },
  noGpsNote:            { fontSize: 12, color: C.TEXT3, fontStyle: 'italic' },
  listContent:          { paddingTop: 4 },

  // Opportunity card
  oppCard:    { backgroundColor: C.CARD, borderRadius: 14, marginHorizontal: 12, marginBottom: 10, padding: 14, ...AppConfig.SHADOW.CARD },
  oppRow:     { flexDirection: 'row', gap: 10 },
  catPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 6 },
  catPillText:{ fontSize: 11, fontWeight: '700' },
  typePill:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start' },
  typePillText:{ fontSize: 10, fontWeight: '600', color: C.TEXT2 },
  oppTitle:   { fontSize: 14, fontWeight: '700', color: C.TEXT, lineHeight: 20, marginBottom: 2, flex: 1 },
  oppSub:     { fontSize: 12, color: C.TEXT2, marginBottom: 6 },
  infoRows:   { gap: 3, marginBottom: 8 },
  infoRow:    { fontSize: 12, color: C.TEXT3 },
  tagRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  skillTag:   { backgroundColor: C.BG, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: C.BORDER },
  skillTagText:{ fontSize: 11, color: C.TEXT2 },
  spotsText:  { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  capBar:     { height: 4, backgroundColor: C.BG, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  capFill:    { height: '100%' as any, borderRadius: 2 },
  capText:    { fontSize: 11, color: C.TEXT3, marginBottom: 8 },
  cardActions:{ flexDirection: 'row', gap: 8, marginTop: 4 },
  applyBtn:   { flex: 1, backgroundColor: C.PRIMARY, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  applyBtnText:{ fontSize: 13, fontWeight: '700', color: '#fff' },
  shareBtn:   { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  shareBtnText:{ fontSize: 13, fontWeight: '600', color: C.TEXT2 },

  // Empty state
  emptyText:    { fontSize: 15, fontWeight: '600', color: C.TEXT, textAlign: 'center', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: C.TEXT2, textAlign: 'center' },
});