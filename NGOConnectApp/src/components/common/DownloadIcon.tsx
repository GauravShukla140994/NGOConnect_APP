import React from 'react';
import Svg, {
  Circle, Defs, LinearGradient, Stop, Path, Rect, G, ClipPath,
} from 'react-native-svg';

/**
 * Download icon — exact match of the uploaded download-button.svg.
 * Gradient circle (purple top-left → deep-purple bottom-right) +
 * long-shadow overlay + white arrow + white tray bar.
 *
 * Platform gradient: #7B5CFF → #4B32C9 (NGO Connect primary).
 */
interface Props {
  size?: number;
}

export default function DownloadIcon({ size = 38 }: Props) {
  // Original SVG is 96×96 with circle r=40 centred at (48,48).
  // We scale to `size` via the viewBox.
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Defs>
        {/* Background gradient — top-left light purple → bottom-right deep purple */}
        <LinearGradient id="dlBg" x1="14" y1="10" x2="82" y2="86" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#7B5CFF" stopOpacity="1" />
          <Stop offset="1" stopColor="#4B32C9" stopOpacity="1" />
        </LinearGradient>

        {/* Long-shadow overlay fading toward bottom-right */}
        <LinearGradient id="dlShadow" x1="40" y1="40" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#24157A" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#24157A" stopOpacity="0" />
        </LinearGradient>

        <ClipPath id="dlClip">
          <Circle cx="48" cy="48" r="40" />
        </ClipPath>
      </Defs>

      {/* Gradient background circle */}
      <Circle cx="48" cy="48" r="40" fill="url(#dlBg)" />

      {/* Long-shadow shapes, clipped to circle */}
      <G clipPath="url(#dlClip)" fill="url(#dlShadow)">
        <Path d="M58 24 L118 84 L118 104 L129 104 L108 123 L87 104 L27 44 L38 44 L38 24 Z" />
        <Path d="M69 68 L129 128 L129 135 L87 135 L27 75 L27 68 Z" />
      </G>

      {/* White download arrow */}
      <Path d="M38 24h20v20h11L48 63 27 44h11z" fill="#FFFFFF" />

      {/* White tray bar */}
      <Rect x="27" y="68" width="42" height="7" rx="1.5" fill="#FFFFFF" />
    </Svg>
  );
}
