import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

type WebViewParams = { url: string; title: string };

export default function WebViewScreen() {
  const nav   = useNavigation();
  const route = useRoute<RouteProp<{ WebView: WebViewParams }, 'WebView'>>();
  const { url, title } = route.params;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} accessibilityLabel="Go back">
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <View style={{ width: 70 }} />
      </View>
      <WebView source={{ uri: url }} style={{ flex: 1 }} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#fff' },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn: { width: 70 },
  backText:{ fontSize: 15, color: C.PRIMARY, fontWeight: '600' },
  title:   { flex: 1, fontSize: 16, fontWeight: '700', color: C.TEXT, textAlign: 'center' },
});
