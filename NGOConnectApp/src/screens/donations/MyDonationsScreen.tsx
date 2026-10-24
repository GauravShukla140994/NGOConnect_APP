/**
 * MyDonationsScreen — s-my-donations
 * 4 tabs: History | Recurring | Receipts | NGOs
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl, ScrollView, Modal, Pressable,
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
  { code: null,        label: 'All'        },
  { code: 'SUCCESS',   label: 'Successful' },
  { code: 'INITIATED', label: 'Processing' },
  { code: 'FAILED',    label: 'Failed'     },
  { code: 'REFUNDED',  label: 'Refunded'   },
];

const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534', label: 'Success'    },
  INITIATED: { bg: '#FFF7ED', text: '#C2410C', label: 'Processing' },
  PENDING:   { bg: '#FFF7ED', text: '#C2410C', label: 'Processing' },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B', label: 'Failed'     },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Refunded'   },
  CANCELLED: { bg: '#F3F4F6', text: '#374151', label: 'Cancelled'  },
};

// Avatar palette — hash orgId to a color
const AVATAR_COLORS = ['#6C47FF', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const avatarColor = (orgId: number) => AVATAR_COLORS[orgId % AVATAR_COLORS.length];

// Date range presets
const DATE_PRESETS = [
  { label: 'Last 7 days',    days: 7   },
  { label: 'Last 30 days',   days: 30  },
  { label: 'Last 3 months',  days: 90  },
  { label: 'This year',      days: 365 },
];

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
  const [allItems, setAllItems]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [statusCode, setStatusCode]   = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [datePresetDays, setDatePresetDays] = useState<number | null>(null);
  const [showDateModal, setShowDateModal]   = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      // Load up to 200 — client-side filtering handles search/date/status
      const res = await donationApi.getHistory({ pageNumber: 1, pageSize: 200 });
      if (res.data?.isSuccess === 1) setAllItems(res.data.data?.items ?? []);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  // ── Client-side filtering ──────────────────────────────────────────────────
  const filtered = allItems.filter(item => {
    if (statusCode && item.payStatus !== statusCode) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(item.orgName ?? '').toLowerCase().includes(q) &&
          !(item.donationId ?? '').toLowerCase().includes(q)) return false;
    }
    if (datePresetDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - datePresetDays);
      if (new Date(item.createdAt) < cutoff) return false;
    }
    return true;
  });

  // ── Summary stats (always from allItems, not filtered) ────────────────────
  const successItems   = allItems.filter(i => i.payStatus === 'SUCCESS');
  const processingItems = allItems.filter(i => i.payStatus === 'INITIATED' || i.payStatus === 'PENDING');
  const refundedItems  = allItems.filter(i => i.payStatus === 'REFUNDED');

  const totalGiven     = successItems.reduce((a, i) => a + (Number(i.donationAmount) || 0), 0);
  const processingAmt  = processingItems.reduce((a, i) => a + (Number(i.donationAmount) || 0), 0);
  const ngosSupported  = new Set(successItems.map(i => i.orgId)).size;

  // ── Chip counts ───────────────────────────────────────────────────────────
  const chipCount: Record<string, number> = {
    null:        allItems.length,
    SUCCESS:     successItems.length,
    INITIATED:   processingItems.length,
    FAILED:      allItems.filter(i => i.payStatus === 'FAILED').length,
    REFUNDED:    refundedItems.length,
  };

  const grouped = groupByMonth(filtered);
  const hasFilter = statusCode !== null || search !== '' || datePresetDays !== null;

  const clearAll = () => { setStatusCode(null); setSearch(''); setDatePresetDays(null); };

  const dateLabel = datePresetDays
    ? DATE_PRESETS.find(p => p.days === datePresetDays)?.label ?? 'Custom'
    : 'All time';

  return (
    <View style={{ flex: 1 }}>
      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <View style={s.summaryCard}>
        <Text style={s.summaryLabel}>Total given</Text>
        <Text style={s.summaryBigAmount}>₹{totalGiven.toLocaleString('en-IN')}</Text>
        <Text style={s.summaryBreakdown}>
          {successItems.length} successful · {processingItems.length} processing · {refundedItems.length} refunded
        </Text>
        <View style={s.summaryStatRow}>
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>{ngosSupported}</Text>
            <Text style={s.summaryStatLabel}>NGOs supported</Text>
          </View>
          <View style={s.summaryStatDivider} />
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>₹{processingAmt.toLocaleString('en-IN')}</Text>
            <Text style={s.summaryStatLabel}>Processing</Text>
          </View>
        </View>
      </View>

      {/* ── Search bar ───────────────────────────────────────────────────── */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search NGO or donation ID"
          placeholderTextColor={C.TEXT2}
          value={search}
          onChangeText={setSearch}
        />
        {search !== '' && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 12 }}>
            <Text style={{ color: C.TEXT2, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Date range ───────────────────────────────────────────────────── */}
      <TouchableOpacity style={s.dateRangeBtn} onPress={() => setShowDateModal(true)}>
        <Text style={s.dateRangeIcon}>📅</Text>
        <Text style={s.dateRangeBtnText}>Date range  ·  {dateLabel}</Text>
        <Text style={s.dateRangeChevron}>▾</Text>
      </TouchableOpacity>

      {/* Date preset modal */}
      <Modal transparent visible={showDateModal} animationType="fade" onRequestClose={() => setShowDateModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowDateModal(false)}>
          <View style={s.dateModal}>
            <Text style={s.dateModalTitle}>Select date range</Text>
            {DATE_PRESETS.map(p => (
              <TouchableOpacity key={p.days} style={[s.dateModalRow, datePresetDays === p.days && s.dateModalRowActive]}
                onPress={() => { setDatePresetDays(datePresetDays === p.days ? null : p.days); setShowDateModal(false); }}>
                <Text style={[s.dateModalLabel, datePresetDays === p.days && s.dateModalLabelActive]}>{p.label}</Text>
                {datePresetDays === p.days && <Text style={{ color: C.PRIMARY }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.dateModalClear} onPress={() => { setDatePresetDays(null); setShowDateModal(false); }}>
              <Text style={s.dateModalClearText}>Clear date filter</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Status chips with counts ──────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.chipsScroll} contentContainerStyle={s.chipsRow}>
        {STATUS_CHIPS.map(c => {
          const count = chipCount[String(c.code)];
          const active = statusCode === c.code;
          return (
            <TouchableOpacity key={String(c.code)} style={[s.chip, active && s.chipActive]}
              onPress={() => setStatusCode(c.code)}>
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {c.label}{count != null ? ` · ${count}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Showing X of Y + Clear all ───────────────────────────────────── */}
      <View style={s.metaRow}>
        <Text style={s.metaText}>
          Showing {filtered.length} of {allItems.length}
        </Text>
        {hasFilter && (
          <TouchableOpacity onPress={clearAll}>
            <Text style={s.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Donation list ─────────────────────────────────────────────────── */}
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.PRIMARY} size="large" />
        : <FlatList
            data={grouped}
            keyExtractor={(_, i) => String(i)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.PRIMARY} />}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 }}
            ListEmptyComponent={<EmptyState icon="💳" text="No donations found" />}
            renderItem={({ item }) => (
              <View>
                <View style={s.monthRow}>
                  <Text style={s.monthLabel}>{item.month.toUpperCase()}</Text>
                  <Text style={s.monthTotal}>
                    ₹{item.items.filter((d:any) => d.payStatus === 'SUCCESS')
                        .reduce((a:number, d:any) => a + Number(d.donationAmount), 0)
                        .toLocaleString('en-IN')} given
                  </Text>
                </View>
                {item.items.map((d: any) => (
                  <DonationCard key={d.donationId} d={d} onPress={() =>
                    nav.navigate('DonationDetail', { donationRef: d.donationId })} />
                ))}
              </View>
            )}
          />
      }
    </View>
  );
}

// ── Donation card ─────────────────────────────────────────────────────────────
function DonationCard({ d, onPress }: { d: any; onPress: () => void }) {
  const meta  = STATUS_META[d.payStatus] ?? STATUS_META['CANCELLED'];
  const initials = (d.orgName ?? 'N').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const bgColor  = avatarColor(d.orgId ?? 0);

  const hintText = d.payStatus === 'INITIATED' || d.payStatus === 'PENDING'
    ? '🟠  Confirming with your bank — usually under 24 hrs'
    : d.payStatus === 'REFUNDED'
    ? `🔵  Refund of ₹${Number(d.donationAmount).toLocaleString('en-IN')} initiated — credited in 5–7 working days`
    : d.payStatus === 'FAILED'
    ? '🔴  Payment failed. No amount was deducted.'
    : null;

  return (
    <TouchableOpacity style={s.donCard} onPress={onPress} activeOpacity={0.75}>
      <View style={s.donCardInner}>
        {/* Avatar */}
        <View style={[s.donAvatar, { backgroundColor: bgColor }]}>
          <Text style={s.donAvatarText}>{initials}</Text>
        </View>

        {/* Middle content */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.donOrgName} numberOfLines={1}>{d.orgName ?? '—'}</Text>
          <Text style={s.donSubtitle} numberOfLines={1}>General Donation</Text>
          <Text style={s.donMeta}>
            {fmtDateShort(d.createdAt)}
            {d.payMethod ? `  ·  ${d.payMethod.replace('_', ' ')}` : ''}
            {d.donationId ? `  ·  ${d.donationId}` : ''}
          </Text>
        </View>

        {/* Right: amount + status */}
        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          <Text style={[s.donAmount, { color: d.payStatus === 'SUCCESS' ? C.PRIMARY : C.TEXT }]}>
            ₹{Number(d.donationAmount).toLocaleString('en-IN')}
          </Text>
          <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
            <Text style={[s.statusPillText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>

        <Text style={s.donChevron}>›</Text>
      </View>

      {/* Hint text for non-success statuses */}
      {hintText && (
        <View style={s.hintRow}>
          <Text style={s.hintText}>{hintText}</Text>
        </View>
      )}
    </TouchableOpacity>
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
        <View style={[s.summaryCard, { marginBottom: 16 }]}>
          <Text style={s.summaryLabel}>Annual Committed</Text>
          <Text style={s.summaryBigAmount}>₹{annualCommitted.toLocaleString('en-IN')}</Text>
          <Text style={s.summaryBreakdown}>
            {items.filter(i => i.statusCode === 'ACTIVE').length} active plans
          </Text>
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
                  <View style={[s.donAvatar, { backgroundColor: avatarColor(item.orgId ?? 0), marginRight: 12 }]}>
                    <Text style={s.donAvatarText}>
                      {(item.orgName ?? 'N').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.recurCardOrg}>{item.orgName}</Text>
                    <Text style={s.recurCardCampaign}>General Donation</Text>
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
                <View style={s.recurCardRow}>
                  <View>
                    <Text style={s.recurCardLabel}>Successful cycles</Text>
                    <Text style={s.recurCardValue}>{item.successCount ?? 0}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.recurCardLabel}>Started</Text>
                    <Text style={s.recurCardValue}>{fmtDate(item.startDate)}</Text>
                  </View>
                </View>
                <View style={s.recurCardActions}>
                  {item.statusCode === 'ACTIVE'
                    ? <TouchableOpacity style={s.recurPauseBtn} onPress={() => handlePause(item.recurringDonId)}>
                        <Text style={s.recurPauseBtnText}>⏸ Pause</Text>
                      </TouchableOpacity>
                    : item.statusCode === 'PAUSED'
                    ? <TouchableOpacity style={s.recurResumeBtn} onPress={() => handleResume(item.recurringDonId)}>
                        <Text style={s.recurResumeBtnText}>▶ Resume</Text>
                      </TouchableOpacity>
                    : <Text style={s.cancelledTag}>Cancelled</Text>
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
        : <EmptyState icon="🧾" text="No receipts yet — make a donation with your PAN number to get an 80G receipt" />
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 12 }} /> : null}
      renderItem={({ item }) => (
        <View style={s.receiptCard}>
          <View style={[s.donAvatar, { backgroundColor: avatarColor(item.orgId ?? 0), marginRight: 12, alignSelf: 'flex-start' }]}>
            <Text style={s.donAvatarText}>
              {(item.orgName ?? 'R').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.receiptNo}>{item.receiptNumber}</Text>
            <Text style={s.receiptOrg}>{item.orgName}</Text>
            <Text style={s.receiptFY}>FY {item.fiscalYear}  ·  {fmtDate(item.issuedAt)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.receiptAmount}>₹{Number(item.donationAmount).toLocaleString('en-IN')}</Text>
            {item.receiptUrl
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
  const [items, setItems]         = useState<any[]>([]);
  const [allHistory, setAllHistory] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');

  const load = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const [ngoRes, histRes] = await Promise.allSettled([
        donationApi.getSupportedNgos(),
        donationApi.getHistory({ pageNumber: 1, pageSize: 200 }),
      ]);
      if (ngoRes.status === 'fulfilled' && ngoRes.value.data?.isSuccess === 1)
        setItems(ngoRes.value.data.data ?? []);
      if (histRes.status === 'fulfilled' && histRes.value.data?.isSuccess === 1)
        setAllHistory(histRes.value.data.data?.items ?? []);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const totalAllNgos = items.reduce((a: number, i: any) => a + (Number(i.totalGiven) || 0), 0) || 1;

  const filtered = items.filter(i =>
    !search || (i.orgName ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Get "last donation date" and "processing amount" for each org from history
  const orgHistory = (orgId: number) => allHistory.filter(d => d.orgId === orgId);
  const lastDate   = (orgId: number) => orgHistory(orgId).find(d => d.payStatus === 'SUCCESS')?.createdAt;
  const processing = (orgId: number) =>
    orgHistory(orgId)
      .filter(d => d.payStatus === 'INITIATED' || d.payStatus === 'PENDING')
      .reduce((a: number, d: any) => a + Number(d.donationAmount), 0);

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search NGO, cause or city"
          placeholderTextColor={C.TEXT2}
          value={search}
          onChangeText={setSearch}
        />
        {search !== '' && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 12 }}>
            <Text style={{ color: C.TEXT2, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => item.orgId?.toString() ?? String(i)}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, paddingTop: 8 }}
        ListEmptyComponent={loading
          ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 40 }} size="large" />
          : <EmptyState icon="🏢" text="No NGOs supported yet" />
        }
        renderItem={({ item }) => {
          const pct      = Math.round(((Number(item.totalGiven) || 0) / totalAllNgos) * 100);
          const last     = lastDate(item.orgId);
          const procAmt  = processing(item.orgId);
          const giftCnt  = item.giftCount ?? orgHistory(item.orgId).filter((d: any) => d.payStatus === 'SUCCESS').length;

          return (
            <TouchableOpacity style={s.ngoCard} activeOpacity={0.75}
              onPress={() => nav.navigate('DonorNgoGivingSummary', { orgId: item.orgId, orgName: item.orgName })}>
              <View style={s.ngoCardHeader}>
                <View style={[s.donAvatar, { backgroundColor: avatarColor(item.orgId ?? 0) }]}>
                  <Text style={s.donAvatarText}>
                    {(item.orgName ?? 'N').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.ngoName}>{item.orgName}</Text>
                  <Text style={s.ngoGiftCount}>
                    {giftCnt} donation{giftCnt !== 1 ? 's' : ''}
                    {last ? ` · last ${fmtDateShort(last)}` : ''}
                  </Text>
                  {procAmt > 0 && (
                    <Text style={s.ngoProcessing}>₹{procAmt.toLocaleString('en-IN')} processing</Text>
                  )}
                </View>
                <Text style={s.ngoTotal}>₹{Number(item.totalGiven).toLocaleString('en-IN')}</Text>
                <Text style={s.ngoChevron}>›</Text>
              </View>
              <View style={s.ngoShareRow}>
                <Text style={s.ngoShareLabel}>Share of your giving</Text>
                <Text style={s.ngoSharePct}>{pct}%</Text>
              </View>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: `${pct}%` }]} />
              </View>
              <TouchableOpacity style={s.donateAgainBtn}
                onPress={(e) => { e.stopPropagation?.(); nav.navigate('Donate', { orgId: item.orgId, orgName: item.orgName }); }}>
                <Text style={s.donateAgainBtnText}>Donate again</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function StatusPill({ code }: { code?: string }) {
  const m = STATUS_META[code ?? ''] ?? { bg: '#F3F4F6', text: '#374151', label: code ?? 'Unknown' };
  return (
    <View style={[s.statusPill, { backgroundColor: m.bg }]}>
      <Text style={[s.statusPillText, { color: m.text }]}>{m.label}</Text>
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

function fmtDateShort(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

  // ── Summary card ───────────────────────────────────────────────────────────
  summaryCard: { backgroundColor: C.PRIMARY, marginHorizontal: 16, marginTop: 14,
                 borderRadius: 16, padding: 18 },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  summaryBigAmount: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 4 },
  summaryBreakdown: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 14 },
  summaryStatRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)',
                    borderRadius: 10, overflow: 'hidden' },
  summaryStat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  summaryStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 8 },
  summaryStatValue: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 2 },
  summaryStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.75)' },

  // ── Search ─────────────────────────────────────────────────────────────────
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
                marginTop: 12, backgroundColor: C.CARD, borderRadius: 12,
                borderWidth: 1, borderColor: C.BORDER, paddingLeft: 12 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: C.TEXT },

  // ── Date range ─────────────────────────────────────────────────────────────
  dateRangeBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
                  marginTop: 8, backgroundColor: C.CARD, borderRadius: 10,
                  borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: 14, height: 40 },
  dateRangeIcon: { fontSize: 14, marginRight: 8 },
  dateRangeBtnText: { flex: 1, fontSize: 13, color: C.TEXT },
  dateRangeChevron: { fontSize: 12, color: C.TEXT2 },

  // ── Date modal ─────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  dateModal: { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20,
               paddingTop: 20, paddingBottom: 36, paddingHorizontal: 20 },
  dateModalTitle: { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 12 },
  dateModalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  dateModalRowActive: { },
  dateModalLabel: { fontSize: 14, color: C.TEXT },
  dateModalLabelActive: { color: C.PRIMARY, fontWeight: '700' },
  dateModalClear: { marginTop: 16, alignItems: 'center' },
  dateModalClearText: { fontSize: 14, color: '#EF4444', fontWeight: '600' },

  // ── Status chips ───────────────────────────────────────────────────────────
  chipsScroll: { maxHeight: 48, marginTop: 8 },
  chipsRow:   { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER },
  chipActive: { backgroundColor: C.PRIMARY + '18', borderColor: C.PRIMARY },
  chipText:   { fontSize: 12, color: C.TEXT2 },
  chipTextActive: { color: C.PRIMARY, fontWeight: '700' },

  // ── Meta row ───────────────────────────────────────────────────────────────
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
             paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  metaText: { fontSize: 12, color: C.TEXT2 },
  clearAllText: { fontSize: 12, color: C.PRIMARY, fontWeight: '700' },

  // ── Month group ────────────────────────────────────────────────────────────
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 12, marginBottom: 8 },
  monthLabel: { fontSize: 11, fontWeight: '700', color: C.TEXT2, letterSpacing: 0.8 },
  monthTotal: { fontSize: 11, color: C.TEXT2 },

  // ── Donation card ──────────────────────────────────────────────────────────
  donCard: { backgroundColor: C.CARD, borderRadius: 14, marginBottom: 10,
             borderWidth: 1, borderColor: C.BORDER, overflow: 'hidden' },
  donCardInner: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  donAvatar: { width: 42, height: 42, borderRadius: 21,
               alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  donAvatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  donOrgName: { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  donSubtitle: { fontSize: 12, color: C.TEXT2, marginBottom: 4 },
  donMeta:    { fontSize: 11, color: C.TEXT2 },
  donAmount:  { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  donChevron: { fontSize: 20, color: C.TEXT2, marginLeft: 4 },
  hintRow:    { backgroundColor: '#FFF7ED', paddingHorizontal: 14, paddingVertical: 9,
                borderTopWidth: 1, borderTopColor: '#FED7AA' },
  hintText:   { fontSize: 11, color: '#92400E', lineHeight: 16 },

  // ── Status pill ────────────────────────────────────────────────────────────
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // ── Recurring ──────────────────────────────────────────────────────────────
  recurCard:  { backgroundColor: C.CARD, borderRadius: 14, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: C.BORDER },
  recurCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  recurCardOrg:  { fontSize: 15, fontWeight: '700', color: C.TEXT },
  recurCardCampaign: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  recurCardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  recurCardLabel: { fontSize: 11, color: C.TEXT2, marginBottom: 3 },
  recurCardValue: { fontSize: 13, fontWeight: '600', color: C.TEXT },
  recurCardActions: { flexDirection: 'row', gap: 10 },
  recurPauseBtn: { flex: 1, backgroundColor: '#FFF7ED', borderRadius: 8, paddingVertical: 9,
                   alignItems: 'center', borderWidth: 1, borderColor: '#FED7AA' },
  recurPauseBtnText: { fontSize: 13, fontWeight: '700', color: '#C2410C' },
  recurResumeBtn: { flex: 1, backgroundColor: '#F0FDF4', borderRadius: 8, paddingVertical: 9,
                    alignItems: 'center', borderWidth: 1, borderColor: '#86EFAC' },
  recurResumeBtnText: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  cancelledTag: { fontSize: 12, color: C.TEXT2, fontStyle: 'italic', paddingVertical: 9 },
  recurringCta: { fontSize: 13, color: C.TEXT2, textAlign: 'center', marginTop: 16,
                  lineHeight: 20, paddingHorizontal: 8 },

  // ── Receipts ───────────────────────────────────────────────────────────────
  receiptCard: { flexDirection: 'row', backgroundColor: C.CARD, borderRadius: 12,
                 padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.BORDER,
                 alignItems: 'center' },
  receiptNo:  { fontSize: 13, fontWeight: '700', color: C.TEXT, fontFamily: 'monospace' },
  receiptOrg: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  receiptFY:  { fontSize: 11, color: C.TEXT2, marginTop: 4 },
  receiptAmount: { fontSize: 15, fontWeight: '700', color: C.PRIMARY, marginBottom: 8 },
  downloadBtn: { backgroundColor: '#EFF6FF', borderRadius: 7, paddingHorizontal: 10,
                 paddingVertical: 5, borderWidth: 1, borderColor: '#BFDBFE' },
  downloadBtnText: { fontSize: 12, color: '#1D4ED8', fontWeight: '600' },
  pendingReceiptText: { fontSize: 11, color: C.TEXT2, fontStyle: 'italic' },

  // ── NGOs ───────────────────────────────────────────────────────────────────
  ngoCard:    { backgroundColor: C.CARD, borderRadius: 14, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: C.BORDER },
  ngoCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ngoName:    { fontSize: 14, fontWeight: '700', color: C.TEXT },
  ngoGiftCount: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  ngoProcessing: { fontSize: 11, color: '#C2410C', marginTop: 2 },
  ngoTotal:   { fontSize: 15, fontWeight: '800', color: C.PRIMARY, marginRight: 2 },
  ngoChevron: { fontSize: 18, color: C.TEXT2 },
  ngoShareRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, marginTop: 2 },
  ngoShareLabel: { fontSize: 11, color: C.TEXT2 },
  ngoSharePct: { fontSize: 11, fontWeight: '700', color: C.TEXT2 },
  progressBg: { height: 5, backgroundColor: C.BORDER, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: 5, backgroundColor: C.PRIMARY, borderRadius: 3 },
  donateAgainBtn: { alignSelf: 'stretch', paddingVertical: 10, backgroundColor: C.PRIMARY + '14',
                    borderRadius: 8, alignItems: 'center' },
  donateAgainBtnText: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyWrap:  { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyText:  { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },
});
