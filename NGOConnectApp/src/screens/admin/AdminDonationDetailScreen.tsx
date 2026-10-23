/**
 * AdminDonationDetailScreen — Donation details (admin view)
 * Route params: { donationRef: string; orgId?: number }
 *
 * Shows: campaign header, donor info + PAN, 80G receipt status,
 *        Payment & settlement (Gross, Gateway 2%, GST 18%, Net to NGO),
 *        Refund section (if refunded).
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

interface RouteParams { donationRef: string; orgId?: number }

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534', label: 'Completed'  },
  INITIATED: { bg: '#FEF9C3', text: '#854D0E', label: 'Initiated'  },
  PENDING:   { bg: '#FEF9C3', text: '#854D0E', label: 'Pending'    },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B', label: 'Failed'     },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Refunded'   },
  CANCELLED: { bg: '#F3F4F6', text: '#374151', label: 'Cancelled'  },
};

export default function AdminDonationDetailScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { donationRef, orgId } = (route.params ?? {}) as RouteParams;

  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await donationApi.getDonationDetailAdmin(donationRef);
        if (res.data?.isSuccess === 1) setData(res.data.data);
        else setError(res.data?.message ?? 'Could not load donation');
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Something went wrong');
      } finally { setLoading(false); }
    })();
  }, [donationRef]);

  if (loading) return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donation Details" />
      <ActivityIndicator color={C.PRIMARY} size="large" style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  if (error || !data) return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donation Details" />
      <View style={s.errorWrap}><Text style={s.errorIcon}>⚠️</Text><Text style={s.errorText}>{error || 'Not found'}</Text></View>
    </SafeAreaView>
  );

  const gross       = Number(data.donationAmount ?? 0);
  const gatewayFee  = gross * 0.02;
  const gstOnFee    = gatewayFee * 0.18;
  const netToNgo    = gross - gatewayFee - gstOnFee;
  const statusCode: string = data.payStatus ?? 'INITIATED';
  const badge = STATUS_BADGE[statusCode] ?? { bg: '#F3F4F6', text: '#374151', label: statusCode };
  const isRefunded = statusCode === 'REFUNDED';

  return (
    <SafeAreaView style={s.container}>
      <Header onBack={() => nav.goBack()} title="Donation Details" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Campaign header */}
        <View style={s.campaignBanner}>
          <View style={s.orgLogoCircle}>
            <Text style={s.orgLogoText}>{(data.orgName ?? 'N')[0]}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.bannerOrgName}>{data.orgName}</Text>
            <Text style={s.bannerCampaign} numberOfLines={2}>{data.campaignName}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: badge.bg }]}>
            <Text style={[s.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        {/* Amount */}
        <View style={s.amountCard}>
          <Text style={s.amountValue}>₹{gross.toLocaleString('en-IN')}</Text>
          <Text style={s.amountDonId}>{data.donationId}</Text>
          <Text style={s.amountDate}>{fmtDateTime(data.createdAt)}</Text>
        </View>

        {/* Donor info */}
        <SectionTitle title="Donor" />
        <View style={s.detailCard}>
          <DetailRow label="Name"         value={data.donorName ?? '—'} />
          {data.donorEmail  && <DetailRow label="Email"  value={data.donorEmail} />}
          {data.donorMobile && <DetailRow label="Mobile" value={data.donorMobile} />}
          {data.donorPan    && <DetailRow label="PAN"    value={data.donorPan} mono />}
          {data.isMember === 1 && <DetailRow label="Member" value="Yes — registered member" />}
          {data.isRecurring === 1 && <DetailRow label="Recurring donor" value="Yes" />}
        </View>

        {/* 80G Receipt */}
        <SectionTitle title="80G Tax Receipt" />
        <View style={s.detailCard}>
          {data.receiptNumber
            ? <>
                <DetailRow label="Receipt number" value={data.receiptNumber} mono />
                {data.fiscalYear && <DetailRow label="FY" value={data.fiscalYear} />}
                {data.receiptPdfUrl
                  ? <TouchableOpacity style={s.downloadBtn}>
                      <Text style={s.downloadBtnText}>📥 Download Receipt</Text>
                    </TouchableOpacity>
                  : <Text style={s.receiptPendingText}>Receipt being generated…</Text>
                }
              </>
            : <Text style={s.receiptPendingText}>
                {statusCode === 'SUCCESS'
                  ? 'Receipt will be auto-generated within 24 hours'
                  : 'No receipt issued — payment not completed'}
              </Text>
          }
        </View>

        {/* Payment + Settlement */}
        <SectionTitle title="Payment & Settlement" />
        <View style={s.detailCard}>
          <DetailRow label="Payment method"  value={data.payMethod ?? '—'} />
          {data.gatewayPaymentId && <DetailRow label="Payment ID" value={data.gatewayPaymentId} mono />}
          {data.gatewayOrderId   && <DetailRow label="Order ID"   value={data.gatewayOrderId}   mono />}
          <View style={s.divider} />
          <DetailRow label="Gross donation"      value={`₹${gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />
          <DetailRow label="Gateway fee (2%)"    value={`-₹${gatewayFee.toFixed(2)}`} />
          <DetailRow label="GST on fee (18%)"    value={`-₹${gstOnFee.toFixed(2)}`} />
          <View style={s.netRow}>
            <Text style={s.netLabel}>Net to NGO</Text>
            <Text style={s.netValue}>₹{netToNgo.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={s.settlementNote}>
            <Text style={s.settlementNoteText}>⏰ Settlement via Razorpay T+2 business days</Text>
          </View>
        </View>

        {/* Refund section */}
        {isRefunded && (
          <>
            <SectionTitle title="Refund" />
            <View style={[s.detailCard, s.refundCard]}>
              <Text style={s.refundText}>This donation was refunded.</Text>
              {data.refundedAt && <DetailRow label="Refund date" value={fmtDate(data.refundedAt)} />}
              <TouchableOpacity style={s.refundNoteBtn}>
                <Text style={s.refundNoteBtnText}>📄 Download refund note</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* View donor button */}
        {orgId != null && data.donorUserId && (
          <TouchableOpacity style={s.viewDonorBtn}
            onPress={() => nav.navigate('AdminDonorDetail', { orgId, donorUserId: data.donorUserId })}>
            <Text style={s.viewDonorBtnText}>👤 View donor profile</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
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
const fmtDateTime = (iso?: string) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '';
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

  campaignBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.PRIMARY + '12',
                    borderRadius: 14, padding: 16, marginBottom: 14,
                    borderWidth: 1, borderColor: C.PRIMARY + '30' },
  orgLogoCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.PRIMARY + '28',
                   alignItems: 'center', justifyContent: 'center' },
  orgLogoText: { fontSize: 20, fontWeight: '700', color: C.PRIMARY },
  bannerOrgName: { fontSize: 15, fontWeight: '700', color: C.TEXT },
  bannerCampaign: { fontSize: 13, color: C.TEXT2, marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  amountCard: { backgroundColor: C.CARD, borderRadius: 14, padding: 20,
                alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.BORDER },
  amountValue: { fontSize: 32, fontWeight: '800', color: C.TEXT },
  amountDonId: { fontSize: 14, fontWeight: '700', color: C.PRIMARY, marginTop: 8, fontFamily: 'monospace' },
  amountDate:  { fontSize: 12, color: C.TEXT2, marginTop: 4 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.TEXT2, marginBottom: 8,
                  textTransform: 'uppercase', letterSpacing: 0.8 },
  detailCard: { backgroundColor: C.CARD, borderRadius: 14, paddingHorizontal: 16,
                paddingVertical: 4, marginBottom: 16, borderWidth: 1, borderColor: C.BORDER },
  detailRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  detailLabel: { fontSize: 13, color: C.TEXT2 },
  detailValue: { fontSize: 13, color: C.TEXT, textAlign: 'right', maxWidth: '60%' },
  detailMono:  { fontFamily: 'monospace', fontSize: 12 },
  divider:    { height: 1, backgroundColor: C.BORDER, marginVertical: 6 },

  netRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  netLabel: { fontSize: 14, fontWeight: '700', color: C.TEXT },
  netValue: { fontSize: 16, fontWeight: '800', color: '#16A34A' },
  settlementNote: { paddingBottom: 10 },
  settlementNoteText: { fontSize: 12, color: C.TEXT2, fontStyle: 'italic' },

  downloadBtn: { margin: 12, backgroundColor: '#EFF6FF', borderRadius: 10,
                 paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE' },
  downloadBtnText: { fontSize: 14, fontWeight: '700', color: '#1D4ED8' },
  receiptPendingText: { fontSize: 13, color: C.TEXT2, textAlign: 'center', padding: 14 },

  refundCard: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  refundText: { fontSize: 14, color: '#991B1B', paddingVertical: 10, fontWeight: '600' },
  refundNoteBtn: { margin: 10, backgroundColor: '#FFF1F2', borderRadius: 10,
                   paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FECDD3' },
  refundNoteBtnText: { fontSize: 13, fontWeight: '700', color: '#BE123C' },

  viewDonorBtn: { backgroundColor: C.PRIMARY + '14', borderRadius: 12, paddingVertical: 14,
                  alignItems: 'center', borderWidth: 1, borderColor: C.PRIMARY + '30' },
  viewDonorBtnText: { fontSize: 15, fontWeight: '700', color: C.PRIMARY },
});
