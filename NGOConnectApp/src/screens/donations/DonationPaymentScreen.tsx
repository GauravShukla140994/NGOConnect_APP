/**
 * DonationPaymentScreen
 *
 * Phase 1: Shows "Completing your payment…" animation while Razorpay checkout
 * processes in an external window. A small dev-only simulate link is shown at
 * the bottom for testing without the real SDK.
 *
 * Phase 2: Replace with Razorpay React Native SDK — the loading state here
 * is what the user sees while the SDK WebView is opening.
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
  donType?:      string;   // 'ONE_TIME' | 'MONTHLY'
  campaignId?:   number | null;
}

const DonationPaymentScreen = () => {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const _p = (route.params ?? {}) as RouteParams;

  const transactionId = Number(_p.transactionId);
  const amount        = Number(_p.amount);
  const { donationId, orgName, campaignName, payMethod, donType } = _p;

  const [processing, setProcessing] = useState(false);

  // Guard: invalid session
  useEffect(() => {
    if (!transactionId || isNaN(transactionId) || transactionId <= 0) {
      Alert.alert(
        'Session expired',
        'Your payment session is no longer valid. Please start the donation again.',
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    }
  }, []);

  // ── Animated pulsing dots (3 sequential dots) ─────────────────────────────
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 3, duration: 1200, useNativeDriver: false }),
    ).start();
  }, []);

  const dot = (threshold: number) => ({
    opacity: anim.interpolate({
      inputRange: [threshold - 0.5, threshold, threshold + 0.5],
      outputRange: [0.3, 1, 0.3],
      extrapolate: 'clamp',
    }),
    transform: [{
      scale: anim.interpolate({
        inputRange: [threshold - 0.5, threshold, threshold + 0.5],
        outputRange: [0.85, 1.2, 0.85],
        extrapolate: 'clamp',
      }),
    }],
  });

  // ── Simulate (dev only) ───────────────────────────────────────────────────
  const handleSimulate = async (statusCode: 'SUCCESS' | 'FAILED') => {
    setProcessing(true);
    try {
      const res = await donationApi.confirmPayment({ transactionId, statusCode });
      if (statusCode === 'SUCCESS' && res.data?.isSuccess === 1) {
        const d = res.data.data;
        nav.replace('DonationSuccess', {
          donationId,
          amount,
          orgName:         d?.orgName    ?? orgName,
          campaignName,
          payMethod,
          donType:         donType ?? d?.donTypeCode ?? 'ONE_TIME',
          recurringDonId:  d?.recurringDonId  ?? null,
          nextChargeDate:  d?.nextChargeDate   ?? null,
        });
      } else if (statusCode === 'FAILED') {
        nav.goBack();
      } else {
        Alert.alert('Payment failed', res.data?.message ?? 'Could not confirm.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Something went wrong.');
    } finally {
      setProcessing(false);
    }
  };

  const showDevMenu = () => {
    Alert.alert('Dev: Simulate payment', undefined, [
      { text: '✅ Simulate Success', onPress: () => handleSimulate('SUCCESS') },
      { text: '❌ Simulate Failure', onPress: () => handleSimulate('FAILED') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>

        {/* Animated dots */}
        <View style={s.dotsRow}>
          {[0.5, 1.5, 2.5].map((t, i) => (
            <Animated.View key={i} style={[s.dot, dot(t)]} />
          ))}
        </View>

        {/* Title */}
        <Text style={s.title}>Completing your payment…</Text>

        {/* Subtitle */}
        <Text style={s.subtitle}>
          Finish paying ₹{amount.toLocaleString('en-IN')} in the secure checkout window.
          Don't close the app or press back.
        </Text>

      </View>

      {/* Dev-only simulate link (hidden at bottom) */}
      {!processing ? (
        <TouchableOpacity style={s.devLink} onPress={showDevMenu}>
          <Text style={s.devLinkText}>🔧 dev</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.devLink}>
          <ActivityIndicator size="small" color={C.TEXT2} />
        </View>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  inner:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },

  dotsRow: { flexDirection: 'row', gap: 10, marginBottom: 32 },
  dot:     { width: 12, height: 12, borderRadius: 6, backgroundColor: C.PRIMARY },

  title:    { fontSize: 20, fontWeight: '700', color: C.TEXT, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 22 },

  devLink: { paddingBottom: 24, paddingTop: 8, alignItems: 'center' },
  devLinkText: { fontSize: 11, color: C.TEXT2, opacity: 0.5 },
});

export default DonationPaymentScreen;
