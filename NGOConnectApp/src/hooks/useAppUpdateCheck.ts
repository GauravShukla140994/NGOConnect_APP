/**
 * useAppUpdateCheck
 *
 * Checks on every app launch whether a newer version is available on the
 * App Store (iOS) or Play Store (Android) by comparing the local build version
 * against values stored in the platform's Settings table.
 *
 * Settings keys (all IsPublic = 1):
 *   APP_VERSION_IOS      — latest version string published on App Store, e.g. "1.2.0"
 *   APP_VERSION_ANDROID  — latest version string published on Play Store, e.g. "1.2"
 *   APP_STORE_URL        — iOS App Store deep-link
 *   PLAY_STORE_URL       — Android Play Store deep-link
 *
 * Behaviour:
 *   - updateAvailable: true only while NOT dismissed; returns true again on next app open
 *   - dismiss(): sets in-memory flag for this session only (no AsyncStorage / MMKV)
 *   - storeUrl: platform-correct URL to open when user taps "Update"
 *
 * Version comparison:
 *   Numeric segment-by-segment:  "1.2.0" > "1.1.9"  ✓
 *   Non-numeric strings are treated as equal to avoid spurious banners.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { settingsApi } from '../api/settings.api';
import { APP_BUILD_VERSION } from '../config/version';

// ── Version comparison helpers ────────────────────────────────────────────────

/** Parse a version string into an array of numbers.  "1.2.3" → [1, 2, 3] */
function parseVersion(v: string): number[] {
  return v
    .split('.')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

/**
 * Returns true if `remote` is strictly greater than `local`.
 * Pads the shorter array with zeros:  "1.2" vs "1.2.1" → [1,2,0] vs [1,2,1]
 */
function isRemoteNewer(local: string, remote: string): boolean {
  const loc = parseVersion(local);
  const rem = parseVersion(remote);
  const len = Math.max(loc.length, rem.length);
  for (let i = 0; i < len; i++) {
    const l = loc[i] ?? 0;
    const r = rem[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false; // equal
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface AppUpdateState {
  /** True when a newer version is available AND not dismissed this session */
  updateAvailable: boolean;
  /** Platform-correct store URL.  Empty string while loading. */
  storeUrl: string;
  /** Call this when the user taps ✕ — hides banner for the rest of this session */
  dismiss: () => void;
  /** Call this when the user taps "Update" — opens the store and dismisses */
  openStore: () => void;
}

export function useAppUpdateCheck(isAuthenticated: boolean): AppUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [storeUrl, setStoreUrl]               = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;

    const check = async () => {
      try {
        const res = await settingsApi.getPublic();
        if (!res.data?.isSuccess || !res.data.data) return;

        const settings = res.data.data;
        const get = (key: string) =>
          settings.find(s => s.settingKey === key)?.settingValue ?? '';

        const versionKey  = Platform.OS === 'ios' ? 'APP_VERSION_IOS' : 'APP_VERSION_ANDROID';
        const storeUrlKey = Platform.OS === 'ios' ? 'APP_STORE_URL'   : 'PLAY_STORE_URL';

        const remoteVersion = get(versionKey);
        const url           = get(storeUrlKey);

        if (!remoteVersion) return; // setting not yet seeded

        setStoreUrl(url);

        if (isRemoteNewer(APP_BUILD_VERSION, remoteVersion)) {
          setUpdateAvailable(true);
        }
      } catch {
        // Network failure — silently skip, not critical
      }
    };

    check();
  }, [isAuthenticated]);

  const dismiss = useCallback(() => {
    setUpdateAvailable(false);
    // Intentionally NOT persisted — reappears on next launch
  }, []);

  const openStore = useCallback(() => {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {/* best-effort */});
    }
    dismiss();
  }, [storeUrl, dismiss]);

  return { updateAvailable, storeUrl, dismiss, openStore };
}
