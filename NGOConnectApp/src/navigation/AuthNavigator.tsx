import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import SetupProfileScreen from '../screens/auth/SetupProfileScreen';
import {AuthTokens} from '../types/api.types';

export type AuthStackParamList = {
  Login: undefined;
  Otp: {recipient: string; countryCode: string; isNewUser?: boolean};
  SetupProfile: {tokens: AuthTokens};
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{headerShown: false}}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Otp" component={OtpScreen} />
    <Stack.Screen name="SetupProfile" component={SetupProfileScreen} />
  </Stack.Navigator>
);

export default AuthNavigator;
