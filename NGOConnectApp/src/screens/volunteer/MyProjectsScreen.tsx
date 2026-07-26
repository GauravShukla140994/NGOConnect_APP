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
import { fmtDate } from '../../utils/dateUtils';
import { getMyApplications } from '../../api/user.api';
import type { UserApplication } from '../../types/api.types';

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

// ── Tab filtering (mirrors ImpactScreen logic) ──────────────────────────────
const isCompleted = (a: UserApplication) =>
  ['COMPLETED', 'EXPIRED', 'CANCELLED'].includes(a.projectStatusCode ?? '');
const isUpcoming  = (a: UserApplication) =>
  a.statusCode === 'APPROVED' && ['UPCOMING', 'ACTIVE'].includes(a.projectStatusCode ?? '');
const isApplied   = (a: UserApplication) =>
  !isUpcoming(a) && !isCompleted(a);

// fmtDate imported from utils/dateUtils (26-Jul-2026 format)

function ProjectCard({ item, tab }: { item: UserApplication; tab: Tab }) {
  const statusColor = STATUS_COLORS[item.statusCode] ?? STATUS_COLORS.APPROVED;
  const borderColor = TAB_BORDER[tab];
  const location    = [item.landmark, item.city].filter(Boolean).join(', ');
  const dateLabel   = item.recurStart ? fmtDate(item.recurStart) : undefined;

  return (
    <View style={[styles.projectCard, { borderLeftColor: borderColor }]}>
      <View style={styles.cardRow}>
        <Text style={styles.projectTitle}>{item.projectName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusText, { color: statusColor.text }]}>
            {item.statusCode === 'PENDING'   ? '⏳ Pending'  :
             item.statusCode === 'APPROVED'  ? '✓ Approved' :
             item.statusCode === 'REJECTED'  ? '✗ Rejected' :
             item.statusCode === 'WITHDRAWN' ? 'Withdrawn'  :
             item.statusCode}
          </Text>
        </View>
      </View>

      <Text style={styles.orgName}>{item.orgName}</Text>

      {(dateLabel || location) ? (
        <Text style={styles.dateText}>
          {dateLabel ? `📅 ${dateLabel}` : ''}
          {dateLabel && location ? ' · ' : ''}
          {location}
        </Text>
      ) : null}

      {/* Applied tab footer */}
      {tab === 'applied' && (
        <View style={styles.cardFooter}>
          <Text style={[styles.footerMeta, { color: statusColor.text }]}>
            Applied {fmtDate(item.createdAt) ?? ''}
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
          {item.scheduleTypeCode && (
            <Text style={styles.sessionText}>
              {item.scheduleTypeName ?? item.scheduleTypeCode}
              {item.recurDays ? ` · ${item.recurDays}` : ''}
              {item.sessionStartTime ? ` · ${item.sessionStartTime}` : ''}
            </Text>
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

      {/* Completed tab — hours / skills / certificate */}
      {tab === 'completed' && (
        <>
          <View style={styles.completedRow}>
            {item.hoursLogged != null && (
              <View>
                <Text style={styles.completedLabel}>Hours</Text>
                <Text style={styles.completedValue}>{item.hoursLogged}h</Text>
              </View>
            )}
            {item.skillRatings && item.skillRatings.length > 0 && (
              <View>
                <Text style={styles.completedLabel}>Top Skill</Text>
                <Text style={styles.completedValue}>{item.skillRatings[0].skillName}</Text>
              </View>
            )}
            {item.impactNote ? (
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.completedLabel}>Impact</Text>
                <Text style={styles.completedValue}>{item.impactNote}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.certRow}>
            <Text style={styles.certStatus}>✓ Completed</Text>
          </View>
        </>
      )}
    </View>
  );
}

export default function MyProjectsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [allApps,    setAllApps]    = useState<UserApplication[]>([]);
  const [tab,        setTab]        = useState<Tab>('applied');
  const [loading,    setLoading]    = useState(true);
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
      const res = await getMyApplications();
      if (res.data?.isSuccess) {
        setAllApps(res.data.data ?? []);
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not load your projects.');
      }
    } catch {
      Alert.alert('Error', 'Could not load your projects.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Client-side tab filtering
  const tabItems: UserApplication[] =
    tab === 'applied'   ? allApps.filter(isApplied) :
    tab === 'upcoming'  ? allApps.filter(isUpcoming) :
                          allApps.filter(isCompleted);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>My Projects</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Swipe area */}
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
            data={tabItems}
            keyExtractor={(item, idx) => `${item.applicationId ?? idx}`}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
            renderItem={({ item }) => <ProjectCard item={item} tab={tab} />}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No {tab} projects yet.</Text>
                <TouchableOpacity onPress={() => nav.navigate('AllOpportunities' as never)}>
                  <Text style={styles.emptyLink}>Explore opportunities →</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.BG },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, marginTop: 60 },
  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:        { color: C.PRIMARY, fontSize: 16, fontWeight: '600' },
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
  certStatus:      { fontSize: 11, color: C.TEAL },
  emptyText:       { fontSize: 16, color: C.TEXT2, fontWeight: '600', marginBottom: 8 },
  emptyLink:       { color: C.PRIMARY, fontSize: 14, fontWeight: '600' },
});
