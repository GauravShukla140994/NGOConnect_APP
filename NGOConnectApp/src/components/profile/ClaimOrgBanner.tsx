import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { unclaimedApi } from '../../api/unclaimed.api';
import type { UnclaimedMatch } from '../../types/api.types';

const C = AppConfig.COLORS;
const R = AppConfig.RADIUS;

/**
 * "Claim Your Organisation" — shown on Edit Profile only when the signed-in number appears on an imported listing.
 * Tapping opens Create Organisation pre-filled from the listing; submitting it creates a claim for admin review
 * (never an automatic ownership transfer). Fails silently: no matches / network error → renders nothing.
 */
export default function ClaimOrgBanner() {
  const nav = useNavigation<any>();
  const [items, setItems] = useState<UnclaimedMatch[]>([]);

  useEffect(() => {
    let alive = true;
    unclaimedApi.getMyMatches()
      .then(res => { if (alive && res.data?.isSuccess === 1) setItems(res.data.data?.items ?? []); })
      .catch(() => { /* optional feature — ignore */ });
    return () => { alive = false; };
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Claim Your Organisation</Text>
      <Text style={styles.sub}>
        {items.length === 1
          ? 'We found an organisation listed with your mobile number. Claim it to manage its profile.'
          : 'We found organisations listed with your mobile number. Claim the ones you manage.'}
      </Text>
      {items.map(m => (
        <View key={m.listingToken} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>{m.organisationName}</Text>
            <Text style={styles.place} numberOfLines={1}>{[m.district, m.state].filter(Boolean).join(', ')}</Text>
          </View>
          {m.hasPendingClaim ? (
            <Text style={styles.pending}>Claim under review</Text>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
              onPress={() => nav.navigate('CreateOrg', { claimListing: m })}
              accessibilityLabel={`Claim ${m.organisationName}`}
            >
              <Text style={styles.btnText}>Claim</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { backgroundColor: C.PRIMARY_LIGHT, borderRadius: R.CARD, padding: 14, marginBottom: 16, ...AppConfig.SHADOW.CARD_SM },
  title:    { fontSize: 15, fontWeight: '700', color: C.TEXT },
  sub:      { fontSize: 12, color: C.TEXT2, marginTop: 4, marginBottom: 8 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.BORDER },
  name:     { fontSize: 14, fontWeight: '600', color: C.TEXT },
  place:    { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  btn:      { backgroundColor: C.PRIMARY, borderRadius: R.BTN, paddingVertical: 9, paddingHorizontal: 18 },
  btnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  pending:  { fontSize: 12, color: C.TEXT2, fontWeight: '600' },
});
