import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { getMyProfile, getMyOrgs, getMyDocuments } from '../../api/user.api';
import { sosApi } from '../../api/sos.api';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import type { UserProfile, Organisation } from '../../types/api.types';
import ProfileIncompleteSheet from '../../components/profile/ProfileIncompleteSheet';

const PALETTE = ['#6B4EFF', '#059669', '#FF8C42', '#2563EB', '#B45309', '#16A34A'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % PALETTE.length; }
  return PALETTE[Math.abs(h)];
}

const ACTIVITY_ITEMS = [
  { icon: '✏️', label: 'Edit Profile',       screen: 'EditProfile' },
  { icon: '🏢', label: 'Admin Dashboard',     screen: 'AdminTabs' },
  { icon: '🏛', label: 'My Organizations',   screen: 'MyOrgs' },
  { icon: '💛', label: 'My Donations',        screen: 'MyDonations' },
  { icon: '🔖', label: 'Saved Posts',         screen: 'SavedPosts' },
];

// Returns true if the org is one the user administers (ADMIN or FOUNDER role).
function isAdminOrg(o: Organisation): boolean {
  // Org must be fully approved before it appears in Admin Dashboard
  if (o.orgStatusCode !== 'APPROVED') return false;
  const vals = [o.myRoleCode, o.myRole, (o as any).roleCode]
    .map((v: any) => (v ?? '').toString().toUpperCase().trim());
  return vals.some((v) => v === 'FOUNDER' || v === 'ADMIN');
}

const SETTINGS_ITEMS = [
  { icon: '🔔', label: 'Notifications',           screen: 'Notifications',              params: undefined },
  { icon: '📣', label: 'Communication Preferences', screen: 'CommunicationPreferences', params: undefined },
  { icon: '📋', label: 'Terms of Service',         screen: 'WebView',                   params: { url: 'https://www.ripplehub.app/terms',   title: 'Terms of Service' } },
  { icon: '🔐', label: 'Privacy Policy',           screen: 'WebView',                   params: { url: 'https://www.ripplehub.app/privacy', title: 'Privacy Policy'   } },
  { icon: '🆘', label: 'Help & Support',           screen: 'HelpSupport',               params: undefined },
  { icon: '⚙',  label: 'Account Settings',         screen: 'AccountSettings',           params: undefined },
  // DEV ONLY — uncomment to test push notifications, remove before Play Store release
  // { icon: '🔔', label: '🧪 Test Push Notification', screen: 'FCMTest', params: undefined },
];

export default function ProfileScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { logout } = useAuthStore();
  const { selectedOrg: currentAdminOrg, setSelectedOrg, setAdminOrgs } = useAdminStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sosChecking, setSosChecking] = useState(false);
  const [showAdminPicker, setShowAdminPicker] = useState(false);
  const [adminPickerOrgs, setAdminPickerOrgs] = useState<Organisation[]>([]);
  const [gateVisible,    setGateVisible]    = useState(false);
  const [gateMissing,    setGateMissing]    = useState<string[]>([]);
  const [gateTargetStep, setGateTargetStep] = useState(0);

  const load = useCallback(async () => {
    try {
      const [profileRes, orgsRes] = await Promise.all([
        getMyProfile(),
        getMyOrgs(),
      ]);
      if (profileRes.data?.isSuccess) { setProfile(profileRes.data.data); }
      if (orgsRes.data?.isSuccess) { setOrgs(orgsRes.data.data ?? []); }
    } catch { /* fail silently */ }
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => { init(); }, [init]);

  // Re-fetch profile whenever this screen comes into focus (e.g. back from EditProfile)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Smart SOS navigation: check for an existing active incident first.
  // If one exists → go to SosActive (victim view). If not → go to SosTrigger.
  const handleEmergencySos = useCallback(async () => {
    setSosChecking(true);
    try {
      const res = await sosApi.getMyActive();
      if (res.data?.isSuccess && res.data.data) {
        const incidentId = (res.data.data as any).sosIncidentId as number;
        nav.navigate('SosActive', { sosIncidentId: incidentId, isVictim: true });
      } else {
        nav.navigate('SosTrigger');
      }
    } catch {
      nav.navigate('SosTrigger');
    } finally {
      setSosChecking(false);
    }
  }, [nav]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }, [logout]);

  // Profile gate check — same logic as MyOrgsScreen
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

  // Admin Dashboard entry point — filters to ADMIN/FOUNDER orgs before navigating.
  const handleAdminDashboard = useCallback(() => {
    const adminOrgs = orgs.filter(isAdminOrg).sort((a, b) => {
      if (currentAdminOrg && a.orgId === currentAdminOrg.orgId) return -1;
      if (currentAdminOrg && b.orgId === currentAdminOrg.orgId) return  1;
      return (a.orgName ?? '').localeCompare(b.orgName ?? '');
    });

    if (adminOrgs.length === 0) {
      Alert.alert(
        'No Admin Access',
        'You are not managing any organisation yet. Create one to access the Admin Dashboard.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Organisation', onPress: handleCreateOrg },
        ],
      );
      return;
    }

    // Pre-populate the admin store so AdminDashboardScreen loads the right org immediately.
    setAdminOrgs(adminOrgs);

    if (adminOrgs.length === 1) {
      setSelectedOrg(adminOrgs[0]);
      nav.navigate('AdminTabs');
      return;
    }

    // Multiple admin orgs — let user pick first.
    setAdminPickerOrgs(adminOrgs);
    setShowAdminPicker(true);
  }, [orgs, nav, setAdminOrgs, setSelectedOrg]);

  const initials = [profile?.firstName?.[0], profile?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || 'ME';

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={AppConfig.COLORS.PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Hero — fixed, does not scroll */}
      <View style={styles.hero}>
        {profile?.profilePhoto
          ? <Image source={{ uri: profile.profilePhoto }} style={styles.heroAvatarImg} />
          : (
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{initials}</Text>
            </View>
          )
        }
        <Text style={styles.heroName}>
          {profile?.firstName} {profile?.lastName}
        </Text>
        {profile?.occupation ? (
          <Text style={styles.heroOccupation}>{profile.occupation}</Text>
        ) : null}
        {profile?.bio ? (
          <Text style={styles.heroBio}>{profile.bio}</Text>
        ) : null}
        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => nav.navigate('EditProfile')}
          accessibilityLabel="Edit profile"
        >
          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable content below the hero */}
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[AppConfig.COLORS.PRIMARY]}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      >
        {/* Stats row hidden — will be re-enabled in a future release */}

        {/* MY ACTIVITY Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MY ACTIVITY</Text>
          <View style={styles.menuCard}>
            {ACTIVITY_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={item.screen}
                style={[styles.menuItem, index < ACTIVITY_ITEMS.length - 1 && styles.menuItemBorder]}
                onPress={item.screen === 'AdminTabs' ? handleAdminDashboard : () => nav.navigate(item.screen)}
                accessibilityLabel={item.label}
              >
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SETTINGS Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SETTINGS</Text>
          <View style={styles.menuCard}>
            {SETTINGS_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.menuItem, index < SETTINGS_ITEMS.length - 1 && styles.menuItemBorder]}
                onPress={() => nav.navigate(item.screen as any, item.params)}
                accessibilityLabel={item.label}
              >
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Emergency SOS */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EMERGENCY</Text>
          <TouchableOpacity
            style={[styles.sosCard, sosChecking && { opacity: 0.7 }]}
            onPress={handleEmergencySos}
            disabled={sosChecking}
            accessibilityLabel="Emergency SOS"
          >
            <Text style={styles.sosEmoji}>{sosChecking ? '⏳' : '🚨'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sosTitle}>Emergency SOS</Text>
              <Text style={styles.sosSub}>
                {sosChecking ? 'Checking SOS status...' : 'Send an alert to your NGO members instantly'}
              </Text>
            </View>
            {sosChecking
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ fontSize: 20, color: '#fff' }}>›</Text>}
          </TouchableOpacity>
        </View>

        {/* Skills */}
        {profile?.skills?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Skills</Text>
            <View style={styles.tagRow}>
              {profile.skills.map((s: any, i: number) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{s.skillName ?? s}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Sign out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleLogout}
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Admin org picker (shown when user admins multiple orgs) ─────── */}
      <Modal
        visible={showAdminPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdminPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowAdminPicker(false)}>
          <Pressable style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Select Organisation</Text>
            <Text style={styles.pickerSub}>Choose an NGO to manage</Text>
            <FlatList
              data={adminPickerOrgs}
              keyExtractor={(o) => String(o.orgId)}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.BORDER }} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    setShowAdminPicker(false);
                    setSelectedOrg(item);
                    nav.navigate('AdminTabs');
                  }}
                >
                  <View style={[styles.pickerOrgIcon, { backgroundColor: avatarColor(item.orgName ?? 'NG') }]}>
                    {item.logoUrl || item.orgLogoUrl ? (
                      <Image source={{ uri: (item.logoUrl ?? item.orgLogoUrl)! }} style={styles.pickerOrgImg} resizeMode="cover" />
                    ) : (
                      <Text style={styles.pickerOrgInitials}>
                        {(item.orgName ?? 'NG').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerOrgName} numberOfLines={1}>{item.orgName}</Text>
                    <Text style={styles.pickerOrgRole}>{item.myRole ?? item.myRoleCode ?? 'Admin'}</Text>
                  </View>
                  <Text style={styles.pickerChevron}>›</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <ProfileIncompleteSheet
        visible={gateVisible}
        onClose={() => setGateVisible(false)}
        missingItems={gateMissing}
        targetStep={gateTargetStep}
      />

    </SafeAreaView>
  );
}

const C = AppConfig.COLORS;
const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.BG },
  centered:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero:              { backgroundColor: C.PRIMARY, padding: 20, alignItems: 'center', paddingBottom: 24 },
  heroAvatar:        { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  heroAvatarImg:     { width: 70, height: 70, borderRadius: 35, marginBottom: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  heroAvatarText:    { fontSize: 24, fontWeight: '800', color: '#fff' },
  heroName:          { fontSize: 18, fontWeight: '700', color: '#fff' },
  heroOccupation:    { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  heroBio:           { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  editProfileBtn:    { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 18, paddingVertical: 7, borderRadius: 18 },
  editProfileBtnText:{ color: '#fff', fontSize: 14, fontWeight: '600' },
  statsRow:          { flexDirection: 'row', backgroundColor: C.CARD, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  statItem:          { flex: 1, alignItems: 'center' },
  statValue:         { fontSize: 18, fontWeight: '800', color: C.TEXT },
  statLabel:         { fontSize: 11, color: C.TEXT2, marginTop: 2 },
  statDivider:       { width: 1, backgroundColor: C.BORDER },
  section:           { padding: 14 },
  sectionTitle:      { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 10 },
  sectionLabel:      { fontSize: 11, fontWeight: '700', color: C.TEXT2, letterSpacing: 1.2, marginBottom: 10 },
  sosCard:           { backgroundColor: '#EF4444', borderRadius: 14, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  sosEmoji:          { fontSize: 28 },
  sosTitle:          { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 2 },
  sosSub:            { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 16 },
  menuCard:          { backgroundColor: C.CARD, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  menuItem:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  menuItemBorder:    { borderTopWidth: 1, borderTopColor: C.BORDER },
  menuIcon:          { fontSize: 18, width: 24, textAlign: 'center' },
  menuLabel:         { fontSize: 15, color: C.TEXT, flex: 1 },
  chevron:           { fontSize: 16, color: C.TEXT3 },

  // Sign out
  signOutBtn:  { margin: 16, marginTop: 8, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#EF4444' },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  // Tags (interests)
  tagRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:     { backgroundColor: C.PRIMARY + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText: { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },

  // Org picker
  pickerOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet:      { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  pickerHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  pickerTitle:      { fontSize: 16, fontWeight: '700', color: C.TEXT, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  pickerSub:        { fontSize: 12, color: C.TEXT2, paddingHorizontal: 16, paddingBottom: 8 },
  pickerRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  pickerOrgImg:     { width: 40, height: 40, borderRadius: 10 },
  pickerOrgIcon:    { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pickerOrgInitials:{ color: '#fff', fontSize: 13, fontWeight: '800' },
  pickerOrgName:    { fontSize: 14, fontWeight: '600', color: C.TEXT },
  pickerOrgRole:    { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  pickerChevron:    { fontSize: 18, color: C.TEXT3, marginLeft: 'auto' as any },
});