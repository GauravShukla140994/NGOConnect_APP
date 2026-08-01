/**
 * @format
 */

import * as Sentry from '@sentry/react-native';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import AppConfig from './src/config/AppConfig';
import { navigationIntegration } from './src/config/sentry';
// NOTE: Do NOT import notificationApi (or anything that imports apiClient.ts) here.
// apiClient.ts instantiates `new MMKV()` at module level. MMKV is a JSI native module
// and is NOT available in Android's headless JS context (background/killed-state FCM
// handler). Importing it here causes index.js to fail at load time, which means
// setBackgroundMessageHandler() never registers and ALL notifications are silently dropped.

// SOS notif types that go on the urgent channel with alarm sound + triple vibration
const SOS_NOTIF_TYPES = new Set(['SOS_TRIGGERED', 'SOS_RESPONDER_APPROVED']);

// ── Notifee: display a system notification banner ─────────────────────────────
// Used for both foreground and background/quit cases so notifications
// always appear in the phone's notification panel.
// channelId: 'ripplehub_sos' for SOS alerts, 'ripplehub_default' for everything else.
// imageUrl: campaign image URL shown as largeIcon when present (must be a remote URL).
// NOTE: largeIcon is only set when imageUrl is a real URL. Passing a drawable resource
// name fallback (e.g. 'logo') caused the notification to be silently dropped on devices
// where the APK was built before the drawable was added — so we omit it instead.
async function displaySystemNotification(title, body, channelId, imageUrl) {
  await notifee.displayNotification({
    title: title ?? 'RippleHub',
    body:  body  ?? '',
    android: {
      channelId:     channelId ?? 'ripplehub_default',
      importance:    AndroidImportance.HIGH,
      pressAction:   { id: 'default' },         // tapping opens the app
      smallIcon:     'ic_notification',         // monochrome status-bar icon (falls back to app icon if not found)
      ...(imageUrl ? { largeIcon: imageUrl } : {}),  // only set when a real URL is provided
      showTimestamp: true,
      when:          Date.now(),                // precise delivery time, not "today" date
    },
  });
}

// ── FCM: Background / Quit-state message handler ─────────────────────────────
// MUST be registered here (outside React), before AppRegistry.
// Backend now sends data-only messages on Android (no Message.Notification),
// so FCM will NOT auto-display — our handler has full control of the timestamp.
// title/body/notifType/imageUrl all arrive in remoteMessage.data.
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  try {
    // Data-only: title/body are in the data payload (backend moved them there to
    // prevent FCM auto-display with its wrong/frozen event_time default).
    // Fallback to notification fields for any legacy / non-Android messages.
    const data      = remoteMessage.data ?? {};
    const title     = data.title    ?? remoteMessage.notification?.title;
    const body      = data.body     ?? remoteMessage.notification?.body;
    const imageUrl  = data.imageUrl;                   // campaign image URL (present on CAMPAIGN type)
    const notifType = data.notifType ?? '';
    if (title || body) {
      const channelId = SOS_NOTIF_TYPES.has(notifType) ? 'ripplehub_sos' : 'ripplehub_default';
      await displaySystemNotification(title, body, channelId, imageUrl);
    }

    // CAMPAIGN delivery ack intentionally skipped in background handler.
    // Cannot import notificationApi here — apiClient.ts uses MMKV (JSI) which crashes
    // in headless JS context. Foreground ack in RootNavigator.tsx covers the majority of cases.
  } catch (err) {
    // Catch prevents FCM from silently dropping the message on notifee failure.
    // Errors here mean the notification was not shown — log for Sentry/debugging.
    console.error('[BGHandler] displaySystemNotification failed:', err);
  }
});

// ── Sentry Error Monitoring ───────────────────────────────────────────────────
// Must be initialised BEFORE AppRegistry so all native crashes are captured.
// Environment is derived automatically from BASE_URL — no manual DSN switching needed.
const sentryEnvironment = AppConfig.BASE_URL.includes('staging')
  ? 'staging'
  : AppConfig.BASE_URL.includes('ngoconnect.app')
    ? 'production'
    : 'development';

Sentry.init({
  dsn:              AppConfig.SENTRY_DSN,
  environment:      sentryEnvironment,  // tags every event: staging / production
  tracesSampleRate: 0.2,               // 20% of sessions traced — free-tier safe
  enabled:          !__DEV__,          // disable in development to avoid noise
  integrations:     [navigationIntegration], // tracks screen name on crash
});

AppRegistry.registerComponent(appName, () => Sentry.wrap(App));
