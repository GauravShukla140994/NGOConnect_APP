/**
 * useNotificationPermission
 *
 * Handles the full Android 13+ / iOS notification permission lifecycle:
 *   1. First launch after login → show rationale modal, then system dialog
 *   2. Permission granted → register FCM token
 *   3. Permission denied → on next launches, show a non-blocking "Enable in Settings" nudge
 *
 * State is persisted via MMKV so we only show the rationale once.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Linking, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { MMKV } from 'react-native-mmkv';
import { notificationApi } from '../api/notification.api';

const storage = new MMKV({ id: 'notif-perm' });

// Keys
const KEY_RATIONALE_SHOWN = 'rationale_shown';   // has the in-app rationale modal been shown
const KEY_SYSTEM_ASKED    = 'system_asked';       // has the OS permission dialog been triggered

export type PermissionState =
  | 'idle'           // not checked yet
  | 'show_rationale' // show in-app modal before OS dialog
  | 'show_nudge'     // previously denied — show soft "Enable in Settings" nudge
  | 'granted'        // permission granted, token registered
  | 'denied';        // denied, user chose to ignore nudge

export function useNotificationPermission(isAuthenticated: boolean) {
  const [permState, setPermState] = useState<PermissionState>('idle');
  const tokenRefreshUnsubRef = useRef<(() => void) | undefined>(undefined);

  // ── Register token + watch for refresh ─────────────────────────────────────
  const registerToken = async () => {
    try {
      const token = await messaging().getToken();
      if (token) { await notificationApi.registerDeviceToken(token); }

      // Listen for token rotation
      tokenRefreshUnsubRef.current = messaging().onTokenRefresh(async (newToken) => {
        try { await notificationApi.registerDeviceToken(newToken); } catch { /* best effort */ }
      });

      setPermState('granted');
    } catch { /* non-fatal */ }
  };

  // ── Check current permission status on (re)launch ──────────────────────────
  useEffect(() => {
    if (!isAuthenticated) { return; }

    const check = async () => {
      const current = await messaging().hasPermission();
      const granted =
        current === messaging.AuthorizationStatus.AUTHORIZED ||
        current === messaging.AuthorizationStatus.PROVISIONAL;

      if (granted) {
        // Already granted — just register/refresh token
        await registerToken();
        return;
      }

      const rationaleShown = storage.getBoolean(KEY_RATIONALE_SHOWN) ?? false;
      const systemAsked    = storage.getBoolean(KEY_SYSTEM_ASKED)    ?? false;

      if (!rationaleShown) {
        // First time: show our in-app rationale modal
        setPermState('show_rationale');
      } else if (!systemAsked) {
        // Rationale was shown but OS dialog not triggered yet (shouldn't normally happen)
        setPermState('show_rationale');
      } else {
        // OS dialog was already shown and user denied — soft nudge only
        setPermState('show_nudge');
      }
    };

    check();
    return () => { tokenRefreshUnsubRef.current?.(); };
  }, [isAuthenticated]);

  // ── Called when user taps "Allow" in our rationale modal ───────────────────
  const requestPermission = async () => {
    storage.set(KEY_RATIONALE_SHOWN, true);
    storage.set(KEY_SYSTEM_ASKED, true);

    try {
      // On Android 13+: if the permission is already DENIED (e.g. auto-blocked
      // by device policy or previously denied), requestPermission() returns
      // immediately without showing the OS dialog.  We detect this by checking
      // the status BEFORE calling requestPermission — if it is already DENIED,
      // skip the OS dialog and open App Settings directly so the user can
      // manually enable notifications.
      const currentStatus = await messaging().hasPermission();
      const alreadyDenied =
        currentStatus === messaging.AuthorizationStatus.DENIED;

      if (alreadyDenied) {
        setPermState('denied'); // close modal
        openSettings();         // go straight to App Settings
        return;
      }

      const status = await messaging().requestPermission();
      const granted =
        status === messaging.AuthorizationStatus.AUTHORIZED ||
        status === messaging.AuthorizationStatus.PROVISIONAL;

      if (granted) {
        await registerToken();
      } else {
        // OS dialog was shown but user denied it — open Settings as the next step
        // so they have a clear path to change their mind without hunting for it.
        setPermState('denied'); // close modal
        openSettings();
      }
    } catch {
      setPermState('denied');
    }
  };

  // ── Called when user taps "Not Now" in rationale modal ─────────────────────
  const dismissRationale = () => {
    storage.set(KEY_RATIONALE_SHOWN, true);
    storage.set(KEY_SYSTEM_ASKED, true);
    setPermState('show_nudge');
  };

  // ── Open system app settings (for denied users) ────────────────────────────
  // After opening Settings we watch AppState: if the user grants permission
  // and returns to the app, we re-check and register the token automatically
  // so the nudge disappears without requiring a restart.
  const openSettings = () => {
    if (Platform.OS === 'android') {
      Linking.openSettings();
    } else {
      Linking.openURL('app-settings:');
    }

    // Set up a one-shot AppState listener for when the app comes back to foreground
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        sub.remove(); // one-shot — remove immediately
        const current = await messaging().hasPermission();
        const granted =
          current === messaging.AuthorizationStatus.AUTHORIZED ||
          current === messaging.AuthorizationStatus.PROVISIONAL;
        if (granted) {
          await registerToken(); // sets permState → 'granted', nudge disappears
        }
        // If still denied, leave permState as 'denied' (nudge already dismissed)
      }
    });
  };

  // ── Dismiss the nudge banner for this session ──────────────────────────────
  const dismissNudge = () => setPermState('denied'); // 'denied' = "stop showing UI this session"

  return { permState, requestPermission, dismissRationale, openSettings, dismissNudge };
}
