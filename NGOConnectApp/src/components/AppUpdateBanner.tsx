/**
 * AppUpdateBanner
 *
 * A non-blocking top banner shown when a newer app version is available on the
 * App Store or Play Store.  Matches the style of the notification nudge banner
 * (NotificationPermissionModal) but sits at a higher z-index so it always
 * appears above the notification nudge when both are visible.
 *
 * Behaviour:
 *   - Tapping "Update" opens the store listing and dismisses the banner
 *   - Tapping ✕ dismisses for the current session only (reappears next launch)
 *   - Renders nothing when visible=false
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible:   boolean;
  onUpdate:  () => void;  // opens store + dismisses
  onDismiss: () => void;  // dismiss this session
}

export default function AppUpdateBanner({ visible, onUpdate, onDismiss }: Props) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View style={[s.banner, { top: insets.top + 8 }]}>
      {/* Icon + message */}
      <Text style={s.icon}>🔄</Text>
      <Text style={s.text} numberOfLines={2}>
        New version available — update for the latest features &amp; fixes.
      </Text>

      {/* Update CTA */}
      <TouchableOpacity onPress={onUpdate} style={s.updateBtn} activeOpacity={0.85}>
        <Text style={s.updateBtnText}>Update</Text>
      </TouchableOpacity>

      {/* Dismiss */}
      <TouchableOpacity onPress={onDismiss} style={s.closeBtn} activeOpacity={0.7}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  banner: {
    position:          'absolute',
    left:              12,
    right:             12,
    // Higher than notification nudge (999) so update bar always sits on top
    zIndex:            1000,
    elevation:         10,           // Android shadow layer
    backgroundColor:   '#1a3a2e',   // deep green — visually distinct from notif nudge (dark navy)
    borderRadius:      10,
    paddingVertical:   10,
    paddingHorizontal: 12,
    flexDirection:     'row',
    alignItems:        'center',
    shadowColor:       '#000',
    shadowOpacity:     0.25,
    shadowOffset:      { width: 0, height: 2 },
    shadowRadius:      6,
  },
  icon: {
    fontSize: 16,
    marginRight: 6,
  },
  text: {
    flex:       1,
    color:      '#fff',
    fontSize:   12,
    lineHeight: 17,
  },
  updateBtn: {
    backgroundColor:  '#2ecc71',
    borderRadius:     6,
    paddingHorizontal: 10,
    paddingVertical:   5,
    marginLeft:        8,
  },
  updateBtnText: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical:   4,
    marginLeft:        4,
  },
  closeText: {
    color:    '#aaa',
    fontSize: 14,
  },
});
