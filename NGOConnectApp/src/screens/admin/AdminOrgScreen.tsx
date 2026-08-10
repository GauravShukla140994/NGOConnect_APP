import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AppConfig from '../../config/AppConfig';
import { orgApi } from '../../api/org.api';
import { getSignedUrl } from '../../api/upload.api';
import { getMyOrgs } from '../../api/user.api';
import { useAdminStore } from '../../store/adminStore';
import type { Organisation } from '../../types/api.types';

// ── Download icon ─────────────────────────────────────────────────────────────
function DownloadIcon({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 2, height: size * 0.42, backgroundColor: color, borderRadius: 1 }} />
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: size * 0.32, borderRightWidth: size * 0.32, borderTopWidth: size * 0.32,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color,
        marginTop: -1,
      }} />
      <View style={{ width: size * 0.75, height: 2, backgroundColor: color, borderRadius: 1, marginTop: 3 }} />
    </View>
  );
}

type DlState = 'idle' | 'downloading' | 'done' | 'error';

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] ?? 'application/octet-stream';
}

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

// ── Read-only field ───────────────────────────────────────────────────────────
function FieldRow({
  label, value, placeholder, multiline,
}: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti, styles.fieldInputDisabled]}
        value={value}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={C.TEXT3}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        editable={false}
        selectTextOnFocus={false}
        textAlignVertical={multiline ? 'top' : 'center'}
        accessibilityLabel={label}
      />
    </View>
  );
}

// ── Read-only toggle badge ────────────────────────────────────────────────────
function BadgeRow({ label, value }: { label: string; value: boolean }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.badge, value ? styles.badgeOn : styles.badgeOff]}>
        <Text style={[styles.badgeText, value ? styles.badgeTextOn : styles.badgeTextOff]}>
          {value ? '✓ Yes' : '✗ No'}
        </Text>
      </View>
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
  const [orgDocs,  setOrgDocs]  = useState<any[]>([]);
  const [dlState,  setDlState]  = useState<Record<number, DlState>>({});

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

  // Form state
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
  const [regNumber,  setRegNumber]  = useState('');
  const [orgStatus,  setOrgStatus]  = useState('');

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
        setIs80G((o as any).is80GEligible ?? (o as any).is80G ?? false);
        setIs12A((o as any).is12AEligible ?? (o as any).is12A ?? false);
        setMemberCount(String(o.memberCount ?? ''));
        setRegNumber((o as any).regNumber ?? (o as any).registrationNumber ?? '');
        setOrgStatus((o as any).statusCode ?? (o as any).orgStatusCode ?? (o as any).status ?? '');
      }
    } catch { /* silent */ }

    // Fetch org documents (separate call — non-blocking)
    try {
      const docsRes = await orgApi.getDocuments(oid);
      if (docsRes.data?.isSuccess) {
        setOrgDocs(docsRes.data.data ?? []);
      }
    } catch { /* silent */ }

    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [orgId]); // eslint-disable-line

  const downloadOrgDoc = async (doc: any) => {
    const id    = doc.orgDocumentId as number;
    const fUrl  = doc.fileUrl as string | undefined;
    const fName = doc.fileName as string;
    if (dlState[id] === 'downloading') { return; }
    if (!fUrl) {
      Alert.alert('Not available', 'No file found for this document.');
      return;
    }
    setDlState(prev => ({ ...prev, [id]: 'downloading' }));
    try {
      // Full URL → download directly. Bare S3 key → fetch presigned URL first.
      let downloadUrl = fUrl;
      if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
        downloadUrl = await getSignedUrl(fUrl);
      }
      const dest = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fName}`;
      await ReactNativeBlobUtil.config({
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: fName,
          description: 'Downloading document...',
          path: dest,
          mime: getMimeType(fName),
        },
      }).fetch('GET', downloadUrl);
      setDlState(prev => ({ ...prev, [id]: 'done' }));
    } catch (err: any) {
      setDlState(prev => ({ ...prev, [id]: 'error' }));
      Alert.alert('Download Failed', err?.message ?? 'Could not download document.');
    }
  };

  const avatarBg   = avatarColor(orgName || 'NG');
  const avatarText = initials(orgName || 'NG');

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Organisation Profile</Text>
            <Text style={styles.headerSub}>Admin · {orgName || ''}</Text>
          </View>
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Organisation Profile</Text>
          <Text style={styles.headerSub}>Admin · {orgName || ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.previewBtn}
          onPress={() => nav.navigate('NgoProfile', { orgId })}
          accessibilityLabel="Preview public profile"
        >
          <Text style={styles.previewBtnText}>👁 Preview</Text>
        </TouchableOpacity>
      </View>

      {/* ── Read-only notice ────────────────────────────────────────────────── */}
      <View style={styles.readOnlyBanner}>
        <Text style={styles.readOnlyIcon}>ℹ️</Text>
        <Text style={styles.readOnlyText}>
          Profile editing is coming soon. Tap <Text style={{ fontWeight: '700' }}>Preview</Text> to see how your public page looks.
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Organisation Details ──────────────────────────────────────── */}
        <Section title="Organisation Details" />
        <View style={styles.formCard}>

          {/* Logo */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Logo</Text>
            <View style={styles.logoRow}>
              <View style={[styles.logoAvatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.logoAvatarText}>{avatarText}</Text>
              </View>
              <View>
                <Text style={styles.orgNameDisplay}>{orgName || '—'}</Text>
                {!!orgStatus && (
                  <View style={[styles.statusBadge, orgStatus === 'APPROVED' ? styles.statusApproved : styles.statusPending]}>
                    <Text style={[styles.statusText, orgStatus === 'APPROVED' ? styles.statusTextApproved : styles.statusTextPending]}>
                      {orgStatus}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <FieldRow label="Registration Number"  value={regNumber}   placeholder="Not provided" />
          <FieldRow label="Total Members"         value={memberCount} placeholder="—" />
          <FieldRow label="About Organisation"    value={about}       placeholder="Not provided" multiline />
          <FieldRow label="Mission"               value={mission}     placeholder="Not provided" multiline />
          <FieldRow label="Vision"                value={vision}      placeholder="Not provided" multiline />
        </View>

        {/* ── Contact Information ───────────────────────────────────────── */}
        <Section title="Contact Information" />
        <View style={styles.formCard}>
          <FieldRow label="Email"   value={email}   placeholder="Not provided" />
          <FieldRow label="Phone"   value={phone}   placeholder="Not provided" />
          <FieldRow label="Website" value={website} placeholder="Not provided" />
        </View>

        {/* ── Address ───────────────────────────────────────────────────── */}
        <Section title="Address" />
        <View style={styles.formCard}>
          <FieldRow label="Address Line 1" value={address1} placeholder="Not provided" />
          {!!address2 && <FieldRow label="Address Line 2" value={address2} />}
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}><FieldRow label="Pincode" value={pincode} placeholder="—" /></View>
            <View style={{ flex: 1 }}><FieldRow label="City"    value={city}    placeholder="—" /></View>
          </View>
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}><FieldRow label="State"   value={state}   placeholder="—" /></View>
            <View style={{ flex: 1 }}><FieldRow label="Country" value={country} placeholder="—" /></View>
          </View>
        </View>

        {/* ── Certifications ────────────────────────────────────────────── */}
        <Section title="Certifications" subtitle="Tax certificates registered with this organisation." />
        <View style={styles.formCard}>
          <BadgeRow label="80G Certified — donors get tax exemption" value={is80G} />
          <View style={styles.toggleDivider} />
          <BadgeRow label="12A Registered — organisation tax exemption" value={is12A} />
        </View>

        {/* ── Documents ─────────────────────────────────────────────────── */}
        <Section title="Organisation Documents" subtitle="Uploaded registration certificates and other documents." />
        <View style={styles.formCard}>
          {orgDocs.length === 0 ? (
            <View style={styles.emptyDocs}>
              <Text style={styles.emptyDocsText}>No documents uploaded yet.</Text>
            </View>
          ) : orgDocs.map((doc: any) => {
            const id = doc.orgDocumentId as number;
            const ds = dlState[id] ?? 'idle';
            return (
              <View key={id} style={styles.docRow}>
                <Text style={styles.docIcon}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName} numberOfLines={1}>{doc.fileName}</Text>
                  <Text style={styles.docMeta}>
                    {doc.documentType ?? 'Document'}{doc.isVerified ? '  ✓ Verified' : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.dlBtn,
                    ds === 'done'  && styles.dlBtnDone,
                    ds === 'error' && styles.dlBtnErr,
                  ]}
                  onPress={() => downloadOrgDoc(doc)}
                  disabled={ds === 'downloading'}
                  accessibilityLabel={`Download ${doc.fileName}`}
                >
                  {ds === 'downloading' ? (
                    <ActivityIndicator size={13} color={C.PRIMARY} />
                  ) : ds === 'done' ? (
                    <Text style={[styles.dlBtnTxt, { color: '#15803D' }]}>✓</Text>
                  ) : ds === 'error' ? (
                    <Text style={[styles.dlBtnTxt, { color: '#DC2626' }]}>✕</Text>
                  ) : (
                    <DownloadIcon color={C.PRIMARY} size={14} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.BG },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.CARD,
                 borderBottomWidth: 1, borderBottomColor: C.BORDER },
  headerTitle: { fontSize: 16, fontWeight: '800', color: C.TEXT },
  headerSub:   { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  previewBtn:  { backgroundColor: C.PRIMARY + '15', borderRadius: 20, paddingHorizontal: 12,
                 paddingVertical: 6, borderWidth: 1.5, borderColor: C.PRIMARY + '40' },
  previewBtnText:{ fontSize: 12, fontWeight: '700', color: C.PRIMARY },

  // Read-only banner
  readOnlyBanner:{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EFF6FF',
                   borderBottomWidth: 1, borderBottomColor: '#BFDBFE', paddingHorizontal: 14, paddingVertical: 10 },
  readOnlyIcon:  { fontSize: 14 },
  readOnlyText:  { flex: 1, fontSize: 12, color: '#1D4ED8', lineHeight: 18 },

  // Sections
  sectionHead: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 6 },
  sectionTitle:{ fontSize: 14, fontWeight: '700', color: C.TEXT },
  sectionSub:  { fontSize: 11, color: C.TEXT2, marginTop: 2 },

  // Form card
  formCard:    { backgroundColor: C.CARD, marginHorizontal: 12, borderRadius: 14,
                 paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8,
                 shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                 shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  fieldGroup:  { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  fieldLabel:  { fontSize: 11, fontWeight: '600', color: C.TEXT2, textTransform: 'uppercase',
                 letterSpacing: 0.4, marginBottom: 5 },
  fieldInput:  { fontSize: 14, color: C.TEXT, paddingVertical: 0 },
  fieldInputMulti:{ minHeight: 80, paddingTop: 4 },
  fieldInputDisabled:{ color: C.TEXT2 },

  // Logo row
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 },
  logoAvatar:  { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoAvatarText:{ color: '#fff', fontSize: 16, fontWeight: '800' },
  orgNameDisplay:{ fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 4 },

  // Status badge
  statusBadge:        { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusApproved:     { backgroundColor: '#D1FAE5' },
  statusPending:      { backgroundColor: '#FEF3C7' },
  statusText:         { fontSize: 11, fontWeight: '700' },
  statusTextApproved: { color: '#065F46' },
  statusTextPending:  { color: '#92400E' },

  // Toggle (read-only badge)
  toggleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  toggleLabel:  { fontSize: 13, color: C.TEXT, flex: 1, lineHeight: 19 },
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  badgeOn:      { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' },
  badgeOff:     { backgroundColor: C.BG, borderColor: C.BORDER },
  badgeText:    { fontSize: 12, fontWeight: '700' },
  badgeTextOn:  { color: '#065F46' },
  badgeTextOff: { color: C.TEXT3 },
  toggleDivider:{ height: 1, backgroundColor: C.BORDER },

  // Two-column layout
  twoCol:      { flexDirection: 'row', gap: 10 },

  // Documents section
  emptyDocs:     { paddingVertical: 18, alignItems: 'center' },
  emptyDocsText: { fontSize: 13, color: C.TEXT3 },
  docRow:        { flexDirection: 'row', alignItems: 'center', gap: 10,
                   paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  docIcon:       { fontSize: 22 },
  docName:       { fontSize: 13, fontWeight: '600', color: C.TEXT },
  docMeta:       { fontSize: 11, color: C.TEXT3, marginTop: 2 },
  dlBtn:         { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: C.PRIMARY,
                   alignItems: 'center', justifyContent: 'center', backgroundColor: `${C.PRIMARY}08` },
  dlBtnDone:     { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  dlBtnErr:      { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  dlBtnTxt:      { fontSize: 12, fontWeight: '700' },
});
