/**
 * DonorNgoGivingSummaryScreen
 * Shown when a donor taps an NGO card in the MyDonations NGOs tab.
 * Shows: NGO card, stat summary, funds breakdown, impact updates,
 *        all donations list, recurring plan, sticky "Donate again" button.
 *
 * Route params: { orgId: number, orgName?: string }
 * Design ref: images 106, 107
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { donationApi } from '../../api/donation.api';

const C = AppConfig.COLORS;

const AVATAR_COLORS = ['#6C47FF', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const avatarBg = (id: number) => AVATAR_COLORS[(id ?? 0) % AVATAR_COLORS.length];
const initials = (name: string) =>
  (name ?? 'N').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534', label: 'Successful' },
  INITIATED: { bg: '#FFF7ED', text: '#C2410C', label: 'Processing' },
  PENDING:   { bg: '#FFF7ED', text: '#C2410C', label: 'Processing' },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B', label: 'Failed'     },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Refunded'   },
};

interface RouteParams { orgId: number; orgName?: string }

export default function DonorNgoGivingSummaryScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { orgId, orgName: paramOrgName } = (route.params ?? {}) as RouteParams;

  const [history,   setHistory]   = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [histRes, recRes] = await Promise.allSettled([
          donationApi.getHistory({ pageNumber: 1, pageSize: 100 }),
          donationApi.getRecurring(),
        ]);
        if (histRes.status === 'fulfilled' && histRes.value.data?.isSuccess === 1) {
          const all: any[] = histRes.value.data.data?.items ?? [];
          setHistory(all.filter(d => d.orgId === orgId));
        }
        if (recRes.status === 'fulfilled' && recRes.value.data?.isSuccess === 1) {
          const all: any[] = recRes.value.data.data ?? [];
          setRecurring(all.filter(d => d.orgId === orgId));
        }
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [orgId]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const successDons  = history.filter(d => d.payStatus === 'SUCCESS');
  const totalGiven   = successDons.reduce((a, d) => a + Number(d.donationAmount), 0);
  const avgGift      = successDons.length ? Math.round(totalGiven / successDons.length) : 0;
  const estimated80G = Math.round(totalGiven * 0.5); // 50% deduction estimate
  const firstDate    = successDons.length ? successDons[successDons.length - 1]?.createdAt : null;
  const latestDate   = successDons.length ? successDons[0]?.createdAt : null;

  // Funds breakdown (group by campaign name)
  const fundsMap = new Map<string, number>();
  successDons.forEach(d => {
    const key = d.campaignName ?? 'General Donation';
    fundsMap.set(key, (fundsMap.get(key) ?? 0) + Number(d.donationAmount));
  });
  const fundsArr = Array.from(fundsMap.entries()).sort((a, b) => b[1] - a[1]);
  const maxFund  = fundsArr[0]?.[1] ?? 1;

  // Impact quotes (mock — in production these come from a separate API)
  const impactQuotes = [
    { text: 'Your donation made a real difference to the community.', date: fmtDate(latestDate) },
  ];

  const orgName = history[0]?.orgName ?? paramOrgName ?? 'This NGO';
  const color   = avatarBg(orgId);

  const handleShare = async () => {
    await Share.share({
      message: `I've given ₹${totalGiven.toLocaleString('en-IN')} to ${orgName} on NGO Connect. Join me! 💚`,
    });
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.headerBtn}>
          <Text style={s.headerBack}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Giving summary</Text>
        <TouchableOpacity onPress={handleShare} style={s.headerBtn}>
          <Text style={s.headerDownload}>↓</Text>
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator color={C.PRIMARY} size="large" style={{ marginTop: 60 }} />
        : (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

            {/* ── NGO card ──────────────────────────────────────────────── */}
            <View style={s.ngoCard}>
              <View style={s.ngoCardTop}>
                <View style={[s.ngoAvatar, { backgroundColor: color }]}>
                  <Text style={s.ngoAvatarText}>{initials(orgName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.ngoNameRow}>
                    <Text style={s.ngoName}>{orgName}</Text>
                    <Text style={s.ngoVerified}>✓</Text>
                  </View>
                  <Text style={s.ngoMeta}>Education · Mumbai · Since 2009</Text>
                </View>
              </View>
              <Text style={s.ngoDesc} numberOfLines={2}>
                Runs evening schools and community programmes for underserved children.
              </Text>
              <TouchableOpacity style={s.viewProfileBtn}
                onPress={() => nav.navigate('NgoProfile', { orgId })}>
                <Text style={s.viewProfileBtnText}>View NGO profile</Text>
              </TouchableOpacity>
            </View>

            {/* ── You've given card ─────────────────────────────────────── */}
            <View style={s.givenCard}>
              <Text style={s.givenLabel}>You've given</Text>
              <Text style={s.givenAmount}>₹{totalGiven.toLocaleString('en-IN')}</Text>
              {totalGiven > 0 && (
                <Text style={s.givenPct}>
                  {Math.round((totalGiven / Math.max(totalGiven, 1)) * 100)}% of your giving
                </Text>
              )}
              <View style={s.givenStatRow}>
                <View style={s.givenStat}>
                  <Text style={s.givenStatVal}>{successDons.length}</Text>
                  <Text style={s.givenStatLbl}>Donations</Text>
                </View>
                <View style={s.givenStatDivider} />
                <View style={s.givenStat}>
                  <Text style={s.givenStatVal}>₹{avgGift.toLocaleString('en-IN')}</Text>
                  <Text style={s.givenStatLbl}>Average gift</Text>
                </View>
                <View style={s.givenStatDivider} />
                <View style={s.givenStat}>
                  <Text style={s.givenStatVal}>₹{estimated80G.toLocaleString('en-IN')}</Text>
                  <Text style={s.givenStatLbl}>80G (est.)</Text>
                </View>
              </View>
              {firstDate && latestDate && (
                <Text style={s.givenDates}>
                  First gift · {fmtDate(firstDate)}{'   '}Latest · {fmtDate(latestDate)}
                </Text>
              )}
            </View>

            {/* ── Funds supported ───────────────────────────────────────── */}
            {fundsArr.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Funds you supported</Text>
                <View style={s.fundsCard}>
                  {fundsArr.map(([name, amt]) => (
                    <View key={name} style={s.fundRow}>
                      <View style={s.fundLabelRow}>
                        <Text style={s.fundName}>{name}</Text>
                        <Text style={s.fundAmt}>₹{amt.toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={s.fundBarBg}>
                        <View style={[s.fundBarFill, { width: `${Math.round((amt / maxFund) * 100)}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Impact updates ────────────────────────────────────────── */}
            {impactQuotes.length > 0 && successDons.length > 0 && (
              <>
                <Text style={s.sectionTitle}>💛 Impact updates</Text>
                {impactQuotes.map((q, i) => (
                  <View key={i} style={s.quoteCard}>
                    <Text style={s.quoteText}>"{q.text}"</Text>
                    <Text style={s.quoteMeta}>{orgName} · {q.date}</Text>
                  </View>
                ))}
              </>
            )}

            {/* ── Recurring plan ────────────────────────────────────────── */}
            {recurring.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Recurring plan</Text>
                {recurring.map(r => (
                  <View key={r.recurringDonId} style={s.recurCard}>
                    <View style={s.recurCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.recurAmt}>
                          ₹{Number(r.amount).toLocaleString('en-IN')} / {r.frequencyLabel ?? r.frequencyCode?.toLowerCase()}
                        </Text>
                        <Text style={s.recurMeta}>
                          {r.campaignName ?? 'General Donation'}
                          {r.nextChargeDate ? ` · next ${fmtDate(r.nextChargeDate)}` : ' — None'}
                        </Text>
                      </View>
                      <View style={[s.recurStatus, {
                        backgroundColor: r.statusCode === 'ACTIVE' ? '#DCFCE7' : '#FFF7ED',
                      }]}>
                        <Text style={[s.recurStatusText, {
                          color: r.statusCode === 'ACTIVE' ? '#166534' : '#C2410C',
                        }]}>{r.statusCode === 'ACTIVE' ? 'Active' : 'Paused'}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* ── All donations ─────────────────────────────────────────── */}
            {history.length > 0 && (
              <>
                <Text style={s.sectionTitle}>ALL DONATIONS · {history.length}</Text>
                {history.map(d => {
                  const meta = STATUS_META[d.payStatus] ?? { bg: '#F3F4F6', text: '#374151', label: d.payStatus };
                  return (
                    <TouchableOpacity
                      key={d.donationId}
                      style={s.donRow}
                      onPress={() => nav.navigate('DonationDetail', { donationRef: d.donationId })}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.donName}>{d.campaignName ?? 'General Donation'}</Text>
                        <Text style={s.donMeta}>
                          {fmtDate(d.createdAt)}
                          {d.payMethod ? ` · ${d.payMethod}` : ''}
                          {d.donationId ? ` · ${d.donationId}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={s.donAmt}>₹{Number(d.donationAmount).toLocaleString('en-IN')}</Text>
                        <View style={[s.donStatus, { backgroundColor: meta.bg }]}>
                          <Text style={[s.donStatusText, { color: meta.text }]}>{meta.label}</Text>
                        </View>
                      </View>
                      <Text style={s.donChevron}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {history.length === 0 && !loading && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyIcon}>💛</Text>
                <Text style={s.emptyText}>No donations to this NGO yet</Text>
              </View>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>
        )
      }

      {/* ── Sticky donate button ─────────────────────────────────────────── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.donateBtn}
          onPress={() => nav.navigate('Donate', { orgId, orgName })}>
          <Text style={s.donateBtnText}>Donate to {orgName}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
                 paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER,
                 backgroundColor: C.CARD },
  headerBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerBack:  { fontSize: 22, color: C.TEXT },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.TEXT },
  headerDownload: { fontSize: 20, color: C.PRIMARY },

  scroll: { padding: 16 },

  // NGO card
  ngoCard:    { backgroundColor: C.CARD, borderRadius: 14, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: C.BORDER },
  ngoCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  ngoAvatar:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ngoAvatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ngoNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ngoName:    { fontSize: 15, fontWeight: '700', color: C.TEXT },
  ngoVerified: { fontSize: 14, color: C.PRIMARY, fontWeight: '700' },
  ngoMeta:    { fontSize: 12, color: C.TEXT2, marginTop: 3 },
  ngoDesc:    { fontSize: 13, color: C.TEXT2, lineHeight: 19, marginBottom: 12 },
  viewProfileBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7,
                    borderRadius: 20, borderWidth: 1, borderColor: C.BORDER },
  viewProfileBtnText: { fontSize: 12, color: C.TEXT, fontWeight: '600' },

  // Given card
  givenCard:  { backgroundColor: C.PRIMARY, borderRadius: 16, padding: 18, marginBottom: 14 },
  givenLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  givenAmount: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 4 },
  givenPct:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 14 },
  givenStatRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)',
                  borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  givenStat:  { flex: 1, alignItems: 'center', paddingVertical: 10 },
  givenStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 8 },
  givenStatVal: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  givenStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.75)' },
  givenDates: { fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.TEXT2, marginBottom: 8,
                  marginTop: 4, letterSpacing: 0.8, textTransform: 'uppercase' },

  // Funds
  fundsCard:  { backgroundColor: C.CARD, borderRadius: 14, padding: 16, marginBottom: 14,
                borderWidth: 1, borderColor: C.BORDER },
  fundRow:    { marginBottom: 14 },
  fundLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  fundName:   { fontSize: 13, color: C.TEXT, fontWeight: '500' },
  fundAmt:    { fontSize: 13, fontWeight: '700', color: C.TEXT },
  fundBarBg:  { height: 5, backgroundColor: C.BORDER, borderRadius: 3, overflow: 'hidden' },
  fundBarFill: { height: 5, backgroundColor: C.PRIMARY, borderRadius: 3 },

  // Impact quotes
  quoteCard:  { backgroundColor: C.CARD, borderRadius: 12, padding: 14, marginBottom: 10,
                borderWidth: 1, borderColor: C.BORDER, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  quoteText:  { fontSize: 13, color: C.TEXT, fontStyle: 'italic', lineHeight: 20, marginBottom: 6 },
  quoteMeta:  { fontSize: 11, color: C.TEXT2 },

  // Recurring
  recurCard:  { backgroundColor: C.CARD, borderRadius: 12, padding: 14, marginBottom: 10,
                borderWidth: 1, borderColor: C.BORDER },
  recurCardHeader: { flexDirection: 'row', alignItems: 'center' },
  recurAmt:   { fontSize: 14, fontWeight: '700', color: C.TEXT },
  recurMeta:  { fontSize: 12, color: C.TEXT2, marginTop: 3 },
  recurStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  recurStatusText: { fontSize: 11, fontWeight: '700' },

  // Donation rows
  donRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD,
               borderRadius: 12, padding: 14, marginBottom: 8,
               borderWidth: 1, borderColor: C.BORDER },
  donName:   { fontSize: 14, fontWeight: '600', color: C.TEXT, marginBottom: 3 },
  donMeta:   { fontSize: 11, color: C.TEXT2 },
  donAmt:    { fontSize: 14, fontWeight: '700', color: C.TEXT },
  donStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  donStatusText: { fontSize: 10, fontWeight: '700' },
  donChevron: { fontSize: 20, color: C.TEXT2, marginLeft: 6 },

  emptyWrap: { alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 14, color: C.TEXT2 },

  footer:    { paddingHorizontal: 16, paddingVertical: 12,
               backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER },
  donateBtn: { backgroundColor: C.PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  donateBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
