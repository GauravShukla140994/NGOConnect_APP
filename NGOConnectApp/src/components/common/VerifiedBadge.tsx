/**
 * VerifiedBadge — Twitter-style blue verified checkmark.
 *
 * Uses react-native-svg (already installed) so it renders
 * pixel-identically on both iOS and Android.
 *
 * Usage:
 *   <VerifiedBadge />            — default 14 px
 *   <VerifiedBadge size={16} />  — any size
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface Props {
  size?: number;
}

const VerifiedBadge: React.FC<Props> = ({ size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Blue filled circle */}
    <Circle cx="12" cy="12" r="12" fill="#1D9BF0" />
    {/* White checkmark — same proportions as Twitter/X badge */}
    <Path
      d="M6.5 12.5 L10 16 L17.5 8.5"
      stroke="#FFFFFF"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default VerifiedBadge;
