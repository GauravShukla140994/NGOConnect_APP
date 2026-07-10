import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

export default function SosResolvedScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { alertTypeName = 'SOS Alert', cancelled = false, timer = '--:--' } = route.params ?? {};

  // Scale-in animation for the circle
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  const isCancelled = Boolean(cancelled);
  const accentColor = isCancelled ? C.TEXT2 : '#10B981';
  const emoji       = isCancelled ? '🔕' : '✅';
  const title       = isCancelled ? 'Alert Cancelled' : 'You\'re Safe!';
  const subtitle    = isCancelled
    ? 'Your SOS alert has been cancelled. Responders have been notified.'
    : 'Your SOS alert has been resolved. Responders have been notified that you are safe.';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        {/* Animated circle */}
        <Animated.View style={[styles.circle, { backgroundColor: accentColor, transform: [{ scale }], opacity }]}>
          <Text style={styles.circleEmoji}>{emoji}</Text>
        </Animated.View>

        <Animated.View style={{ opacity }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </Animated.View>

        {/* Incident summary */}
        <Animated.View style={[styles.summaryCard, { opacity }]}>
          <SummaryRow label="Alert Type"    value={alertTypeName} />
          <SummaryRow label="Duration"      value={timer} />
          <SummaryRow label="Status"        value={isCancelled ? 'Cancelled' : 'Resolved'} valueColor={accentColor} />
        </Animated.View>

        {/* Guidance */}
        {!isCancelled && (
          <Animated.View style={[styles.tipCard, { opacity }]}>
            <Text style={styles.tipTitle}>{'💡 What happens next'}</Text>
            <Text style={styles.tipText}>
              {'• Responders who helped you have been thanked\n• Your incident report has been saved\n• Stay safe and reach out to your NGO coordinator if needed'}
            </Text>
          </Animated.View>
        )}

        {/* Return button */}
        <Animated.View style={[{ width: '100%' }, { opacity }]}>
          <TouchableOpacity
            style={[styles.homeBtn, { backgroundColor: accentColor }]}
            onPress={() => nav.navigate('Tabs', { screen: 'Profile' })}
            accessibilityLabel="Return to Profile"
          >
            <Text style={styles.homeBtnTxt}>Return to Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.communityBtn}
            onPress={() => nav.navigate('Tabs', { screen: 'Community' })}
            accessibilityLabel="Go to Community"
          >
            <Text style={styles.communityBtnTxt}>Go to Community</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={srStyles.row}>
      <Text style={srStyles.label}>{label}</Text>
      <Text style={[srStyles.value, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

const srStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  label: { fontSize: 13, color: C.TEXT2 },
  value: { fontSize: 13, fontWeight: '700', color: C.TEXT },
});

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: C.BG },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  circle:      { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 24, elevation: 6, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
  circleEmoji: { fontSize: 52 },

  title:    { fontSize: 26, fontWeight: '900', color: C.TEXT, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20, marginBottom: 24 },

  summaryCard: { width: '100%', backgroundColor: C.CARD, borderRadius: 16, padding: 16, marginBottom: 16, ...AppConfig.SHADOW.CARD },
  tipCard:     { width: '100%', backgroundColor: '#ECFDF5', borderRadius: 14, padding: 14, marginBottom: 24 },
  tipTitle:    { fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 8 },
  tipText:     { fontSize: 12, color: '#047857', lineHeight: 20 },

  homeBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  homeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  communityBtn:    { paddingVertical: 12, alignItems: 'center' },
  communityBtnTxt: { fontSize: 14, color: C.TEXT2 },
});
