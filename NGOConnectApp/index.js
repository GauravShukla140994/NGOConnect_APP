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

// ── Notifee: display a system notification banner ─────────────────────────────
// Used for both foreground and background/quit cases so notifications
// always appear in the phone's notification panel.
async function displaySystemNotification(title, body) {
  // Reuse the channel already created in MainApplication.kt
  await notifee.displayNotification({
    title: title ?? 'RippleHub',
    body:  body  ?? '',
    android: {
      channelId:     'ripplehub_default',
      importance:    AndroidImportance.HIGH,
      pressAction:   { id: 'default' },   // tapping opens the app
      smallIcon:     'ic_notification',   // monochrome status-bar icon
      largeIcon:     'logo',              // brand logo in notification tray (res/drawable/logo.png)
      showTimestamp: true,
      when:          Date.now(),           // precise delivery time, not "today" date
    },
  });
}

// ── FCM: Background / Quit-state message handler ─────────────────────────────
// MUST be registered here (outside React), before AppRegistry.
// For notification messages (title+body set on backend) FCM auto-shows the
// system banner. We also call notifee to ensure it always lands in the panel.
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const title = remoteMessage.notification?.title;
  const body  = remoteMessage.notification?.body;
  if (title || body) {
    await displaySystemNotification(title, body);
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
