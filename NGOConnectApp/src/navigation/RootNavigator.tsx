import React, { useEffect } from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useAuthStore} from '../store/authStore';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';

const Stack = createNativeStackNavigator();

const RootNavigator = () => {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const loadProfile     = useAuthStore(state => state.loadProfile);

  // Load user profile whenever auth state becomes true —
  // covers both fresh OTP login and app restarts with an existing session.
  useEffect(() => {
    if (isAuthenticated) { loadProfile(); }
  }, [isAuthenticated]);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {isAuthenticated ? (
          <Stack.Screen name="App" component={AppNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
