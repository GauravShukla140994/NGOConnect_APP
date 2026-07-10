import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { getMyOrgs } from '../../api/user.api';
import { useAuthStore } from '../../store/authStore';
import type { Organisation } from '../../types/api.types';

const C = AppConfig.COLORS;

// Deterministic color per org based on name
const ORG_COLORS = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#D97706', '#16A34A', '#7C3AED'];
function orgColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % ORG_COLORS.length;
  return ORG_COLORS[Math.abs(h)];
}

function initials(name: string) {
  return (name ?? 'NG').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatJoinDate(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  } catch { return ''; }
}

/* ─── Org Row Card ─────────────────────────────────────────────────────────── */
function OrgCard({
  org, isAdmin, isPending, onPress,
}: {
  org: Organisation;
  isAdmin: boolean;
  isPending: boolean;
  onPress: () => void;
}) {
  const name     = org.orgName ?? org.name ?? 'NGO';
  const color    = orgColor(name);
  const joinDate = formatJoinDate(org.joinedAt);
  const role     = (org as any).role ?? org.myRole ?? (isAdmin ? 'Admin' : 'Member');
  const count    = org.memberCount ? `${org.memberCount.toLocaleString('en-IN')} members` : '';
  const meta     = [role, count, joinDate].filter(Boolean).join(' · ');

  // Distinguish: org awaiting approval (founder) vs join request pending (member)
  const isOrgPending = org.orgStatusCode === 'PENDING';
  const pillLabel    = isPending
    ? (isOrgPending ? 'Awaiting Approval' : 'Request Pending')
    : (isAdmin ? 'Admin' : 'Active');

  return (
    <TouchableOpacity
      style={[styles.orgCard, isAdmin && !isPending && styles.orgCardAdmin]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={`${name} — ${role}`}
    >
      {/* Avatar */}
      <View style={[styles.orgAvatar, { backgroundColor: color }]}>
        <Text style={styles.orgAvatarText}>{initials(name)}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={styles.orgName} numberOfLines={1}>{name}</Text>
        <Text style={styles.orgMeta} numberOfLines={1}>{meta}</Text>
      </View>

      {/* Status pill */}
      {isPending ? (
        <View style={styles.pillPending}>
          <Text style={styles.pillPendingText}>{pillLabel}</Text>
        </View>
      ) : (
        <View style={[styles.pillActive, isAdmin && styles.pillAdmin]}>
          <Text style={[styles.pillActiveText, isAdmin && styles.pillAdminText]}>
            {pillLabel}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ─── Main Screen ──────────────────────────────────────────────────────────── */
export default function MyOrgsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [orgs,       setOrgs]       = useState<Organisation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getMyOrgs();
      console.log('[MyOrgs] raw response:', JSON.stringify(res.data, null, 2));
      if (res.data?.isSuccess) {
        const data = res.data.data ?? [];
        console.log('[MyOrgs] orgs count:', data.length);
        if (data.length > 0) {
          console.log('[MyOrgs] first org fields:', JSON.stringify(data[0]));
        }
        setOrgs(data);
      } else {
        setError(res.data?.message ?? 'Failed to load organizations.');
      }
    } catch (e: any) {
      console.error('[MyOrgs] error:', e?.message, e?.response?.status);
      setError('Could not connect. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // Partition:
  // activeOrgs  — APPROVED member + org is not PENDING (fully active)
  // pendingOrgs — PENDING join request OR founder whose org is awaiting approval
  const activeOrgs  = orgs.filter(o =>
    o.memberStatusCode === 'APPROVED' && (o.orgStatusCode ?? 'ACTIVE') !== 'PENDING'
  );
  const pendingOrgs = orgs.filter(o =>
    o.memberStatusCode === 'PENDING' ||
    (o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'PENDING')
  );

  const userInitials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || 'ME';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{userInitials}</Text>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
        contentContainerStyle={[{   paddingBottom: 40  }, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>My Organizations</Text>
          <Text style={styles.subtitle}>Manage your memberships</Text>
        </View>

        {/* Create New Organization CTA */}
        <View style={styles.section}>
          <Pressable
            style={styles.createCard}
            onPress={() => nav.navigate('CreateOrg')}
            android_ripple={{ color: 'rgba(107,78,255,0.08)', borderless: false }}
            accessibilityLabel="Create new organization"
          >
            <View style={styles.createIcon}>
              <Text style={{ fontSize: 22, color: '#fff', fontWeight: '700', lineHeight: 28 }}>+</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.createTitle}>Create New Organization</Text>
              <Text style={styles.createSub}>Register a new NGO and become a founder</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ margin: 40 }} size="large" color={C.PRIMARY} />
        ) : error ? (
          <View style={styles.centeredMsg}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Linked Organizations */}
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Linked Organizations</Text>
                {activeOrgs.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{activeOrgs.length}</Text>
                  </View>
                )}
              </View>

              {activeOrgs.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>You haven't joined any organizations yet.</Text>
                </View>
              ) : (
                <View style={styles.cardGroup}>
                  {activeOrgs.map(org => (
                    <OrgCard
                      key={org.orgId}
                      org={org}
                      isAdmin={((org as any).roleCode ?? org.myRoleCode ?? '').toUpperCase() === 'ADMIN'}
                      isPending={false}
                      onPress={() => nav.navigate('NgoProfile', { orgId: org.orgId })}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* Pending Requests */}
            {pendingOrgs.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Pending Requests</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{pendingOrgs.length}</Text>
                  </View>
                </View>
                <View style={styles.cardGroup}>
                  {pendingOrgs.map(org => (
                    <OrgCard
                      key={org.orgId}
                      org={org}
                      isAdmin={false}
                      isPending={true}
                      onPress={() => nav.navigate('NgoProfile', { orgId: org.orgId })}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Info tip */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 You can be a member of multiple organizations. Switch between them from your home screen.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.BG },

  // Header
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:           { paddingVertical: 4 },
  backText:          { fontSize: 15, color: C.TEXT, fontWeight: '500' },
  headerAvatar:      { width: 34, height: 34, borderRadius: 17, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText:  { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Title
  titleBlock:        { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  title:             { fontSize: 22, fontWeight: '800', color: C.TEXT },
  subtitle:          { fontSize: 13, color: C.TEXT2, marginTop: 3 },

  // Create CTA
  createCard:        { backgroundColor: C.CARD, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  createIcon:        { width: 44, height: 44, borderRadius: 22, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  createTitle:       { fontSize: 15, fontWeight: '700', color: C.TEXT },
  createSub:         { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  chevron:           { fontSize: 20, color: C.TEXT3, fontWeight: '600' },

  // Sections
  section:           { paddingHorizontal: 16, paddingTop: 20 },
  sectionRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle:      { fontSize: 15, fontWeight: '700', color: C.TEXT },
  countBadge:        { backgroundColor: C.PRIMARY, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  countBadgeText:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Org card group
  cardGroup:         { gap: 8 },
  orgCard:           { backgroundColor: C.CARD, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  orgCardAdmin:      { borderWidth: 1.5, borderColor: C.PRIMARY },
  orgAvatar:         { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  orgAvatarText:     { color: '#fff', fontSize: 15, fontWeight: '800' },
  orgName:           { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 3 },
  orgMeta:           { fontSize: 12, color: C.TEXT2 },

  // Status pills
  pillActive:        { backgroundColor: '#EDFAF3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillActiveText:    { fontSize: 12, fontWeight: '700', color: '#16A34A' },
  pillAdmin:         { backgroundColor: C.PRIMARY_LIGHT },
  pillAdminText:     { color: C.PRIMARY },
  pillPending:       { backgroundColor: '#FFF4EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillPendingText:   { fontSize: 12, fontWeight: '700', color: '#D97706' },

  // Empty / error
  emptyBox:          { backgroundColor: C.CARD, borderRadius: 12, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  emptyText:         { fontSize: 14, color: C.TEXT2, textAlign: 'center' },
  centeredMsg:       { alignItems: 'center', paddingTop: 40 },  errorText:         { fontSize: 14, color: C.RED, textAlign: 'center', marginBottom: 14 },
  retryBtn:          { backgroundColor: C.PRIMARY, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText:         { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Info tip
  infoBox:           { marginHorizontal: 16, marginTop: 20, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FEF08A' },
  infoText:          { fontSize: 13, color: '#92400E', lineHeight: 20 },
});
