import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Modal,
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
import { getDashboard } from '../../api/org.api';
import { getMyOrgs, getMyDocuments } from '../../api/user.api';
import { useAdminStore } from '../../store/adminStore';
import { useAuthStore } from '../../store/authStore';
import type { OrgDashboard, Organisation } from '../../types/api.types';
import ProfileIncompleteSheet from '../../components/profile/ProfileIncompleteSheet';

const C = AppConfig.COLORS;

const KPI_BLUE   = { bg: '#EEF5FF', number: '#2563EB' };
const KPI_GREEN  = { bg: '#EDFAF3', number: '#16A34A' };
const KPI_PURPLE = { bg: '#F0EDFF', number: '#6B4EFF' };
const KPI_ORANGE = { bg: '#FFF5EE', number: '#FF8C42' };

const PALETTE = ['#6B4EFF', '#059669', '#FF8C42', '#2563EB', '#B45309', '#16A34A'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % PALETTE.length; }
  return PALETTE[Math.abs(h)];
}
function initials(name: string) {
  return (name || 'NG').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

// Renders org logo if URL is valid + loads successfully, else colour-coded initials.
// Uses local state so a broken image falls back gracefully without re-rendering the list.
function OrgAvatar({ org }: { org: Organisation }) {
  const name    = org.orgName ?? (org as any).name ?? 'Org';
  const col     = avatarColor(name);
  const hasLogo = typeof org.logoUrl === 'string' && org.logoUrl.trim().startsWith('http');
  const [imgErr, setImgErr] = React.useState(false);

  if (hasLogo && !imgErr) {
    return (
      <Image
        source={{ uri: org.logoUrl! }}
        style={styles.sheetAvatar}
        resizeMode="cover"
        onError={() => setImgErr(true)}
      />
    );
  }
  return (
    <View style={[styles.sheetAvatar, { backgroundColor: col }]}>
      <Text style={styles.sheetAvatarText}>{initials(name)}</Text>
    </View>
  );
}

function KpiCard({ value, label, sub, colors }: {
  value: string | number; label: string; sub?: string; colors: { bg: string; number: string };
}) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.bg }]}>
      <Text style={[styles.kpiNumber, { color: colors.number }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function QAButton({ label, primary, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.qaBtn, primary ? styles.qaBtnPrimary : styles.qaBtnOutline]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={label}
    >
      <Text style={[styles.qaBtnText, primary ? styles.qaBtnPrimaryText : styles.qaBtnOutlineText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const ACTIVITY_META: Record<string, { symbol: string; color: string }> = {
  member:      { symbol: '✓', color: '#16A34A' },
  project:     { symbol: '▶', color: '#6B4EFF' },
  certificate: { symbol: '★', color: '#FF8C42' },
  badge:       { symbol: '★', color: '#D97706' },
  donation:    { symbol: '♥', color: '#16A34A' },
  default:     { symbol: '•', color: C.TEXT2 },
};

function ActivityRow({ symbol, color, message, timeAgo, dimmed, noBorder }: {
  symbol: string; color: string; message: string; timeAgo: string; dimmed?: boolean; noBorder?: boolean;
}) {
  return (
    <View style={[styles.activityItem, noBorder && { borderBottomWidth: 0 }, dimmed && { opacity: 0.4 }]}>
      <View style={[styles.activityCircle, { borderColor: color + '50' }]}>
        <Text style={[styles.activitySymbol, { color }]}>{symbol}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityMsg}>{message}</Text>
        <Text style={styles.activityTime}>{timeAgo}</Text>
      </View>
    </View>
  );
}

function BackIcon()    { return <><Text style={styles.navIcon}>{'←'}</Text><Text style={styles.navBack}>{'Back'}</Text></>; }
function RefreshIcon() { return <Text style={[styles.navIcon, { color: C.TEXT2 }]}>{'↻'}</Text>; }
function ChevronDown() { return <Text style={styles.chevron}>{'⌄'}</Text>; }

export default function AdminDashboardScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const { adminOrgs, selectedOrg, setAdminOrgs, setSelectedOrg } = useAdminStore();

  const [dashboard,      setDashboard]      = useState<OrgDashboard | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [showOrgPicker,  setShowOrgPicker]  = useState(false);
  const [gateVisible,    setGateVisible]    = useState(false);
  const [gateMissing,    setGateMissing]    = useState<string[]>([]);
  const [gateTargetStep, setGateTargetStep] = useState(0);

  const isAdminOrg = (o: Organisation): boolean => {
    const a = o as any;
    const vals = [o.myRoleCode, o.myRole, a.roleCode, a.role, a.memberRole, a.memberRoleCode]
      .map((v: any) => (v ?? '').toString().toUpperCase().trim());
    return vals.some((v: string) => v === 'FOUNDER' || v === 'ADMIN');
  };

  const loadOrgs = useCallback(async () => {
    try {
      const res = await getMyOrgs();
      if (res.data?.isSuccess) {
        const all: Organisation[] = Array.isArray(res.data.data) ? res.data.data : [];
        let filtered = all.filter((o) => isAdminOrg(o) && (o as any).orgStatusCode === 'APPROVED').sort((a, b) => {
          if (selectedOrg && a.orgId === selectedOrg.orgId) return -1;
          if (selectedOrg && b.orgId === selectedOrg.orgId) return  1;
          return (a.orgName ?? (a as any).name ?? '').localeCompare(b.orgName ?? (b as any).name ?? '');
        });
        // Fallback: no admin roles on approved orgs (edge case) — show all approved orgs
        if (filtered.length === 0) { filtered = all.filter((o: any) => o.orgStatusCode === 'APPROVED'); }
        setAdminOrgs(filtered);
        return filtered;
      }
    } catch { /* silent */ }
    return [];
  }, [setAdminOrgs]);

  const loadDashboard = useCallback(async (orgId: number) => {
    try {
      const res = await getDashboard(orgId);
      if (res.data?.isSuccess) { setDashboard(res.data.data ?? null); }
    } catch { /* silent */ }
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    const orgs = await loadOrgs();
    const org  = useAdminStore.getState().selectedOrg ?? orgs[0] ?? null;
    if (org) { await loadDashboard(org.orgId); }
    setLoading(false);
  }, [loadOrgs, loadDashboard]);

  // Refetch every time the screen comes into focus so KPIs stay current
  // after actions on child screens (remove member, complete project, etc.)
  useFocusEffect(useCallback(() => { init(); }, [init]));
  useEffect(() => {
    if (selectedOrg) { loadDashboard(selectedOrg.orgId); }
  }, [selectedOrg, loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (selectedOrg) { await loadDashboard(selectedOrg.orgId); }
    setRefreshing(false);
  }, [selectedOrg, loadDashboard]);

  const orgName  = selectedOrg?.orgName ?? (selectedOrg as any)?.name ?? 'Select Organisation';
  const orgColor = selectedOrg ? avatarColor(orgName) : C.PRIMARY;
  const orgInit  = initials(orgName);

  const totalMembers   = dashboard?.totalMembers        ?? 0;
  const newThisMonth   = dashboard?.newMembersThisMonth ?? 0;
  const activeVols     = dashboard?.activeVolunteers    ?? 0;
  const activeRate     = dashboard?.activeRatePct       ?? 0;
  const volHours       = dashboard?.volunteerHoursMonth ?? 0;
  const activeProjects = dashboard?.activeProjects      ?? 0;
  const pendingApps        = dashboard?.pendingApplications        ?? 0;
  const pendingProjApps    = dashboard?.pendingProjectApplications ?? 0;
  const totalPending       = pendingApps + pendingProjApps;
  const followerCount      = dashboard?.followerCount ?? 0;
  const recentActivity = dashboard?.recentActivity ?? [];

  const goAdmin = (screen: string) => nav.navigate(screen, { orgId: selectedOrg?.orgId });

  const handleCreateOrg = useCallback(async () => {
    const currentUser = useAuthStore.getState().user as any;
    const missing: string[] = [];
    if (!currentUser?.firstName || !currentUser?.lastName) missing.push('Full name');
    if (!currentUser?.city)                                missing.push('City');
    if (!currentUser?.mobile)                              missing.push('Mobile number');
    let hasGovtId = false, hasAddrProof = false;
    try {
      const docRes = await getMyDocuments();
      if (docRes.data?.isSuccess && Array.isArray(docRes.data.data)) {
        const docs = docRes.data.data as Array<{ docTypeCode: string }>;
        const GOVT_ID_CODES = ['PHOTO_ID', 'AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LIC'];
        hasGovtId    = docs.some(d => GOVT_ID_CODES.includes(d.docTypeCode));
        hasAddrProof = docs.some(d => d.docTypeCode === 'ADDR_PROOF');
      }
    } catch { /* assume missing */ }
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

  if (!loading && adminOrgs.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.topbar}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.topbarBack}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.topbarTitle}>Admin Dashboard</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>{'🏢'}</Text>
          <Text style={styles.emptyTitle}>No Admin Access</Text>
          <Text style={styles.emptyText}>
            {'You are not an admin or founder of any Organisation.\nCreate one to get started.'}
          </Text>
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateOrg}>
            <Text style={styles.createBtnText}>+ Create Organisation</Text>
          </TouchableOpacity>
        </View>
        <ProfileIncompleteSheet
          visible={gateVisible}
          onClose={() => setGateVisible(false)}
          missingItems={gateMissing}
          targetStep={gateTargetStep}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.topbarBack} accessibilityLabel="Back">
          <BackIcon />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.orgSelector}
          onPress={() => adminOrgs.length > 1 && setShowOrgPicker(true)}
          activeOpacity={adminOrgs.length > 1 ? 0.75 : 1}
          accessibilityLabel="Select organisation"
        >
          {selectedOrg?.logoUrl || selectedOrg?.orgLogoUrl
            ? <Image
                key={selectedOrg.logoUrl ?? selectedOrg.orgLogoUrl}
                source={{ uri: (selectedOrg.logoUrl ?? selectedOrg.orgLogoUrl)! }}
                style={[styles.orgLogo, { overflow: 'hidden' }]}
                resizeMode="cover"
              />
            : <View style={[styles.orgLogo, { backgroundColor: orgColor }]}><Text style={styles.orgLogoText}>{orgInit}</Text></View>
          }
          <Text style={styles.orgName} numberOfLines={1}>{orgName}</Text>
          {adminOrgs.length > 1 && <ChevronDown />}
        </TouchableOpacity>

        <TouchableOpacity onPress={onRefresh} style={styles.topbarBtn} accessibilityLabel="Refresh">
          <RefreshIcon />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          <View style={styles.titleRow}>
            <Text style={styles.pageTitle}>Organisation Dashboard</Text>
            <View style={styles.livePill}>
              <Text style={styles.liveDot}>{'●'}</Text>
              <Text style={styles.liveText}>Live</Text>
            </View>
          </View>

          {/* KPI Cards: 2 explicit rows of 2 - NO flexWrap */}
          <View style={styles.kpiSection}>
            <View style={styles.kpiRow}>
              <KpiCard
                value={totalMembers.toLocaleString('en-IN')}
                label="Total Members"
                sub={newThisMonth > 0 ? '+' + newThisMonth + ' this month' : '0 new this month'}
                colors={KPI_BLUE}
              />
              <View style={{ width: 9 }} />
              <KpiCard
                value={activeVols.toLocaleString('en-IN')}
                label="Active Volunteers"
                sub={activeRate.toFixed(0) + '% active rate'}
                colors={KPI_GREEN}
              />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard
                value={Math.round(Number(volHours)).toLocaleString('en-IN')}
                label="Volunteer Hours"
                sub="This month"
                colors={KPI_PURPLE}
              />
              <View style={{ width: 9 }} />
              <KpiCard
                value={activeProjects}
                label="Active Projects"
                sub={activeProjects > 0 ? activeProjects + ' active' : 'No active projects'}
                colors={KPI_ORANGE}
              />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard
                value={followerCount.toLocaleString('en-IN')}
                label="Followers"
                sub={followerCount > 0 ? followerCount + ' people following' : 'No followers yet'}
                colors={KPI_BLUE}
              />
            </View>
          </View>

          {/* Quick Actions: 2 explicit rows of 2 - NO flexWrap+gap */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.qaRow}>
              <QAButton label="+ New Project"    primary onPress={() => goAdmin('CreateProject')} />
              <View style={{ width: 7 }} />
              <QAButton label="View Applications"       onPress={() => goAdmin('AdminVolunteers')} />
            </View>
            <View style={[styles.qaRow, { marginTop: 7 }]}>
              <QAButton label="Donations"               onPress={() => goAdmin('AdminDonations')} />
              <View style={{ width: 7 }} />
              <QAButton label="Award Badge"             onPress={() => goAdmin('AdminVolunteers')} />
            </View>
          </View>

          {/* Pending Actions - always visible */}
          <View style={styles.section}>
            <View style={styles.warnCard}>
              <View style={styles.warnHeader}>
                <Text style={styles.warnTitle}>Pending Actions</Text>
                <View style={styles.warnBadge}>
                  <Text style={styles.warnBadgeText}>{totalPending}</Text>
                </View>
              </View>
              {/* Member join applications */}
              <TouchableOpacity
                style={styles.warnRow}
                onPress={() => goAdmin('AdminVolunteers')}
                accessibilityLabel="Review member applications"
              >
                <Text style={styles.warnItem}>Member Applications</Text>
                <Text style={styles.warnLink}>{pendingApps} pending · Review →</Text>
              </TouchableOpacity>
              {/* Project volunteer applications */}
              <TouchableOpacity
                style={[styles.warnRow, { borderTopWidth: 1, borderTopColor: '#FDE68A', marginTop: 6, paddingTop: 8 }]}
                onPress={() => goAdmin('AdminProjects')}
                accessibilityLabel="Review project applications"
              >
                <Text style={styles.warnItem}>Project Applications</Text>
                <Text style={styles.warnLink}>{pendingProjApps} pending · Review →</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Recent Activity - always visible */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.activityCard}>
              {recentActivity.length > 0 ? (
                recentActivity.map((a, i) => {
                  const meta = ACTIVITY_META[a.type ?? 'default'] ?? ACTIVITY_META.default;
                  return (
                    <ActivityRow
                      key={i}
                      symbol={a.icon ?? meta.symbol}
                      color={meta.color}
                      message={a.message}
                      timeAgo={a.timeAgo}
                      noBorder={i === recentActivity.length - 1}
                    />
                  );
                })
              ) : (
                <View>
                  <ActivityRow symbol={'✓'} color="#16A34A" message="New member approved"     timeAgo="No recent data" dimmed={true} noBorder={false} />
                  <ActivityRow symbol={'▶'} color="#6B4EFF" message="Project milestone"       timeAgo="No recent data" dimmed={true} noBorder={false} />
                  <ActivityRow symbol={'★'} color="#FF8C42" message="Certificate auto-issued" timeAgo="No recent data" dimmed={true} noBorder={true} />
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={showOrgPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrgPicker(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowOrgPicker(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            {/* Header row: title + subtitle + close button */}
            <View style={styles.sheetHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Switch Organisation</Text>
                <Text style={styles.sheetSubtitle}>Select an organization or create a new one</Text>
              </View>
              <TouchableOpacity onPress={() => setShowOrgPicker(false)} hitSlop={10}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* Scrollable org list */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.sheetList}
              keyboardShouldPersistTaps="handled"
            >
              {adminOrgs.map((org) => {
                const name     = org.orgName ?? (org as any).name ?? 'Org';
                const isActive = selectedOrg?.orgId === org.orgId;
                return (
                  <TouchableOpacity
                    key={org.orgId}
                    style={[styles.sheetRow, isActive && styles.sheetRowActive]}
                    onPress={() => { setSelectedOrg(org); setShowOrgPicker(false); }}
                    accessibilityLabel={'Switch to ' + name}
                  >
                    <OrgAvatar org={org} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sheetOrgName, isActive && { color: C.PRIMARY }]}>{name}</Text>
                      <Text style={styles.sheetOrgRole}>
                        {(org as any).myRole ?? 'Admin'}
                        {(org as any).memberCount ? ` · ${(org as any).memberCount} members` : ''}
                      </Text>
                    </View>
                    {isActive ? (
                      <View style={styles.sheetActiveBadge}>
                        <Text style={styles.sheetActiveTick}>✓</Text>
                      </View>
                    ) : (
                      <Text style={styles.sheetChevron}>›</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  topbarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topbarBack:  { minWidth: 70, height: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  topbarTitle: { fontSize: 15, fontWeight: '700', color: C.TEXT },
  navIcon:     { fontSize: 20, color: C.PRIMARY, fontWeight: '600' },
  navBack:     { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },

  orgSelector: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 8, gap: 8,
  },
  orgLogo:     { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  orgLogoText: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  orgName:     { fontSize: 15, fontWeight: '700', color: C.TEXT, maxWidth: 150 },
  chevron:     { fontSize: 14, color: C.TEXT2, marginTop: 2 },

  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 13, paddingTop: 12, paddingBottom: 4,
  },
  pageTitle: { fontSize: 16, fontWeight: '700', color: C.TEXT },
  livePill:  {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F8F0',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, gap: 3,
  },
  liveDot: { fontSize: 8, color: '#16A34A' },
  liveText: { fontSize: 9, fontWeight: '600', color: '#16A34A' },

  kpiSection: { paddingHorizontal: 13, paddingBottom: 4 },
  kpiRow:     { flexDirection: 'row', marginBottom: 9 },
  kpiCard:    { flex: 1, borderRadius: 13, padding: 13 },
  kpiNumber:  { fontSize: 24, fontWeight: '700', marginBottom: 3 },
  kpiLabel:   { fontSize: 12, fontWeight: '500', color: C.TEXT, marginBottom: 2 },
  kpiSub:     { fontSize: 11, color: C.TEXT3 },

  section:      { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 0 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: C.TEXT, marginBottom: 10 },

  qaRow:            { flexDirection: 'row' },
  qaBtn:            { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qaBtnPrimary:     { backgroundColor: C.PRIMARY },
  qaBtnOutline:     { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.PRIMARY },
  qaBtnText:        { fontSize: 12, fontWeight: '600' },
  qaBtnPrimaryText: { color: '#fff' },
  qaBtnOutlineText: { color: C.PRIMARY },

  warnCard: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  warnHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  warnTitle:     { fontSize: 14, fontWeight: '600', color: C.TEXT },
  warnBadge:     { backgroundColor: '#F59E0B', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 2 },
  warnBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  warnRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  warnItem:      { fontSize: 12, color: C.TEXT2 },
  warnLink:      { fontSize: 12, color: C.PRIMARY, fontWeight: '500' },

  activityCard: {
    backgroundColor: C.CARD, borderRadius: 16,
    paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4,
    ...AppConfig.SHADOW.CARD,
  },
  activityItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  activityCircle: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  activitySymbol: { fontSize: 13, fontWeight: '700' },
  activityMsg:    { fontSize: 13, color: C.TEXT, lineHeight: 18, flex: 1 },
  activityTime:   { fontSize: 11, color: C.TEXT3, marginTop: 2 },

  // Empty state
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: C.TEXT, marginBottom: 8, textAlign: 'center' },
  emptyText:   { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  createBtn:   { backgroundColor: C.PRIMARY, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  createBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },

  // Org picker sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeaderRow:{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  sheetTitle:    { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  sheetSubtitle: { fontSize: 12, color: C.TEXT2 },
  sheetClose:    { fontSize: 18, color: C.TEXT2, paddingLeft: 12 },
  sheetList:     { maxHeight: 320 },
  sheetRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  sheetRowActive:{ backgroundColor: C.PRIMARY + '10' },
  sheetAvatar:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetAvatarText:{ fontSize: 13, fontWeight: '800', color: '#fff' },
  sheetOrgName:  { fontSize: 14, fontWeight: '600', color: C.TEXT },
  sheetOrgRole:  { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  sheetActiveBadge:{ marginLeft: 'auto' as any, width: 22, height: 22, borderRadius: 11, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  sheetActiveTick: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sheetChevron:  { fontSize: 18, color: C.TEXT3 },
});