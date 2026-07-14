import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

const MyDonationsScreen = () => (
  <SafeAreaView style={s.container}>
    <View style={s.inner}>
      <Text style={s.icon}>💛</Text>
      <Text style={s.title}>My Donations</Text>
      <Text style={s.sub}>
        Your donation history and impact summary will be available here.{'\n'}
        We're putting the finishing touches on this feature — check back soon!
      </Text>
    </View>
  </SafeAreaView>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  inner: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon:  { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: C.TEXT, marginBottom: 10, textAlign: 'center' },
  sub:   { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 22 },
});

export default MyDonationsScreen;
