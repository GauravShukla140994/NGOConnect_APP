import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

/**
 * Donate now icon — heart outline with a circle-plus badge at lower-right.
 * Matches the uploaded donate-now-icon.svg (24×24, stroke #5A3EF0 style).
 * Used on NgoProfileScreen action row and MyDonationsScreen search bar.
 */
const DonateIcon: React.FC<Props> = ({ size = 20, color = '#808080' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Heart — partial upper arc, leaves lower-right open for the badge */}
    <Path
      d="M12 20s-7-4.4-9.4-8.8A5.3 5.3 0 0 1 12 5.6a5.3 5.3 0 0 1 9.3 4.6"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Circle-plus badge */}
    <Circle cx={18} cy={17} r={4} fill="#FFFFFF" stroke={color} strokeWidth="1.4" />
    <Path d="M18 15.2v3.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <Path d="M16.2 17h3.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export default DonateIcon;
