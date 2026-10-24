/**
 * DonationSuccessScreen — shown after payment confirmed successfully.
 * Route params: { donationId, donationRef, amount, orgName, campaignName, payMethod, gatewayPaymentId?, userFirstName? }
 * Design ref: success screen mockup
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Share, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

interface RouteParams {
  donationId:       string;   // DON-2026-000001
  donationRef?:     string;   // same — alias
  amount:           number;
  orgName:          string;
  campaignName?:    string;
  payMethod:        string;
  gatewayPaymentId?: string;
  userFirstName?:   string;
}

const DonationSuccessScreen = () => {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const p = (route.params ?? {}) as RouteParams;

  const amount          = Number(p.amount);
  const donationId      = p.donationId ?? p.donationRef ?? '';
  const orgName         = p.orgName ?? 'the NGO';
  const campaignName    = p.campaignName ?? 'General Donation';
  const payMethod       = p.payMethod ?? 'UPI';
  const gatewayPayId    = p.gatewayPaymentId ?? '[RAZORPAY PAYMENT ID]';
  const firstName       = p.userFirstName ?? '';

  // Entrance animation for the checkmark circle
  const scaleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1, useNativeDriver: true, tension: 80, friction: 8,
    }).start();
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I just donated ₹${amount.toLocaleString('en-IN')} to ${orgName} on NGO Connect! 🎉 Join me in making a difference.`,
      });
    } catch (_) {}
  };

  const handleDone = () => {
    nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>

        {/* Animated check circle */}
        <Animated.View style={[s.checkCircleOuter, { transform: [{ scale: scaleAnim }] }]}>
          <View style={s.checkCircleInner}>
            <Text style={s.checkMark}>✓</Text>
          </View>
        </Animated.View>

        {/* Thank you message */}
        <Text style={s.thankYou}>
          {firstName ? `Thank you, ${firstName}!` : 'Thank you!'}
        </Text>
        <Text style={s.confirmSub}>
          Your ₹{amount.toLocaleString('en-IN')} gift to{' '}
          <Text style={{ fontWeight: '700', color: C.TEXT }}>{orgName}</Text> is confirmed.
        </Text>

        {/* Summary card */}
        <View style={s.card}>
          <SummaryRow label="Fund"        value={campaignName}  />
          <SummaryRow label="Donation ID" value={donationId}    mono />
          <SummaryRow label="Payment ID"  value={gatewayPayId}  mono />
          <SummaryRow label="Paid via"    value={payMethod.replace('_', ' ')} isLast />
        </View>

        {/* Email receipt notice */}
        <View style={s.emailBox}>
          <Text style={s.emailIcon}>✉️</Text>
          <Text style={s.emailText}>Payment receipt emailed to your registered address</Text>
        </View>

        {/* Action buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
            <Text style={s.shareBtnText}>Share impact</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.doneBtn} onPress={handleDone}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Secondary: view donation detail */}
        <TouchableOpacity
          onPress={() => nav.navigate('DonationDetail', { donationRef: donationId })}
          style={s.viewDetailLink}>
          <Text style={s.viewDetailText}>View donation details →</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
};

const SummaryRow = ({
  label, value, mono, isLast,
}: { label: string; value: string; mono?: boolean; isLast?: boolean }) => (
  <View style={[s.summaryRow, isLast && { borderBottomWidth: 0 }]}>
    <Text style={s.summaryLabel}>{label}</Text>
    <Text style={[s.summaryValue, mono && s.summaryValueMono]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F8' },
  inner:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  // Check circle
  checkCircleOuter: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#16A34A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  checkCircleInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { fontSize: 26, color: '#fff', fontWeight: '800', lineHeight: 32 },

  thankYou:   { fontSize: 26, fontWeight: '800', color: '#1A1A2E', marginBottom: 8, textAlign: 'center' },
  confirmSub: { fontSize: 14, color: '#666680', textAlign: 'center', marginBottom: 24, lineHeight: 20 },

  // Summary card
  card:       { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 0,
                borderWidth: 1, borderColor: '#E8E8F0', marginBottom: 14,
                overflow: 'hidden' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 13,
                borderBottomWidth: 1, borderBottomColor: '#E8E8F0' },
  summaryLabel: { fontSize: 13, color: '#666680' },
  summaryValue: { fontSize: 13, color: '#1A1A2E', fontWeight: '600',
                  maxWidth: '60%', textAlign: 'right' },
  summaryValueMono: { fontFamily: 'monospace', fontSize: 12 },

  // Email box
  emailBox:  { flexDirection: 'row', alignItems: 'center', gap: 8,
               backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12,
               borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 20, width: '100%' },
  emailIcon: { fontSize: 16 },
  emailText: { flex: 1, fontSize: 13, color: '#15803D', lineHeight: 18 },

  // Buttons
  btnRow:    { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 12 },
  shareBtn:  { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
               borderWidth: 1.5, borderColor: '#E8E8F0', backgroundColor: '#fff' },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  doneBtn:   { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
               backgroundColor: '#6B4EFF' },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  viewDetailLink: { paddingVertical: 8 },
  viewDetailText: { fontSize: 13, color: '#6B4EFF', fontWeight: '600' },
});

export default DonationSuccessScreen;
