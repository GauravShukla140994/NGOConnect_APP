import React, { useEffect, useRef } from 'react';
import { Linking, NavigationContainerRef, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle, EventType } from '@notifee/react-native';
import { useAuthStore } from '../store/authStore';
import { navigationIntegration } from '../config/sentry';
import { pendingInviteStore } from '../store/pendingInviteStore';
import { pendingDeepLinkStore } from '../store/pendingDeepLinkStore';
import { shareApi } from '../api/share.api';
import { notificationApi } from '../api/notification.api';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import NotificationPermissionModal from '../components/NotificationPermissionModal';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';

const Stack = createNativeStackNavigator();

// SOS types that route to the urgent channel (alarm sound + triple vibration)
// Matches MainApplication.kt "ripplehub_sos" channel.
// SOS_RESOLVED goes on the default channel — it's a relief notification, not urgent.
// SOS_RESPONDER_INCOMING → victim needs urgent alert so they can approve/deny in time.
const SOS_NOTIF_TYPES = new Set(['SOS_TRIGGERED', 'SOS_RESPONDER_INCOMING', 'SOS_RESPONDER_APPROVED']);

// ─────────────────────────────────────────────────────────────────────────────
// Deep-link routing: notifType → { screen, params }
// ─────────────────────────────────────────────────────────────────────────────
type NotifData = {
  notifType?:            string;
  refId?:                string;
  refType?:              string;
  // CAMPAIGN extras — set by backend's Marketing & Communication Center
  deepLink?:             string;   // ngoconnect:// or https:// URL to open on tap
  actionLabel?:          string;   // CTA label ("Donate Now" etc.) passed as nav param
  campaignRecipientId?:  string;   // delivery ack ID — POST /campaign-recipients/{id}/delivered
};

function resolveScreen(data: NotifData): { screen: string; params?: object } | null {
  const refId = data.refId ? parseInt(data.refId, 10) : undefined;
  switch (data.notifType) {
    case 'NEW_PROJECT':
      return refId ? { screen: 'ProjectDetail', params: { projectId: refId } } : { screen: 'AllOpportunities' };
    // Sent to the volunteer applicant
    case 'APPLICATION_APPROVED':
    case 'APPLICATION_REJECTED':
    case 'NO_SHOW_EXCUSED':
      return { screen: 'MyProjects' };
    // Sent to org admins — open the specific project's participants list (Applied tab)
    case 'NEW_APPLICATION':
      return refId ? { screen: 'Participants', params: { projectId: refId } } : { screen: 'AdminProjects' };
    case 'MEMBERSHIP_REQUEST':
    case 'MEMBERSHIP_APPROVED':
    case 'MEMBERSHIP_REJECTED':
    case 'MEMBER_REMOVED':
    case 'MEMBER_ROLE_CHANGED':
    case 'ORG_APPROVED':
    case 'ORG_REJECTED':
    case 'ORG_SUSPENDED':
    case 'ORG_REACTIVATED':
    case 'ORG_PROFILE_VERIFIED':
    case 'ORG_PROFILE_REJECTED':
    case 'INVITE_ACCEPTED':
    case 'INVITE_DECLINED':
      return { screen: 'MyOrgs' };
    case 'SOS_TRIGGERED':
    case 'SOS_RESPONDER_APPROVED':
    case 'SOS_RESOLVED':
      return refId ? { screen: 'SosActive', params: { sosIncidentId: refId } } : null;
    // Victim-only: responder offered help → victim must approve/decline.
    // Must pass isVictim: true so SosActiveScreen shows the Approve/Decline buttons.
    case 'SOS_RESPONDER_INCOMING':
      return refId ? { screen: 'SosActive', params: { sosIncidentId: refId, isVictim: true } } : null;
    case 'DONATION_CONFIRMED':
      return { screen: 'MyDonations' };
    case 'DONATION_RECEIVED_ADMIN':
      return { screen: 'AdminDonations' };
    case 'WITHDRAWAL_APPROVED':
    case 'WITHDRAWAL_REJECTED':
      return { screen: 'AdminWithdrawal' };
    case 'NEW_FEED_POST':
      return { screen: 'Home' };
    case 'POST_LIKED':
    case 'POST_COMMENTED':
    case 'POST_REPORTED':
      return refId
        ? { screen: 'Home', params: { focusPostId: refId } }
        : { screen: 'Home' };
    // Sent to org admins — open Posts tab filtered to Reported sub-tab
    case 'POST_REPORTED_ADMIN':
      return { screen: 'AdminVolunteers', params: { initialTab: 'posts', initialPostsTab: 'reported' } };
    // CAMPAIGN: if deepLink is present the caller handles it before resolveScreen.
    // This fallback fires only when there is no deepLink.
    case 'CAMPAIGN':
      return { screen: 'Notifications' };
    case 'COMMUNITY_POST':
    case 'NEW_POLL':
      return { screen: 'Community' };
    case 'COMMUNITY_POST_LIKED':
    case 'COMMUNITY_POST_COMMENTED':
      return refId
        ? { screen: 'Community', params: { focusCommunityPostId: refId } }
        : { screen: 'Community' };
    case 'BADGE_AWARDED':
    case 'SKILL_RATING':
      // refId = projectId — open the project directly; fall back to Impact tab
      return refId
        ? { screen: 'ProjectDetail', params: { projectId: refId } }
        : { screen: 'Impact' };
    case 'PROFILE_VERIFIED':
      return { screen: 'Impact' };
    case 'PROFILE_UPDATE_REQUIRED':
    case 'ACCOUNT_SUSPENDED':
    case 'ACCOUNT_REACTIVATED':
      return { screen: 'Profile' };
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep-link parsers
// Handles both custom scheme and universal link, e.g.:
//   ngoconnect://invite/TOKEN           → InviteAccept  (invite token, always random string)
//   ngoconnect://ngo/42                 → NgoProfile    (legacy numeric ID — backward compat)
//   ngoconnect://ngo/abc123...          → NgoProfile    (encrypted share token — v4.9+)
//   ngoconnect://opportunity/7          → ProjectDetail (legacy numeric ID)
//   ngoconnect://opportunity/abc123...  → ProjectDetail (encrypted share token)
//   https://ripplehub.app/invite/TOKEN
//   https://ripplehub.app/ngo/42
//   https://ripplehub.app/ngo/abc123...
//   https://ripplehub.app/opportunity/7
//   https://ripplehub.app/opportunity/abc123...
//
// v4.9: Shared URLs now use AES-256-GCM encrypted tokens instead of raw numeric IDs.
//       Legacy numeric-ID links are still handled for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

type OrgLinkResult     = { orgId: number } | { token: string } | null;
type ProjectLinkResult = { projectId: number } | { token: string } | null;

function extractInviteToken(url: string): string | null {
  const m = url.match(/\/invite\/([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

function extractOrgLink(url: string): OrgLinkResult {
  // Matches /ngo/ followed by digits (legacy) OR URL-safe Base64 chars (encrypted token)
  const m = url.match(/\/ngo\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const part = m[1];
  // Pure digits = legacy numeric orgId
  if (/^\d+$/.test(part)) return { orgId: parseInt(part, 10) };
  // Otherwise it's an encrypted share token (must be ≥ 20 chars to avoid false positives)
  if (part.length >= 20) return { token: part };
  return null;
}

function extractProjectLink(url: string): ProjectLinkResult {
  const m = url.match(/\/opportunity\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const part = m[1];
  if (/^\d+$/.test(part)) return { projectId: parseInt(part, 10) };
  if (part.length >= 20) return { token: part };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
const RootNavigator = () => {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const loadProfile     = useAuthStore(state => state.loadProfile);
  const navRef          = useRef<NavigationContainerRef<any>>(null);

  const {
    permState,
    requestPermission,
    dismissRationale,
    openSettings,
    dismissNudge,
  } = useNotificationPermission(isAuthenticated);

  // Load profile on auth state change
  useEffect(() => {
    if (isAuthenticated) { loadProfile(); }
  }, [isAuthenticated]);

  // ── Deep link router — handles invite, ngo profile, project ──────────
  const handleDeepLink = (url: string) => {
    // 1. Invite link (always a random opaque token — no change needed)
    const inviteToken = extractInviteToken(url);
    if (inviteToken) {
      if (isAuthenticated) {
        setTimeout(() => {
          navRef.current?.navigate('InviteAccept' as never, { token: inviteToken } as never);
        }, 400);
      } else {
        pendingInviteStore.set(inviteToken);
      }
      return;
    }

    // 2. NGO profile link: /ngo/{orgId|token}
    const orgLink = extractOrgLink(url);
    if (orgLink) {
      if (isAuthenticated) {
        if ('orgId' in orgLink) {
          // Legacy numeric ID — navigate directly
          setTimeout(() => {
            navRef.current?.navigate('NgoProfile' as never, { orgId: orgLink.orgId } as never);
          }, 400);
        } else {
          // Encrypted token — resolve via public API then navigate
          shareApi.resolveToken(orgLink.token).then(res => {
            const data = res.data?.data;
            if (data?.entityType === 'ORG' && data.entityId > 0) {
              setTimeout(() => {
                navRef.current?.navigate('NgoProfile' as never, { orgId: data.entityId } as never);
              }, 400);
            }
          }).catch(() => { /* silent — invalid token, ignore */ });
        }
      } else {
        // Store for post-login resolution
        if ('orgId' in orgLink) {
          pendingDeepLinkStore.set({ type: 'ngo', id: orgLink.orgId });
        } else {
          pendingDeepLinkStore.set({ type: 'ngo', token: orgLink.token });
        }
      }
      return;
    }

    // 3. Project / opportunity link: /opportunity/{projectId|token}
    const projectLink = extractProjectLink(url);
    if (projectLink) {
      if (isAuthenticated) {
        if ('projectId' in projectLink) {
          setTimeout(() => {
            navRef.current?.navigate('ProjectDetail' as never, { projectId: projectLink.projectId } as never);
          }, 400);
        } else {
          shareApi.resolveToken(projectLink.token).then(res => {
            const data = res.data?.data;
            if (data?.entityType === 'OPP' && data.entityId > 0) {
              setTimeout(() => {
                navRef.current?.navigate('ProjectDetail' as never, { projectId: data.entityId } as never);
              }, 400);
            }
          }).catch(() => { /* silent */ });
        }
      } else {
        if ('projectId' in projectLink) {
          pendingDeepLinkStore.set({ type: 'project', id: projectLink.projectId });
        } else {
          pendingDeepLinkStore.set({ type: 'project', token: projectLink.token });
        }
      }
    }
  };

  // Cold start: app launched directly from a deep link
  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) { handleDeepLink(url); }
    });
  }, []);

  // Warm start: link tapped while app is running
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [isAuthenticated]);

  // After login: flush any pending deep link stored before login
  useEffect(() => {
    if (!isAuthenticated) { return; }

    // Pending invite
    const token = pendingInviteStore.get();
    if (token) {
      pendingInviteStore.clear();
      setTimeout(() => {
        navRef.current?.navigate('InviteAccept' as never, { token } as never);
      }, 600);
      return;
    }

    // Pending NGO / Project — may be a legacy numeric ID or an encrypted token (v4.9+)
    const pending = pendingDeepLinkStore.get();
    if (!pending) { return; }
    pendingDeepLinkStore.clear();

    if ('id' in pending) {
      // Legacy numeric ID path — navigate directly
      setTimeout(() => {
        if (pending.type === 'ngo') {
          navRef.current?.navigate('NgoProfile' as never, { orgId: pending.id } as never);
        } else if (pending.type === 'project') {
          navRef.current?.navigate('ProjectDetail' as never, { projectId: pending.id } as never);
        }
      }, 600);
    } else {
      // Encrypted token path — resolve via public API then navigate
      shareApi.resolveToken(pending.token).then(res => {
        const data = res.data?.data;
        if (!data) return;
        setTimeout(() => {
          if (data.entityType === 'ORG' && data.entityId > 0) {
            navRef.current?.navigate('NgoProfile' as never, { orgId: data.entityId } as never);
          } else if (data.entityType === 'OPP' && data.entityId > 0) {
            navRef.current?.navigate('ProjectDetail' as never, { projectId: data.entityId } as never);
          }
        }, 600);
      }).catch(() => { /* invalid token — drop silently */ });
    }
  }, [isAuthenticated]);

  // Always-current ref so the FCM/notifee tap effects ([] dep array) can call
  // handleDeepLink without stale-closure issues.
  const handleDeepLinkRef = useRef(handleDeepLink);
  handleDeepLinkRef.current = handleDeepLink;

  // ── FCM: permission + token registration handled by useNotificationPermission ─

  // ── FCM: foreground messages → real system notification via notifee ────
  // FCM does NOT auto-show a system banner when app is in the foreground.
  // notifee.displayNotification() sends it to the notification panel exactly
  // like WhatsApp / Instagram foreground notifications.
  useEffect(() => {
    if (!isAuthenticated) { return; }
    const unsub = messaging().onMessage(async (remoteMessage) => {
      // Backend sends data-only on Android: title/body/imageUrl are in remoteMessage.data.
      // Fallback to notification fields covers iOS and any legacy sends.
      const title    = (remoteMessage.data?.title    as string | undefined) ?? remoteMessage.notification?.title ?? 'RippleHub';
      const body     = (remoteMessage.data?.body     as string | undefined) ?? remoteMessage.notification?.body  ?? '';
      const imageUrl = (remoteMessage.data?.imageUrl as string | undefined) ?? (remoteMessage.notification as any)?.android?.imageUrl;
      if (!body) { return; }

      const data      = (remoteMessage.data ?? {}) as NotifData;
      const channelId = SOS_NOTIF_TYPES.has(data.notifType ?? '')
        ? 'ripplehub_sos'       // alarm sound + triple vibration for active SOS
        : 'ripplehub_default';  // standard sound + double vibration for everything else

      try {
        await notifee.displayNotification({
          title,
          body,
          data: data as Record<string, string>,   // passed through to press handler
          android: {
            channelId,
            importance:    AndroidImportance.HIGH,
            pressAction:   { id: 'default' },       // tapping opens the app
            smallIcon:     'ic_notification',       // monochrome status-bar icon — must exist in every drawable-*dpi (no fallback if missing, see index.js note)
            ...(imageUrl ? { largeIcon: imageUrl } : {}),  // small thumbnail, shown collapsed AND expanded
            // Full-width banner image on expand (Instagram/WhatsApp-style) — this was
            // never implemented before; largeIcon alone only ever gives the small
            // thumbnail, which is why images looked "not showing" even when expanded.
            ...(imageUrl ? { style: { type: AndroidStyle.BIGPICTURE, picture: imageUrl } } : {}),
            showTimestamp: true,
            when:          Date.now(),              // precise delivery time — fixes frozen "03/01/01" date
          },
        });
      } catch (err) {
        // If this throws (e.g. a missing drawable resource), the notification silently never
        // appears with no visible error — log it instead of letting it disappear.
        console.error('[Foreground] displayNotification failed:', err);
        return;
      }

      // CAMPAIGN delivery acknowledgment — fire-and-forget after the notification renders.
      // Only for CAMPAIGN type; other types don't have/need this endpoint.
      if (data.notifType === 'CAMPAIGN' && data.campaignRecipientId) {
        notificationApi.acknowledgeDelivery(data.campaignRecipientId).catch(() => {});
      }
    });
    return unsub;
  }, [isAuthenticated]);

  // ── Notifee: notification tapped while app is in foreground ────────────
  // When the user taps a notifee-displayed notification, navigate to the
  // right screen using the same resolveScreen logic as background taps.
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        const data = (detail.notification?.data ?? {}) as NotifData;
        // CAMPAIGN with deepLink: route through the deep-link handler
        if (data.notifType === 'CAMPAIGN' && data.deepLink) {
          handleDeepLinkRef.current(data.deepLink);
          return;
        }
        const target = resolveScreen(data);
        if (target && navRef.current) {
          // For CAMPAIGN with no deepLink, pass actionLabel so the destination
          // screen can render an in-app CTA banner (e.g. "Donate Now").
          const extra = data.notifType === 'CAMPAIGN' && data.actionLabel
            ? { actionLabel: data.actionLabel } : {};
          navRef.current.navigate(target.screen as never, { ...(target.params ?? {}), ...extra } as never);
        }
      }
    });
    return unsub;
  }, []);

  // ── FCM: background/quit tap → deep link ───────────────────────────────
  useEffect(() => {
    // App was in background
    const unsubBg = messaging().onNotificationOpenedApp((msg) => {
      const data = (msg.data ?? {}) as NotifData;
      if (data.notifType === 'CAMPAIGN' && data.deepLink) {
        handleDeepLinkRef.current(data.deepLink);
        return;
      }
      const target = resolveScreen(data);
      if (target && navRef.current) {
        const extra = data.notifType === 'CAMPAIGN' && data.actionLabel
          ? { actionLabel: data.actionLabel } : {};
        navRef.current.navigate(target.screen as never, { ...(target.params ?? {}), ...extra } as never);
      }
    });

    // App was quit (cold start)
    messaging().getInitialNotification().then((msg) => {
      if (!msg) { return; }
      const data = (msg.data ?? {}) as NotifData;
      if (data.notifType === 'CAMPAIGN' && data.deepLink) {
        setTimeout(() => handleDeepLinkRef.current(data.deepLink!), 600);
        return;
      }
      const target = resolveScreen(data);
      if (target && navRef.current) {
        const extra = data.notifType === 'CAMPAIGN' && data.actionLabel
          ? { actionLabel: data.actionLabel } : {};
        setTimeout(() => {
          navRef.current?.navigate(target.screen as never, { ...(target.params ?? {}), ...extra } as never);
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

      {/* Notification permission rationale modal + denied nudge banner */}
      <NotificationPermissionModal
        permState={permState}
        onAllow={requestPermission}
        onNotNow={dismissRationale}
        onOpenSettings={openSettings}
        onDismissNudge={dismissNudge}
      />
    </NavigationContainer>
  );
};

export default RootNavigator;
