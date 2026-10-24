/**
 * DonationDetailScreen — s-my-donations (member view of a single donation)
 * Route params: { donationRef: string }
 * Design ref: images 102, 103, 114
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Clipboard, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { donationApi } from '../../api/donation.api';

const C = AppConfig.COLORS;

// Avatar palette
const AVATAR_COLORS = ['#6C47FF', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const avatarBg = (orgId: number) => AVATAR_COLORS[(orgId ?? 0) % AVATAR_COLORS.length];
const initials = (name: string) =>
  (name ?? 'N').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

// Status config
const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  SUCCESS:   { bg: '#DCFCE7', text: '#166534', label: 'Successful'  },
  INITIATED: { bg: '#FFF7ED', text: '#C2410C', label: 'Processing'  },
  PENDING:   { bg: '#FFF7ED', text: '#C2410C', label: 'Processing'  },
  FAILED:    { bg: '#FEE2E2', text: '#991B1B', label: 'Failed'      },
  REFUNDED:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Refunded'    },
  CANCELLED: { bg: '#F3F4F6', text: '#374151', label: 'Cancelled'   },
};

interface RouteParams { donationRef: string }

// ── Journey step definitions ──────────────────────────────────────────────────
// Each step has a "done at" status code and subtitle text
const JOURNEY: Array<{
  label: string;
  sub: (d: any) => string;
  doneWhen: string[];
  activeWhen: string[];
  failWhen?: string[];
}> = [
  {
    label: 'Payment initiated',
    sub: (d) => d?.createdAt ? `${fmtDateTime(d.createdAt)}${d.payMethod ? ' · ' + d.payMethod : ''}` : '',
    doneWhen: ['SUCCESS', 'REFUNDED'],
    activeWhen: ['INITIATED', 'PENDING', 'FAILED'],
  },
  {
    label: 'Confirming with your bank',
    sub: () => 'Usually under 24 hours',
    doneWhen: ['SUCCESS', 'REFUNDED'],
    activeWhen: ['PENDING'],
    failWhen: ['FAILED'],
  },
  {
    label: (d: any) => `Received by ${d?.orgName ?? 'Organisation'}` as any,
    sub: () => 'After confirmation',
    doneWhen: ['SUCCESS', 'REFUNDED'],
    activeWhen: [],
  },
  {
    label: 'Receipt & 80G certificate',
    sub: () => 'Issued automatically once confirmed',
    doneWhen: [],
    activeWhen: [],
  },
] as any[];

export default function DonationDetailScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { donationRef } = (route.params ?? {}) as RouteParams;

  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await donationApi.getDonationDetail(donationRef);
      if (res.data?.isSuccess === 1) setData(res.data.data);
      else setError(res.data?.message ?? 'Could not load donation');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Something went wrong');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchDetail(); }, [donationRef]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDetail();
    if (data) Alert.alert('Status updated', `Current status: ${data.payStatus ?? 'Unknown'}`);
  };

  const handleGetHelp = () => {
    nav.navigate('HelpSupport', {
      initialCategory: 'DONATION_SUPPORT',
      initialSubject:  `Issue with donation ${donationRef}`,
    });
  };

  const copyToClipboard = (value: string, label: string) => {
    Clipboard.setString(value);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <NavHeader title="Donation details" onBack={() => nav.goBack()} />
        <ActivityIndicator color={C.PRIMARY} size="large" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={s.container}>
        <NavHeader title="Donation details" onBack={() => nav.goBack()} />
        <View style={s.errorWrap}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorText}>{error || 'Donation not found'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); setError(''); fetchDetail(); }}>
            <Text style={s.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = data.payStatus ?? 'INITIATED';
  const meta   = STATUS_META[status] ?? { bg: '#F3F4F6', text: '#374151', label: status };
  const isProcessing = status === 'INITIATED' || status === 'PENDING';
  const isFailed     = status === 'FAILED';
  const isRefunded   = status === 'REFUNDED';
  const isSuccess    = status === 'SUCCESS';

  // ── Journey step states ───────────────────────────────────────────────────────
  const getStepState = (step: typeof JOURNEY[number]) => {
    if (step.failWhen?.includes(status)) return 'failed';
    if (step.doneWhen?.includes(status)) return 'done';
    if (step.activeWhen?.includes(status)) return 'active';
    return 'pending';
  };

  const stepColor = (state: string) => ({
    done:    '#16A34A',
    active:  '#C2410C',
    failed:  '#DC2626',
    pending: C.BORDER,
  }[state] ?? C.BORDER);

  return (
    <SafeAreaView style={s.container}>
      <NavHeader
        title="Donation details"
        onBack={() => nav.goBack()}
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero: avatar + org + amount + status ────────────────────────── */}
        <View style={s.heroCard}>
          <View style={[s.heroAvatar, { backgroundColor: avatarBg(data.orgId ?? 0) }]}>
            <Text style={s.heroAvatarText}>{initials(data.orgName ?? '')}</Text>
          </View>
          <Text style={s.heroOrg}>{data.orgName ?? '—'}</Text>
          <Text style={s.heroCampaign}>{data.campaignName ?? 'General Donation'}</Text>
          <Text style={s.heroAmount}>₹{Number(data.donationAmount).toLocaleString('en-IN')}</Text>
          <View style={[s.heroPill, { backgroundColor: meta.bg }]}>
            <Text style={[s.heroPillText, { color: meta.text }]}>{meta.label}</Text>
          </View>
          <Text style={s.heroDate}>{fmtDateTime(data.createdAt)}</Text>
        </View>

        {/* ── Warning banner (INITIATED / PENDING) ──────────────────────── */}
        {isProcessing && (
          <View style={s.warningBanner}>
            <Text style={s.warningIcon}>⏱</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.warningTitle}>Waiting for your bank to confirm.</Text>
              <Text style={s.warningBody}>
                This usually takes under 24 hours. Don't pay again — we'll notify you the moment it clears.
              </Text>
            </View>
          </View>
        )}

        {/* ── Refund banner ─────────────────────────────────────────────── */}
        {isRefunded && (
          <View style={[s.warningBanner, s.refundBanner]}>
            <Text style={s.warningIcon}>🔄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.warningTitle, { color: '#1D4ED8' }]}>Refund initiated.</Text>
              <Text style={[s.warningBody, { color: '#1D4ED8' }]}>
                Your refund of ₹{Number(data.donationAmount).toLocaleString('en-IN')} will be credited within 5–7 working days.
              </Text>
            </View>
          </View>
        )}

        {/* ── Failed banner ────────────────────────────────────────────── */}
        {isFailed && (
          <View style={[s.warningBanner, s.failBanner]}>
            <Text style={s.warningIcon}>❌</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.warningTitle, { color: '#991B1B' }]}>Payment failed.</Text>
              <Text style={[s.warningBody, { color: '#991B1B' }]}>
                No amount was deducted from your account. You can try donating again.
              </Text>
            </View>
          </View>
        )}

        {/* ── Donation journey ─────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Donation journey</Text>
        <View style={s.journeyCard}>
          {JOURNEY.map((step, idx) => {
            const state = getStepState(step);
            const color = stepColor(state);
            const label = typeof step.label === 'function' ? step.label(data) : step.label;
            const sub   = step.sub(data);
            const isLast = idx === JOURNEY.length - 1;
            return (
              <View key={idx} style={s.stepRow}>
                {/* Left: dot + connector */}
                <View style={s.stepLeft}>
                  <View style={[s.stepDot, { borderColor: color, backgroundColor: state === 'done' ? color : 'transparent' }]}>
                    {state === 'done'    && <Text style={s.stepCheck}>✓</Text>}
                    {state === 'active'  && <View style={[s.stepInnerDot, { backgroundColor: color }]} />}
                    {state === 'failed'  && <Text style={[s.stepCheck, { color }]}>✕</Text>}
                  </View>
                  {!isLast && (
                    <View style={[s.stepLine, {
                      backgroundColor: state === 'done' ? '#16A34A' : C.BORDER,
                    }]} />
                  )}
                </View>
                {/* Right: label + sub */}
                <View style={[s.stepContent, !isLast && { paddingBottom: 20 }]}>
                  <Text style={[s.stepLabel,
                    state !== 'pending' && s.stepLabelActive,
                    state === 'failed'  && { color: '#DC2626' },
                  ]}>{label}</Text>
                  {!!sub && <Text style={s.stepSub}>{sub}</Text>}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Payment details ────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Payment details</Text>
        <View style={s.detailCard}>
          {data.donationId && (
            <DetailRow
              label="Donation ID"
              value={data.donationId}
              mono
              onCopy={() => copyToClipboard(data.donationId, 'Donation ID')}
            />
          )}
          {data.gatewayPaymentId && (
            <DetailRow label="Transaction ref." value={data.gatewayPaymentId} mono />
          )}
          {data.payMethod && (
            <DetailRow label="Payment method" value={data.payMethod.replace('_', ' ')} />
          )}
          {data.gatewayOrderId && (
            <DetailRow label="Paid from" value={data.gatewayOrderId} mono />
          )}
          <DetailRow
            label="Platform fee"
            value="₹0"
            sub="100% goes to the organisation"
          />
          <DetailRow
            label="Amount to organisation"
            value={`₹${Number(data.orgReceivesAmt ?? data.donationAmount).toLocaleString('en-IN')}`}
            highlight
            isLast
          />
        </View>

        {/* ── 80G receipt ───────────────────────────────────────────────── */}
        {(isSuccess || data.receiptNumber) && (
          <>
            <Text style={s.sectionTitle}>80G Tax receipt</Text>
            <View style={s.detailCard}>
              {data.receiptNumber ? (
                <>
                  <DetailRow label="Receipt number" value={data.receiptNumber} mono />
                  {data.fiscalYear && <DetailRow label="Financial year" value={data.fiscalYear} />}
                  {data.donorPan   && <DetailRow label="PAN" value={data.donorPan} mono />}
                  <TouchableOpacity
                    style={s.downloadBtn}
                    onPress={() => Alert.alert('Coming soon', 'Receipt download will be available shortly.')}>
                    <Text style={s.downloadBtnText}>📥 Download 80G Receipt</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={s.pendingNote}>
                  Your 80G receipt will be generated within 24 hours of payment confirmation.
                </Text>
              )}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Fixed footer ──────────────────────────────────────────────────── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.helpBtn}
          onPress={handleGetHelp}>
          <Text style={s.helpBtnText}>Get help</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.refreshBtn, refreshing && { opacity: 0.7 }]}
          onPress={handleRefresh}
          disabled={refreshing}>
          {refreshing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.refreshBtnText}>Refresh status</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function NavHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={s.headerBtn} accessibilityLabel="Back">
        <Text style={s.headerBackArrow}>←</Text>
        <Text style={s.headerBackLabel}>Back</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 70 }} />
    </View>
  );
}

function DetailRow({
  label, value, mono, sub, onCopy, highlight, isLast,
}: {
  label: string; value: string; mono?: boolean; sub?: string;
  onCopy?: () => void; highlight?: boolean; isLast?: boolean;
}) {
  return (
    <View style={[s.detailRow, isLast && { borderBottomWidth: 0 }]}>
      <Text style={s.detailLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[
            s.detailValue,
            mono && s.detailValueMono,
            highlight && s.detailValueHighlight,
          ]}>{value}</Text>
          {sub && <Text style={s.detailSub}>{sub}</Text>}
        </View>
        {onCopy && (
          <TouchableOpacity onPress={onCopy} style={s.copyBtn}>
            <Text style={s.copyBtnIcon}>⧉</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function fmtDateTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', '
    + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
                    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER,
                    backgroundColor: C.CARD },
  headerBtn:        { minWidth: 70, height: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBackArrow:  { fontSize: 20, color: C.PRIMARY, fontWeight: '600' },
  headerBackLabel:  { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:      { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.TEXT },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Error
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorIcon: { fontSize: 44, marginBottom: 12 },
  errorText: { fontSize: 15, color: C.TEXT2, textAlign: 'center', marginBottom: 20 },
  retryBtn:  { backgroundColor: C.PRIMARY, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Hero card
  heroCard:     { backgroundColor: C.CARD, borderRadius: 16, padding: 20, alignItems: 'center',
                  marginBottom: 12, borderWidth: 1, borderColor: C.BORDER },
  heroAvatar:   { width: 64, height: 64, borderRadius: 32, alignItems: 'center',
                  justifyContent: 'center', marginBottom: 12 },
  heroAvatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroOrg:      { fontSize: 17, fontWeight: '700', color: C.TEXT, marginBottom: 4, textAlign: 'center' },
  heroCampaign: { fontSize: 13, color: C.TEXT2, marginBottom: 16, textAlign: 'center' },
  heroAmount:   { fontSize: 34, fontWeight: '800', color: C.TEXT, marginBottom: 10 },
  heroPill:     { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginBottom: 10 },
  heroPillText: { fontSize: 13, fontWeight: '700' },
  heroDate:     { fontSize: 12, color: C.TEXT2 },

  // Banners
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                   backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14,
                   marginBottom: 14, borderWidth: 1, borderColor: '#FED7AA' },
  refundBanner: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  failBanner:   { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  warningIcon:  { fontSize: 20, marginTop: 1 },
  warningTitle: { fontSize: 13, fontWeight: '700', color: '#C2410C', marginBottom: 3 },
  warningBody:  { fontSize: 12, color: '#92400E', lineHeight: 17 },

  // Section title
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 8, marginTop: 4 },

  // Journey card
  journeyCard:  { backgroundColor: C.CARD, borderRadius: 14, padding: 16, marginBottom: 16,
                  borderWidth: 1, borderColor: C.BORDER },
  stepRow:      { flexDirection: 'row' },
  stepLeft:     { width: 28, alignItems: 'center' },
  stepDot:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                  alignItems: 'center', justifyContent: 'center' },
  stepCheck:    { fontSize: 11, color: '#fff', fontWeight: '700' },
  stepInnerDot: { width: 8, height: 8, borderRadius: 4 },
  stepLine:     { flex: 1, width: 2, marginTop: 3, marginBottom: 0 },
  stepContent:  { flex: 1, paddingLeft: 10, paddingTop: 1 },
  stepLabel:    { fontSize: 14, color: C.TEXT2, fontWeight: '400' },
  stepLabelActive: { color: C.TEXT, fontWeight: '600' },
  stepSub:      { fontSize: 12, color: C.TEXT2, marginTop: 3, lineHeight: 16 },

  // Detail card
  detailCard:  { backgroundColor: C.CARD, borderRadius: 14, paddingHorizontal: 16,
                 marginBottom: 16, borderWidth: 1, borderColor: C.BORDER },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                 paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  detailLabel: { fontSize: 13, color: C.TEXT2 },
  detailValue: { fontSize: 13, color: C.TEXT, textAlign: 'right', maxWidth: 200 },
  detailValueMono: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0.5 },
  detailValueHighlight: { fontSize: 15, fontWeight: '700', color: C.PRIMARY },
  detailSub:   { fontSize: 11, color: C.TEXT2, marginTop: 2, textAlign: 'right' },
  copyBtn:     { width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
                 backgroundColor: '#F0F2F8', borderRadius: 6 },
  copyBtnIcon: { fontSize: 14, color: C.PRIMARY },

  // 80G
  downloadBtn: { margin: 12, backgroundColor: '#EFF6FF', borderRadius: 10,
                 paddingVertical: 11, alignItems: 'center',
                 borderWidth: 1, borderColor: '#BFDBFE' },
  downloadBtnText: { fontSize: 14, fontWeight: '700', color: '#1D4ED8' },
  pendingNote: { fontSize: 13, color: C.TEXT2, textAlign: 'center', padding: 16, lineHeight: 20 },

  // Footer
  footer:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 10,
                 backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER },
  helpBtn:     { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                 borderWidth: 1.5, borderColor: C.BORDER },
  helpBtnText: { fontSize: 15, fontWeight: '600', color: C.TEXT },
  refreshBtn:  { flex: 1.6, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                 backgroundColor: C.PRIMARY },
  refreshBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
