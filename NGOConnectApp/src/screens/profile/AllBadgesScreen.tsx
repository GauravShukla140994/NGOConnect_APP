import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { getMyBadges } from '../../api/user.api';
import type { UserBadge } from '../../types/api.types';

const C = AppConfig.COLORS;

// ─── Badge meta — matches ImpactScreen ───────────────────────────────────────

const BADGE_META: Record<string, { emoji: string; color: string }> = {
  STAR_VOL:    { emoji: '⭐', color: '#D97706' },
  TEAM_PLAYER: { emoji: '🤝', color: '#2563EB' },
  TOP_PERFORM: { emoji: '🏆', color: '#7C3AED' },
};

// ─── Badge Card ───────────────────────────────────────────────────────────────

function BadgeCard({ badge }: { badge: UserBadge }) {
  const meta = BADGE_META[badge.badgeCode] ?? { emoji: '🏅', color: '#B45309' };
  const date = badge.awardedAt
    ? new Date(badge.awardedAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <View style={[s.badgeCard, { borderLeftColor: meta.color }]}>
      <View style={[s.badgeIconWrap, { backgroundColor: meta.color + '20' }]}>
        <Text style={{ fontSize: 26 }}>{meta.emoji}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.badgeName} numberOfLines={1}>{badge.badgeName}</Text>
        {!!badge.orgName     && <Text style={s.badgeMeta} numberOfLines={1}>🏢 {badge.orgName}</Text>}
        {!!badge.projectName && <Text style={s.badgeMeta} numberOfLines={1}>📋 {badge.projectName}</Text>}
        {!!date              && <Text style={s.badgeDate}>{date}</Text>}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type RouteParams = { totalBadges?: number };

export default function AllBadgesScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();

  // Show totalBadges from ImpactScreen immediately while fetching the full list
  const hintTotal = route.params?.totalBadges;

  const [badges,  setBadges]  = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyBadges()
      .then(r => { if (r.data?.isSuccess) setBadges(r.data.data ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const count = loading ? (hintTotal ?? 0) : badges.length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} activeOpacity={0.7}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Badges Earned</Text>
        {count > 0 && (
          <View style={s.countPill}>
            <Text style={s.countPillTxt}>{count}</Text>
          </View>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={badges}
          keyExtractor={(b, i) => String(b.userBadgeId ?? i)}
          renderItem={({ item }) => <BadgeCard badge={item} />}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>🎖</Text>
              <Text style={s.emptyText}>No badges earned yet.{'\n'}Complete projects to earn your first badge!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    backgroundColor: C.CARD,
  },
  backBtn:     { padding: 4, marginRight: 8 },
  backArrow:   { fontSize: 22, color: C.TEXT, lineHeight: 26 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.TEXT },
  countPill: {
    backgroundColor: C.PRIMARY_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countPillTxt: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },

  // List
  list:   { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Badge card
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.CARD,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    ...AppConfig.SHADOW.CARD_SM,
  },
  badgeIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  badgeMeta: { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  badgeDate: { fontSize: 11, color: C.TEXT2, marginTop: 4, fontStyle: 'italic' },

  // Empty
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 22 },
});
