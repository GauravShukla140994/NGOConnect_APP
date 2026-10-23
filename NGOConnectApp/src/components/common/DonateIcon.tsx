import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

/**
 * Heart-with-rupee-coin donation icon drawn with react-native-svg.
 * Stroke-only — renders pixel-identical on iOS and Android.
 * Matches the style of ShareIcon used in the action row.
 *
 * Shape: a heart outline (left-shifted slightly) with a small coin circle
 * overlapping the lower-right, containing a ₹ / $ currency glyph.
 */
const DonateIcon: React.FC<Props> = ({ size = 20, color = '#808080' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Heart outline — centred slightly left to leave room for coin */}
    <Path
      d="M11 20s-8-5.5-8-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 2.5-1.5 4.9-3.5 7"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Coin circle — lower right */}
    <Circle
      cx="17"
      cy="18"
      r="4"
      stroke={color}
      strokeWidth="1.6"
    />
    {/* Rupee ₹ tick marks inside coin */}
    <Path
      d="M15.5 16.5h3M15.5 18h3M17 16.5v3.5"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </Svg>
);

export default DonateIcon;
