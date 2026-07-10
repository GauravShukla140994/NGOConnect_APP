/**
 * ComposeFab — Floating Action Button for creating posts/community content.
 *
 * Matches prototype (s-home, s-community):
 *   - 56×56 purple circle, right: 16, positioned just above the bottom tab bar
 *   - Pencil/edit icon (white stroke, drawn with Views)
 *
 * Positioning note:
 *   Screens inside a Tab Navigator already have the tab bar subtracted from
 *   their usable height by React Navigation. Therefore bottom: 16 places the
 *   FAB exactly 16dp above the tab bar — no useBottomTabBarHeight() needed.
 *   Adding tabBarHeight would double-stack and push the FAB too high.
 *
 * Usage:
 *   <ComposeFab onPress={() => setShowModal(true)} />
 *
 * Must be rendered as a sibling of the scroll content OUTSIDE any ScrollView,
 * inside the same root View / SafeAreaView that fills the screen.
 */

import React from 'react';
import { Dimensions, TouchableOpacity, View, StyleSheet } from 'react-native';
import AppConfig from '../../config/AppConfig';

// Responsive FAB size: 56dp on screens ≥ 360dp wide (standard), 48dp on small screens
const { width: SCREEN_W } = Dimensions.get('window');
const FAB_SIZE  = SCREEN_W >= 360 ? 56 : 48;
const FAB_RIGHT = SCREEN_W >= 360 ? 20 : 14;

interface ComposeFabProps {
  onPress: () => void;
  accessibilityLabel?: string;
}

// ── Pencil icon ───────────────────────────────────────────────────────────────
// Matches prototype SVG: path "M4 20h4l10.5-10.5 ... v4" + line "13.5,6.5 17.5,10.5"
// Rendered without SVG library using rotated rectangles + triangle tip.
function PencilIcon() {
  return (
    <View style={icon.wrap}>
      {/* Main body — thin rotated rectangle */}
      <View style={icon.body} />
      {/* Tip — thin triangle via border trick */}
      <View style={icon.tip} />
      {/* Eraser top cap */}
      <View style={icon.cap} />
      {/* Horizontal scratch line (the detail line on pencil) */}
      <View style={icon.line} />
    </View>
  );
}

const PENCIL_COLOR = '#fff';
// Scale pencil proportionally with FAB size
const PENCIL_SCALE = FAB_SIZE / 56;

const icon = StyleSheet.create({
  wrap: {
    width: Math.round(24 * PENCIL_SCALE),
    height: Math.round(24 * PENCIL_SCALE),
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    position: 'absolute',
    width: Math.round(7 * PENCIL_SCALE),
    height: Math.round(14 * PENCIL_SCALE),
    backgroundColor: PENCIL_COLOR,
    borderRadius: 1,
    top: Math.round(2 * PENCIL_SCALE),
  },
  tip: {
    position: 'absolute',
    bottom: 1,
    width: 0,
    height: 0,
    borderLeftWidth: Math.round(3.5 * PENCIL_SCALE),
    borderRightWidth: Math.round(3.5 * PENCIL_SCALE),
    borderTopWidth: Math.round(5 * PENCIL_SCALE),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: PENCIL_COLOR,
  },
  cap: {
    position: 'absolute',
    top: 0,
    width: Math.round(9 * PENCIL_SCALE),
    height: Math.round(3 * PENCIL_SCALE),
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 1,
  },
  line: {
    position: 'absolute',
    top: Math.round(14 * PENCIL_SCALE),
    width: Math.round(7 * PENCIL_SCALE),
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});

// ── FAB ───────────────────────────────────────────────────────────────────────
export default function ComposeFab({ onPress, accessibilityLabel = 'Create new post' }: ComposeFabProps) {
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <PencilIcon />
    </TouchableOpacity>
  );
}

const C = AppConfig.COLORS;

const styles = StyleSheet.create({
  fab: {
    position:  'absolute',
    right:     FAB_RIGHT,
    bottom:    16,                  // 16dp above tab bar — screen height already excludes tab bar
    width:     FAB_SIZE,
    height:    FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: C.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    // Prototype: box-shadow 0 4px 16px rgba(107,78,255,.5)
    elevation:    8,
    shadowColor:  C.PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius:  12,
  },
});
