/**
 * AdminDonorDetailScreen — Donor Summary (admin view)
 * Route params: { orgId: number; donorUserId: number }
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { donationApi } from '../../api/donation.api';

const C = AppConfig.COLORS;

export default function AdminDonorDetailScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { orgId, donorUserId } = (route.params ?? {}) as { orgId: number; donorUserId: number };

  const [profile, setProfile] = useState<any>(null);
  const [gifts, setGifts]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await donationApi.getDonorDetail(orgId, donorUserId);
        if (res.data?.isSuccess === 1) {
          const arr = res.data.data ?? [];
          setProfile(arr[0] ?? null);
          setGifts(arr[1] ?? []);
        } else {
          setError(res.data?.message ?? 'Could not load donor detail');
        }
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Something went wrong');
      } finally { setLoading(false); }
    })();
  }, [orgId, donorUserId]);

  if (loading) return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donor Summary" />
      <ActivityIndicator color={C.PRIMARY} size="large" style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  if (error || !profile) return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donor Summary" />
      <View style={s.errorWrap}><Text style={s.errorIcon}>⚠️</Text><Text style={s.errorText}>{error}</Text></View>
    </SafeAreaView>
  );

  const periodTotal = Number(profile.periodTotal ?? 0);
  const allTimeTotal = Number(profile.allTimeTotal ?? 0);

  return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donor Summary" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Donor profile card */}
        <View style={s.profileCard}>
          <View style={s.profileInitialCircle}>
            <Text style={s.profileInitialText}>{(profile.donorName ?? 'A')[0]}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.profileName}>{profile.donorName}</Text>
            {profile.donorEmail   && <Text style={s.profileMeta}>{profile.donorEmail}</Text>}
            {profile.donorMobile  && <Text style={s.profileMeta}>{profile.donorMobile}</Text>}
          </View>
          {profile.isMember === 1 && (
            <View style={s.memberBadge}><Text style={s.memberBadgeText}>Member</Text></View>
          )}
        </View>

        {/* Period stats card */}
        <View style={s.statsRow}>
          <View style={[s.statBox, { backgroundColor: C.PRIMARY }]}>
            <Text style={s.statBoxLabel}>Total given</Text>
            <Text style={s.statBoxValue}>₹{allTimeTotal.toLocaleString('en-IN')}</Text>
          </View>
          <View style={[s.statBox, { backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER }]}>
            <Text style={[s.statBoxLabel, { color: C.TEXT2 }]}>Gifts</Text>
            <Text style={[s.statBoxValue, { color: C.TEXT }]}>{profile.totalGiftCount ?? 0}</Text>
          </View>
          <View style={[s.statBox, { backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER }]}>
            <Text style={[s.statBoxLabel, { color: C.TEXT2 }]}>Avg gift</Text>
            <Text style={[s.statBoxValue, { color: C.TEXT }]}>
              ₹{profile.totalGiftCount > 0 ? Math.round(allTimeTotal / profile.totalGiftCount).toLocaleString('en-IN') : '—'}
            </Text>
          </View>
        </View>

        {/* Details section */}
        <SectionTitle title="Details" />
        <View style={s.detailCard}>
          {profile.isMember === 1 && (
            <DetailRow label="Membership" value="Active member" />
          )}
          {profile.hasRecurring === 1 && (
            <DetailRow label="Recurring" value="Has active recurring donation" />
          )}
          {profile.mostSupportedCampaign && (
            <DetailRow label="Most supported" value={profile.mostSupportedCampaign} />
          )}
          {profile.donorPan && (
            <DetailRow label="PAN" value={profile.donorPan} mono />
          )}
          {profile.firstGiftAt && (
            <DetailRow label="First donation" value={fmtDate(profile.firstGiftAt)} />
          )}
          {profile.lastGiftAt && (
            <DetailRow label="Last donation" value={fmtDate(profile.lastGiftAt)} />
          )}
        </View>

        {/* Gift history */}
        {gifts.length > 0 && (
          <>
            <SectionTitle title="Gift History" />
            {gifts.map((g: any, i: number) => (
              <TouchableOpacity key={g.donationId ?? i} style={s.giftCard}
                onPress={() => nav.navigate('AdminDonationDetail', { donationRef: g.donationId, orgId })}>
                <View style={{ flex: 1 }}>
                  <Text style={s.giftCampaign} numberOfLines={1}>{g.campaignName}</Text>
                  <Text style={s.giftDate}>{fmtDate(g.createdAt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.giftAmount}>₹{Number(g.donationAmount).toLocaleString('en-IN')}</Text>
                  <StatusPill code={g.payStatus} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Thank-you CTA */}
        <TouchableOpacity style={s.thankYouBtn}>
          <Text style={s.thankYouBtnText}>💌 Send a thank-you note</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Header = ({ onBack, title }: { onBack: () => void; title: string }) => (
  <View style={s.header}>
    <TouchableOpacity onPress={onBack} style={s.backBtn}><Text style={s.backIcon}>←</Text></TouchableOpacity>
    <Text style={s.headerTitle}>{title}</Text>
    <View style={{ width: 36 }} />
  </View>
);
const SectionTitle = ({ title }: { title: string }) => (
  <Text style={s.sectionTitle}>{title}</Text>
);
const DetailRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <View style={s.detailRow}>
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={[s.detailValue, mono && s.detailMono]}>{value}</Text>
  </View>
);
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534' },
  INITIATED: { bg: '#FEF9C3', text: '#854D0E' },
  PENDING:   { bg: '#FEF9C3', text: '#854D0E' },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B' },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8' },
};
const StatusPill = ({ code }: { code?: string }) => {
  const c = STATUS_COLORS[code ?? ''] ?? { bg: '#F3F4F6', text: '#374151' };
  return (
    <View style={[s.statusPill, { backgroundColor: c.bg }]}>
      <Text style={[s.statusPillText, { color: c.text }]}>{code ?? '—'}</Text>
    </View>
  );
};
const fmtDate = (iso?: string) => iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '';

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
               paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon:  { fontSize: 22, color: C.TEXT },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.TEXT },
  errorWrap: { alignItems: 'center', marginTop: 60 },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorText: { fontSize: 15, color: C.TEXT2 },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD,
                 borderRadius: 14, padding: 16, marginBottom: 14,
                 borderWidth: 1, borderColor: C.BORDER },
  profileInitialCircle: { width: 56, height: 56, borderRadius: 28,
                          backgroundColor: C.PRIMARY + '20', alignItems: 'center', justifyContent: 'center' },
  profileInitialText: { fontSize: 24, fontWeight: '700', color: C.PRIMARY },
  profileName: { fontSize: 16, fontWeight: '700', color: C.TEXT },
  profileMeta: { fontSize: 12, color: C.TEXT2, marginTop: 3 },
  memberBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4,
                 borderRadius: 7, alignSelf: 'flex-start' },
  memberBadgeText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },

  statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox:   { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  statBoxLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  statBoxValue: { fontSize: 18, fontWeight: '800', color: '#fff' },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.TEXT2, marginBottom: 8,
                  textTransform: 'uppercase', letterSpacing: 0.8 },
  detailCard: { backgroundColor: C.CARD, borderRadius: 14, paddingHorizontal: 16,
                paddingVertical: 4, marginBottom: 16, borderWidth: 1, borderColor: C.BORDER },
  detailRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  detailLabel: { fontSize: 13, color: C.TEXT2 },
  detailValue: { fontSize: 13, color: C.TEXT, textAlign: 'right', maxWidth: '60%' },
  detailMono:  { fontFamily: 'monospace', fontSize: 12 },

  giftCard:  { flexDirection: 'row', backgroundColor: C.CARD, borderRadius: 12,
               padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.BORDER },
  giftCampaign: { fontSize: 14, fontWeight: '600', color: C.TEXT },
  giftDate:  { fontSize: 11, color: C.TEXT2, marginTop: 3 },
  giftAmount: { fontSize: 15, fontWeight: '700', color: C.PRIMARY, marginBottom: 4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  thankYouBtn: { backgroundColor: '#FFF7ED', borderRadius: 12, paddingVertical: 14,
                 alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: '#FED7AA' },
  thankYouBtnText: { fontSize: 15, fontWeight: '700', color: '#C2410C' },
});
