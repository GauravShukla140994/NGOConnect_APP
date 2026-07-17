/**
 * NGO Connect App
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import AppConfig from './src/config/AppConfig';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://6b540ace7ba29887cce0d760d1d0948d@o4511746239430656.ingest.de.sentry.io/4511746349400144',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle='dark-content'
        backgroundColor={AppConfig.COLORS.CARD}
        translucent={false}
      />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
