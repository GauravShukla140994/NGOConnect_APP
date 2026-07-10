import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppConfig from '../../config/AppConfig';

const MyDonationsScreen = () => (
  <SafeAreaView style={styles.container}>
    <View style={styles.inner}>
      <Text style={styles.title}>My Donations</Text>
      <Text style={styles.sub}>Coming in next sprint</Text>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: AppConfig.COLORS.BG},
  inner: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  title: {fontSize: 22, fontWeight: '700', color: AppConfig.COLORS.TEXT, marginBottom: 8},
  sub: {fontSize: 14, color: AppConfig.COLORS.TEXT2}});

export default MyDonationsScreen;