import React, { useCallback, useRef } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

type WebViewParams = { url: string; title: string };

/**
 * CSS injected into every legal page:
 *  1. Hides header/nav/footer using both tag names and common class/id patterns
 *     (attribute-selector wildcards catch any naming convention the site uses).
 *  2. Disables all link clicks — the page is read-only inside the app.
 */
const LOCK_CSS = `
(function () {
  var style = document.createElement('style');
  style.textContent = [
    /* Hide page chrome by tag, class wildcard, and id wildcard */
    'header, nav, footer { display: none !important; }',
    '[class*="header"], [class*="navbar"], [class*="nav-bar"], [class*="navigation"] { display: none !important; }',
    '[class*="footer"], [class*="site-footer"] { display: none !important; }',
    '[class*="cookie"], [class*="banner"], [class*="announcement"] { display: none !important; }',
    '[id*="header"], [id*="nav"], [id*="footer"], [id*="cookie"] { display: none !important; }',
    /* Disable link clicks — this page is read-only */
    'a { pointer-events: none !important; cursor: default !important; }',
  ].join(' ');
  document.head.appendChild(style);
})();
true;
`;

export default function WebViewScreen() {
  const nav   = useNavigation();
  const route = useRoute<RouteProp<{ WebView: WebViewParams }, 'WebView'>>();
  const { url, title } = route.params;

  const webViewRef  = useRef<WebView>(null);
  // Anchor URL — updated to final URL after any server-side redirect on first load.
  const anchorUrl   = useRef<string>(url);
  const hasLanded   = useRef(false);

  const isAllowed = (u: string | undefined | null) =>
    !u || u === anchorUrl.current || u.startsWith('about:');

  // ── Android hardware back → always close this screen ──────────────────────
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        nav.goBack();
        return true;
      });
      return () => sub.remove();
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
         * iOS: onShouldStartLoadWithRequest fires before every navigation.
         * Allow only the initial landing URL; block everything else silently.
         */
        onShouldStartLoadWithRequest={request => {
          if (!hasLanded.current) {
            anchorUrl.current = request.url; // record final URL (handles redirects)
            hasLanded.current = true;
            return true;
          }
          return isAllowed(request.url);
        }}

        /**
         * Android: onShouldStartLoadWithRequest does NOT fire for user link-clicks.
         * onNavigationStateChange is the Android equivalent — stop any load that
         * drifts away from the anchor URL.
         */
        onNavigationStateChange={navState => {
          if (!navState.url) return; // guard: url is undefined during back transitions
          if (!hasLanded.current) {
            anchorUrl.current = navState.url;
            hasLanded.current = true;
            return;
          }
          if (!isAllowed(navState.url) && navState.loading) {
            webViewRef.current?.stopLoading();
          }
        }}

        // Inject CSS on every page load: hide nav/footer chrome + disable links.
        injectedJavaScript={LOCK_CSS}
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
