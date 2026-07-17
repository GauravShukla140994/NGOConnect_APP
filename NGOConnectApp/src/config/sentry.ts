/**
 * sentry.ts — Sentry shared config for NGO Connect
 *
 * Why a separate file?
 * - The navigation integration instance must be created ONCE and shared between
 *   index.js (Sentry.init) and RootNavigator.tsx (registerNavigationContainer).
 * - Importing from a shared module guarantees the same object reference.
 */

import * as Sentry from '@sentry/react-native';

// Navigation integration — tracks active screen name on every crash/error.
// Must be passed to Sentry.init() AND registered on NavigationContainer.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true, // measures time to first screen render
});
