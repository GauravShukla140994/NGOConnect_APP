import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { orgApi } from '../../api/org.api';
import { getMyOrgs } from '../../api/user.api';
import { useAdminStore } from '../../store/adminStore';
import type { Organisation } from '../../types/api.types';

const C = AppConfig.COLORS;

// ── Avatar helpers ────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#D97706', '#16A34A'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length; }
  return AVATAR_COLORS[Math.abs(h)];
}
function initials(name: string) {
  return (name || 'NG').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Field row (label + input) ─────────────────────────────────────────────────
function FieldRow({
  label, value, onChangeText, placeholder, multiline, keyboardType, editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'numeric';
  editable?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti, !editable && styles.fieldInputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={C.TEXT3}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType ?? 'default'}
        editable={editable}
        autoCapitalize="sentences"
        accessibilityLabel={label}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.BORDER, true: C.PRIMARY }}
        thumbColor="#fff"
        accessibilityLabel={label}
      />
    </View>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function AdminOrgScreen() {
  const nav             = useNavigation<any>();
  const { selectedOrg, setAdminOrgs, setSelectedOrg } = useAdminStore();
  const orgId           = selectedOrg?.orgId ?? 0;

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // ── Ensure org is loaded if navigated directly to this tab ───────────────
  const ensureOrg = useCallback(async (): Promise<number> => {
    if (orgId) { return orgId; }
    try {
      const res = await getMyOrgs();
      if (res.data?.isSuccess) {
        const all = res.data.data ?? [];
        if (all.length > 0) {
          setAdminOrgs(all);
          setSelectedOrg(all[0]);
          return all[0].orgId;
        }
      }
    } catch { /* silent */ }
    return 0;
  }, [orgId, setAdminOrgs, setSelectedOrg]);

  // Form state — mirrors Organisation fields
  const [orgName,    setOrgName]    = useState('');
  const [about,      setAbout]      = useState('');
  const [mission,    setMission]    = useState('');
  const [vision,     setVision]     = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [website,    setWebsite]    = useState('');
  const [address1,   setAddress1]   = useState('');
  const [address2,   setAddress2]   = useState('');
  const [pincode,    setPincode]    = useState('');
  const [city,       setCity]       = useState('');
  const [state,      setState]      = useState('');
  const [country,    setCountry]    = useState('');
  const [is80G,      setIs80G]      = useState(false);
  const [is12A,      setIs12A]      = useState(false);
  const [memberCount,setMemberCount]= useState('');

  // ── Load profile ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const oid = await ensureOrg();
    if (!oid) { setLoading(false); return; }
    try {
      const res = await orgApi.getProfile(oid);
      if (res.data?.isSuccess) {
        const o: Organisation = res.data.data!;
        setOrgName(o.orgName ?? o.name ?? '');
        setAbout(o.about ?? o.description ?? '');
        setMission(o.mission ?? '');
        setVision(o.vision ?? '');
        setEmail(o.contactEmail ?? o.email ?? '');
        setPhone(o.contactPhone ?? '');
        setWebsite(o.website ?? '');
        setAddress1(o.addressLine1 ?? '');
        setAddress2(o.addressLine2 ?? '');
        setPincode(o.pincode ?? '');
        setCity(o.city ?? '');
        setState(o.state ?? '');
        setCountry(o.country ?? '');
        setIs80G(o.is80G ?? false);
        setIs12A(o.is12A ?? false);
        setMemberCount(String(o.memberCount ?? ''));
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [orgId]);

  // Re-run when selectedOrg changes (user switches org from Dashboard)
  useEffect(() => { load(); }, [orgId]); // eslint-disable-line

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!orgName.trim()) {
      Alert.alert('Validation', 'Organisation name is required.');
      return;
    }
    const oid = selectedOrg?.orgId ?? orgId;
    if (!oid) { Alert.alert('Error', 'No organisation selected.'); return; }
    setSaving(true);
    try {
      const res = await orgApi.update(oid, {
        orgName:      orgName.trim(),
        about:        about.trim() || undefined,
        mission:      mission.trim() || undefined,
        vision:       vision.trim() || undefined,
        contactEmail: email.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        website:      website.trim() || undefined,
        addressLine1: address1.trim() || undefined,
        addressLine2: address2.trim() || undefined,
        pincode:      pincode.trim() || undefined,
        city:         city.trim() || undefined,
        state:        state.trim() || undefined,
        country:      country.trim() || undefined,
        is80G,
        is12A,
      });
      if (res.data?.isSuccess) {
        Alert.alert('Saved', 'Organisation profile updated successfully.');
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not save changes.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally { setSaving(false); }
  }, [orgId, orgName, about, mission, vision, email, phone, website,
      address1, address2, pincode, city, state, country, is80G, is12A]);

  const avatarBg   = avatarColor(orgName || 'NG');
  const avatarText = initials(orgName || 'NG');

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.headerBtn} accessibilityLabel="Back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Organisation Profile</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.headerBtn} accessibilityLabel="Back">
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Organisation Profile</Text>
        {/* Preview button */}
        <TouchableOpacity
          style={styles.previewBtn}
          onPress={() => nav.navigate('NgoProfile', { orgId })}
          accessibilityLabel="Preview public profile"
        >
          <Text style={styles.previewBtnText}>👁 Preview</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Organisation Details ──────────────────────────────────────── */}
          <Section
            title="Organisation Details"
            subtitle="Changes appear instantly on the public Explore page."
          />

          <View style={styles.formCard}>
            <FieldRow label="Organisation Name" value={orgName} onChangeText={setOrgName} placeholder="Enter organisation name" />

            <FieldRow
              label="Total Members"
              value={memberCount}
              editable={false}
              placeholder="Computed automatically"
            />

            {/* Logo */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Logo</Text>
              <View style={styles.logoRow}>
                <View style={[styles.logoAvatar, { backgroundColor: avatarBg }]}>
                  <Text style={styles.logoAvatarText}>{avatarText}</Text>
                </View>
                <TouchableOpacity
                  style={styles.changeLogoBtn}
                  onPress={() => Alert.alert('Coming soon', 'Logo upload will be available soon.')}
                  accessibilityLabel="Change logo"
                >
                  <Text style={styles.changeLogoBtnText}>Change Logo</Text>
                </TouchableOpacity>
              </View>
            </View>

            <FieldRow label="About Organisation"     value={about}    onChangeText={setAbout}    placeholder="Tell your story…"        multiline />
            <FieldRow label="Mission"                value={mission}  onChangeText={setMission}  placeholder="Your mission statement"   />
            <FieldRow label="Vision"                 value={vision}   onChangeText={setVision}   placeholder="Your vision statement"    />
          </View>

          {/* ── Contact Information ───────────────────────────────────────── */}
          <Section title="Contact Information" />
          <View style={styles.formCard}>
            <FieldRow label="Email"   value={email}   onChangeText={setEmail}   placeholder="contact@ngo.org"   keyboardType="email-address" />
            <FieldRow label="Phone"   value={phone}   onChangeText={setPhone}   placeholder="+91 XXXXX XXXXX"   keyboardType="phone-pad"     />
            <FieldRow label="Website" value={website} onChangeText={setWebsite} placeholder="https://your-ngo.org" keyboardType="url"          />
          </View>

          {/* ── Address ───────────────────────────────────────────────────── */}
          <Section title="Address" />
          <View style={styles.formCard}>
            <FieldRow label="Address Line 1" value={address1} onChangeText={setAddress1} placeholder="Street / Building" />
            <FieldRow label="Address Line 2" value={address2} onChangeText={setAddress2} placeholder="Area / Landmark (optional)" />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <FieldRow label="Pincode" value={pincode} onChangeText={setPincode} placeholder="400001" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldRow label="City" value={city} onChangeText={setCity} placeholder="Mumbai" />
              </View>
            </View>
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <FieldRow label="State" value={state} onChangeText={setState} placeholder="Maharashtra" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldRow label="Country" value={country} onChangeText={setCountry} placeholder="India" />
              </View>
            </View>
          </View>

          {/* ── Certifications ────────────────────────────────────────────── */}
          <Section title="Certifications" subtitle="Enables donor trust indicators on your profile." />
          <View style={styles.formCard}>
            <ToggleRow label="80G Certified (Tax exemption for donors)" value={is80G} onValueChange={setIs80G} />
            <View style={styles.toggleDivider} />
            <ToggleRow label="12A Registered (Tax exemption for NGO)" value={is12A} onValueChange={setIs12A} />
          </View>

          {/* ── Save button ───────────────────────────────────────────────── */}
          <View style={styles.saveSection}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={save}
              disabled={saving}
              accessibilityLabel="Save changes"
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.BG },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  headerBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon:    { fontSize: 20, color: C.TEXT, fontWeight: '300' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.TEXT, flex: 1, textAlign: 'center' },
  previewBtn:  { backgroundColor: C.PRIMARY + '15', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: C.PRIMARY + '40' },
  previewBtnText:{ fontSize: 12, fontWeight: '700', color: C.PRIMARY },

  // Sections
  sectionHead: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 6 },
  sectionTitle:{ fontSize: 14, fontWeight: '700', color: C.TEXT },
  sectionSub:  { fontSize: 11, color: C.TEXT2, marginTop: 2 },

  // Form card
  formCard:    { backgroundColor: C.CARD, marginHorizontal: 12, borderRadius: 14, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  fieldGroup:  { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  fieldLabel:  { fontSize: 11, fontWeight: '600', color: C.TEXT2, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  fieldInput:  { fontSize: 14, color: C.TEXT, paddingVertical: 0 },
  fieldInputMulti:{ minHeight: 80, paddingTop: 4 },
  fieldInputDisabled:{ color: C.TEXT2 },

  // Logo row
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 },
  logoAvatar:  { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoAvatarText:{ color: '#fff', fontSize: 16, fontWeight: '800' },
  changeLogoBtn:{ backgroundColor: C.BG, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1.5, borderColor: C.BORDER },
  changeLogoBtnText:{ fontSize: 13, fontWeight: '600', color: C.TEXT },

  // Toggle row
  toggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  toggleLabel: { fontSize: 13, color: C.TEXT, flex: 1, lineHeight: 19 },
  toggleDivider:{ height: 1, backgroundColor: C.BORDER },

  // Two-column layout
  twoCol:      { flexDirection: 'row', gap: 10 },

  // Save
  saveSection: { padding: 16, paddingBottom: 32 },
  saveBtn:     { backgroundColor: C.PRIMARY, paddingVertical: 15, borderRadius: 14, alignItems: 'center', shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
