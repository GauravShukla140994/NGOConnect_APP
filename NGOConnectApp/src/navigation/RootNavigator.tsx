import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import messaging from '@react-native-firebase/messaging';
import { useAuthStore } from '../store/authStore';
import { navigationIntegration } from '../config/sentry';
import { notificationApi } from '../api/notification.api';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';

const Stack = createNativeStackNavigator();

// ─────────────────────────────────────────────────────────────────────────────
// Deep-link routing: notifType → { screen, params }
// ─────────────────────────────────────────────────────────────────────────────
type NotifData = { notifType?: string; refId?: string; refType?: string };

function resolveScreen(data: NotifData): { screen: string; params?: object } | null {
  const refId = data.refId ? parseInt(data.refId, 10) : undefined;
  switch (data.notifType) {
    case 'NEW_APPLICATION':
    case 'APPLICATION_APPROVED':
    case 'APPLICATION_REJECTED':
      return { screen: 'MyProjects' };
    case 'MEMBERSHIP_REQUEST':
    case 'MEMBERSHIP_APPROVED':
    case 'MEMBERSHIP_REJECTED':
    case 'MEMBER_REMOVED':
    case 'ORG_APPROVED':
    case 'ORG_REJECTED':
    case 'ORG_SUSPENDED':
      return { screen: 'MyOrgs' };
    case 'SOS_TRIGGERED':
    case 'SOS_RESPONDER_APPROVED':
    case 'SOS_RESOLVED':
      return refId ? { screen: 'SosActive', params: { sosIncidentId: refId } } : null;
    case 'DONATION_CONFIRMED':
      return { screen: 'MyDonations' };
    case 'COMMUNITY_POST':
    case 'NEW_POLL':
      return { screen: 'Community' };
    case 'BADGE_AWARDED':
    case 'SKILL_RATING':
    case 'PROFILE_VERIFIED':
      return { screen: 'Impact' };
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const RootNavigator = () => {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const loadProfile     = useAuthStore(state => state.loadProfile);
  const navRef          = useRef<NavigationContainerRef<any>>(null);

  // Load profile on auth state change
  useEffect(() => {
    if (isAuthenticated) { loadProfile(); }
  }, [isAuthenticated]);

  // ── FCM: request permission + register token ────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) { return; }
    let tokenRefreshUnsub: (() => void) | undefined;

    const setup = async () => {
      try {
        const status = await messaging().requestPermission();
        const enabled =
          status === messaging.AuthorizationStatus.AUTHORIZED ||
          status === messaging.AuthorizationStatus.PROVISIONAL;
        if (!enabled) { return; }

        const token = await messaging().getToken();
        if (token) { await notificationApi.registerDeviceToken(token); }

        tokenRefreshUnsub = messaging().onTokenRefresh(async (newToken) => {
          try { await notificationApi.registerDeviceToken(newToken); } catch { /* best effort */ }
        });
      } catch { /* non-fatal */ }
    };

    setup();
    return () => { tokenRefreshUnsub?.(); };
  }, [isAuthenticated]);

  // ── FCM: foreground messages (silent — let notification bell refresh) ───
  useEffect(() => {
    if (!isAuthenticated) { return; }
    const unsub = messaging().onMessage(async () => {
      // foreground: no-op for now; bell badge auto-refreshes on screen focus
    });
    return unsub;
  }, [isAuthenticated]);

  // ── FCM: background/quit tap → deep link ───────────────────────────────
  useEffect(() => {
    // App was in background
    const unsubBg = messaging().onNotificationOpenedApp((msg) => {
      const target = resolveScreen((msg.data ?? {}) as NotifData);
      if (target && navRef.current) {
        navRef.current.navigate(target.screen as never, (target.params ?? {}) as never);
      }
    });

    // App was quit (cold start)
    messaging().getInitialNotification().then((msg) => {
      if (!msg) { return; }
      const target = resolveScreen((msg.data ?? {}) as NotifData);
      if (target && navRef.current) {
        setTimeout(() => {
          navRef.current?.navigate(target.screen as never, (target.params ?? {}) as never);
        }, 600);
      }
    });

    return unsubBg;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <NavigationContainer
      ref={navRef}
      onReady={() => navigationIntegration.registerNavigationContainer(navRef)}>
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
