/**
 * MyDonationsScreen — s-my-donations
 * 4 tabs: History | Recurring | Receipts | Orgs
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl, ScrollView, Modal, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import DonateIcon from '../../components/common/DonateIcon';
import OrgAvatar  from '../../components/common/OrgAvatar';
import { donationApi } from '../../api/donation.api';
import { orgApi }      from '../../api/org.api';

const C = AppConfig.COLORS;

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = ['History', 'Recurring', 'Receipts', 'Orgs'] as const;
type TabType = typeof TABS[number];

// ── Status chips ──────────────────────────────────────────────────────────────
const STATUS_CHIPS = [
  { code: null,        label: 'All'        },
  { code: 'SUCCESS',   label: 'Successful' },
  { code: 'INITIATED', label: 'Processing' },
  { code: 'FAILED',    label: 'Failed'     },
  { code: 'REFUNDED',  label: 'Refunded'   },
];

const STATUS_META: Record<string, { bg: string; text: string; label: string; dot?: string }> = {
  // Donation transaction statuses
  SUCCESS:   { bg: '#E7F6EC', text: '#15703A', label: 'Success'    },
  INITIATED: { bg: '#FDF1DE', text: '#A14B05', label: 'Processing' },
  PENDING:   { bg: '#FDF1DE', text: '#A14B05', label: 'Processing' },
  FAILED:    { bg: '#FCE8E8', text: '#B3261E', label: 'Failed'     },
  REFUNDED:  { bg: '#EAF2FE', text: '#1D4ED8', label: 'Refunded'   },
  CANCELLED: { bg: '#F3F4F6', text: '#374151', label: 'Cancelled'  },
  // Recurring donation plan statuses
  ACTIVE:    { bg: '#E7F6EC', text: '#15703A', label: 'Active',  dot: '#15703A' },
  PAUSED:    { bg: '#FDF1DE', text: '#A14B05', label: 'Paused',  dot: '#A14B05' },
};

// Date range presets
const DATE_PRESETS = [
  { label: 'Last 7 days',    days: 7   },
  { label: 'Last 30 days',   days: 30  },
  { label: 'Last 3 months',  days: 90  },
  { label: 'This year',      days: 365 },
];

// ── Donate Now Modal ───────────────────────────────────────────────────────────
function DonateNowModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const nav = useNavigation<any>();
  const [search, setSearch]           = useState('');
  const [recentOrgs, setRecentOrgs]   = useState<any[]>([]);
  const [discoverOrgs, setDiscoverOrgs] = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const searchRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([
      donationApi.getSupportedNgos().catch(() => ({ data: null })),
      orgApi.list({ pageSize: 20 }).catch(() => ({ data: null })),
    ]).then(([recentRes, discoverRes]) => {
      setRecentOrgs((recentRes as any)?.data?.data ?? (recentRes as any)?.data ?? []);
      setDiscoverOrgs((discoverRes as any)?.data?.data?.items ?? []);
    }).finally(() => setLoading(false));
  }, [visible]);

  const openDonate = (orgId: number, orgName: string) => {
    onClose();
    nav.navigate('Donate', { orgId, orgName });
  };

  const filteredRecent = search
    ? recentOrgs.filter((o: any) => (o.orgName ?? '').toLowerCase().includes(search.toLowerCase()))
    : recentOrgs;

  const filteredDiscover = search
    ? discoverOrgs.filter((o: any) =>
        (o.orgName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (o.city ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (o.category ?? '').toLowerCase().includes(search.toLowerCase()))
    : discoverOrgs;

  const formatLastGave = (o: any) => {
    if (!o.lastAmount) return null;
    const d = o.lastDonationDate ? new Date(o.lastDonationDate) : null;
    const dateStr = d ? `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}` : '';
    return `Last gave ₹${Number(o.lastAmount).toLocaleString('en-IN')}${dateStr ? ` · ${dateStr}` : ''}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={dn.container}>
        {/* Header */}
        <View style={dn.header}>
          <TouchableOpacity onPress={onClose} style={dn.backBtn} accessibilityLabel="Close">
            <Text style={dn.backArrow}>←</Text>
            <Text style={dn.backLabel}>Back</Text>
          </TouchableOpacity>
          <Text style={dn.headerTitle}>Donate now</Text>
          <View style={{ width: 70 }} />
        </View>

        {/* Search */}
        <View style={dn.searchRow}>
          <Text style={dn.searchIcon}>🔍</Text>
          <TextInput
            ref={searchRef}
            style={dn.searchInput}
            placeholder="Search NGO, cause, category or city"
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

        {loading ? (
          <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
            {/* ── Recently Donated ──────────────────────────────────── */}
            {filteredRecent.length > 0 && (
              <View>
                <Text style={dn.sectionLabel}>RECENTLY DONATED</Text>
                {filteredRecent.map((o: any) => {
                  const lastGave = formatLastGave(o);
                  return (
                    <TouchableOpacity key={o.orgId} style={dn.recentRow}
                      onPress={() => openDonate(o.orgId, o.orgName)}>
                      <OrgAvatar orgId={o.orgId} orgName={o.orgName ?? ''} logoUrl={o.logoUrl}
                        size={42} radius={21} />
                      <View style={{ flex: 1 }}>
                        <Text style={dn.recentOrgName} numberOfLines={1}>{o.orgName}</Text>
                        {o.lastCampaignName ? (
                          <Text style={dn.recentCampaign} numberOfLines={1}>{o.lastCampaignName}</Text>
                        ) : null}
                        {lastGave ? <Text style={dn.recentLastGave}>{lastGave}</Text> : null}
                      </View>
                      <Text style={dn.chevron}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Discover Verified NGOs ────────────────────────────── */}
            {filteredDiscover.length > 0 && (
              <View style={{ marginTop: filteredRecent.length > 0 ? 8 : 0 }}>
                <Text style={dn.sectionLabel}>DISCOVER VERIFIED NGOS</Text>
                {filteredDiscover.map((o: any) => {
                  const is80G      = o.is80GEligible === 1 || o.is80GEligible === true;
                  const isVerified = (o.verificationStatusCode ?? '').toUpperCase() === 'VERIFIED';
                  const isRegistered = !(o.isNonRegistered === 1 || o.isNonRegistered === true);
                  return (
                    <TouchableOpacity key={o.orgId} style={dn.discoverRow}
                      onPress={() => openDonate(o.orgId, o.orgName)}>
                      <OrgAvatar orgId={o.orgId} orgName={o.orgName ?? ''} logoUrl={o.logoUrl}
                        size={42} radius={21} />
                      <View style={{ flex: 1 }}>
                        <Text style={dn.discoverOrgName} numberOfLines={1}>{o.orgName}</Text>
                        <Text style={dn.discoverMeta} numberOfLines={1}>
                          {[o.categoryName ?? o.category, o.city].filter(Boolean).join(' · ')}
                        </Text>
                        {/* Status badges row */}
                        <View style={dn.badgeRow}>
                          {isVerified ? (
                            <View style={dn.badgeVerified}>
                              <Text style={dn.badgeVerifiedText}>✓ Verified</Text>
                            </View>
                          ) : (
                            <View style={dn.badgeNotVerified}>
                              <Text style={dn.badgeNotVerifiedText}>✗ Not Verified</Text>
                            </View>
                          )}
                          <View style={isRegistered ? dn.badgeRegistered : dn.badgeNonReg}>
                            <Text style={isRegistered ? dn.badgeRegisteredText : dn.badgeNonRegText}>
                              {isRegistered ? 'Registered' : 'Non-registered'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {/* 80G badge */}
                      <View style={[dn.badge80G, !is80G && dn.badge80GNo]}>
                        <Text style={[dn.badge80GText, !is80G && { color: '#B45309' }]}>
                          {is80G ? '80G' : 'No 80G'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {filteredRecent.length === 0 && filteredDiscover.length === 0 && !loading && (
              <Text style={dn.emptyText}>No organisations found for "{search}"</Text>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const dn = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.BG },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:      { minWidth: 70, height: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow:    { fontSize: 20, color: C.PRIMARY, fontWeight: '600' },
  backLabel:    { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.TEXT },
  searchRow:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 12,
                  backgroundColor: C.CARD, borderRadius: 12, borderWidth: 1, borderColor: C.BORDER, paddingLeft: 12 },
  searchIcon:   { fontSize: 16, marginRight: 8 },
  searchInput:  { flex: 1, height: 44, fontSize: 14, color: C.TEXT },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.TEXT2, letterSpacing: 0.8,
                  textTransform: 'uppercase', marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  recentRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER, gap: 12 },
  discoverRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER, gap: 12 },
  avatar:       { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:   { fontSize: 14, fontWeight: '800', color: '#fff' },
  recentOrgName:  { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 1 },
  recentCampaign: { fontSize: 12, color: C.TEXT2, marginBottom: 1 },
  recentLastGave: { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },
  chevron:      { fontSize: 20, color: C.TEXT2 },
  discoverOrgName: { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 1 },
  discoverMeta:   { fontSize: 12, color: C.TEXT2 },
  badge80G:     { backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 7,
                  paddingVertical: 3, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 },
  badge80GNo:   { backgroundColor: '#FEF3C7' },
  badge80GText: { fontSize: 11, fontWeight: '700', color: '#15803D' },
  badgeRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  badgeVerified:    { backgroundColor: '#EEF2FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeVerifiedText:{ fontSize: 10, fontWeight: '700', color: '#4F46E5' },
  badgeNotVerified:     { backgroundColor: '#FEF2F2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeNotVerifiedText: { fontSize: 10, fontWeight: '700', color: '#B91C1C' },
  badgeRegistered:  { backgroundColor: '#F0FDF4', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeRegisteredText: { fontSize: 10, fontWeight: '700', color: '#15803D' },
  badgeNonReg:      { backgroundColor: '#F3F4F6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeNonRegText:  { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  emptyText:    { textAlign: 'center', color: C.TEXT2, marginTop: 48, fontSize: 14 },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function MyDonationsScreen() {
  const nav     = useNavigation<any>();
  const route   = useRoute<any>();
  const initTab = (route.params as any)?.initialTab as TabType | undefined;
  const [activeTab, setActiveTab] = useState<TabType>(
    TABS.includes(initTab as TabType) ? initTab! : 'History'
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} accessibilityLabel="Back">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Donations</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs — 4-column fixed grid */}
      <View style={s.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(t)}
            style={[s.tabBtn, activeTab === t && s.tabBtnActive]}>
            <Text style={[s.tabBtnText, activeTab === t && s.tabBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'History'   && <HistoryTab />}
      {activeTab === 'Recurring' && <RecurringTab />}
      {activeTab === 'Receipts'  && <ReceiptsTab />}
      {activeTab === 'Orgs'      && <NgosTab />}
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
  const [customFrom, setCustomFrom]         = useState('');
  const [customTo, setCustomTo]             = useState('');
  const [customRange, setCustomRange]       = useState<{ from: Date; to: Date } | null>(null);
  const [showDonateNow, setShowDonateNow]   = useState(false);
  const insets = useSafeAreaInsets();

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
    if (customRange) {
      const d = new Date(item.createdAt);
      if (d < customRange.from || d > customRange.to) return false;
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
  const hasFilter = statusCode !== null || search !== '' || datePresetDays !== null || customRange !== null;

  const clearAll = () => {
    setStatusCode(null); setSearch(''); setDatePresetDays(null);
    setCustomRange(null); setCustomFrom(''); setCustomTo('');
  };

  const parseCustomDate = (str: string): Date | null => {
    // Accept DD/MM/YYYY
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return isNaN(d.getTime()) ? null : d;
  };

  const applyCustomRange = () => {
    const from = parseCustomDate(customFrom);
    const to   = parseCustomDate(customTo);
    if (!from) { Alert.alert('Invalid date', 'Enter From date as DD/MM/YYYY'); return; }
    if (!to)   { Alert.alert('Invalid date', 'Enter To date as DD/MM/YYYY'); return; }
    if (from > to) { Alert.alert('Invalid range', '"From" date must be before "To" date'); return; }
    const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999);
    setCustomRange({ from, to: toEnd });
    setDatePresetDays(null);
    setShowDateModal(false);
  };

  const dateLabel = customRange
    ? `${fmtDateShort(customRange.from.toISOString())} – ${fmtDateShort(customRange.to.toISOString())}`
    : datePresetDays
    ? DATE_PRESETS.find(p => p.days === datePresetDays)?.label ?? 'Custom'
    : 'All time';

  // ── Header content (scrolls with the list) ───────────────────────────────
  const listHeader = (
    <>
      {/* Summary card */}
      <View style={s.summaryCard}>
        {/* Top row: label + Donate Now button */}
        <View style={s.summaryTopRow}>
          <Text style={s.summaryLabel}>Total given</Text>
          <TouchableOpacity style={s.donateNowPill} onPress={() => setShowDonateNow(true)}
            accessibilityLabel="Donate now">
            <DonateIcon size={16} color={C.PRIMARY} />
            <Text style={s.donateNowPillText}>Donate Now</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.summaryBigAmount}>₹{totalGiven.toLocaleString('en-IN')}</Text>
        <Text style={s.summaryBreakdown}>
          {successItems.length} successful · {processingItems.length} processing · {refundedItems.length} refunded
        </Text>
        <View style={s.summaryTileGrid}>
          <View style={s.summaryTile}>
            <Text style={s.summaryStatValue}>{ngosSupported}</Text>
            <Text style={s.summaryStatLabel}>Orgs supported</Text>
          </View>
          <View style={s.summaryTile}>
            <Text style={s.summaryStatValue}>{successItems.length}</Text>
            <Text style={s.summaryStatLabel}>Successful</Text>
          </View>
          <View style={s.summaryTile}>
            <Text style={s.summaryStatValue}>{allItems.length}</Text>
            <Text style={s.summaryStatLabel}>Total donations</Text>
          </View>
          <View style={s.summaryTile}>
            <Text style={s.summaryStatValue}>
              {processingAmt > 0 ? `₹${processingAmt.toLocaleString('en-IN')}` : refundedItems.length}
            </Text>
            <Text style={s.summaryStatLabel}>
              {processingAmt > 0 ? 'Processing' : 'Refunded'}
            </Text>
          </View>
        </View>
      </View>

      {/* Donate Now modal */}
      <DonateNowModal visible={showDonateNow} onClose={() => setShowDonateNow(false)} />

      {/* Search bar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search organisation or donation ID"
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

      {/* Date range button */}
      <TouchableOpacity style={s.dateRangeBtn} onPress={() => setShowDateModal(true)}>
        <Text style={s.dateRangeIcon}>📅</Text>
        <Text style={s.dateRangeBtnText}>Date range</Text>
        <Text style={s.dateRangeValue}>{dateLabel}</Text>
        <Text style={s.dateRangeChevron}>▾</Text>
      </TouchableOpacity>

      {/* Status chips (horizontal scroll) */}
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

      {/* Showing X of Y + Clear all */}
      <View style={s.metaRow}>
        <Text style={s.metaText}>Showing {filtered.length} of {allItems.length}</Text>
        {hasFilter && (
          <TouchableOpacity onPress={clearAll}>
            <Text style={s.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Modal lives outside FlatList so it overlays the whole screen */}
      <Modal transparent visible={showDateModal} animationType="slide" onRequestClose={() => setShowDateModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.modalOverlay} onPress={() => setShowDateModal(false)}>
            <Pressable style={[s.dateModal, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
              onPress={e => e.stopPropagation()}>
              <View style={s.dateModalHandle} />
              <Text style={s.dateModalTitle}>Select date range</Text>

              {DATE_PRESETS.map(p => (
                <TouchableOpacity key={p.days}
                  style={[s.dateModalRow, datePresetDays === p.days && s.dateModalRowActive]}
                  onPress={() => {
                    const next = datePresetDays === p.days ? null : p.days;
                    setDatePresetDays(next);
                    setCustomRange(null); setCustomFrom(''); setCustomTo('');
                    setShowDateModal(false);
                  }}>
                  <Text style={[s.dateModalLabel, datePresetDays === p.days && s.dateModalLabelActive]}>
                    {p.label}
                  </Text>
                  {datePresetDays === p.days && <Text style={{ color: C.PRIMARY, fontWeight: '700' }}>✓</Text>}
                </TouchableOpacity>
              ))}

              <View style={s.dateModalDivider} />
              <Text style={s.dateModalSectionLabel}>Custom range</Text>
              <View style={s.dateCustomRow}>
                <View style={s.dateCustomField}>
                  <Text style={s.dateCustomFieldLabel}>From</Text>
                  <TextInput
                    style={[s.dateCustomInput, customRange && s.dateCustomInputActive]}
                    placeholder="DD/MM/YYYY" placeholderTextColor={C.TEXT2}
                    value={customFrom} onChangeText={setCustomFrom}
                    keyboardType="numeric" maxLength={10}
                  />
                </View>
                <Text style={s.dateCustomSep}>→</Text>
                <View style={s.dateCustomField}>
                  <Text style={s.dateCustomFieldLabel}>To</Text>
                  <TextInput
                    style={[s.dateCustomInput, customRange && s.dateCustomInputActive]}
                    placeholder="DD/MM/YYYY" placeholderTextColor={C.TEXT2}
                    value={customTo} onChangeText={setCustomTo}
                    keyboardType="numeric" maxLength={10}
                  />
                </View>
              </View>
              <TouchableOpacity style={s.dateApplyBtn} onPress={applyCustomRange}>
                <Text style={s.dateApplyBtnText}>Apply custom range</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dateModalClear}
                onPress={() => {
                  setDatePresetDays(null); setCustomRange(null); setCustomFrom(''); setCustomTo('');
                  setShowDateModal(false);
                }}>
                <Text style={s.dateModalClearText}>Clear date filter</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* FlatList owns all scrolling — header + items scroll together */}
      <FlatList
        data={loading ? [] : grouped}
        keyExtractor={(_, i) => String(i)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.PRIMARY} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading
            ? <ActivityIndicator style={{ marginTop: 40 }} color={C.PRIMARY} size="large" />
            : <EmptyState icon="💳" text="No donations found" />
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
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
    </View>
  );
}

// ── Donation card ─────────────────────────────────────────────────────────────
function DonationCard({ d, onPress }: { d: any; onPress: () => void }) {
  const meta  = STATUS_META[d.payStatus] ?? STATUS_META['CANCELLED'];
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
        <OrgAvatar orgId={d.orgId ?? 0} orgName={d.orgName ?? ''} logoUrl={d.orgLogoUrl}
          size={42} radius={21} />

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
// EDIT RECURRING PLAN MODAL
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_AMOUNTS  = [250, 500, 1000, 2000];
const FREQUENCIES    = [
  { code: 'MONTHLY',   label: 'Monthly'   },
  { code: 'QUARTERLY', label: 'Quarterly' },
  { code: 'YEARLY',    label: 'Yearly'    },
];
const PAY_METHODS = [
  { code: 'UPI_AUTOPAY',    label: 'UPI Autopay'   },
  { code: 'CARD_MANDATE',   label: 'Card mandate'  },
];

interface EditRecurPlan {
  recurringDonId: number;
  orgName: string;
  campaignName: string;
  amount: number;
  frequencyCode: string;
  payMethodCode: string;
  nextChargeDate?: string;
}

function EditRecurModal({
  plan, onClose, onSaved,
}: { plan: EditRecurPlan; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [amount,    setAmount]    = useState(String(plan.amount));
  const [freq,      setFreq]      = useState(plan.frequencyCode ?? 'MONTHLY');
  const [payMethod, setPayMethod] = useState(plan.payMethodCode ?? 'UPI_AUTOPAY');
  const [saving,    setSaving]    = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const freqMult  = freq === 'MONTHLY' ? 12 : freq === 'QUARTERLY' ? 4 : 1;
  const annualAmt = numAmount * freqMult;
  const nextLabel = plan.nextChargeDate ? fmtDate(plan.nextChargeDate) : '—';

  const handleSave = async () => {
    if (numAmount < 1) { Alert.alert('Invalid amount', 'Please enter a valid amount.'); return; }
    setSaving(true);
    try {
      const res = await donationApi.updateRecurring(plan.recurringDonId, {
        amount: numAmount, frequencyCode: freq,
      });
      if (res.data?.isSuccess === 1) {
        onSaved();
        onClose();
      } else {
        Alert.alert('Could not update', res.data?.message ?? 'Please try again.');
      }
    } catch (_) {
      Alert.alert('Error', 'Could not update recurring plan. Please try again.');
    } finally { setSaving(false); }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel recurring plan',
      'Are you sure you want to cancel this recurring donation? This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            await donationApi.cancelRecurring?.(plan.recurringDonId);
            onSaved();
            onClose();
          } catch (_) {
            Alert.alert('Error', 'Could not cancel recurring donation.');
          } finally { setCancelling(false); }
        }},
      ],
    );
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      {/* Full-screen dim — always covers background reliably on both platforms */}
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        {/* Tap outside to close */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <View style={[s.editRecurSheet, { maxHeight: '90%' }]}>
          {/* Drag handle */}
          <View style={s.editRecurHandle} />

          {/* Header */}
          <View style={s.editRecurHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.editRecurTitle}>Edit recurring plan</Text>
              <Text style={s.editRecurSub} numberOfLines={1}>
                {plan.orgName}{plan.campaignName ? ` · ${plan.campaignName}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.editRecurClose}>
              <Text style={s.editRecurCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Scrollable body */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>

            {/* Amount per debit */}
            <Text style={s.editRecurSectionLabel}>Amount per debit</Text>
            <View style={s.editRecurChipRow}>
              {QUICK_AMOUNTS.map(a => (
                <TouchableOpacity key={a}
                  style={[s.editRecurChip, String(a) === amount && s.editRecurChipActive]}
                  onPress={() => setAmount(String(a))}>
                  <Text style={[s.editRecurChipText, String(a) === amount && s.editRecurChipTextActive]}>
                    ₹{a.toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.editRecurAmtInput}>
              <Text style={s.editRecurRupee}>₹</Text>
              <TextInput
                style={s.editRecurAmtText}
                keyboardType="numeric"
                value={amount}
                onChangeText={v => { setAmount(v.replace(/[^0-9]/g, '')); }}
                placeholderTextColor={C.TEXT2}
              />
            </View>

            {/* Frequency */}
            <Text style={s.editRecurSectionLabel}>Frequency</Text>
            <View style={s.editRecurChipRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity key={f.code}
                  style={[s.editRecurChip, freq === f.code && s.editRecurChipActive]}
                  onPress={() => setFreq(f.code)}>
                  <Text style={[s.editRecurChipText, freq === f.code && s.editRecurChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Pay with — read-only (gateway mandate cannot be changed locally) */}
            <Text style={s.editRecurSectionLabel}>Pay with</Text>
            <View style={[s.editRecurChipRow, { marginBottom: 4 }]}>
              {PAY_METHODS.map(p => (
                <View key={p.code}
                  style={[s.editRecurChip, payMethod === p.code && s.editRecurChipActive]}>
                  <Text style={[s.editRecurChipText, payMethod === p.code && s.editRecurChipTextActive]}>
                    {p.label}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: C.TEXT2, marginBottom: 14 }}>
              Payment method is set by your bank mandate and cannot be changed here.
            </Text>

            {/* Summary */}
            {numAmount > 0 && (
              <View style={s.editRecurSummary}>
                <Text style={s.editRecurSummaryText}>
                  ₹{annualAmt.toLocaleString('en-IN')} per year · next debit {nextLabel}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Pinned footer — buttons always visible */}
          <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 8 }}>
            <View style={s.editRecurBtns}>
              <TouchableOpacity style={s.editRecurCancelBtn} onPress={onClose} disabled={saving}>
                <Text style={s.editRecurCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.editRecurSaveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave} disabled={saving}>
                <Text style={s.editRecurSaveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={handleCancel} disabled={cancelling} style={{ alignItems: 'center', marginTop: 10 }}>
              <Text style={s.editRecurCancelPlan}>
                {cancelling ? 'Cancelling…' : 'Cancel this recurring plan'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP RECURRING MODAL
// ─────────────────────────────────────────────────────────────────────────────
function SetupRecurringModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [recentOrgs,      setRecentOrgs]      = useState<any[]>([]);
  const [selectedOrg,     setSelectedOrg]     = useState<any | null>(null);   // full org object
  const [amount,          setAmount]          = useState('500');
  const [frequencyCode,   setFrequencyCode]   = useState('MONTHLY');
  const [payMethod,       setPayMethod]       = useState('UPI_AUTOPAY');
  const [saving,          setSaving]          = useState(false);
  const [loadingOrgs,     setLoadingOrgs]     = useState(true);
  // browse / search state
  const [browseOpen,      setBrowseOpen]      = useState(false);
  const [browseQuery,     setBrowseQuery]     = useState('');
  const [browseResults,   setBrowseResults]   = useState<any[]>([]);
  const [browseLoading,   setBrowseLoading]   = useState(false);
  const browseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    donationApi.getSupportedNgos()
      .then(res => { if (res.data?.isSuccess === 1) setRecentOrgs(res.data.data ?? []); })
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, []);

  // Debounced live search against full org DB
  useEffect(() => {
    if (!browseOpen) return;
    if (browseTimer.current) clearTimeout(browseTimer.current);
    if (browseQuery.trim().length === 0) {
      // Load first page with no keyword so user sees options immediately
      setBrowseLoading(true);
      orgApi.list({ pageNumber: 1, pageSize: 10 })
        .then(res => setBrowseResults(res.data?.data?.items ?? []))
        .catch(() => {})
        .finally(() => setBrowseLoading(false));
      return;
    }
    browseTimer.current = setTimeout(() => {
      setBrowseLoading(true);
      orgApi.list({ keyword: browseQuery.trim(), pageNumber: 1, pageSize: 10 })
        .then(res => setBrowseResults(res.data?.data?.items ?? []))
        .catch(() => {})
        .finally(() => setBrowseLoading(false));
    }, 350);
    return () => { if (browseTimer.current) clearTimeout(browseTimer.current); };
  }, [browseQuery, browseOpen]);

  const selectOrg = (org: any) => {
    setSelectedOrg(org);
    setBrowseOpen(false); setBrowseQuery(''); setBrowseResults([]);
  };

  const finalAmount      = Number(amount) || 0;
  const tomorrow         = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const firstDebitStr    = tomorrow.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const annualMultiplier = frequencyCode === 'MONTHLY' ? 12 : frequencyCode === 'QUARTERLY' ? 4 : 1;
  const annualAmt        = finalAmount * annualMultiplier;

  const handleStart = async () => {
    if (!selectedOrg) { Alert.alert('Select Organisation', 'Please select an organisation to donate to.'); return; }
    if (finalAmount < 1) { Alert.alert('Invalid amount', 'Please enter a valid donation amount.'); return; }
    setSaving(true);
    try {
      const res = await donationApi.setupRecurring({
        orgId: selectedOrg.orgId, amount: finalAmount, frequencyCode,
        startDate: tomorrow.toISOString().split('T')[0],
      });
      if (res.data?.isSuccess === 1) { onSaved(); onClose(); }
      else Alert.alert('Error', res.data?.message ?? 'Could not start recurring donation.');
    } catch { Alert.alert('Error', 'Something went wrong. Please try again.'); }
    finally { setSaving(false); }
  };

  const lastGaveLabel = (org: any) => {
    const amt  = org.lastAmount ? `₹${Number(org.lastAmount).toLocaleString('en-IN')}` : '';
    const date = org.lastDonatedAt
      ? new Date(org.lastDonatedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      : '';
    return amt && date ? `Last gave ${amt} · ${date}` : amt || '';
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[s.editRecurSheet, { maxHeight: '92%' }]}>
          <View style={s.editRecurHandle} />

          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={s.editRecurHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.editRecurTitle}>Start a recurring donation</Text>
              <Text style={{ fontSize: 13, color: C.TEXT2, marginTop: 2 }}>
                Give automatically. Pause or cancel anytime.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.setupCloseBtn}>
              <Text style={{ fontSize: 16, color: C.TEXT2, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>

            {/* ── Recently donated orgs ────────────────────────────────── */}
            {(loadingOrgs || recentOrgs.length > 0) && (
              <>
                <View style={s.setupSectionRow}>
                  <Text style={s.editRecurSectionLabel}>Recently donated</Text>
                  <Text style={{ fontSize: 12, color: C.TEXT2 }}>Tap to select</Text>
                </View>
                {loadingOrgs
                  ? <ActivityIndicator color={C.PRIMARY} style={{ marginVertical: 16 }} />
                  : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -20 }}
                      contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 4 }}>
                      {recentOrgs.map((org: any) => {
                        const isSelected = org.orgId === selectedOrg?.orgId;
                        return (
                          <TouchableOpacity key={org.orgId}
                            style={[s.setupOrgCard, isSelected && s.setupOrgCardActive]}
                            onPress={() => selectOrg(org)}>
                            <OrgAvatar orgId={org.orgId} orgName={org.orgName ?? ''} logoUrl={org.logoUrl} size={48} radius={24} />
                            <Text style={[s.setupOrgCardName, isSelected && { color: C.PRIMARY }]}
                              numberOfLines={2}>{org.orgName}</Text>
                            <Text style={s.setupOrgCardCampaign} numberOfLines={1}>
                              {org.lastCampaignName ?? 'General Donation'}
                            </Text>
                            {lastGaveLabel(org) !== '' && (
                              <Text style={[s.setupOrgCardLastGave, isSelected && { color: C.PRIMARY }]}>
                                {lastGaveLabel(org)}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )
                }
              </>
            )}

            {/* ── Browse / search all organisations ────────────────────── */}
            <Text style={[s.editRecurSectionLabel, { marginTop: recentOrgs.length > 0 ? 20 : 0 }]}>
              {recentOrgs.length > 0 ? 'Or support a new organisation' : 'Select organisation'}
            </Text>

            {!browseOpen ? (
              <TouchableOpacity style={s.setupBrowseRow} activeOpacity={0.75}
                onPress={() => setBrowseOpen(true)}>
                <Text style={{ fontSize: 14, color: C.TEXT2, flex: 1 }}>
                  Search all verified organisations…
                </Text>
                <Text style={{ fontSize: 16, color: C.PRIMARY }}>🔍</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.setupBrowseExpanded}>
                {/* Search input */}
                <View style={s.setupBrowseInputRow}>
                  <Text style={{ fontSize: 14, marginRight: 8, color: C.TEXT2 }}>🔍</Text>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: C.TEXT, paddingVertical: 0 }}
                    placeholder="Type organisation name…"
                    placeholderTextColor={C.TEXT2}
                    value={browseQuery}
                    onChangeText={setBrowseQuery}
                    autoFocus
                  />
                  {browseQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setBrowseQuery('')}>
                      <Text style={{ fontSize: 15, color: C.TEXT2, paddingLeft: 8 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Results */}
                {browseLoading
                  ? <ActivityIndicator color={C.PRIMARY} style={{ marginVertical: 12 }} />
                  : browseResults.length === 0
                    ? <Text style={{ fontSize: 13, color: C.TEXT2, textAlign: 'center', paddingVertical: 12 }}>
                        No organisations found
                      </Text>
                    : browseResults.map((org: any) => {
                        const isSelected = org.orgId === selectedOrg?.orgId;
                        return (
                          <TouchableOpacity key={org.orgId}
                            style={[s.setupBrowseResult, isSelected && s.setupBrowseResultActive]}
                            onPress={() => selectOrg(org)}>
                            <OrgAvatar orgId={org.orgId} orgName={org.orgName ?? ''} logoUrl={org.logoUrl} size={36} radius={18} />
                            <View style={{ flex: 1 }}>
                              <Text style={[s.setupBrowseOrgName, isSelected && { color: C.PRIMARY }]}
                                numberOfLines={1}>{org.orgName}</Text>
                              {org.city && (
                                <Text style={{ fontSize: 11, color: C.TEXT2 }}>{org.city}</Text>
                              )}
                            </View>
                            {isSelected && (
                              <Text style={{ fontSize: 14, color: C.PRIMARY, fontWeight: '700' }}>✓</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })
                }
              </View>
            )}

            {selectedOrg && (
              <View style={s.setupSelectedCard}>
                {/* Avatar */}
                <OrgAvatar orgId={selectedOrg.orgId} orgName={selectedOrg.orgName ?? ''} logoUrl={selectedOrg.logoUrl} size={48} radius={24} />
                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={s.setupSelectedOrgName} numberOfLines={1}>
                    {selectedOrg.orgName ?? ''}
                  </Text>
                  <Text style={s.setupSelectedCampaign} numberOfLines={1}>
                    {selectedOrg.lastCampaignName ?? 'General Donation'}
                  </Text>
                  {selectedOrg.lastAmount ? (
                    <Text style={s.setupSelectedLastGave}>
                      {lastGaveLabel(selectedOrg)}
                    </Text>
                  ) : null}
                </View>
                {/* Change button */}
                <TouchableOpacity
                  onPress={() => setSelectedOrg(null)}
                  style={s.setupSelectedChangeBtn}>
                  <Text style={s.setupSelectedChangeBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Amount per debit ────────────────────────────────────── */}
            <Text style={[s.editRecurSectionLabel, { marginTop: 20 }]}>Amount per debit</Text>
            <View style={s.editRecurChipRow}>
              {QUICK_AMOUNTS.map(a => (
                <TouchableOpacity key={a}
                  style={[s.editRecurChip, String(a) === amount && s.editRecurChipActive]}
                  onPress={() => setAmount(String(a))}>
                  <Text style={[s.editRecurChipText, String(a) === amount && s.editRecurChipTextActive]}>
                    ₹{a.toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.editRecurAmtInput}>
              <Text style={s.editRecurRupee}>₹</Text>
              <TextInput
                style={s.editRecurAmtText}
                keyboardType="numeric"
                value={amount}
                onChangeText={v => setAmount(v.replace(/[^0-9]/g, ''))}
                placeholderTextColor={C.TEXT2}
              />
            </View>

            {/* ── Frequency ───────────────────────────────────────────── */}
            <Text style={[s.editRecurSectionLabel, { marginTop: 20 }]}>Frequency</Text>
            <View style={s.editRecurChipRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity key={f.code}
                  style={[s.editRecurChip, frequencyCode === f.code && s.editRecurChipActive]}
                  onPress={() => setFrequencyCode(f.code)}>
                  <Text style={[s.editRecurChipText, frequencyCode === f.code && s.editRecurChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Pay with ────────────────────────────────────────────── */}
            <Text style={[s.editRecurSectionLabel, { marginTop: 20 }]}>Pay with</Text>
            <View style={[s.editRecurChipRow, { marginBottom: 4 }]}>
              {PAY_METHODS.map(pm => (
                <TouchableOpacity key={pm.code}
                  style={[s.editRecurChip, payMethod === pm.code && s.editRecurChipActive]}
                  onPress={() => setPayMethod(pm.code)}>
                  <Text style={[s.editRecurChipText, payMethod === pm.code && s.editRecurChipTextActive]}>
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: C.TEXT2, marginBottom: 14 }}>
              Mandate will be set up via your bank after confirmation
            </Text>

            {/* ── Summary ─────────────────────────────────────────────── */}
            {selectedOrg && finalAmount >= 1 && (
              <View style={s.editRecurSummary}>
                <Text style={s.editRecurSummaryText}>
                  ₹{annualAmt.toLocaleString('en-IN')} per year · first debit {firstDebitStr}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 8 }}>
            <View style={s.editRecurBtns}>
              <TouchableOpacity style={s.editRecurCancelBtn} onPress={onClose} disabled={saving}>
                <Text style={s.editRecurCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.editRecurSaveBtn, saving && { opacity: 0.6 }]}
                onPress={handleStart} disabled={saving}>
                <Text style={s.editRecurSaveBtnText}>{saving ? 'Starting…' : 'Start plan'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
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
  const [editPlan,  setEditPlan]  = useState<EditRecurPlan | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);

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
    try { await donationApi.pauseRecurring(id); load(true); }
    catch (_) { Alert.alert('Error', 'Could not pause recurring donation'); }
  };

  const handleResume = async (id: number) => {
    try { await donationApi.resumeRecurring(id); load(true); }
    catch (_) { Alert.alert('Error', 'Could not resume recurring donation'); }
  };

  const activeItems    = items.filter(i => i.statusCode === 'ACTIVE');
  const annualCommitted = activeItems.reduce((a, i) => a + (i.annualCommitted ?? 0), 0);

  return (
    <View style={{ flex: 1 }}>
      {/* Edit recurring plan modal */}
      {editPlan && (
        <EditRecurModal
          plan={editPlan}
          onClose={() => setEditPlan(null)}
          onSaved={() => load(true)}
        />
      )}
      {/* Start recurring plan modal */}
      {showSetupModal && (
        <SetupRecurringModal
          onClose={() => setShowSetupModal(false)}
          onSaved={() => load(true)}
        />
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.PRIMARY} />}>

        {/* ── Summary banner ───────────────────────────────────────────── */}
        {!loading && items.length > 0 && (
          <View style={s.recurSummary}>
            <Text style={s.recurSummaryLabel}>Committed per year</Text>
            <Text style={s.recurSummaryAmount}>₹{annualCommitted.toLocaleString('en-IN')}</Text>
            <Text style={s.recurSummaryMeta}>
              {activeItems.length} active of {items.length} plan{items.length !== 1 ? 's' : ''} · cancel or pause anytime
            </Text>
          </View>
        )}

        {loading
          ? <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 40 }} size="large" />
          : items.length === 0
          ? <EmptyState icon="🔄" text="No recurring donations yet" />
          : items.map(item => {
              const isPaused    = item.statusCode === 'PAUSED';
              const isCancelled = item.statusCode === 'CANCELLED';
              const nextDebit   = isPaused
                ? 'None — paused'
                : item.nextChargeDate
                ? fmtDate(item.nextChargeDate)
                : '—';
              const payMethod  = item.payMethodSummary ?? item.paymentMethod ?? '';
              const setupNote  = item.startDate
                ? `Set up ${fmtDate(item.startDate)}${(item.successCount ?? 0) === 0 ? '  ·  first debit pending' : ''}`
                : '';

              return (
                <View key={item.recurringDonId} style={[
                  s.recurCard,
                  isCancelled && { opacity: 0.65 },
                ]}>
                  {/* Header row */}
                  <View style={s.recurCardHeader}>
                    <OrgAvatar orgId={item.orgId ?? 0} orgName={item.orgName ?? ''}
                      logoUrl={item.orgLogoUrl} size={40} radius={10} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.recurCardOrg} numberOfLines={1}>{item.orgName}</Text>
                      <Text style={s.recurCardCampaign} numberOfLines={1}>
                        {item.campaignName ?? 'General Donation'}
                      </Text>
                    </View>
                    <StatusPill code={item.statusCode} />
                  </View>

                  {/* Amount + Next debit 2-col */}
                  <View style={s.recurInfoRow}>
                    <View style={s.recurInfoCol}>
                      <Text style={s.recurCardLabel}>Amount</Text>
                      <Text style={s.recurCardValue}>
                        ₹{Number(item.amount).toLocaleString('en-IN')} / {item.frequencyLabel ?? item.frequencyCode ?? 'month'}
                      </Text>
                    </View>
                    <View style={[s.recurInfoCol, { alignItems: 'flex-end' }]}>
                      <Text style={s.recurCardLabel}>Next debit</Text>
                      <Text style={[s.recurCardValue, isPaused && { color: C.TEXT2 }]}>{nextDebit}</Text>
                    </View>
                  </View>

                  {/* Payment method */}
                  {payMethod !== '' && (
                    <Text style={s.recurPayMethod}>{payMethod}</Text>
                  )}

                  {/* Setup note */}
                  {setupNote !== '' && (
                    <Text style={s.recurSetupNote}>{setupNote}</Text>
                  )}

                  {/* Divider */}
                  <View style={s.recurDivider} />

                  {/* Actions */}
                  {!isCancelled && (
                    <View style={s.recurCardActions}>
                      {isPaused
                        ? <TouchableOpacity style={s.recurActionBtn}
                            onPress={() => handleResume(item.recurringDonId)}>
                            <Text style={s.recurActionBtnText}>Resume</Text>
                          </TouchableOpacity>
                        : <TouchableOpacity style={s.recurActionBtn}
                            onPress={() => handlePause(item.recurringDonId)}>
                            <Text style={s.recurActionBtnText}>Pause</Text>
                          </TouchableOpacity>
                      }
                      <TouchableOpacity style={s.recurEditBtn}
                        onPress={() => setEditPlan({
                          recurringDonId: item.recurringDonId,
                          orgName:        item.orgName ?? '',
                          campaignName:   item.campaignName ?? '',
                          amount:         Number(item.amount) || 0,
                          frequencyCode:  item.frequencyCode ?? 'MONTHLY',
                          payMethodCode:  item.payMethodCode ?? 'UPI_AUTOPAY',
                          nextChargeDate: item.nextChargeDate,
                        })}>
                        <Text style={s.recurEditBtnText}>Edit plan</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {isCancelled && (
                    <Text style={s.cancelledTag}>This plan has been cancelled</Text>
                  )}
                </View>
              );
            })
        }
      </ScrollView>

      {/* ── Floating CTA ─────────────────────────────────────────────────── */}
      <View style={s.recurCtaBar}>
        <TouchableOpacity style={s.recurCtaBtn}
          onPress={() => setShowSetupModal(true)}>
          <Text style={s.recurCtaBtnText}>+ Start a recurring donation</Text>
        </TouchableOpacity>
      </View>
    </View>
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
          <OrgAvatar orgId={item.orgId ?? 0} orgName={item.orgName ?? ''} logoUrl={item.orgLogoUrl}
            size={42} radius={21} />
          <View style={{ flex: 1 }}>
            <Text style={s.receiptNo}>{item.receiptNumber}</Text>
            <Text style={s.receiptOrg}>{item.orgName}</Text>
            <Text style={s.receiptFY}>FY {item.fiscalYear}  ·  {fmtDate(item.issuedAt)}</Text>
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

  const totalAllNgos = items.reduce((a: number, i: any) => a + (Number(i.totalDonated) || 0), 0) || 1;

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
          placeholder="Search organisation, cause or city"
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
          : <EmptyState icon="🏢" text="No organisations supported yet" />
        }
        renderItem={({ item }) => {
          const pct      = Math.round(((Number(item.totalDonated) || 0) / totalAllNgos) * 100);
          const last     = lastDate(item.orgId);
          const procAmt  = processing(item.orgId);
          const giftCnt  = item.transactions ?? orgHistory(item.orgId).filter((d: any) => d.payStatus === 'SUCCESS').length;

          return (
            <TouchableOpacity style={s.ngoCard} activeOpacity={0.75}
              onPress={() => nav.navigate('DonorNgoGivingSummary', { orgId: item.orgId, orgName: item.orgName })}>
              <View style={s.ngoCardHeader}>
                <OrgAvatar orgId={item.orgId ?? 0} orgName={item.orgName ?? ''}
                  logoUrl={item.logoUrl} size={42} radius={21} />
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
                <Text style={s.ngoTotal}>₹{(Number(item.totalDonated) || 0).toLocaleString('en-IN')}</Text>
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
      {m.dot && (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.dot, marginRight: 5 }} />
      )}
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
  backBtn:    { minWidth: 70, height: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow:  { fontSize: 20, color: C.PRIMARY, fontWeight: '600' },
  backLabel:  { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.TEXT },

  tabsRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tabBtn:     { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center',
                borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: C.PRIMARY },
  tabBtnText: { fontSize: 14, color: '#3B3850', fontWeight: '400' },
  tabBtnTextActive: { color: C.PRIMARY, fontWeight: '700' },

  // ── Summary card ───────────────────────────────────────────────────────────
  summaryCard: { backgroundColor: C.PRIMARY, marginHorizontal: 16, marginTop: 14,
                 borderRadius: 20, padding: 18, gap: 14 },
  summaryLabel: { fontSize: 13, color: '#E2DCFF', fontWeight: '500' },
  summaryBigAmount: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  summaryBreakdown: { fontSize: 13, color: '#E2DCFF', marginTop: 2 },
  summaryTileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryTile: { flex: 1, minWidth: '45%', backgroundColor: '#5C44D3',
                 borderRadius: 12, padding: 10 },
  summaryStatValue: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 2 },
  summaryStatLabel: { fontSize: 11, color: '#E2DCFF' },

  // ── Summary card top row ───────────────────────────────────────────────────
  summaryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  donateNowPill: { flexDirection: 'row', alignItems: 'center', gap: 6,
                   backgroundColor: '#FFFFFF', borderRadius: 999,
                   paddingHorizontal: 14, paddingVertical: 8 },
  donateNowPillText: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },

  // ── Search ─────────────────────────────────────────────────────────────────
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
                marginTop: 12, backgroundColor: C.CARD, borderRadius: 12,
                borderWidth: 1, borderColor: C.BORDER, paddingLeft: 12 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: C.TEXT },

  // ── Date range ─────────────────────────────────────────────────────────────
  dateRangeBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
                  marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 12,
                  borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: 14, height: 44 },
  dateRangeIcon: { fontSize: 14, marginRight: 8 },
  dateRangeBtnText: { flex: 1, fontSize: 14, color: '#3B3850' },
  dateRangeValue: { fontSize: 13, fontWeight: '600', color: C.PRIMARY, marginLeft: 4 },
  dateRangeChevron: { fontSize: 12, color: C.TEXT2, marginLeft: 6 },

  // ── Date modal ─────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  dateModal: { backgroundColor: C.CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24,
               paddingTop: 12, paddingHorizontal: 20 },
  dateModalHandle: { width: 40, height: 4, backgroundColor: C.BORDER, borderRadius: 2,
                     alignSelf: 'center', marginBottom: 16 },
  dateModalTitle: { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 14 },
  dateModalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  dateModalRowActive: { },
  dateModalLabel: { fontSize: 14, color: C.TEXT },
  dateModalLabelActive: { color: C.PRIMARY, fontWeight: '700' },
  dateModalDivider: { height: 1, backgroundColor: C.BORDER, marginVertical: 14 },
  dateModalSectionLabel: { fontSize: 12, fontWeight: '700', color: C.TEXT2, letterSpacing: 0.8,
                            textTransform: 'uppercase', marginBottom: 10 },
  dateCustomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  dateCustomField: { flex: 1 },
  dateCustomFieldLabel: { fontSize: 11, color: C.TEXT2, fontWeight: '600', marginBottom: 5 },
  dateCustomInput: { backgroundColor: C.BG, borderRadius: 10, borderWidth: 1,
                     borderColor: C.BORDER, paddingHorizontal: 12, height: 42,
                     fontSize: 14, color: C.TEXT },
  dateCustomInputActive: { borderColor: C.PRIMARY },
  dateCustomSep: { fontSize: 16, color: C.TEXT2, paddingBottom: 10 },
  dateApplyBtn: { backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 12,
                  alignItems: 'center', marginBottom: 8 },
  dateApplyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  dateModalClear: { paddingVertical: 14, alignItems: 'center' },
  dateModalClearText: { fontSize: 14, color: '#EF4444', fontWeight: '600' },

  // ── Status chips ───────────────────────────────────────────────────────────
  chipsScroll: { marginTop: 8, marginBottom: 2 },
  chipsRow:   { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip:       { height: 36, paddingHorizontal: 14, borderRadius: 999,
                backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER,
                alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: C.PRIMARY + '18', borderColor: C.PRIMARY },
  chipText:   { fontSize: 13, color: C.TEXT, fontWeight: '600' },
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
  hintRow:    { backgroundColor: '#FDF1DE', paddingHorizontal: 14, paddingVertical: 9,
                borderTopWidth: 1, borderTopColor: '#F3D9A8' },
  hintText:   { fontSize: 11, color: '#A14B05', lineHeight: 16 },

  // ── Status pill ────────────────────────────────────────────────────────────
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // ── Recurring — summary banner ─────────────────────────────────────────────
  recurSummary: { backgroundColor: C.CARD, borderRadius: 16, padding: 18, marginBottom: 16,
                  borderWidth: 1, borderColor: C.BORDER },
  recurSummaryLabel: { fontSize: 13, color: C.TEXT2, fontWeight: '500', marginBottom: 4 },
  recurSummaryAmount: { fontSize: 32, fontWeight: '800', color: C.TEXT, letterSpacing: -0.5,
                        marginBottom: 4 },
  recurSummaryMeta: { fontSize: 13, color: C.TEXT2 },

  // ── Recurring — plan cards ─────────────────────────────────────────────────
  recurCard:  { backgroundColor: C.CARD, borderRadius: 16, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: C.BORDER },
  recurAvatar: { width: 40, height: 40, borderRadius: 10,
                 alignItems: 'center', justifyContent: 'center' },
  recurCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  recurCardOrg:  { fontSize: 15, fontWeight: '700', color: C.TEXT },
  recurCardCampaign: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  recurInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  recurInfoCol: { flex: 1 },
  recurCardLabel: { fontSize: 11, color: C.TEXT2, fontWeight: '500', marginBottom: 3 },
  recurCardValue: { fontSize: 14, fontWeight: '700', color: C.TEXT },
  recurPayMethod: { fontSize: 12, color: C.TEXT2, marginBottom: 3 },
  recurSetupNote: { fontSize: 11, color: C.TEXT2 },
  recurDivider:  { height: 1, backgroundColor: C.BORDER, marginVertical: 12 },
  recurCardActions: { flexDirection: 'row', gap: 10 },
  recurActionBtn: { flex: 1, backgroundColor: C.CARD, borderRadius: 10, paddingVertical: 10,
                    alignItems: 'center', borderWidth: 1, borderColor: C.BORDER },
  recurActionBtnText: { fontSize: 13, fontWeight: '700', color: C.TEXT },
  recurEditBtn:  { flex: 1, backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 10,
                   alignItems: 'center' },
  recurEditBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  cancelledTag: { fontSize: 12, color: C.TEXT2, fontStyle: 'italic', paddingTop: 4, textAlign: 'center' },

  // ── Recurring — floating CTA ───────────────────────────────────────────────
  recurCtaBar: { position: 'absolute', bottom: 0, left: 0, right: 0,
                 backgroundColor: C.BG, borderTopWidth: 1, borderTopColor: C.BORDER,
                 paddingHorizontal: 16, paddingVertical: 12 },
  recurCtaBtn: { backgroundColor: C.CARD, borderRadius: 12, paddingVertical: 14,
                 alignItems: 'center', borderWidth: 1.5, borderColor: C.PRIMARY },
  recurCtaBtnText: { fontSize: 14, fontWeight: '700', color: C.PRIMARY },

  // ── Edit Recurring Plan Modal ──────────────────────────────────────────────
  editRecurSheet: { backgroundColor: C.CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    paddingTop: 12 },
  editRecurHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
                     backgroundColor: '#D1D5DB', marginBottom: 16 },
  editRecurHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20,
                     paddingHorizontal: 20 },
  editRecurTitle:  { fontSize: 18, fontWeight: '700', color: C.TEXT },
  editRecurSub:    { fontSize: 13, color: C.TEXT2, marginTop: 2 },
  editRecurClose:  { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6',
                     alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  editRecurCloseText: { fontSize: 14, color: C.TEXT2, fontWeight: '600' },

  editRecurSectionLabel: { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 10 },
  editRecurChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  editRecurChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10,
                   borderWidth: 1.5, borderColor: C.BORDER, backgroundColor: C.CARD },
  editRecurChipActive: { borderColor: C.PRIMARY, backgroundColor: C.PRIMARY + '12' },
  editRecurChipText: { fontSize: 14, fontWeight: '600', color: C.TEXT },
  editRecurChipTextActive: { color: C.PRIMARY },

  editRecurAmtInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1,
                       borderColor: C.BORDER, borderRadius: 10, paddingHorizontal: 12,
                       height: 48, marginBottom: 18 },
  editRecurRupee:  { fontSize: 16, fontWeight: '600', color: C.TEXT, marginRight: 6 },
  editRecurAmtText: { flex: 1, fontSize: 16, fontWeight: '600', color: C.TEXT },

  editRecurSummary: { backgroundColor: '#F5F3FF', borderRadius: 10, paddingHorizontal: 14,
                      paddingVertical: 10, marginBottom: 18 },
  editRecurSummaryText: { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },

  editRecurBtns: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  editRecurCancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5,
                        borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  editRecurCancelBtnText: { fontSize: 15, fontWeight: '600', color: C.TEXT },
  editRecurSaveBtn: { flex: 2, height: 48, borderRadius: 12, backgroundColor: C.PRIMARY,
                      alignItems: 'center', justifyContent: 'center' },
  editRecurSaveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  editRecurCancelPlan: { fontSize: 14, fontWeight: '600', color: '#B3261E', paddingVertical: 4 },

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

  // ── Setup Recurring Modal ──────────────────────────────────────────────────
  setupCloseBtn: {
    padding: 6, borderRadius: 20, backgroundColor: C.BORDER + '60',
  },
  setupSectionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  setupOrgCard: {
    width: 110, paddingVertical: 14, paddingHorizontal: 10,
    borderRadius: 14, borderWidth: 1.5, borderColor: C.BORDER, backgroundColor: C.CARD,
  },
  setupOrgCardActive: {
    borderColor: C.PRIMARY, backgroundColor: C.PRIMARY + '0D',
  },
  setupOrgAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  setupOrgCardName: {
    fontSize: 12, fontWeight: '700', color: C.TEXT, lineHeight: 16, marginBottom: 2,
  },
  setupOrgCardCampaign: {
    fontSize: 11, color: C.TEXT2, lineHeight: 14, marginBottom: 4,
  },
  setupOrgCardLastGave: {
    fontSize: 10, color: C.PRIMARY, fontWeight: '600', lineHeight: 13,
  },
  setupBrowseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.BORDER,
    backgroundColor: C.CARD, marginBottom: 6,
  },
  setupBrowseExpanded: {
    borderRadius: 12, borderWidth: 1.5, borderColor: C.PRIMARY + '60',
    backgroundColor: C.CARD, marginBottom: 6, overflow: 'hidden',
  },
  setupBrowseInputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  setupBrowseResult: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.BORDER,
  },
  setupBrowseResultActive: {
    backgroundColor: C.PRIMARY + '0D',
  },
  setupBrowseAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  setupBrowseOrgName: {
    fontSize: 13, fontWeight: '600', color: C.TEXT,
  },
  // ── Selected-org rich card ─────────────────────────────────────────────────
  setupSelectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 12, padding: 14, borderRadius: 14,
    backgroundColor: C.PRIMARY + '0D',
    borderWidth: 1.5, borderColor: C.PRIMARY + '33',
  },
  setupSelectedAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  setupSelectedAvatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  setupSelectedOrgName:    { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  setupSelectedCampaign:   { fontSize: 12, color: C.TEXT2, marginBottom: 2 },
  setupSelectedLastGave:   { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },
  setupSelectedChangeBtn:  {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5, borderColor: C.PRIMARY,
    backgroundColor: '#fff', flexShrink: 0,
  },
  setupSelectedChangeBtnText: { fontSize: 12, fontWeight: '700', color: C.PRIMARY },
  setupSearchRow: {                // legacy — kept for safety, unused now
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1.5, borderColor: C.BORDER,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: C.CARD, marginBottom: 4,
  },
  setupOrgName: { fontSize: 11, color: C.TEXT, textAlign: 'center', lineHeight: 14 }, // legacy

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyWrap:  { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyText:  { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },
});
