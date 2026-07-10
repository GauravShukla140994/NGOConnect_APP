/**
 * NGO Connect App
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import AppConfig from './src/config/AppConfig';

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

export default App;
