/**
 * @format
 */

import * as Sentry from '@sentry/react-native';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import AppConfig from './src/config/AppConfig';
import { navigationIntegration } from './src/config/sentry';

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
