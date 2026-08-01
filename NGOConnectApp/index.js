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
import { notificationApi } from './src/api/notification.api';

// SOS notif types that go on the urgent channel with alarm sound + triple vibration
const SOS_NOTIF_TYPES = new Set(['SOS_TRIGGERED', 'SOS_RESPONDER_APPROVED']);

// ── Notifee: display a system notification banner ─────────────────────────────
// Used for both foreground and background/quit cases so notifications
// always appear in the phone's notification panel.
// channelId: 'ripplehub_sos' for SOS alerts, 'ripplehub_default' for everything else.
// imageUrl: campaign image shown as largeIcon when present (falls back to brand logo).
async function displaySystemNotification(title, body, channelId, imageUrl) {
  await notifee.displayNotification({
    title: title ?? 'RippleHub',
    body:  body  ?? '',
    android: {
      channelId:     channelId ?? 'ripplehub_default',
      importance:    AndroidImportance.HIGH,
      pressAction:   { id: 'default' },         // tapping opens the app
      smallIcon:     'ic_notification',         // monochrome status-bar icon
      largeIcon:     imageUrl ?? 'logo',        // campaign image if present, else brand logo
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
  // Data-only: title/body are in the data payload (backend moved them there to
  // prevent FCM auto-display with its wrong/frozen event_time default).
  // Fallback to notification fields for any legacy / non-Android messages.
  const data      = remoteMessage.data ?? {};
  const title     = data.title    ?? remoteMessage.notification?.title;
  const body      = data.body     ?? remoteMessage.notification?.body;
  const imageUrl  = data.imageUrl;                   // campaign image (present on CAMPAIGN type)
  const notifType = data.notifType ?? '';
  if (title || body) {
    const channelId = SOS_NOTIF_TYPES.has(notifType) ? 'ripplehub_sos' : 'ripplehub_default';
    await displaySystemNotification(title, body, channelId, imageUrl);
  }

  // CAMPAIGN delivery acknowledgment — call after the notification renders.
  // Fire-and-forget: a missed ack is low-stakes (one row stays unconfirmed-delivered).
  if (notifType === 'CAMPAIGN' && data.campaignRecipientId) {
    notificationApi.acknowledgeDelivery(data.campaignRecipientId).catch(() => {});
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
