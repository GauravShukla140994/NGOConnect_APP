import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

/**
 * Paper-plane "share / send" icon drawn with react-native-svg.
 * Stroke-only — renders pixel-identical on iOS and Android.
 * Default size matches the 22pt emoji icons used in the feed action row.
 *
 * Shape: classic Telegram-style paper plane pointing upper-right,
 * with a fold crease from the nose back to the tail.
 */
const ShareIcon: React.FC<Props> = ({ size = 22, color = '#555555' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Outer triangle + fold crease — single compound path */}
    <Path
      d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default ShareIcon;
