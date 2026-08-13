import React, { useCallback, useRef } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

type WebViewParams = { url: string; title: string };

export default function WebViewScreen() {
  const nav   = useNavigation();
  const route = useRoute<RouteProp<{ WebView: WebViewParams }, 'WebView'>>();
  const { url, title } = route.params;

  const webViewRef    = useRef<WebView>(null);
  // Track whether the resolved URL after any server-side redirect
  const resolvedUrl   = useRef<string | null>(null);

  // ── Android hardware back → always close this screen (no WebView history to traverse) ──
  useFocusEffect(
    useCallback(() => {
      const handler = () => {
        nav.goBack();
        return true; // always consume — we block in-page navigation below
      };
      BackHandler.addEventListener('hardwareBackPress', handler);
      return () => BackHandler.removeEventListener('hardwareBackPress', handler);
    }, [nav]),
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} accessibilityLabel="Go back">
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <View style={{ width: 70 }} />
      </View>

      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1 }}
        /**
         * Lock navigation to the initial page only.
         *
         * The privacy / terms page is a reading surface — tapping any link
         * (website header, footer, "Home", social icons, etc.) would otherwise
         * navigate the WebView into the full website, which is confusing.
         *
         * Strategy:
         *  - First request (resolvedUrl is null): always allow and record the
         *    final URL (handles server-side redirects transparently).
         *  - Subsequent requests: allow only if the URL matches the resolved URL
         *    or is an about: frame (some WebView internals use about:blank).
         *  - Everything else (link clicks) → return false (blocked silently).
         */
        onShouldStartLoadWithRequest={request => {
          if (resolvedUrl.current === null) {
            // First load — record where we actually land (may differ from `url`
            // if the server redirects, e.g. http → https).
            resolvedUrl.current = request.url;
            return true;
          }
          // Allow internal WebView frames and the resolved page itself.
          if (
            request.url === resolvedUrl.current ||
            request.url.startsWith('about:')
          ) {
            return true;
          }
          // Block everything else — link clicks on the website stay silent.
          return false;
        }}
        // Inject CSS to hide the website's navigation bar and footer so the
        // screen looks like a clean in-app document, not a full web page.
        injectedJavaScript={`
          (function () {
            var style = document.createElement('style');
            style.textContent =
              'header, nav, footer, .navbar, .nav, .footer, ' +
              '.site-header, .site-footer, .cookie-banner, #cookie-banner { ' +
              '  display: none !important; ' +
              '}';
            document.head.appendChild(style);
          })();
          true;
        `}
        javaScriptEnabled
        domStorageEnabled
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#fff' },
  header:  {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    backgroundColor: C.CARD,
  },
  backBtn:  { width: 70 },
  backText: { fontSize: 15, color: C.PRIMARY, fontWeight: '600' },
  title:    { flex: 1, fontSize: 16, fontWeight: '700', color: C.TEXT, textAlign: 'center' },
});
