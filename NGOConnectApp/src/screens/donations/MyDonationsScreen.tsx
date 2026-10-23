/**
 * MyDonationsScreen — s-my-donations
 * 4 tabs: History | Recurring | Receipts | NGOs
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { donationApi } from '../../api/donation.api';

const C = AppConfig.COLORS;

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = ['History', 'Recurring', 'Receipts', 'NGOs'] as const;
type TabType = typeof TABS[number];

// ── Status chips ──────────────────────────────────────────────────────────────
const STATUS_CHIPS = [
  { code: null,        label: 'All'       },
  { code: 'SUCCESS',   label: 'Completed' },
  { code: 'INITIATED', label: 'Pending'   },
  { code: 'FAILED',    label: 'Failed'    },
  { code: 'REFUNDED',  label: 'Refunded'  },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534' },
  INITIATED: { bg: '#FEF9C3', text: '#854D0E' },
  PENDING:   { bg: '#FEF9C3', text: '#854D0E' },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B' },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8' },
  CANCELLED: { bg: '#F3F4F6', text: '#374151' },
};

// ─────────────────────────────────────────────────────────────────────────────
export default function MyDonationsScreen() {
  const nav = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<TabType>('History');

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Donations</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll}
        contentContainerStyle={s.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(t)}
            style={[s.tabBtn, activeTab === t && s.tabBtnActive]}>
            <Text style={[s.tabBtnText, activeTab === t && s.tabBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      {activeTab === 'History'   && <HistoryTab />}
      {activeTab === 'Recurring' && <RecurringTab />}
      {activeTab === 'Receipts'  && <ReceiptsTab />}
      {activeTab === 'NGOs'      && <NgosTab />}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY TAB
// ─────────────────────────────────────────────────────────────────────────────
function HistoryTab() {
  const nav = useNavigation<any>();
  const [items, setItems]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (p = 1, status = statusCode, refresh = false) => {
    if (p === 1) refresh ? setRefreshing(true) : setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await donationApi.getHistory({ status: status ?? undefined, pageNumber: p, pageSize: 15 });
      if (res.data?.isSuccess === 1) {
        const d = res.data.data;
        setTotal(d?.totalCount ?? 0);
        setItems(p === 1 ? (d?.items ?? []) : prev => [...prev, ...(d?.items ?? [])]);
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [statusCode]);

  useEffect(() => { setPage(1); load(1); }, [statusCode]);

  const onRefresh = () => load(1, statusCode, true);
  const onEndReached = () => {
    if (!loadingMore && items.length < total) {
      const next = page + 1;
      setPage(next);
      load(next);
    }
  };

  // Group by month
  const grouped = groupByMonth(items);

  return (
    <View style={{ flex: 1 }}>
      {/* Summary card */}
      <View style={s.summaryPurple}>
        <View style={s.summaryPurpleInner}>
          <Text style={s.summaryPurpleLabel}>Total Donated</Text>
          <Text style={s.summaryPurpleValue}>
            ₹{items.reduce((a, i) => a + (i.donationAmount ?? 0), 0).toLocaleString('en-IN')}
          </Text>
        </View>
        <View style={s.summaryPurpleDivider} />
        <View style={s.summaryPurpleInner}>
          <Text style={s.summaryPurpleLabel}>Donations</Text>
          <Text style={s.summaryPurpleValue}>{total}</Text>
        </View>
      </View>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.chipsScroll} contentContainerStyle={s.chipsRow}>
        {STATUS_CHIPS.map(c => (
          <TouchableOpacity key={String(c.code)} style={[s.chip, statusCode === c.code && s.chipActive]}
            onPress={() => setStatusCode(c.code)}>
            <Text style={[s.chipText, statusCode === c.code && s.chipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.PRIMARY} size="large" />
        : <FlatList
            data={grouped}
            keyExtractor={(_, i) => String(i)}
            onRefresh={onRefresh}
            refreshing={refreshing}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListEmptyComponent={<EmptyState icon="💳" text="No donations yet" />}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 12 }} /> : null}
            renderItem={({ item }) => (
              <View>
                <Text style={s.monthLabel}>{item.month}</Text>
                {item.items.map((d: any) => (
                  <TouchableOpacity key={d.donationId} style={s.donationCard}
                    onPress={() => nav.navigate('DonationDetail', { donationRef: d.donationId })}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.donCardCampaign} numberOfLines={1}>{d.campaignName}</Text>
                      <Text style={s.donCardOrg}>{d.orgName}</Text>
                      <Text style={s.donCardDate}>{fmtDate(d.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.donCardAmount}>₹{Number(d.donationAmount).toLocaleString('en-IN')}</Text>
                      <StatusPill code={d.payStatus} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          />
      }
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING TAB
// ─────────────────────────────────────────────────────────────────────────────
function RecurringTab() {
  const nav = useNavigation<any>();
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await donationApi.getRecurring();
      if (res.data?.isSuccess === 1) setItems(res.data.data ?? []);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const handlePause = async (id: number) => {
    try {
      await donationApi.pauseRecurring(id);
      load(true);
    } catch (_) { Alert.alert('Error', 'Could not pause recurring donation'); }
  };

  const handleResume = async (id: number) => {
    try {
      await donationApi.resumeRecurring(id);
      load(true);
    } catch (_) { Alert.alert('Error', 'Could not resume recurring donation'); }
  };

  const annualCommitted = items
    .filter(i => i.statusCode === 'ACTIVE')
    .reduce((a, i) => a + (i.annualCommitted ?? 0), 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.PRIMARY} />}>
      {!loading && items.length > 0 && (
        <View style={[s.summaryPurple, { marginBottom: 16 }]}>
          <View style={s.summaryPurpleInner}>
            <Text style={s.summaryPurpleLabel}>Annual Committed</Text>
            <Text style={s.summaryPurpleValue}>₹{annualCommitted.toLocaleString('en-IN')}</Text>
          </View>
          <View style={s.summaryPurpleDivider} />
          <View style={s.summaryPurpleInner}>
            <Text style={s.summaryPurpleLabel}>Active Plans</Text>
            <Text style={s.summaryPurpleValue}>{items.filter(i => i.statusCode === 'ACTIVE').length}</Text>
          </View>
        </View>
      )}

      {loading
        ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 40 }} size="large" />
        : items.length === 0
          ? <>
              <EmptyState icon="🔄" text="No recurring donations" />
              <Text style={s.recurringCta}>Set up a recurring donation to automatically support your favourite NGOs every month.</Text>
            </>
          : items.map(item => (
              <View key={item.recurringDonId} style={s.recurCard}>
                <View style={s.recurCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.recurCardOrg}>{item.orgName}</Text>
                    <Text style={s.recurCardCampaign}>{item.campaignName}</Text>
                  </View>
                  <StatusPill code={item.statusCode} />
                </View>
                <View style={s.recurCardRow}>
                  <View>
                    <Text style={s.recurCardLabel}>Amount</Text>
                    <Text style={s.recurCardValue}>₹{Number(item.amount).toLocaleString('en-IN')} / {item.frequencyLabel ?? item.frequencyCode}</Text>
                  </View>
                  {item.nextChargeDate && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.recurCardLabel}>Next charge</Text>
                      <Text style={s.recurCardValue}>{fmtDate(item.nextChargeDate)}</Text>
                    </View>
                  )}
                </View>
                <View style={s.recurCardActions}>
                  {item.statusCode === 'ACTIVE'
                    ? <TouchableOpacity style={s.recurPauseBtn} onPress={() => handlePause(item.recurringDonId)}>
                        <Text style={s.recurPauseBtnText}>⏸ Pause</Text>
                      </TouchableOpacity>
                    : <TouchableOpacity style={s.recurResumeBtn} onPress={() => handleResume(item.recurringDonId)}>
                        <Text style={s.recurResumeBtnText}>▶ Resume</Text>
                      </TouchableOpacity>
                  }
                </View>
              </View>
            ))
      }
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ReceiptsTab() {
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async (p = 1, refresh = false) => {
    if (p === 1) refresh ? setRefreshing(true) : setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await donationApi.getReceiptList({ pageNumber: p, pageSize: 15 });
      if (res.data?.isSuccess === 1) {
        const d = res.data.data;
        setTotal(d?.totalCount ?? 0);
        setItems(p === 1 ? (d?.items ?? []) : prev => [...prev, ...(d?.items ?? [])]);
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => item.receiptId ?? String(i)}
      onRefresh={() => load(1, true)}
      refreshing={refreshing}
      onEndReached={() => {
        if (!loadingMore && items.length < total) {
          const next = page + 1; setPage(next); load(next);
        }
      }}
      onEndReachedThreshold={0.3}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      ListEmptyComponent={loading
        ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 40 }} size="large" />
        : <EmptyState icon="🧾" text="No receipts yet" />
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 12 }} /> : null}
      renderItem={({ item }) => (
        <View style={s.receiptCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.receiptNo}>{item.receiptNumber}</Text>
            <Text style={s.receiptOrg}>{item.orgName}</Text>
            <Text style={s.receiptCampaign} numberOfLines={1}>{item.campaignName}</Text>
            <Text style={s.receiptFY}>FY {item.fiscalYear}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.receiptAmount}>₹{Number(item.donationAmount).toLocaleString('en-IN')}</Text>
            {item.pdfUrl
              ? <TouchableOpacity style={s.downloadBtn}>
                  <Text style={s.downloadBtnText}>📥 Download</Text>
                </TouchableOpacity>
              : <Text style={s.pendingReceiptText}>Generating…</Text>
            }
          </View>
        </View>
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NGOs TAB
// ─────────────────────────────────────────────────────────────────────────────
function NgosTab() {
  const nav = useNavigation<any>();
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await donationApi.getSupportedNgos();
      if (res.data?.isSuccess === 1) setItems(res.data.data ?? []);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const maxGiven = Math.max(...items.map((i: any) => i.totalGiven ?? 0), 1);

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => item.orgId?.toString() ?? String(i)}
      onRefresh={() => load(true)}
      refreshing={refreshing}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      ListEmptyComponent={loading
        ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 40 }} size="large" />
        : <EmptyState icon="🏢" text="No NGOs supported yet" />
      }
      renderItem={({ item }) => {
        const pct = Math.round(((item.totalGiven ?? 0) / maxGiven) * 100);
        return (
          <View style={s.ngoCard}>
            <View style={s.ngoCardHeader}>
              <View style={s.ngoLogoPlaceholder}>
                <Text style={s.ngoLogoText}>{(item.orgName ?? 'N')[0]}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.ngoName}>{item.orgName}</Text>
                <Text style={s.ngoGiftCount}>{item.giftCount} donation{item.giftCount !== 1 ? 's' : ''}</Text>
              </View>
              <Text style={s.ngoTotal}>₹{Number(item.totalGiven).toLocaleString('en-IN')}</Text>
            </View>
            {/* Progress bar */}
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${pct}%` }]} />
            </View>
            <TouchableOpacity style={s.donateAgainBtn}
              onPress={() => nav.navigate('NgoProfile', { orgId: item.orgId })}>
              <Text style={s.donateAgainBtnText}>Donate again →</Text>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function StatusPill({ code }: { code?: string }) {
  const c = STATUS_COLORS[code ?? ''] ?? { bg: '#F3F4F6', text: '#374151' };
  return (
    <View style={[s.statusPill, { backgroundColor: c.bg }]}>
      <Text style={[s.statusPillText, { color: c.text }]}>{code ?? 'UNKNOWN'}</Text>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.emptyWrap}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

function groupByMonth(items: any[]) {
  const map = new Map<string, any[]>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.BG },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon:   { fontSize: 22, color: C.TEXT },
  headerTitle:{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.TEXT },

  tabsScroll: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tabsRow:    { paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  tabBtn:     { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  tabBtnActive: { backgroundColor: C.PRIMARY + '18' },
  tabBtnText: { fontSize: 14, color: C.TEXT2, fontWeight: '500' },
  tabBtnTextActive: { color: C.PRIMARY, fontWeight: '700' },

  summaryPurple: { flexDirection: 'row', backgroundColor: C.PRIMARY,
                   marginHorizontal: 16, marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  summaryPurpleInner: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  summaryPurpleDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 10 },
  summaryPurpleLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  summaryPurpleValue: { fontSize: 20, fontWeight: '800', color: '#fff' },

  chipsScroll: { maxHeight: 48, marginTop: 10 },
  chipsRow:   { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER },
  chipActive: { backgroundColor: C.PRIMARY + '18', borderColor: C.PRIMARY },
  chipText:   { fontSize: 13, color: C.TEXT2 },
  chipTextActive: { color: C.PRIMARY, fontWeight: '700' },

  monthLabel: { fontSize: 12, fontWeight: '700', color: C.TEXT2, marginBottom: 8, marginTop: 4,
                textTransform: 'uppercase', letterSpacing: 0.8 },
  donationCard: { flexDirection: 'row', backgroundColor: C.CARD, borderRadius: 12,
                  padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.BORDER },
  donCardCampaign: { fontSize: 14, fontWeight: '700', color: C.TEXT },
  donCardOrg:  { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  donCardDate: { fontSize: 11, color: C.TEXT2, marginTop: 4 },
  donCardAmount: { fontSize: 16, fontWeight: '700', color: C.PRIMARY, marginBottom: 4 },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  recurCard:  { backgroundColor: C.CARD, borderRadius: 14, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: C.BORDER },
  recurCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  recurCardOrg:  { fontSize: 15, fontWeight: '700', color: C.TEXT },
  recurCardCampaign: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  recurCardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  recurCardLabel: { fontSize: 11, color: C.TEXT2, marginBottom: 3 },
  recurCardValue: { fontSize: 13, fontWeight: '600', color: C.TEXT },
  recurCardActions: { flexDirection: 'row', gap: 10 },
  recurPauseBtn: { flex: 1, backgroundColor: '#FFF7ED', borderRadius: 8, paddingVertical: 9,
                   alignItems: 'center', borderWidth: 1, borderColor: '#FED7AA' },
  recurPauseBtnText: { fontSize: 13, fontWeight: '700', color: '#C2410C' },
  recurResumeBtn: { flex: 1, backgroundColor: '#F0FDF4', borderRadius: 8, paddingVertical: 9,
                    alignItems: 'center', borderWidth: 1, borderColor: '#86EFAC' },
  recurResumeBtnText: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  recurringCta: { fontSize: 13, color: C.TEXT2, textAlign: 'center', marginTop: 16,
                  lineHeight: 20, paddingHorizontal: 8 },

  receiptCard: { flexDirection: 'row', backgroundColor: C.CARD, borderRadius: 12,
                 padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.BORDER },
  receiptNo:  { fontSize: 13, fontWeight: '700', color: C.TEXT, fontFamily: 'monospace' },
  receiptOrg: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  receiptCampaign: { fontSize: 11, color: C.TEXT2, marginTop: 2 },
  receiptFY:  { fontSize: 11, color: C.TEXT2, marginTop: 4 },
  receiptAmount: { fontSize: 15, fontWeight: '700', color: C.PRIMARY, marginBottom: 8 },
  downloadBtn: { backgroundColor: '#EFF6FF', borderRadius: 7, paddingHorizontal: 10,
                 paddingVertical: 5, borderWidth: 1, borderColor: '#BFDBFE' },
  downloadBtnText: { fontSize: 12, color: '#1D4ED8', fontWeight: '600' },
  pendingReceiptText: { fontSize: 11, color: C.TEXT2, fontStyle: 'italic' },

  ngoCard:    { backgroundColor: C.CARD, borderRadius: 14, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: C.BORDER },
  ngoCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ngoLogoPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.PRIMARY + '22',
                         alignItems: 'center', justifyContent: 'center' },
  ngoLogoText: { fontSize: 18, fontWeight: '700', color: C.PRIMARY },
  ngoName:    { fontSize: 14, fontWeight: '700', color: C.TEXT },
  ngoGiftCount: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  ngoTotal:   { fontSize: 16, fontWeight: '800', color: C.PRIMARY },
  progressBg: { height: 6, backgroundColor: C.BORDER, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: C.PRIMARY, borderRadius: 3 },
  donateAgainBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7,
                    backgroundColor: C.PRIMARY + '14', borderRadius: 8 },
  donateAgainBtnText: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },

  emptyWrap:  { alignItems: 'center', marginTop: 60 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: C.TEXT2 },
});
