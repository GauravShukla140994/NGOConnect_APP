/**
 * AdminDonationsScreen — s-admin-donations
 * Route params: { orgId: number }
 *
 * Two views toggled by tab:
 *   "Donations" — stats + payout card + searchable/filterable transaction list
 *   "By donor"  — stats + ranked donor list
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { donationApi } from '../../api/donation.api';

const C = AppConfig.COLORS;

const STATUS_CHIPS = [
  { code: null,      label: 'All'      },
  { code: 'SUCCESS', label: 'Received' },
  { code: 'PENDING', label: 'Pending'  },
  { code: 'FAILED',  label: 'Failed'   },
  { code: 'REFUNDED',label: 'Refunded' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534' },
  INITIATED: { bg: '#FEF9C3', text: '#854D0E' },
  PENDING:   { bg: '#FEF9C3', text: '#854D0E' },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B' },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8' },
};

export default function AdminDonationsScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { orgId } = (route.params ?? {}) as { orgId: number };

  const [view, setView] = useState<'donations' | 'donors'>('donations');
  const [dashboard, setDashboard] = useState<any[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await donationApi.getOrgDashboard(orgId);
        if (res.data?.isSuccess === 1) setDashboard(res.data.data ?? []);
      } catch (_) {}
      finally { setDashLoading(false); }
    })();
  }, [orgId]);

  const stats = dashboard[0] ?? {};
  const campaigns: any[] = dashboard[1] ?? [];

  const thisMonth = Number(stats.thisMonthAmount ?? 0);
  const lastMonth = Number(stats.lastMonthAmount ?? 0);
  const monthPct  = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Donations</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* View toggle */}
      <View style={s.toggle}>
        {(['donations', 'donors'] as const).map(v => (
          <TouchableOpacity key={v} style={[s.toggleBtn, view === v && s.toggleBtnActive]}
            onPress={() => setView(v)}>
            <Text style={[s.toggleBtnText, view === v && s.toggleBtnTextActive]}>
              {v === 'donations' ? '💳 Donations' : '👤 By donor'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'donations'
        ? <DonationsView orgId={orgId} stats={stats} monthPct={monthPct} campaigns={campaigns} dashLoading={dashLoading} />
        : <DonorListView orgId={orgId} stats={stats} dashLoading={dashLoading} />
      }
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DONATIONS VIEW
// ─────────────────────────────────────────────────────────────────────────────
function DonationsView({ orgId, stats, monthPct, campaigns, dashLoading }: any) {
  const nav = useNavigation<any>();
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]   = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (p = 1, sc = statusCode, q = search, refresh = false) => {
    if (p === 1) refresh ? setRefreshing(true) : setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await donationApi.getOrgTransactions(orgId, {
        status: sc ?? undefined, search: q || undefined, pageNumber: p, pageSize: 20,
      });
      if (res.data?.isSuccess === 1) {
        const d = res.data.data;
        setTotal(d?.totalCount ?? 0);
        setItems(p === 1 ? (d?.items ?? []) : prev => [...prev, ...(d?.items ?? [])]);
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [orgId, statusCode, search]);

  useEffect(() => { setPage(1); load(1); }, [statusCode]);

  let searchTimer: any;
  const onSearchChange = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { setPage(1); load(1, statusCode, v); }, 500);
  };

  const thisMonth = Number(stats.thisMonthAmount ?? 0);
  const today     = Number(stats.todayAmount ?? 0);
  const recurring = Number(stats.recurringAmount ?? 0);
  const allTime   = Number(stats.totalDonations ?? 0);

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => item.transactionId?.toString() ?? String(i)}
      onRefresh={() => { setPage(1); load(1, statusCode, search, true); }}
      refreshing={refreshing}
      onEndReached={() => {
        if (!loadingMore && items.length < total) {
          const next = page + 1; setPage(next); load(next);
        }
      }}
      onEndReachedThreshold={0.3}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      ListHeaderComponent={
        <>
          {/* Stat cards */}
          {dashLoading
            ? <ActivityIndicator color={C.PRIMARY} style={{ marginBottom: 16 }} />
            : <View style={s.statsGrid}>
                <StatCard label="All-time" value={`₹${fmtK(allTime)}`} />
                <StatCard label="This month" value={`₹${fmtK(thisMonth)}`}
                  badge={monthPct !== 0 ? `${monthPct > 0 ? '+' : ''}${monthPct}%` : undefined}
                  badgeGreen={monthPct > 0} />
                <StatCard label="Today" value={`₹${fmtK(today)}`} />
                <StatCard label="Recurring" value={`₹${fmtK(recurring)}`}
                  sub={`${stats.activeRecurringDonors ?? 0} donors`} />
              </View>
          }

          {/* Payout bank card */}
          <View style={s.payoutCard}>
            <View style={s.payoutCardLeft}>
              <Text style={s.payoutCardTitle}>Payout Account</Text>
              <Text style={s.payoutCardBank}>Bank details not configured</Text>
              <Text style={s.payoutCardNote}>Next settlement: T+2 business days</Text>
            </View>
            <View style={[s.payoutBadge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[s.payoutBadgeText, { color: '#166534' }]}>Active</Text>
            </View>
          </View>

          {/* Campaign progress */}
          {campaigns.length > 0 && (
            <View style={s.campaignsCard}>
              <Text style={s.campaignsTitle}>Campaign Progress</Text>
              {campaigns.map((c: any, i: number) => (
                <View key={i} style={{ marginTop: 10 }}>
                  <View style={s.campaignRow}>
                    <Text style={s.campaignName} numberOfLines={1}>{c.campaignName}</Text>
                    <Text style={s.campaignPct}>{Math.round(c.progressPct ?? 0)}%</Text>
                  </View>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${Math.min(c.progressPct ?? 0, 100)}%` }]} />
                  </View>
                  <Text style={s.campaignMeta}>
                    ₹{Number(c.raisedAmount).toLocaleString('en-IN')} of ₹{Number(c.targetAmount).toLocaleString('en-IN')}
                    {c.daysLeft != null ? `  •  ${c.daysLeft}d left` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Summary + search */}
          <View style={s.summaryPurple}>
            <View style={s.summaryPurpleInner}>
              <Text style={s.summaryPurpleLabel}>Total received</Text>
              <Text style={s.summaryPurpleValue}>
                ₹{items.filter(i => i.payStatus === 'SUCCESS').reduce((a, i) => a + Number(i.donationAmount ?? 0), 0).toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={s.summaryPurpleDivider} />
            <View style={s.summaryPurpleInner}>
              <Text style={s.summaryPurpleLabel}>Transactions</Text>
              <Text style={s.summaryPurpleValue}>{total}</Text>
            </View>
          </View>

          <View style={s.searchBar}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput style={s.searchInput} placeholder="Search donor name or ID…"
              placeholderTextColor={C.TEXT2} value={search} onChangeText={onSearchChange} />
          </View>

          {/* Status chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }} contentContainerStyle={s.chipsRow}>
            {STATUS_CHIPS.map(c => (
              <TouchableOpacity key={String(c.code)} style={[s.chip, statusCode === c.code && s.chipActive]}
                onPress={() => setStatusCode(c.code)}>
                <Text style={[s.chipText, statusCode === c.code && s.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading && <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 20 }} />}
        </>
      }
      ListEmptyComponent={!loading ? <EmptyState icon="💳" text="No transactions found" /> : null}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 12 }} /> : null}
      renderItem={({ item }) => {
        const sc = STATUS_COLORS[item.payStatus ?? ''] ?? { bg: '#F3F4F6', text: '#374151' };
        return (
          <TouchableOpacity style={s.txCard}
            onPress={() => nav.navigate('AdminDonationDetail', { donationRef: item.donationId, orgId })}>
            <View style={{ flex: 1 }}>
              <View style={s.txCardHeader}>
                <Text style={s.txDonorName}>{item.donorName}</Text>
                {item.isMember === 1 && <View style={s.memberBadge}><Text style={s.memberBadgeText}>Member</Text></View>}
                {item.isRecurring === 1 && <View style={s.recurBadge}><Text style={s.recurBadgeText}>Recurring</Text></View>}
              </View>
              <Text style={s.txCampaign} numberOfLines={1}>{item.campaignName}</Text>
              <Text style={s.txDate}>{fmtDate(item.createdAt)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.txAmount}>₹{Number(item.donationAmount).toLocaleString('en-IN')}</Text>
              <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
                <Text style={[s.statusPillText, { color: sc.text }]}>{item.payStatus}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DONOR LIST VIEW
// ─────────────────────────────────────────────────────────────────────────────
function DonorListView({ orgId, stats, dashLoading }: any) {
  const nav = useNavigation<any>();
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (p = 1, q = search, refresh = false) => {
    if (p === 1) refresh ? setRefreshing(true) : setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await donationApi.getOrgDonorList(orgId, {
        search: q || undefined, pageNumber: p, pageSize: 20,
      });
      if (res.data?.isSuccess === 1) {
        const d = res.data.data;
        setTotal(d?.totalCount ?? 0);
        setItems(p === 1 ? (d?.items ?? []) : prev => [...prev, ...(d?.items ?? [])]);
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [orgId, search]);

  useEffect(() => { load(); }, []);

  let searchTimer: any;
  const onSearchChange = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { setPage(1); load(1, v); }, 500);
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => item.donorUserId?.toString() ?? String(i)}
      onRefresh={() => { setPage(1); load(1, search, true); }}
      refreshing={refreshing}
      onEndReached={() => {
        if (!loadingMore && items.length < total) {
          const next = page + 1; setPage(next); load(next);
        }
      }}
      onEndReachedThreshold={0.3}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      ListHeaderComponent={
        <>
          {dashLoading
            ? <ActivityIndicator color={C.PRIMARY} style={{ marginBottom: 16 }} />
            : <View style={s.statsGrid}>
                <StatCard label="Total donors" value={String(stats.thisMonthDonors ?? '—')} />
                <StatCard label="Avg gift"     value={`₹${fmtK(stats.avgGift ?? 0)}`} />
              </View>
          }
          <View style={s.searchBar}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput style={s.searchInput} placeholder="Search donor name…"
              placeholderTextColor={C.TEXT2} value={search} onChangeText={onSearchChange} />
          </View>
          {loading && <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 20 }} />}
        </>
      }
      ListEmptyComponent={!loading ? <EmptyState icon="👤" text="No donors found" /> : null}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 12 }} /> : null}
      renderItem={({ item, index }) => (
        <TouchableOpacity style={s.donorCard}
          onPress={() => nav.navigate('AdminDonorDetail', { orgId, donorUserId: item.donorUserId })}>
          <View style={s.donorRank}><Text style={s.donorRankText}>#{index + 1}</Text></View>
          <View style={s.donorInitialCircle}>
            <Text style={s.donorInitialText}>{(item.donorName ?? 'A')[0]}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={s.donorNameRow}>
              <Text style={s.donorName}>{item.donorName}</Text>
              {item.isMember === 1 && <View style={s.memberBadge}><Text style={s.memberBadgeText}>Member</Text></View>}
            </View>
            <Text style={s.donorMeta}>{item.giftCount} gift{item.giftCount !== 1 ? 's' : ''} · Last: {fmtDate(item.lastGiftAt)}</Text>
          </View>
          <Text style={s.donorTotal}>₹{Number(item.totalGiven).toLocaleString('en-IN')}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, badge, badgeGreen, sub }:
  { label: string; value: string; badge?: string; badgeGreen?: boolean; sub?: string }) => (
  <View style={s.statCard}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={s.statValue}>{value}</Text>
    {badge && (
      <View style={[s.statBadge, { backgroundColor: badgeGreen ? '#DCFCE7' : '#FEE2E2' }]}>
        <Text style={[s.statBadgeText, { color: badgeGreen ? '#166534' : '#991B1B' }]}>{badge}</Text>
      </View>
    )}
    {sub && <Text style={s.statSub}>{sub}</Text>}
  </View>
);
const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
  <View style={s.emptyWrap}><Text style={s.emptyIcon}>{icon}</Text><Text style={s.emptyText}>{text}</Text></View>
);
const fmtK = (n: number) => n >= 100000 ? `${(n/100000).toFixed(1)}L` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(Math.round(n));
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
               paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon:  { fontSize: 22, color: C.TEXT },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.TEXT },

  toggle:    { flexDirection: 'row', margin: 12, backgroundColor: C.CARD,
               borderRadius: 10, padding: 4, borderWidth: 1, borderColor: C.BORDER },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: C.PRIMARY },
  toggleBtnText: { fontSize: 14, color: C.TEXT2, fontWeight: '500' },
  toggleBtnTextActive: { color: '#fff', fontWeight: '700' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard:  { flex: 1, minWidth: '45%', backgroundColor: C.CARD, borderRadius: 12,
               padding: 14, borderWidth: 1, borderColor: C.BORDER },
  statLabel: { fontSize: 11, color: C.TEXT2, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: C.TEXT },
  statBadge: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start' },
  statBadgeText: { fontSize: 10, fontWeight: '700' },
  statSub:   { fontSize: 11, color: C.TEXT2, marginTop: 3 },

  payoutCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: C.CARD, borderRadius: 12, padding: 14, marginBottom: 14,
                borderWidth: 1, borderColor: C.BORDER },
  payoutCardLeft: { flex: 1 },
  payoutCardTitle: { fontSize: 14, fontWeight: '700', color: C.TEXT },
  payoutCardBank:  { fontSize: 12, color: C.TEXT2, marginTop: 3 },
  payoutCardNote:  { fontSize: 11, color: C.TEXT2, marginTop: 3 },
  payoutBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  payoutBadgeText: { fontSize: 12, fontWeight: '700' },

  campaignsCard: { backgroundColor: C.CARD, borderRadius: 12, padding: 14, marginBottom: 14,
                   borderWidth: 1, borderColor: C.BORDER },
  campaignsTitle: { fontSize: 13, fontWeight: '700', color: C.TEXT2, textTransform: 'uppercase', letterSpacing: 0.6 },
  campaignRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  campaignName: { fontSize: 13, color: C.TEXT, flex: 1 },
  campaignPct:  { fontSize: 13, fontWeight: '700', color: C.PRIMARY },
  progressBg:   { height: 6, backgroundColor: C.BORDER, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: C.PRIMARY, borderRadius: 3 },
  campaignMeta: { fontSize: 11, color: C.TEXT2, marginTop: 3 },

  summaryPurple: { flexDirection: 'row', backgroundColor: C.PRIMARY, borderRadius: 14,
                   marginBottom: 14, overflow: 'hidden' },
  summaryPurpleInner: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  summaryPurpleDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 10 },
  summaryPurpleLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  summaryPurpleValue: { fontSize: 20, fontWeight: '800', color: '#fff' },

  searchBar:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD,
                borderRadius: 10, borderWidth: 1, borderColor: C.BORDER,
                paddingHorizontal: 12, marginBottom: 12 },
  searchIcon: { fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, color: C.TEXT, paddingVertical: 10 },

  chipsRow:   { gap: 8, alignItems: 'center' },
  chip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER },
  chipActive: { backgroundColor: C.PRIMARY + '18', borderColor: C.PRIMARY },
  chipText:   { fontSize: 13, color: C.TEXT2 },
  chipTextActive: { color: C.PRIMARY, fontWeight: '700' },

  txCard:   { flexDirection: 'row', backgroundColor: C.CARD, borderRadius: 12,
              padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.BORDER },
  txCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  txDonorName:  { fontSize: 14, fontWeight: '700', color: C.TEXT },
  txCampaign:   { fontSize: 12, color: C.TEXT2 },
  txDate:       { fontSize: 11, color: C.TEXT2, marginTop: 4 },
  txAmount:     { fontSize: 15, fontWeight: '700', color: C.PRIMARY, marginBottom: 4 },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  memberBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  memberBadgeText: { fontSize: 9, fontWeight: '700', color: '#1D4ED8' },
  recurBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  recurBadgeText: { fontSize: 9, fontWeight: '700', color: '#166534' },

  donorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD,
               borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.BORDER },
  donorRank: { width: 28, alignItems: 'center' },
  donorRankText: { fontSize: 12, fontWeight: '700', color: C.TEXT2 },
  donorInitialCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.PRIMARY + '20',
                        alignItems: 'center', justifyContent: 'center' },
  donorInitialText: { fontSize: 17, fontWeight: '700', color: C.PRIMARY },
  donorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  donorName:  { fontSize: 14, fontWeight: '700', color: C.TEXT },
  donorMeta:  { fontSize: 11, color: C.TEXT2, marginTop: 3 },
  donorTotal: { fontSize: 15, fontWeight: '800', color: C.PRIMARY },

  emptyWrap:  { alignItems: 'center', marginTop: 40 },
  emptyIcon:  { fontSize: 40, marginBottom: 10 },
  emptyText:  { fontSize: 14, color: C.TEXT2 },
});
