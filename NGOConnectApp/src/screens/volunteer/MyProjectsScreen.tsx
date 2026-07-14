import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
// getMyProjects — backend endpoint not yet implemented (s-all-projects screen pending)
// import { getMyProjects } from '../../api/user.api';
const getMyProjects = (_p: any): Promise<{ data?: { isSuccess: number; data?: { items: any[] } } }> => Promise.reject(new Error('Not implemented'));

const C = AppConfig.COLORS;

type Tab = 'applied' | 'upcoming' | 'completed';
const TABS: { key: Tab; label: string }[] = [
  { key: 'applied',   label: 'Applied'   },
  { key: 'upcoming',  label: 'Upcoming'  },
  { key: 'completed', label: 'Completed' },
];

const TAB_BORDER: Record<Tab, string> = {
  applied:   C.YELLOW,
  upcoming:  C.PRIMARY,
  completed: C.TEAL,
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING:   { bg: '#FFF4E5', text: '#92400E' },
  APPROVED:  { bg: `${C.PRIMARY}15`, text: C.PRIMARY },
  REJECTED:  { bg: '#FFF0F0', text: '#DC2626' },
  WITHDRAWN: { bg: '#F3F4F6', text: C.TEXT2 },
};

function ProjectCard({ item, tab }: { item: any; tab: Tab }) {
  const statusColor = STATUS_COLORS[item.statusCode] ?? STATUS_COLORS.APPROVED;
  const borderColor = TAB_BORDER[tab];

  return (
    <View style={[styles.projectCard, { borderLeftColor: borderColor }]}>
      <View style={styles.cardRow}>
        <Text style={styles.projectTitle}>{item.title ?? item.projectTitle}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusText, { color: statusColor.text }]}>
            {item.statusCode === 'PENDING' ? '⏳ Pending' :
             item.statusCode === 'APPROVED' ? '✓ Approved' :
             item.statusCode ?? item.applicationStatusCode ?? 'Applied'}
          </Text>
        </View>
      </View>
      <Text style={styles.orgName}>{item.orgName}</Text>
      {(item.startDate || item.scheduleDate) && (
        <Text style={styles.dateText}>
          📅 {item.startDate ?? item.scheduleDate}
          {item.locationName ? ` · ${item.locationName}` : ''}
        </Text>
      )}

      {/* Applied tab footer */}
      {tab === 'applied' && item.appliedAt && (
        <View style={styles.cardFooter}>
          <Text style={[styles.footerMeta, { color: statusColor.text }]}>
            Applied {item.appliedAt}
            {item.statusCode === 'PENDING' ? ' · Awaiting review' : ''}
          </Text>
          {item.statusCode === 'PENDING' && (
            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => Alert.alert('Withdraw', 'Withdraw this application?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Withdraw', style: 'destructive', onPress: () => {} },
              ])}
              accessibilityLabel="Withdraw application"
            >
              <Text style={styles.withdrawBtnText}>Withdraw</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Upcoming tab — QR button */}
      {tab === 'upcoming' && (
        <>
          {item.sessionCount != null && (
            <Text style={styles.sessionText}>Registered for {item.sessionCount} sessions</Text>
          )}
          <View style={styles.qrSection}>
            <Text style={styles.qrHint}>At the venue? Ask admin to show the QR and scan it to log attendance.</Text>
            <TouchableOpacity
              style={styles.qrBtn}
              onPress={() => Alert.alert('QR Scan', 'QR scanner coming in Sprint 6')}
              accessibilityLabel="Scan QR code"
            >
              <Text style={styles.qrBtnText}>📷 Scan QR to Mark Attendance</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Completed tab — hours / rating / certificate */}
      {tab === 'completed' && (
        <>
          <View style={styles.completedRow}>
            {item.hoursLogged != null && (
              <View>
                <Text style={styles.completedLabel}>Hours</Text>
                <Text style={styles.completedValue}>{item.hoursLogged}h</Text>
              </View>
            )}
            {item.rating != null && (
              <View>
                <Text style={styles.completedLabel}>Rating</Text>
                <Text style={styles.completedValue}>{'⭐'.repeat(Math.round(item.rating ?? 0))} {item.rating?.toFixed(1)}</Text>
              </View>
            )}
            {item.impactNote && (
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.completedLabel}>Impact</Text>
                <Text style={styles.completedValue}>{item.impactNote}</Text>
              </View>
            )}
          </View>
          {item.certificateUrl && (
            <View style={styles.certRow}>
              <Text style={styles.certStatus}>✓ Completed</Text>
              <TouchableOpacity style={styles.certBtn} accessibilityLabel="Download certificate">
                <Text style={styles.certBtnText}>🎖 Download Certificate</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

export default function MyProjectsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [tab, setTab]               = useState<Tab>('applied');
  const [items, setItems]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Swipe to change tab ──────────────────────────────────────────────────────
  const swipeState = useRef({ tab: 'applied' as Tab, setTab: (_t: Tab) => {} });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        const { tab: curTab, setTab: change } = swipeState.current;
        const idx = TABS.findIndex(t => t.key === curTab);
        if ((dx < -40 || vx < -0.4) && idx < TABS.length - 1) change(TABS[idx + 1].key);
        else if ((dx > 40 || vx > 0.4) && idx > 0) change(TABS[idx - 1].key);
      },
    })
  ).current;
  swipeState.current = { tab, setTab };

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await getMyProjects({ tab, pageNumber: 1, pageSize: 20 });
      if (res.data?.isSuccess) {
        setItems(res.data.data?.items ?? []);
      }
    } catch {
      Alert.alert('Error', 'Could not load your projects.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>All Projects</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Swipe area — wraps tabs + content */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
            accessibilityLabel={t.label}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Info banner for applied */}
      {tab === 'applied' && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            ⏳ Pending applications are reviewed by admin. Once approved they move to Upcoming.
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) => `${item.projectId ?? item.applicationId ?? idx}`}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => <ProjectCard item={item} tab={tab} />}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No {tab} projects yet.</Text>
              <TouchableOpacity onPress={() => nav.navigate('AllOpportunities')}>
                <Text style={styles.emptyLink}>Explore opportunities →</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
      </View>{/* end swipe area */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.BG },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:        { color: C.PRIMARY, fontSize: 15 },
  topBarTitle:     { fontSize: 16, fontWeight: '700', color: C.TEXT },
  tabBar:          { flexDirection: 'row', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tab:             { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:       { borderBottomWidth: 2, borderBottomColor: C.PRIMARY },
  tabText:         { fontSize: 13, color: C.TEXT2, fontWeight: '500' },
  tabTextActive:   { color: C.PRIMARY, fontWeight: '700' },
  infoBanner:      { margin: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 9, padding: 9 },
  infoBannerText:  { fontSize: 11, color: '#92400E', lineHeight: 15 },
  listContent:     { padding: 12 },
  projectCard:     { backgroundColor: C.CARD, borderRadius: 12, padding: 13, marginBottom: 9, borderLeftWidth: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardRow:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 },
  projectTitle:    { flex: 1, fontSize: 14, fontWeight: '700', color: C.TEXT, marginRight: 8 },
  statusBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText:      { fontSize: 11, fontWeight: '600' },
  orgName:         { fontSize: 12, color: C.TEXT2, marginBottom: 2 },
  dateText:        { fontSize: 12, color: C.TEXT2, marginBottom: 4 },
  cardFooter:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: C.BORDER },
  footerMeta:      { fontSize: 11 },
  withdrawBtn:     { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#FECACA', borderRadius: 7 },
  withdrawBtnText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
  sessionText:     { fontSize: 12, color: C.TEXT2, marginBottom: 4 },
  qrSection:       { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.BORDER },
  qrHint:          { fontSize: 11, color: C.TEXT2, marginBottom: 6, lineHeight: 14 },
  qrBtn:           { backgroundColor: C.PRIMARY, borderRadius: 9, padding: 9, alignItems: 'center' },
  qrBtnText:       { color: '#fff', fontSize: 13, fontWeight: '700' },
  completedRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: C.BORDER },
  completedLabel:  { fontSize: 11, color: C.TEXT2, marginBottom: 2 },
  completedValue:  { fontSize: 12, fontWeight: '700', color: C.YELLOW },
  certRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  certStatus:      { fontSize: 11, color: C.YELLOW },
  certBtn:         { backgroundColor: C.PRIMARY, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  certBtnText:     { fontSize: 13, color: '#fff', fontWeight: '700' },
  emptyText:       { fontSize: 16, color: C.TEXT2, fontWeight: '600', marginBottom: 8 },
  emptyLink:       { color: C.PRIMARY, fontSize: 14, fontWeight: '600' },
});