/**
 * OrgAvatar — shared avatar for the donation module (and beyond).
 * Shows the org logo image if available; falls back to coloured initials on
 * load error or when no URL is provided.
 */
import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';

const AVATAR_COLORS = ['#6C47FF', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export const orgAvatarColor = (orgId: number) =>
  AVATAR_COLORS[Math.abs(orgId) % AVATAR_COLORS.length];

export const orgInitials = (name: string) =>
  (name ?? 'N').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

interface OrgAvatarProps {
  orgId:     number;
  orgName:   string;
  logoUrl?:  string | null;
  size?:     number;
  radius?:   number;
  fontSize?: number;
}

const OrgAvatar: React.FC<OrgAvatarProps> = ({
  orgId,
  orgName,
  logoUrl,
  size    = 42,
  radius,
  fontSize,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const borderRadius = radius ?? size / 2;
  const fs           = fontSize ?? Math.round(size * 0.33);
  const bg           = orgAvatarColor(orgId);
  const txt          = orgInitials(orgName);

  const containerStyle = {
    width: size, height: size, borderRadius,
    backgroundColor: bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    flexShrink: 0 as const,
  };

  if (logoUrl && !imgFailed) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text style={{ fontSize: fs, fontWeight: '800', color: '#fff' }}>{txt}</Text>
    </View>
  );
};

export default OrgAvatar;
