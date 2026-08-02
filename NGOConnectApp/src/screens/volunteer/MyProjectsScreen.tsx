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
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { fmtDate, fmtTime, fmtDateRange } from '../../utils/dateUtils';
import { getMyApplications, withdrawApplication } from '../../api/user.api';
import type { UserApplication } from '../../types/api.types';
import QRScannerModal    from '../../screens/profile/QRScannerModal';
import ProjectDetailModal from '../../screens/profile/ProjectDetailModal';
import CertificateModal   from '../../screens/common/CertificateModal';

const C = AppConfig.COLORS;

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'applied' | 'upcoming' | 'completed' | 'cancelled';
const TABS: { key: Tab; label: string }[] = [
  { key: 'applied',   label: 'Applied'   },
  { key: 'upcoming',  label: 'Upcoming'  },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const TAB_BORDER: Record<Tab, string> = {
  applied:   C.YELLOW,
  upcoming:  C.PRIMARY,
  completed: C.TEAL,
  cancelled: '#9CA3AF',
};

// ── Status chip configs ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING:   { bg: '#FFF4E5', text: '#92400E' },
  APPROVED:  { bg: `${C.PRIMARY}15`, text: C.PRIMARY },
  REJECTED:  { bg: '#FFF0F0', text: '#DC2626' },
  WITHDRAWN: { bg: '#F3F4F6', text: C.TEXT2 },
};

// ── Tab filtering ─────────────────────────────────────────────────────────────

const isUpcoming  = (a: UserApplication) =>
  a.statusCode === 'APPROVED' && ['UPCOMING', 'ACTIVE'].includes(a.projectStatusCode ?? '');
const isCompleted = (a: UserApplication) =>
  !['REJECTED', 'WITHDRAWN'].includes(a.statusCode) &&
  a.projectStatusCode === 'COMPLETED';
const isCancelled = (a: UserApplication) =>
  ['REJECTED', 'WITHDRAWN'].includes(a.statusCode) ||
  ['EXPIRED', 'CANCELLED'].includes(a.projectStatusCode ?? '');
const isApplied   = (a: UserApplication) => a.statusCode === 'PENDING';

// ── Helpers ───────────────────────────────────────────────────────────────────

function scheduleOneLiner(item: UserApplication): string {
  const location = [item.city, item.landmark].filter(Boolean).join(', ');
  const timeStr  = item.sessionStartTime && item.sessionEndTime
    ? `${fmtTime(item.sessionStartTime)} – ${fmtTime(item.sessionEndTime)}`
    : item.sessionStartTime ? fmtTime(item.sessionStartTime) : '';

  if (item.scheduleTypeCode === 'ONE_TIME') {
    // oneTimeDate is correct field; fall back to recurStart for older API responses
    const date = fmtDate(item.oneTimeDate ?? item.recurStart);
    return [date ? `📅 ${date}` : '', timeStr, location].filter(Boolean).join(' · ');
  }
  if (item.scheduleTypeCode === 'RECURRING') {
    const dateRange = fmtDateRange(item.recurStart, item.recurEnd);
    const days = item.recurDays
      ? item.recurDays.split(',').map(d => d.trim().slice(0, 3)).join(' & ')
      : '';
    return [dateRange ? `📅 ${dateRange}` : '', days, timeStr, location].filter(Boolean).join(' · ');
  }
  // FLEXIBLE / OPEN
  const dateRange = fmtDateRange(item.flexFromDate, item.flexToDate);
  return ['Flexible', dateRange ? `📅 ${dateRange}` : '', location].filter(Boolean).join(' · ');
}

function cancelReason(item: UserApplication): { label: string; color: string; bg: string } {
  if (item.statusCode === 'REJECTED')           return { label: '✕ Rejected by Admin', color: '#DC2626', bg: '#FEE2E2' };
  if (item.statusCode === 'WITHDRAWN')          return { label: 'Withdrawn by You',    color: '#6B7280', bg: '#F3F4F6' };
  if (item.projectStatusCode === 'CANCELLED')   return { label: 'Project Cancelled',   color: '#D97706', bg: '#FEF3C7' };
  return                                               { label: 'Project Expired',     color: '#9CA3AF', bg: '#F3F4F6' };
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({
  item, tab, onPress, onScan, onWithdraw, onCertPress,
}: {
  item: UserApplication;
  tab: Tab;
  onPress: () => void;
  onScan: (projectId: number, projectName: string) => void;
  onWithdraw: (app: UserApplication) => void;
  onCertPress?: () => void;
}) {
  const borderColor = TAB_BORDER[tab];

  return (
    <TouchableOpacity
      style={[styles.projectCard, { borderLeftColor: borderColor }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* ── Applied ── */}
      {tab === 'applied' && (() => {
        const statusColor = STATUS_COLORS[item.statusCode] ?? STATUS_COLORS.APPROVED;
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.projectTitle}>{item.projectName}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                <Text style={[styles.statusText, { color: statusColor.text }]}>
                  {item.statusCode === 'PENDING' ? '⏳ Pending' : item.statusCode}
                </Text>
              </View>
            </View>
            <Text style={styles.orgName}>{item.orgName}</Text>
            {scheduleOneLiner(item) ? <Text style={styles.dateText}>{scheduleOneLiner(item)}</Text> : null}
            <View style={styles.cardFooter}>
              <Text style={[styles.footerMeta, { color: statusColor.text }]}>
                Applied {fmtDate(item.createdAt) ?? ''} · Awaiting review
              </Text>
              <TouchableOpacity
                style={styles.withdrawBtn}
                onPress={(e) => { e.stopPropagation(); onWithdraw(item); }}
              >
                <Text style={styles.withdrawBtnText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </>
        );
      })()}

      {/* ── Upcoming ── */}
      {tab === 'upcoming' && (
        <>
          <View style={styles.cardRow}>
            <Text style={styles.projectTitle}>{item.projectName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${C.PRIMARY}15` }]}>
              <Text style={[styles.statusText, { color: C.PRIMARY }]}>✓ Approved</Text>
            </View>
          </View>
          <Text style={styles.orgName}>{item.orgName}</Text>
          {scheduleOneLiner(item) ? <Text style={styles.dateText}>{scheduleOneLiner(item)}</Text> : null}
          {item.scheduleTypeCode === 'RECURRING' && item.recurDays ? (
            <Text style={styles.sessionText}>🔄 {item.recurDays}</Text>
          ) : null}
          {item.requiresApproval && !item.isCheckedIn && (
            <View style={styles.qrSection}>
              <Text style={styles.qrHint}>At the venue? Ask admin to show the QR and scan it to log attendance.</Text>
              <TouchableOpacity
                style={styles.qrBtn}
                onPress={(e) => { e.stopPropagation(); onScan(item.projectId, item.projectName); }}
              >
                <Text style={styles.qrBtnText}>📷 Scan QR to Mark Attendance</Text>
              </TouchableOpacity>
            </View>
          )}
          {item.requiresApproval && item.isCheckedIn && (
            <View style={[styles.qrSection, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Text style={{ fontSize: 15 }}>✅</Text>
              <Text style={{ fontSize: 13, color: '#059669', fontWeight: '600' }}>Attendance marked</Text>
            </View>
          )}
        </>
      )}

      {/* ── Completed ── */}
      {tab === 'completed' && (
        <>
          <View style={styles.cardRow}>
            <Text style={styles.projectTitle}>{item.projectName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: '#D1FAE5' }]}>
              <Text style={[styles.statusText, { color: '#059669' }]}>✓ Completed</Text>
            </View>
          </View>
          <Text style={styles.orgName}>{item.orgName}</Text>
          {scheduleOneLiner(item) ? <Text style={styles.dateText}>{scheduleOneLiner(item)}</Text> : null}
          <View style={styles.completedRow}>
            <View>
              <Text style={styles.completedLabel}>Hours</Text>
              <Text style={styles.completedValue}>{item.hoursLogged ? `${item.hoursLogged}h` : '—'}</Text>
            </View>
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
            <Text style={styles.certStatus}>Tap to view details</Text>
            {!!item.hasCertificate && (
              <TouchableOpacity
                style={styles.certBtn}
                onPress={(e) => { e.stopPropagation(); onCertPress?.(); }}
                activeOpacity={0.85}
              >
                <Text style={styles.certBtnTxt}>📄 Certificate</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ── Cancelled ── */}
      {tab === 'cancelled' && (() => {
        const reason = cancelReason(item);
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.projectTitle}>{item.projectName}</Text>
              <View style={[styles.statusBadge, { backgroundColor: reason.bg }]}>
                <Text style={[styles.statusText, { color: reason.color }]}>{reason.label}</Text>
              </View>
            </View>
            <Text style={styles.orgName}>{item.orgName}</Text>
            {scheduleOneLiner(item) ? <Text style={styles.dateText}>{scheduleOneLiner(item)}</Text> : null}
            <View style={styles.cardFooter}>
              <Text style={[styles.footerMeta, { color: C.TEXT3 }]}>
                Applied {fmtDate(item.createdAt) ?? ''}
              </Text>
            </View>
          </>
        );
      })()}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MyProjectsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route  = useRoute<any>();

  // honour initialTab passed from ImpactScreen "View All" / "View N more"
  const routeTab = (route.params?.initialTab as Tab) ?? 'applied';
  const validTabs: Tab[] = ['applied', 'upcoming', 'completed', 'cancelled'];
  const startTab = validTabs.includes(routeTab) ? routeTab : 'applied';

  const [allApps,      setAllApps]      = useState<UserApplication[]>([]);
  const [tab,          setTab]          = useState<Tab>(startTab);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [scanTarget,   setScanTarget]   = useState<{ projectId: number; projectName: string } | null>(null);
  const [detailApp,    setDetailApp]    = useState<UserApplication | null>(null);
  const [detailOpen,   setDetailOpen]   = useState(false);
  const [certVisible,  setCertVisible]  = useState(false);
  const [certProjectId, setCertProjectId] = useState<number | null>(null);
  const [certProjName,  setCertProjName]  = useState('');

  // ── Swipe tabs ──────────────────────────────────────────────────────────────
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
      if (res.data?.isSuccess) setAllApps(res.data.data ?? []);
      else Alert.alert('Error', res.data?.message ?? 'Could not load your projects.');
    } catch {
      Alert.alert('Error', 'Could not load your projects.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleWithdraw = (app: UserApplication) => {
    Alert.alert(
      'Withdraw Application',
      `Withdraw from "${app.projectName}"?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await withdrawApplication(app.applicationId);
              if (res.data?.isSuccess === 1) {
                setAllApps(prev =>
                  prev.map(a =>
                    a.applicationId === app.applicationId
                      ? { ...a, statusCode: 'WITHDRAWN', status: 'Withdrawn' }
                      : a,
                  ),
                );
                Alert.alert('Withdrawn', 'Your application has been withdrawn.');
              } else {
                Alert.alert('Could not withdraw', res.data?.message ?? 'Please try again.');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message ?? 'Please check your connection.');
            }
          },
        },
      ],
    );
  };

  const openDetail = (app: UserApplication) => { setDetailApp(app); setDetailOpen(true); };
  const openCert   = (app: UserApplication) => {
    setCertProjectId(app.projectId);
    setCertProjName(app.projectName);
    setCertVisible(true);
  };

  const tabItems: UserApplication[] =
    tab === 'applied'   ? allApps.filter(isApplied) :
    tab === 'upcoming'  ? allApps.filter(isUpcoming) :
    tab === 'completed' ? allApps.filter(isCompleted) :
                          allApps.filter(isCancelled);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>My Projects</Text>
        <View style={{ width: 56 }} />
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
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info banners */}
        {tab === 'applied' && (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              ⏳ Pending applications are reviewed by admin. Once approved they move to Upcoming.
            </Text>
          </View>
        )}
        {tab === 'cancelled' && (
          <View style={[styles.infoBanner, { backgroundColor: '#FFF5F5', borderColor: '#FECACA' }]}>
            <Text style={[styles.infoBannerText, { color: '#991B1B' }]}>
              📭 Applications rejected by admin, withdrawn by you, or projects that expired/were cancelled.
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
            renderItem={({ item }) => (
              <ProjectCard
                item={item}
                tab={tab}
                onPress={() => openDetail(item)}
                onScan={(id, name) => setScanTarget({ projectId: id, projectName: name })}
                onWithdraw={handleWithdraw}
                onCertPress={tab === 'completed' ? () => openCert(item) : undefined}
              />
            )}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No {tab} projects yet.</Text>
                {tab === 'applied' && (
                  <TouchableOpacity onPress={() => nav.navigate('AllOpportunities' as never)}>
                    <Text style={styles.emptyLink}>Explore opportunities →</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Modals */}
      <ProjectDetailModal
        visible={detailOpen}
        application={detailApp}
        onClose={() => setDetailOpen(false)}
        onScanQR={() => {
          setDetailOpen(false);
          if (detailApp) setScanTarget({ projectId: detailApp.projectId, projectName: detailApp.projectName });
        }}
      />

      {scanTarget && (
        <QRScannerModal
          visible={!!scanTarget}
          projectId={scanTarget.projectId}
          projectName={scanTarget.projectName}
          onClose={() => setScanTarget(null)}
          onSuccess={() => { setScanTarget(null); load(true); }}
        />
      )}

      <CertificateModal
        visible={certVisible}
        projectId={certProjectId}
        projectName={certProjName}
        onClose={() => setCertVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.BG },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, marginTop: 60 },

  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:        { color: C.PRIMARY, fontSize: 16, fontWeight: '600' },
  topBarTitle:     { fontSize: 16, fontWeight: '700', color: C.TEXT },

  // 4-tab bar
  tabBar:          { flexDirection: 'row', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tab:             { flex: 1, paddingVertical: 11, alignItems: 'center' },
  tabActive:       { borderBottomWidth: 2, borderBottomColor: C.PRIMARY },
  tabText:         { fontSize: 11, color: C.TEXT2, fontWeight: '500' },
  tabTextActive:   { color: C.PRIMARY, fontWeight: '700' },

  infoBanner:      { margin: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 9, padding: 9 },
  infoBannerText:  { fontSize: 11, color: '#92400E', lineHeight: 15 },

  listContent:     { padding: 12 },

  // Card
  projectCard:     {
    backgroundColor: C.CARD, borderRadius: 12, padding: 13, marginBottom: 9,
    borderLeftWidth: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardRow:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 },
  projectTitle:    { flex: 1, fontSize: 14, fontWeight: '700', color: C.TEXT, marginRight: 8 },
  statusBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText:      { fontSize: 10, fontWeight: '600' },
  orgName:         { fontSize: 12, color: C.TEXT2, marginBottom: 2 },
  dateText:        { fontSize: 12, color: C.TEXT2, marginBottom: 4 },
  sessionText:     { fontSize: 12, color: C.TEXT2, marginBottom: 4 },

  cardFooter:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: C.BORDER },
  footerMeta:      { flex: 1, fontSize: 11, color: C.TEXT3 },
  withdrawBtn:     { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#FECACA', borderRadius: 7 },
  withdrawBtnText: { fontSize: 12, color: '#DC2626', fontWeight: '600' },

  qrSection:       { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.BORDER },
  qrHint:          { fontSize: 11, color: C.TEXT2, marginBottom: 6, lineHeight: 14 },
  qrBtn:           { backgroundColor: C.PRIMARY, borderRadius: 9, padding: 9, alignItems: 'center' },
  qrBtnText:       { color: '#fff', fontSize: 13, fontWeight: '700' },

  completedRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: C.BORDER },
  completedLabel:  { fontSize: 11, color: C.TEXT2, marginBottom: 2 },
  completedValue:  { fontSize: 12, fontWeight: '700', color: C.TEAL },
  certRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  certStatus:      { fontSize: 11, color: C.TEXT3 },
  certBtn:         { backgroundColor: C.PRIMARY, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  certBtnTxt:      { color: '#fff', fontSize: 12, fontWeight: '700' },

  emptyText:       { fontSize: 15, color: C.TEXT2, fontWeight: '600', marginBottom: 8 },
  emptyLink:       { color: C.PRIMARY, fontSize: 14, fontWeight: '600' },
});
