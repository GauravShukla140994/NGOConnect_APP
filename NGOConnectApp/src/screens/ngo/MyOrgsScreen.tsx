import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { getMyOrgs, getMyDocuments } from '../../api/user.api';
import { useAuthStore } from '../../store/authStore';
import type { Organisation } from '../../types/api.types';
import ProfileIncompleteSheet from '../../components/profile/ProfileIncompleteSheet';

const C = AppConfig.COLORS;

// ── Deterministic color per org ───────────────────────────────────────────────
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
  try { return new Date(dateStr).toLocaleString('en-IN', { month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

// ── Status pill config for all 5 org statuses ────────────────────────────────
const STATUS_PILLS: Record<string, { label: string; bg: string; text: string }> = {
  APPROVED:     { label: 'Approved',     bg: '#EDFAF3', text: '#16A34A' },
  PENDING:      { label: 'Awaiting Approval', bg: '#FFF4EE', text: '#D97706' },
  UNDER_REVIEW: { label: 'Under Review', bg: '#EEF0FF', text: '#6B4EFF' },
  REJECTED:     { label: 'Rejected',     bg: '#FEF2F2', text: '#DC2626' },
  SUSPENDED:    { label: 'Suspended',    bg: '#FFF7ED', text: '#EA580C' },
};

// ── Standard org card ─────────────────────────────────────────────────────────
function OrgCard({ org, isAdmin, onPress }: {
  org: Organisation; isAdmin: boolean; onPress: () => void;
}) {
  const name      = org.orgName ?? org.name ?? 'NGO';
  const color     = orgColor(name);
  const joinDate  = formatJoinDate(org.joinedAt);
  const role      = (org as any).role ?? org.myRole ?? (isAdmin ? 'Admin' : 'Member');
  const count     = org.memberCount ? `${org.memberCount.toLocaleString('en-IN')} members` : '';
  const meta      = [role, count, joinDate].filter(Boolean).join(' · ');

  // Member's own join request still pending (org itself is fine)
  const memberPending = org.memberStatusCode === 'PENDING';
  const pill = memberPending
    ? { label: 'Request Pending', bg: '#FFF4EE', text: '#D97706' }
    : (STATUS_PILLS[org.orgStatusCode ?? ''] ?? { label: org.orgStatusCode ?? 'Active', bg: '#EDFAF3', text: '#16A34A' });

  return (
    <TouchableOpacity
      style={[styles.orgCard, isAdmin && styles.orgCardAdmin]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={`${name} — ${role}`}
    >
      {org.logoUrl || org.orgLogoUrl
        ? <Image source={{ uri: (org.logoUrl ?? org.orgLogoUrl)! }} style={styles.orgAvatar} resizeMode="cover" />
        : <View style={[styles.orgAvatar, { backgroundColor: color }]}><Text style={styles.orgAvatarText}>{initials(name)}</Text></View>
      }
      <View style={{ flex: 1 }}>
        <Text style={styles.orgName} numberOfLines={1}>{name}</Text>
        <Text style={styles.orgMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
        <Text style={[styles.statusPillText, { color: pill.text }]}>{pill.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Rejected org card (founder must fix and resubmit) ────────────────────────
function RejectedOrgCard({ org, onResubmitSuccess }: {
  org: Organisation; onResubmitSuccess: () => void;
}) {
  const nav     = useNavigation<any>();
  const name    = org.orgName ?? org.name ?? 'NGO';
  const color   = orgColor(name);
  const reason  = (org as any).rejectionReason
    ?? 'No specific reason provided. Please review your organisation details and resubmit.';

  const handleResubmit = useCallback(() => {
    nav.navigate('CreateOrg', { mode: 'resubmit', orgId: org.orgId, prefill: org });
  }, [nav, org]);

  return (
    <View style={styles.alertCard}>
      {/* Header row */}
      <View style={styles.alertCardHeader}>
        {org.logoUrl
          ? <Image source={{ uri: org.logoUrl }} style={styles.orgAvatar} resizeMode="cover" />
          : <View style={[styles.orgAvatar, { backgroundColor: color }]}><Text style={styles.orgAvatarText}>{initials(name)}</Text></View>
        }
        <View style={{ flex: 1 }}>
          <Text style={styles.orgName} numberOfLines={1}>{name}</Text>
          <View style={[styles.statusPill, { backgroundColor: '#FEF2F2', alignSelf: 'flex-start', marginTop: 4 }]}>
            <Text style={[styles.statusPillText, { color: '#DC2626' }]}>❌  Rejected</Text>
          </View>
        </View>
      </View>

      {/* Rejection reason */}
      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>Reason for rejection</Text>
        <Text style={styles.reasonText}>{reason}</Text>
      </View>

      {/* Resubmit CTA */}
      <TouchableOpacity
        style={styles.resubmitBtn}
        onPress={handleResubmit}
        activeOpacity={0.8}
      >
        <Text style={styles.resubmitBtnText}>Fix & Resubmit</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Suspended org card (read-only, contact support) ──────────────────────────
function SuspendedOrgCard({ org }: { org: Organisation }) {
  const name   = org.orgName ?? org.name ?? 'NGO';
  const color  = orgColor(name);
  const reason = org.lastRejectionReason ?? 'This organisation has been suspended by the platform.';

  return (
    <View style={[styles.alertCard, styles.alertCardSuspended]}>
      <View style={styles.alertCardHeader}>
        <View style={[styles.orgAvatar, { backgroundColor: color }]}>
          <Text style={styles.orgAvatarText}>{initials(name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.orgName} numberOfLines={1}>{name}</Text>
          <View style={[styles.statusPill, { backgroundColor: '#FFF7ED', alignSelf: 'flex-start', marginTop: 4 }]}>
            <Text style={[styles.statusPillText, { color: '#EA580C' }]}>⚠️  Suspended</Text>
          </View>
        </View>
      </View>
      <View style={[styles.reasonBox, { backgroundColor: '#FFF7ED' }]}>
        <Text style={[styles.reasonLabel, { color: '#EA580C' }]}>Reason</Text>
        <Text style={[styles.reasonText, { color: '#7C2D12' }]}>{reason}</Text>
      </View>
      <Text style={styles.suspendedNote}>
        If you believe this is an error, contact support at contactus@ripplehub.app
      </Text>
    </View>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!count && count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function MyOrgsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [orgs,       setOrgs]       = useState<Organisation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Profile gate state
  const [gateVisible,     setGateVisible]     = useState(false);
  const [gateMissing,     setGateMissing]     = useState<string[]>([]);
  const [gateTargetStep,  setGateTargetStep]  = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await getMyOrgs();
      console.log('[MyOrgs] raw response:', JSON.stringify(res.data, null, 2));
      if (res.data?.isSuccess) {
        const data = res.data.data ?? [];
        console.log('[MyOrgs] orgs count:', data.length);
        if (data.length > 0) console.log('[MyOrgs] first org:', JSON.stringify(data[0]));
        setOrgs(data);
        setError(null);
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

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const handleCreateOrg = useCallback(async () => {
    const currentUser = useAuthStore.getState().user as any;
    const missing: string[] = [];

    if (!currentUser?.firstName || !currentUser?.lastName) missing.push('Full name');
    if (!currentUser?.city)                                missing.push('City');
    if (!currentUser?.mobile)                              missing.push('Mobile number');

    let hasGovtId    = true;
    let hasAddrProof = true;
    try {
      const docRes = await getMyDocuments();
      if (docRes.data?.isSuccess && Array.isArray(docRes.data.data)) {
        const docs = docRes.data.data as Array<{ docTypeCode: string }>;
        const GOVT_ID_CODES = ['PHOTO_ID', 'AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LIC'];
        hasGovtId    = docs.some(d => GOVT_ID_CODES.includes(d.docTypeCode));
        hasAddrProof = docs.some(d => d.docTypeCode === 'ADDR_PROOF');
      }
    } catch { /* API unreachable — skip doc check, don't block user */ }
    if (!hasGovtId)    missing.push('Government Photo ID');
    if (!hasAddrProof) missing.push('Address Proof');

    if (missing.length > 0) {
      const onlyDocs = missing.every(m => m === 'Government Photo ID' || m === 'Address Proof');
      setGateMissing(missing);
      setGateTargetStep(onlyDocs ? 4 : 0);
      setGateVisible(true);
      return;
    }

    nav.navigate('CreateOrg');
  }, [nav]);

  // ── Partition by the 5 real status codes ─────────────────────────────────
  // activeOrgs    — APPROVED org, APPROVED member
  // pendingOrgs   — org PENDING/UNDER_REVIEW (founder waiting) OR member join-request pending
  // rejectedOrgs  — REJECTED org (founder must resubmit)
  // suspendedOrgs — SUSPENDED org (read-only)
  const sortByOrgName = (a: Organisation, b: Organisation) =>
    (a.orgName ?? (a as any).name ?? '').localeCompare(b.orgName ?? (b as any).name ?? '');

  const activeOrgs    = orgs.filter(o =>
    o.orgStatusCode === 'APPROVED' && o.memberStatusCode === 'APPROVED'
  ).sort(sortByOrgName);
  const pendingOrgs   = orgs.filter(o =>
    o.memberStatusCode === 'PENDING' ||
    (o.memberStatusCode === 'APPROVED' && (o.orgStatusCode === 'PENDING' || o.orgStatusCode === 'UNDER_REVIEW'))
  ).sort(sortByOrgName);
  const rejectedOrgs  = orgs.filter(o =>
    o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'REJECTED'
  ).sort(sortByOrgName);
  const suspendedOrgs = orgs.filter(o =>
    o.memberStatusCode === 'APPROVED' && o.orgStatusCode === 'SUSPENDED'
  ).sort(sortByOrgName);

  const userInitials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || 'ME';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {user?.profilePhoto
          ? <Image source={{ uri: user.profilePhoto }} style={styles.headerAvatar} resizeMode="cover" />
          : (
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{userInitials}</Text>
            </View>
          )
        }
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>My Organizations</Text>
          <Text style={styles.subtitle}>Manage your memberships</Text>
        </View>

        {/* Create New CTA */}
        <View style={styles.section}>
          <Pressable
            style={styles.createCard}
            onPress={handleCreateOrg}
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
            {/* ── Action Required: REJECTED ── */}
            {rejectedOrgs.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="⚠️  Action Required" count={rejectedOrgs.length} />
                <Text style={styles.sectionSubtitle}>
                  These organisations were rejected. Fix the issues and resubmit for review.
                </Text>
                <View style={styles.cardGroup}>
                  {rejectedOrgs.map(org => (
                    <RejectedOrgCard key={org.orgId} org={org} onResubmitSuccess={load} />
                  ))}
                </View>
              </View>
            )}

            {/* ── Suspended ── */}
            {suspendedOrgs.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Suspended" count={suspendedOrgs.length} />
                <View style={styles.cardGroup}>
                  {suspendedOrgs.map(org => (
                    <SuspendedOrgCard key={org.orgId} org={org} />
                  ))}
                </View>
              </View>
            )}

            {/* ── Linked Organizations: APPROVED ── */}
            <View style={styles.section}>
              <SectionHeader title="Linked Organizations" count={activeOrgs.length} />
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
                      onPress={() => nav.navigate('NgoProfile', { orgId: org.orgId })}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* ── Pending Review ── */}
            {pendingOrgs.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Pending Review" count={pendingOrgs.length} />
                <View style={styles.cardGroup}>
                  {pendingOrgs.map(org => (
                    <OrgCard
                      key={org.orgId}
                      org={org}
                      isAdmin={false}
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

      <ProfileIncompleteSheet
        visible={gateVisible}
        onClose={() => setGateVisible(false)}
        missingItems={gateMissing}
        targetStep={gateTargetStep}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: C.BG },

  // Header
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:            { paddingVertical: 4 },
  backText:           { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerAvatar:       { width: 34, height: 34, borderRadius: 17, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText:   { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Title
  titleBlock:         { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  title:              { fontSize: 22, fontWeight: '800', color: C.TEXT },
  subtitle:           { fontSize: 13, color: C.TEXT2, marginTop: 3 },

  // Create CTA
  createCard:         { backgroundColor: C.CARD, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...AppConfig.SHADOW.CARD },
  createIcon:         { width: 44, height: 44, borderRadius: 22, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  createTitle:        { fontSize: 15, fontWeight: '700', color: C.TEXT },
  createSub:          { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  chevron:            { fontSize: 20, color: C.TEXT3, fontWeight: '600' },

  // Sections
  section:            { paddingHorizontal: 16, paddingTop: 20 },
  sectionRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionTitle:       { fontSize: 15, fontWeight: '700', color: C.TEXT },
  sectionSubtitle:    { fontSize: 12, color: C.TEXT2, marginBottom: 10 },
  countBadge:         { backgroundColor: C.PRIMARY, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  countBadgeText:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardGroup:          { gap: 10 },

  // Standard org card
  orgCard:            { backgroundColor: C.CARD, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...AppConfig.SHADOW.CARD },
  orgCardAdmin:       { borderWidth: 1.5, borderColor: C.PRIMARY },
  orgAvatar:          { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  orgAvatarText:      { color: '#fff', fontSize: 15, fontWeight: '800' },
  orgName:            { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 3 },
  orgMeta:            { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  statusPill:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPillText:     { fontSize: 11, fontWeight: '600' },

  // Alert cards (rejected / suspended)
  alertCard:          { backgroundColor: C.CARD, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#DC2626', ...AppConfig.SHADOW.CARD },
  alertCardSuspended: { borderColor: '#EA580C' },
  alertCardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  reasonBox:          { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 12 },
  reasonLabel:        { fontSize: 11, fontWeight: '700', color: '#DC2626', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonText:         { fontSize: 13, color: '#7F1D1D', lineHeight: 18 },
  resubmitBtn:        { backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  resubmitBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  suspendedNote:      { fontSize: 12, color: C.TEXT2, textAlign: 'center', marginTop: 4 },

  // Empty / error states
  emptyBox:           { backgroundColor: C.CARD, borderRadius: 12, padding: 20, alignItems: 'center', marginTop: 6 },
  emptyText:          { fontSize: 13, color: C.TEXT2, textAlign: 'center' },
  centeredMsg:        { alignItems: 'center', paddingVertical: 40 },
  errorText:          { fontSize: 14, color: '#DC2626', marginBottom: 12 },
  retryBtn:           { backgroundColor: C.PRIMARY, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryText:          { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Info tip
  infoBox:            { margin: 16, marginTop: 20, backgroundColor: '#EEF5FF', borderRadius: 10, padding: 12 },
  infoText:           { fontSize: 12, color: '#2563EB', lineHeight: 18 },
});