import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { list as listProjects, apply } from '../../api/project.api';
import type { Project } from '../../types/api.types';

const C = AppConfig.COLORS;

const CATEGORY_CHIPS = ['All', 'Community', 'Environment', 'Education', 'Healthcare', 'Animal Welfare'] as const;
const TYPE_CHIPS     = ['Any Schedule', 'Recurring', 'One-time', 'Flexible'] as const;

const CATEGORY_COLOR: Record<string, string> = {
  Community:       C.TEAL,
  Environment:     C.TEAL,
  Education:       C.PRIMARY,
  Healthcare:      '#F59E0B',
  'Animal Welfare':'#8B5CF6',
};

function spotsColor(spots: number) {
  if (spots <= 3) { return '#EF4444'; }
  if (spots <= 10) { return C.YELLOW; }
  return C.TEAL;
}

function capacityBarColor(pct: number) {
  if (pct >= 1) { return '#EF4444'; }
  if (pct >= 0.85) { return C.YELLOW; }
  return C.TEAL;
}

function OppCard({ item, onApply, onPress }: { item: Project; onApply: () => void; onPress: () => void }) {
  const max     = item.maxParticipants ?? item.maxVolunteers ?? 0;
  const curr    = item.currentParticipants ?? item.approvedCount ?? 0;
  const spots   = item.spotsLeft ?? (max - curr);
  const pct     = max > 0 ? curr / max : 0;
  const isFull  = spots <= 0;

  return (
    <TouchableOpacity style={[styles.oppCard, isFull && { opacity: 0.6 }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.oppRow}>
        <View style={{ flex: 1 }}>
          <View style={[styles.catPill, { backgroundColor: `${CATEGORY_COLOR[item.categoryName ?? ''] ?? C.PRIMARY}20` }]}>
            <Text style={[styles.catPillText, { color: CATEGORY_COLOR[item.categoryName ?? ''] ?? C.PRIMARY }]}>
              {item.categoryName ?? 'Volunteer'}
            </Text>
          </View>
          <Text style={styles.oppTitle}>{item.title}</Text>
          <Text style={styles.oppSub}>
            {item.orgName}{item.distanceKm != null ? ` · ${item.distanceKm.toFixed(1)} km` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.typePill, { backgroundColor: '#F3F4F6' }]}>
            <Text style={styles.typePillText}>{item.scheduleType ?? 'One-time'}</Text>
          </View>
          {!isFull && (
            <Text style={[styles.spotsText, { color: spotsColor(spots) }]}>
              {spots <= 3 ? `${spots} spots!` : `${spots} spots left`}
            </Text>
          )}
          {isFull && <Text style={[styles.spotsText, { color: '#EF4444' }]}>Full</Text>}
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.infoRows}>
        {item.startDate && (
          <Text style={styles.infoRow}>📅 {item.startDate}</Text>
        )}
        {item.startTime && (
          <Text style={styles.infoRow}>🕐 {item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}</Text>
        )}
        {item.locationName && (
          <Text style={styles.infoRow}>📍 {item.locationName}</Text>
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
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]             = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeType, setActiveType] = useState<string>('Any Schedule');
  const [applying, setApplying]     = useState<number | null>(null);
  const searchRef = useRef('');

  const fetchData = useCallback(async (pg: number, refresh = false) => {
    if (pg === 1) { refresh ? setRefreshing(true) : setLoading(true); }
    else { setLoadingMore(true); }
    try {
      const scheduleType = activeType === 'Any Schedule' ? undefined : activeType.toUpperCase().replace('-', '_');
      const keyword = searchRef.current.trim() || undefined;
      const res = await listProjects({
        keyword,
        projectTypeLkpId: undefined,
        pageNumber: pg,
        pageSize: 15,
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
  }, [activeType]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  const handleSearch = () => {
    searchRef.current = search;
    fetchData(1);
  };

  const handleApply = useCallback(async (projectId: number) => {
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
                onPress={() => { setActiveType(t); }}
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
            onApply={() => handleApply(item.projectId)}
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
  filterContainer:   { backgroundColor: C.CARD, padding: 10, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  searchBar:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.BG, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, gap: 6 },
  searchIcon:        { fontSize: 14 },
  searchInput:       { flex: 1, fontSize: 13, color: C.TEXT },
  chipRow:           { flexDirection: 'row', gap: 6, paddingRight: 12 },
  filterChip:        { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: C.BG, borderWidth: 1, borderColor: C.BORDER },
  filterChipActive:  { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  filterChipText:    { fontSize: 12, color: C.TEXT2, fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },
  listContent:       { padding: 12 },
  resultCount:       { fontSize: 13, color: C.TEXT2, marginBottom: 10 },
  oppCard:           { backgroundColor: C.CARD, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  oppRow:            { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 7 },
  catPill:           { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginBottom: 4 },
  catPillText:       { fontSize: 11, fontWeight: '600' },
  oppTitle:          { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  oppSub:            { fontSize: 12, color: C.TEXT2 },
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