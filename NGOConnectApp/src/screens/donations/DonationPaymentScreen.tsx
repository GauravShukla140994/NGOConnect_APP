/**
 * DonationPaymentScreen
 *
 * Phase 1: Simulated payment — shows "Completing your payment…" animation
 * and a "Simulate Payment" button that calls POST /donation/confirm with SUCCESS.
 *
 * Phase 2: Replace with Razorpay React Native SDK checkout + real confirm call.
 *
 * Route params: { transactionId, donationId, amount, orgName, campaignName, payMethod }
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { donationApi } from '../../api/donation.api';

const C = AppConfig.COLORS;

interface RouteParams {
  transactionId: number;
  donationId:    string;
  amount:        number;
  orgName:       string;
  campaignName:  string;
  payMethod:     string;
}

const DonationPaymentScreen = () => {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const _p = (route.params ?? {}) as RouteParams;
  const transactionId = Number(_p.transactionId);   // RN serialises params as strings
  const amount        = Number(_p.amount);
  const { donationId, orgName, campaignName, payMethod } = _p;

  const [processing, setProcessing] = useState(false);
  const dotAnim = useRef(new Animated.Value(0)).current;

  // Guard: if transactionId is missing/invalid (e.g. stale React Navigation state
  // restored after a Metro reload), go back so the user can retry from DonateScreen.
  useEffect(() => {
    console.log('[PaymentScreen] params:', JSON.stringify(route.params));
    console.log('[PaymentScreen] transactionId:', transactionId, '| type:', typeof transactionId);
    if (!transactionId || isNaN(transactionId) || transactionId <= 0) {
      Alert.alert(
        'Session expired',
        'Your payment session is no longer valid. Please start the donation again.',
        [{ text: 'OK', onPress: () => nav.goBack() }]
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate the dots
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [dotAnim]);

  const dot1Opacity = dotAnim.interpolate({ inputRange: [0, 0.33, 1], outputRange: [0.3, 1, 0.3] });
  const dot2Opacity = dotAnim.interpolate({ inputRange: [0, 0.5,  1], outputRange: [0.3, 1, 0.3] });
  const dot3Opacity = dotAnim.interpolate({ inputRange: [0, 0.66, 1], outputRange: [0.3, 1, 0.3] });

  const handleSimulate = async () => {
    setProcessing(true);
    try {
      const res = await donationApi.confirmPayment({
        transactionId,
        statusCode: 'SUCCESS',
      });
      if (res.data?.isSuccess === 1) {
        nav.replace('DonationSuccess', {
          donationId,
          amount,
          orgName,
          campaignName,
          payMethod,
        });
      } else {
        Alert.alert('Payment failed', res.data?.message ?? 'Payment could not be confirmed.');
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message
               ?? e?.response?.data?.Message
               ?? e?.message
               ?? 'Something went wrong. Please try again.';
      Alert.alert('Payment Error', msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleFail = async () => {
    try {
      await donationApi.confirmPayment({ transactionId, statusCode: 'FAILED' });
    } catch (_) {}
    nav.goBack();
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        {/* Animated icon */}
        <View style={s.iconWrap}>
          <Text style={s.icon}>💳</Text>
        </View>

        <Text style={s.title}>Completing your payment…</Text>

        {/* Animated dots */}
        <View style={s.dotsRow}>
          {[dot1Opacity, dot2Opacity, dot3Opacity].map((op, i) => (
            <Animated.View key={i} style={[s.dot, { opacity: op }]} />
          ))}
        </View>

        {/* Payment summary */}
        <View style={s.summaryCard}>
          <SummaryRow label="To"        value={orgName}      />
          <SummaryRow label="Campaign"  value={campaignName} />
          <SummaryRow label="Amount"    value={`₹${amount.toLocaleString('en-IN')}`} bold />
          <SummaryRow label="Pay via"   value={payMethod}    />
          <SummaryRow label="Ref"       value={donationId}   />
        </View>

        {/* Phase 1 dev note */}
        <View style={s.devNote}>
          <Text style={s.devNoteText}>
            🔧 Razorpay integration coming soon. Tap below to simulate a successful payment.
          </Text>
        </View>

        <TouchableOpacity
          style={[s.simulateBtn, processing && s.btnDisabled]}
          onPress={handleSimulate}
          disabled={processing}>
          {processing
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.simulateBtnText}>✅ Simulate Successful Payment</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.cancelBtn, processing && s.btnDisabled]}
          onPress={handleFail}
          disabled={processing}>
          <Text style={s.cancelBtnText}>❌ Cancel / Simulate Failure</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const SummaryRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <View style={s.sumRow}>
    <Text style={s.sumLabel}>{label}</Text>
    <Text style={[s.sumValue, bold && s.sumBold]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.BG },
  inner:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  iconWrap:    { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EFF6FF',
                 alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  icon:        { fontSize: 38 },
  title:       { fontSize: 20, fontWeight: '700', color: C.TEXT, marginBottom: 16 },
  dotsRow:     { flexDirection: 'row', gap: 8, marginBottom: 28 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: C.PRIMARY },

  summaryCard: { width: '100%', backgroundColor: C.CARD, borderRadius: 14, padding: 16,
                 borderWidth: 1, borderColor: C.BORDER, marginBottom: 20 },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  sumLabel:    { fontSize: 13, color: C.TEXT2 },
  sumValue:    { fontSize: 13, color: C.TEXT, maxWidth: '60%', textAlign: 'right' },
  sumBold:     { fontWeight: '700', fontSize: 16, color: C.PRIMARY },

  devNote:     { backgroundColor: '#FFF7ED', borderRadius: 10, padding: 12,
                 borderWidth: 1, borderColor: '#FED7AA', marginBottom: 16, width: '100%' },
  devNoteText: { fontSize: 12, color: '#C2410C', textAlign: 'center' },

  simulateBtn: { width: '100%', backgroundColor: '#16A34A', borderRadius: 12,
                 paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  simulateBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn:   { width: '100%', backgroundColor: C.CARD, borderRadius: 12,
                 paddingVertical: 14, alignItems: 'center',
                 borderWidth: 1, borderColor: C.BORDER },
  cancelBtnText: { fontSize: 14, color: C.TEXT2 },
  btnDisabled: { opacity: 0.5 },
});

export default DonationPaymentScreen;
