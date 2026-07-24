/**
 * NotificationPermissionModal
 *
 * Two states rendered by this component:
 *
 * 1. RATIONALE MODAL (show_rationale)
 *    Full-screen bottom sheet — shown ONCE before the OS permission dialog.
 *    Explains the value of notifications with examples.
 *    "Allow" → triggers system dialog.  "Not Now" → dismissed.
 *
 * 2. NUDGE BANNER (show_nudge)
 *    Subtle top banner — shown on subsequent launches when permission is denied.
 *    "Enable" → opens app Settings.  "×" → dismisses for this session.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PermissionState } from '../hooks/useNotificationPermission';

interface Props {
  permState: PermissionState;
  onAllow:        () => void;
  onNotNow:       () => void;
  onOpenSettings: () => void;
  onDismissNudge: () => void;
}

// ── Rationale Modal ───────────────────────────────────────────────────────────
function RationaleModal({ onAllow, onNotNow }: { onAllow: () => void; onNotNow: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" statusBarTranslucent>
      <View style={s.overlay}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 24 }]}>

          <View style={s.iconWrap}>
            <Text style={s.icon}>🔔</Text>
          </View>

          <Text style={s.heading}>Stay in the loop</Text>
          <Text style={s.body}>
            Enable notifications so you never miss:
          </Text>

          {[
            '✅  Application approved / rejected',
            '📢  Community announcements',
            '🏅  Badge earned & skill ratings',
            '🆘  SOS alerts from your organisation',
            '💰  Donation confirmations',
          ].map(line => (
            <Text key={line} style={s.bullet}>{line}</Text>
          ))}

          <TouchableOpacity style={s.allowBtn} onPress={onAllow} activeOpacity={0.85}>
            <Text style={s.allowBtnText}>Allow Notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.notNowBtn} onPress={onNotNow} activeOpacity={0.7}>
            <Text style={s.notNowText}>Not Now</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

// ── Nudge Banner ─────────────────────────────────────────────────────────────
function NudgeBanner({ onOpenSettings, onDismiss }: { onOpenSettings: () => void; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.nudge, { top: insets.top + 8 }]}>
      <Text style={s.nudgeText} numberOfLines={2}>
        🔔  Notifications are off — you may miss volunteer updates.
      </Text>
      <TouchableOpacity onPress={onOpenSettings} style={s.nudgeEnableBtn}>
        <Text style={s.nudgeEnableText}>Enable</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} style={s.nudgeClose}>
        <Text style={s.nudgeCloseText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function NotificationPermissionModal({
  permState,
  onAllow,
  onNotNow,
  onOpenSettings,
  onDismissNudge,
}: Props) {
  if (permState === 'show_rationale') {
    return <RationaleModal onAllow={onAllow} onNotNow={onNotNow} />;
  }
  if (permState === 'show_nudge') {
    return <NudgeBanner onOpenSettings={onOpenSettings} onDismiss={onDismissNudge} />;
  }
  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Rationale modal
  overlay:       { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 28 },
  iconWrap:      { alignItems: 'center', marginBottom: 12 },
  icon:          { fontSize: 48 },
  heading:       { fontSize: 22, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 8 },
  body:          { fontSize: 15, color: '#555', textAlign: 'center', marginBottom: 12 },
  bullet:        { fontSize: 14, color: '#333', marginBottom: 6, paddingHorizontal: 8 },
  allowBtn:      { backgroundColor: '#4C6EF5', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20, marginBottom: 10 },
  allowBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  notNowBtn:     { alignItems: 'center', paddingVertical: 8 },
  notNowText:    { color: '#888', fontSize: 14 },

  // Nudge banner
  nudge:         {
    position: 'absolute', left: 12, right: 12, zIndex: 999,
    backgroundColor: '#1a1a2e', borderRadius: 10, paddingVertical: 10,
    paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
    elevation: 6,
  },
  nudgeText:     { flex: 1, color: '#fff', fontSize: 12, lineHeight: 17 },
  nudgeEnableBtn:{ backgroundColor: '#4C6EF5', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
  nudgeEnableText:{ color: '#fff', fontSize: 12, fontWeight: '700' },
  nudgeClose:    { paddingHorizontal: 8, paddingVertical: 4, marginLeft: 4 },
  nudgeCloseText:{ color: '#aaa', fontSize: 14 },
});
