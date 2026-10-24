/**
 * DonationSuccessScreen — shown after payment confirmed successfully.
 * Route params: { donationId, amount, orgName, campaignName, payMethod }
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
  donationId:   string;
  amount:       number;
  orgName:      string;
  campaignName: string;
  payMethod:    string;
}

const DonationSuccessScreen = () => {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const _p = (route.params ?? {}) as RouteParams;
  const amount = Number(_p.amount);   // RN serialises params as strings
  const { donationId, orgName, campaignName, payMethod } = _p;

  // Entrance animation
  const scaleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1, useNativeDriver: true, speed: 8, bounciness: 12,
    }).start();
  }, [scaleAnim]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I just donated ₹${amount.toLocaleString('en-IN')} to ${orgName} via RippleHub! 🎉 Join me in making a difference.`,
      });
    } catch (_) {}
  };

  const handleViewDetail = () => {
    nav.navigate('DonationDetail', { donationRef: donationId });
  };

  const handleDone = () => {
    // Go back to the tab home, clearing the donation stack
    nav.navigate('Tabs');
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        {/* Success check animation */}
        <Animated.View style={[s.checkCircle, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={s.checkIcon}>✓</Text>
        </Animated.View>

        <Text style={s.thankYou}>Thank you!</Text>
        <Text style={s.thankSub}>Your donation has been received</Text>

        {/* Details card */}
        <View style={s.card}>
          <Row label="To"         value={orgName}      />
          <Row label="Campaign"   value={campaignName} />
          <Row label="Amount"     value={`₹${amount.toLocaleString('en-IN')}`} bold />
          <Row label="Paid via"   value={payMethod}    />
          <Row label="Donation ID" value={donationId}  />
        </View>

        {/* Email note */}
        <View style={s.emailNote}>
          <Text style={s.emailNoteText}>📧 A confirmation has been sent to your registered email</Text>
        </View>

        {/* Actions */}
        <TouchableOpacity style={s.detailBtn} onPress={handleViewDetail}>
          <Text style={s.detailBtnText}>View donation details</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
          <Text style={s.shareBtnText}>📢 Share your impact</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.doneBtn} onPress={handleDone}>
          <Text style={s.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <View style={s.row}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={[s.rowValue, bold && s.rowBold]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.BG },
  inner:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  checkCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#16A34A',
                 alignItems: 'center', justifyContent: 'center', marginBottom: 20,
                 shadowColor: '#16A34A', shadowOffset: { width: 0, height: 6 },
                 shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  checkIcon:  { fontSize: 44, color: '#fff', fontWeight: '700', lineHeight: 50 },

  thankYou:   { fontSize: 28, fontWeight: '800', color: C.TEXT, marginBottom: 6 },
  thankSub:   { fontSize: 15, color: C.TEXT2, marginBottom: 24 },

  card:       { width: '100%', backgroundColor: C.CARD, borderRadius: 14, padding: 16,
                borderWidth: 1, borderColor: C.BORDER, marginBottom: 14 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7,
                borderBottomWidth: 1, borderBottomColor: C.BORDER },
  rowLabel:   { fontSize: 13, color: C.TEXT2 },
  rowValue:   { fontSize: 13, color: C.TEXT, maxWidth: '58%', textAlign: 'right' },
  rowBold:    { fontWeight: '700', fontSize: 16, color: '#16A34A' },

  emailNote:  { backgroundColor: '#F0F9FF', borderRadius: 10, padding: 10,
                borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 20, width: '100%' },
  emailNoteText: { fontSize: 12, color: '#0369A1', textAlign: 'center' },

  detailBtn:  { width: '100%', backgroundColor: C.CARD, borderRadius: 12, paddingVertical: 13,
                alignItems: 'center', borderWidth: 1.5, borderColor: C.PRIMARY, marginBottom: 10 },
  detailBtnText: { fontSize: 15, fontWeight: '700', color: C.PRIMARY },

  shareBtn:   { width: '100%', backgroundColor: '#F0FDF4', borderRadius: 12, paddingVertical: 13,
                alignItems: 'center', borderWidth: 1.5, borderColor: '#86EFAC', marginBottom: 10 },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#16A34A' },

  doneBtn:    { width: '100%', backgroundColor: C.PRIMARY, borderRadius: 12,
                paddingVertical: 14, alignItems: 'center' },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

export default DonationSuccessScreen;
