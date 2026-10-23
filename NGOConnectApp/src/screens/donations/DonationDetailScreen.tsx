/**
 * DonationDetailScreen — s-my-donations (member view of a single donation)
 * Route params: { donationRef: string }
 * Shows: campaign header, amount + status, DON-YYYY-XXXXXX ref,
 *        Journey timeline, payment details + fee breakdown.
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

interface RouteParams { donationRef: string }

const JOURNEY_STEPS = [
  { code: 'INITIATED', label: 'Donation initiated',   icon: '⚡' },
  { code: 'PENDING',   label: 'Payment processing',   icon: '⏳' },
  { code: 'SUCCESS',   label: 'Received by NGO',       icon: '✅' },
  { code: 'RECEIPT',   label: 'Receipt & 80G ready',   icon: '🧾' },
];

const STATUS_STEP: Record<string, number> = {
  INITIATED: 0,
  PENDING:   1,
  SUCCESS:   3,
  FAILED:    1,
  REFUNDED:  1,
  CANCELLED: 0,
};

export default function DonationDetailScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { donationRef } = (route.params ?? {}) as RouteParams;

  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await donationApi.getDonationDetail(donationRef);
        if (res.data?.isSuccess === 1) setData(res.data.data);
        else setError(res.data?.message ?? 'Could not load donation');
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Something went wrong');
      } finally { setLoading(false); }
    })();
  }, [donationRef]);

  if (loading) return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donation Detail" />
      <ActivityIndicator color={C.PRIMARY} size="large" style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  if (error || !data) return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donation Detail" />
      <View style={s.errorWrap}>
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.errorText}>{error || 'Donation not found'}</Text>
      </View>
    </SafeAreaView>
  );

  const statusCode: string = data.payStatus ?? 'INITIATED';
  const stepReached = STATUS_STEP[statusCode] ?? 0;
  const isFailed    = statusCode === 'FAILED';
  const isRefunded  = statusCode === 'REFUNDED';

  const gatewayFee  = Number(data.donationAmount ?? 0) * 0.02;
  const gstOnFee    = gatewayFee * 0.18;
  const netToNgo    = Number(data.orgReceivesAmt ?? data.donationAmount ?? 0);

  return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donation Detail" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Campaign header banner */}
        <View style={s.campaignBanner}>
          <View style={s.orgLogoCircle}>
            <Text style={s.orgLogoText}>{(data.orgName ?? 'N')[0]}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.bannerOrgName}>{data.orgName}</Text>
            <Text style={s.bannerCampaign} numberOfLines={2}>{data.campaignName}</Text>
          </View>
        </View>

        {/* Amount + status card */}
        <View style={s.amountCard}>
          <Text style={s.amountValue}>₹{Number(data.donationAmount).toLocaleString('en-IN')}</Text>
          <StatusBadge code={statusCode} />
          <Text style={s.donationId}>{data.donationId}</Text>
          <Text style={s.donationDate}>{fmtDateTime(data.createdAt)}</Text>
        </View>

        {/* Journey timeline */}
        <SectionTitle title="Donation Journey" />
        <View style={s.timeline}>
          {JOURNEY_STEPS.map((step, idx) => {
            const reached = isFailed && idx === 1
              ? 'failed'
              : idx <= stepReached ? 'done' : 'pending';
            return (
              <View key={step.code} style={s.timelineRow}>
                <View style={s.timelineLeft}>
                  <View style={[
                    s.timelineDot,
                    reached === 'done'   && s.timelineDotDone,
                    reached === 'failed' && s.timelineDotFailed,
                  ]}>
                    <Text style={s.timelineDotIcon}>{reached === 'failed' ? '✕' : step.icon}</Text>
                  </View>
                  {idx < JOURNEY_STEPS.length - 1 && (
                    <View style={[s.timelineLine, idx < stepReached && s.timelineLineDone]} />
                  )}
                </View>
                <View style={s.timelineContent}>
                  <Text style={[s.timelineLabel, reached !== 'pending' && s.timelineLabelActive]}>
                    {step.label}
                  </Text>
                  {reached === 'done' && idx === 2 && data.createdAt && (
                    <Text style={s.timelineDate}>{fmtDateTime(data.createdAt)}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Payment details */}
        <SectionTitle title="Payment Details" />
        <View style={s.detailCard}>
          <DetailRow label="Payment method"  value={data.payMethod ?? '—'} />
          {data.gatewayPaymentId && <DetailRow label="Payment ID" value={data.gatewayPaymentId} mono />}
          {data.gatewayOrderId   && <DetailRow label="Order ID"   value={data.gatewayOrderId}   mono />}
          <DetailRow label="Donation type"   value={data.donationType ?? 'One-time'} />
          {data.donorPan && <DetailRow label="PAN" value={data.donorPan} mono />}
        </View>

        {/* Amount breakdown */}
        <SectionTitle title="Amount Breakdown" />
        <View style={s.detailCard}>
          <DetailRow label="Gross donation"  value={`₹${Number(data.donationAmount).toLocaleString('en-IN')}`} />
          <DetailRow label="Platform fee"    value="₹0" sub="(Zero platform fee)" />
          <DetailRow label="Gateway fee (2%)" value={`₹${gatewayFee.toFixed(2)}`} />
          <DetailRow label="GST on fee (18%)" value={`₹${gstOnFee.toFixed(2)}`} />
          <View style={s.netRow}>
            <Text style={s.netLabel}>Net to NGO</Text>
            <Text style={s.netValue}>₹{netToNgo.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>

        {/* 80G receipt */}
        {(data.receiptNumber || statusCode === 'SUCCESS') && (
          <>
            <SectionTitle title="80G Tax Receipt" />
            <View style={s.detailCard}>
              {data.receiptNumber
                ? <>
                    <DetailRow label="Receipt number" value={data.receiptNumber} mono />
                    {data.fiscalYear && <DetailRow label="FY" value={data.fiscalYear} />}
                    {data.receiptPdfUrl
                      ? <TouchableOpacity style={s.downloadReceiptBtn}>
                          <Text style={s.downloadReceiptBtnText}>📥 Download 80G Receipt</Text>
                        </TouchableOpacity>
                      : <Text style={s.receiptPendingText}>Receipt will be generated within 24 hours</Text>
                    }
                  </>
                : <Text style={s.receiptPendingText}>Your 80G receipt will be available once processed</Text>
              }
            </View>
          </>
        )}

        {/* Refund note */}
        {isRefunded && (
          <>
            <SectionTitle title="Refund" />
            <View style={[s.detailCard, s.refundCard]}>
              <Text style={s.refundText}>This donation was refunded.</Text>
              {data.refundedAt && <Text style={s.refundDate}>Refunded on {fmtDate(data.refundedAt)}</Text>}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const Header = ({ onBack, title }: { onBack: () => void; title: string }) => (
  <View style={s.header}>
    <TouchableOpacity onPress={onBack} style={s.backBtn}>
      <Text style={s.backIcon}>←</Text>
    </TouchableOpacity>
    <Text style={s.headerTitle}>{title}</Text>
    <View style={{ width: 36 }} />
  </View>
);

const SectionTitle = ({ title }: { title: string }) => (
  <Text style={s.sectionTitle}>{title}</Text>
);

const DetailRow = ({ label, value, mono, sub }:
  { label: string; value: string; mono?: boolean; sub?: string }) => (
  <View style={s.detailRow}>
    <Text style={s.detailLabel}>{label}</Text>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={[s.detailValue, mono && s.detailValueMono]}>{value}</Text>
      {sub && <Text style={s.detailSub}>{sub}</Text>}
    </View>
  </View>
);

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534', label: 'Completed'  },
  INITIATED: { bg: '#FEF9C3', text: '#854D0E', label: 'Initiated'  },
  PENDING:   { bg: '#FEF9C3', text: '#854D0E', label: 'Pending'    },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B', label: 'Failed'     },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Refunded'   },
  CANCELLED: { bg: '#F3F4F6', text: '#374151', label: 'Cancelled'  },
};
const StatusBadge = ({ code }: { code: string }) => {
  const c = STATUS_BADGE[code] ?? { bg: '#F3F4F6', text: '#374151', label: code };
  return (
    <View style={[s.statusBadge, { backgroundColor: c.bg }]}>
      <Text style={[s.statusBadgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
};

function fmtDateTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

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

  campaignBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.PRIMARY + '12',
                    borderRadius: 14, padding: 16, marginBottom: 14,
                    borderWidth: 1, borderColor: C.PRIMARY + '30' },
  orgLogoCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.PRIMARY + '28',
                   alignItems: 'center', justifyContent: 'center' },
  orgLogoText: { fontSize: 20, fontWeight: '700', color: C.PRIMARY },
  bannerOrgName: { fontSize: 15, fontWeight: '700', color: C.TEXT },
  bannerCampaign: { fontSize: 13, color: C.TEXT2, marginTop: 3 },

  amountCard: { backgroundColor: C.CARD, borderRadius: 14, padding: 20, marginBottom: 16,
                alignItems: 'center', borderWidth: 1, borderColor: C.BORDER },
  amountValue: { fontSize: 32, fontWeight: '800', color: C.TEXT, marginBottom: 10 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 12 },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },
  donationId: { fontSize: 14, fontWeight: '700', color: C.PRIMARY, fontFamily: 'monospace' },
  donationDate: { fontSize: 12, color: C.TEXT2, marginTop: 4 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.TEXT2, marginBottom: 8, marginTop: 4,
                  textTransform: 'uppercase', letterSpacing: 0.8 },

  // Timeline
  timeline:  { marginBottom: 20 },
  timelineRow: { flexDirection: 'row' },
  timelineLeft: { width: 40, alignItems: 'center' },
  timelineDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.BORDER,
                 alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  timelineDotDone:   { backgroundColor: '#16A34A' },
  timelineDotFailed: { backgroundColor: '#EF4444' },
  timelineDotIcon:   { fontSize: 15 },
  timelineLine: { flex: 1, width: 2, backgroundColor: C.BORDER, marginVertical: 2 },
  timelineLineDone: { backgroundColor: '#16A34A' },
  timelineContent: { flex: 1, paddingLeft: 10, paddingBottom: 20, justifyContent: 'center' },
  timelineLabel: { fontSize: 14, color: C.TEXT2 },
  timelineLabelActive: { color: C.TEXT, fontWeight: '600' },
  timelineDate: { fontSize: 11, color: C.TEXT2, marginTop: 2 },

  // Detail card
  detailCard: { backgroundColor: C.CARD, borderRadius: 14, paddingHorizontal: 16,
                paddingVertical: 4, marginBottom: 16, borderWidth: 1, borderColor: C.BORDER },
  detailRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  detailLabel: { fontSize: 13, color: C.TEXT2 },
  detailValue: { fontSize: 13, color: C.TEXT, textAlign: 'right', maxWidth: '58%' },
  detailValueMono: { fontFamily: 'monospace', fontSize: 12 },
  detailSub:  { fontSize: 10, color: C.TEXT2, marginTop: 2 },

  netRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  netLabel: { fontSize: 14, fontWeight: '700', color: C.TEXT },
  netValue: { fontSize: 16, fontWeight: '800', color: '#16A34A' },

  downloadReceiptBtn: { margin: 12, backgroundColor: '#EFF6FF', borderRadius: 10,
                        paddingVertical: 11, alignItems: 'center',
                        borderWidth: 1, borderColor: '#BFDBFE' },
  downloadReceiptBtnText: { fontSize: 14, fontWeight: '700', color: '#1D4ED8' },
  receiptPendingText: { fontSize: 13, color: C.TEXT2, textAlign: 'center', padding: 14 },

  refundCard: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  refundText: { fontSize: 14, color: '#991B1B', paddingVertical: 10 },
  refundDate: { fontSize: 12, color: '#B91C1C', paddingBottom: 10 },
});
