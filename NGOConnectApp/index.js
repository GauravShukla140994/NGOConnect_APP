/**
 * @format
 */

import * as Sentry from '@sentry/react-native';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';
import AppConfig from './src/config/AppConfig';
import { navigationIntegration } from './src/config/sentry';

// ── FCM: Background / Quit-state message handler ─────────────────────────────
// MUST be registered here (outside React), before AppRegistry.
// For notification-type messages (title+body set on backend), Android/iOS shows
// the system banner automatically — this handler runs any extra JS logic.
// For data-only messages, this is required to process the payload at all.
messaging().setBackgroundMessageHandler(async (_remoteMessage) => {
  // No-op: the native FCM SDK auto-displays the notification banner.
  // Add custom logic here if you need background data processing.
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
