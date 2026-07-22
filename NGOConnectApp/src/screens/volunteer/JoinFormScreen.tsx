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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { getMyProfile, updateProfile } from '../../api/user.api';
import { requestMembership } from '../../api/org.api';
import type { UserProfile } from '../../types/api.types';

const C = AppConfig.COLORS;

const STEPS = ['Personal Info', 'Address & Professional', 'Volunteer Info', 'Documents'] as const;
type Step = 0 | 1 | 2 | 3;

const GENDER_OPTIONS = [
  { label: 'Male', value: 1 },
  { label: 'Female', value: 2 },
  { label: 'Other', value: 3 },
];

function StepBar({ current }: { current: Step }) {
  return (
    <View style={styles.stepBar}>
      {STEPS.map((_, i) => (
        <React.Fragment key={i}>
          <View style={[styles.stepDot, i <= current && styles.stepDotActive]}>
            <Text style={[styles.stepNum, i <= current && styles.stepNumActive]}>
              {i < current ? '✓' : String(i + 1)}
            </Text>
          </View>
          {i < STEPS.length - 1 && (
            <View style={[styles.stepLine, i < current && styles.stepLineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

export default function JoinFormScreen() {
  const insets = useSafeAreaInsets();
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const orgId: number = route.params?.orgId ?? 1;
  const orgName: string = route.params?.orgName ?? 'NGO';

  const [step, setStep]     = useState<Step>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // Step 1 — Personal Info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [dob, setDob]             = useState('');
  const [genderId, setGenderId]   = useState<number | undefined>(undefined);

  // Step 2 — Address & Professional
  const [address, setAddress]         = useState('');
  const [city, setCity]               = useState('');
  const [state, setState]             = useState('');
  const [pincode, setPincode]         = useState('');
  const [occupation, setOccupation]   = useState('');
  const [organisation, setOrganisation] = useState('');

  // Step 3 — Volunteer Info
  const [volunteerExp, setVolunteerExp] = useState('');
  const [skillsText, setSkillsText]     = useState('');
  const [message, setMessage]           = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await getMyProfile();
        if (res.data?.isSuccess && res.data.data) {
          const p: UserProfile = res.data.data;
          setFirstName(p.firstName ?? '');
          setLastName(p.lastName ?? '');
          setEmail(p.email ?? '');
          setDob(p.dateOfBirth?.slice(0, 10) ?? '');
          setGenderId(p.genderLkpId ?? undefined);
          setAddress(p.addressLine1 ?? '');
          setCity(p.city ?? '');
          setState(p.state ?? '');
          setPincode(p.pincode ?? '');
          setOccupation(p.occupation ?? '');
          setOrganisation(p.organisation ?? '');
          setVolunteerExp(p.volunteerExp ?? '');
        }
      } catch { /* prefill silently */ }
      setLoading(false);
    })();
  }, []);

  const handleNext = useCallback(async () => {
    if (step === 0) {
      if (!firstName.trim()) { Alert.alert('Validation', 'Full name is required.'); return; }
    }
    if (step === 1) {
      if (!city.trim()) { Alert.alert('Validation', 'City is required.'); return; }
      if (!occupation.trim()) { Alert.alert('Validation', 'Occupation is required.'); return; }
    }
    if (step < 3) {
      setStep((s) => (s + 1) as Step);
    }
  }, [step, firstName, city, occupation]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      // Save profile updates
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dob,
        genderLkpId: genderId,
        addressLine1: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        occupation: occupation.trim(),
        organisation: organisation.trim(),
        volunteerExp: volunteerExp.trim(),
      });
      // Submit membership request
      const res = await requestMembership(orgId, message || 'I would like to join your organization.');
      if (res.data?.isSuccess) {
        Alert.alert('Application Submitted!', 'Your application will be reviewed within 2-3 business days.', [
          { text: 'OK', onPress: () => nav.goBack() },
        ]);
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not submit application.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [firstName, lastName, dob, genderId, address, city, state, pincode, occupation, organisation, volunteerExp, message, orgId, nav]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  const fieldLabel = (label: string, required = false) => (
    <Text style={styles.fieldLabel}>{label}{required && <Text style={{ color: '#EF4444' }}> *</Text>}</Text>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Back */}
      <TouchableOpacity style={styles.backRow} onPress={() => step === 0 ? nav.goBack() : setStep((s) => (s - 1) as Step)} accessibilityLabel="Go back">
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <StepBar current={step} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">

        {/* ── Step 0: Personal Info ── */}
        {step === 0 && (
          <View>
            <View style={styles.headerCard}>
              <Text style={styles.formTitle}>Membership Application</Text>
              <Text style={styles.formSub}>Apply to join <Text style={{ fontWeight: '700' }}>{orgName}</Text></Text>
            </View>
            <Text style={styles.sectionLabel}>Personal Information</Text>
            {fieldLabel('Full Name', true)}
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="John" placeholderTextColor={C.TEXT3} accessibilityLabel="First name" />
            {fieldLabel('Last Name')}
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Doe" placeholderTextColor={C.TEXT3} accessibilityLabel="Last name" />
            {fieldLabel('Email Address', true)}
            <TextInput style={[styles.input, styles.inputDisabled]} value={email} editable={false} accessibilityLabel="Email" />
            {fieldLabel('Mobile Number', true)}
            <View style={styles.phoneRow}>
              <View style={styles.countryCode}><Text style={styles.countryCodeText}>🇮🇳 +91</Text></View>
              <TextInput style={[styles.input, { flex: 1 }]} value={phone} onChangeText={setPhone} placeholder="98765 43210" keyboardType="phone-pad" placeholderTextColor={C.TEXT3} accessibilityLabel="Phone number" />
            </View>
            {fieldLabel('Date of Birth', true)}
            <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor={C.TEXT3} accessibilityLabel="Date of birth" />
            {fieldLabel('Gender', true)}
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.genderChip, genderId === g.value && styles.genderChipActive]}
                  onPress={() => setGenderId(g.value)}
                  accessibilityLabel={g.label}
                >
                  <Text style={[styles.genderChipText, genderId === g.value && styles.genderChipTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Step 1: Address & Professional ── */}
        {step === 1 && (
          <View>
            <Text style={styles.sectionLabel}>Address & Professional</Text>
            {fieldLabel('Current Address', true)}
            <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} value={address} onChangeText={setAddress} placeholder="Street address..." placeholderTextColor={C.TEXT3} multiline accessibilityLabel="Address" />
            {fieldLabel('City', true)}
            <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Mumbai" placeholderTextColor={C.TEXT3} accessibilityLabel="City" />
            {fieldLabel('State')}
            <TextInput style={styles.input} value={state} onChangeText={setState} placeholder="Maharashtra" placeholderTextColor={C.TEXT3} accessibilityLabel="State" />
            {fieldLabel('Pincode')}
            <TextInput style={styles.input} value={pincode} onChangeText={setPincode} placeholder="400017" keyboardType="numeric" placeholderTextColor={C.TEXT3} accessibilityLabel="Pincode" />
            {fieldLabel('Occupation', true)}
            <TextInput style={styles.input} value={occupation} onChangeText={setOccupation} placeholder="Software Engineer" placeholderTextColor={C.TEXT3} accessibilityLabel="Occupation" />
            {fieldLabel('Organization / Company')}
            <TextInput style={styles.input} value={organisation} onChangeText={setOrganisation} placeholder="Company name" placeholderTextColor={C.TEXT3} accessibilityLabel="Organisation" />
          </View>
        )}

        {/* ── Step 2: Volunteer Info ── */}
        {step === 2 && (
          <View>
            <Text style={styles.sectionLabel}>Volunteer Information</Text>
            {fieldLabel('Previous NGO Experience')}
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={volunteerExp} onChangeText={setVolunteerExp} placeholder="List any NGOs you've worked with..." placeholderTextColor={C.TEXT3} multiline accessibilityLabel="Volunteer experience" />
            {fieldLabel('Skills & Expertise', true)}
            <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} value={skillsText} onChangeText={setSkillsText} placeholder="e.g., communication, teaching..." placeholderTextColor={C.TEXT3} multiline accessibilityLabel="Skills" />
            {fieldLabel('Message to Organization')}
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage} placeholder="Why do you want to join?" placeholderTextColor={C.TEXT3} multiline accessibilityLabel="Message" />
          </View>
        )}

        {/* ── Step 3: Documents ── */}
        {step === 3 && (
          <View>
            <Text style={styles.sectionLabel}>Document Uploads</Text>
            <Text style={styles.fieldLabel}>Identity Proof <Text style={{ color: '#EF4444' }}>*</Text></Text>
            <View style={styles.uploadZone}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>📤</Text>
              <Text style={styles.uploadText}>Upload ID Card, Passport or Driver's License</Text>
              <Text style={styles.uploadSub}>PNG, JPG, PDF up to 5MB</Text>
            </View>
            <Text style={styles.fieldLabel}>Address Proof <Text style={{ color: '#EF4444' }}>*</Text></Text>
            <View style={styles.uploadZone}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>📤</Text>
              <Text style={styles.uploadText}>Upload utility bill or bank statement</Text>
              <Text style={styles.uploadSub}>PNG, JPG, PDF up to 5MB</Text>
            </View>
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠️ Your application will be reviewed within 2-3 business days.</Text>
            </View>
          </View>
        )}

        {/* Navigation buttons */}
        <View style={styles.navFooter}>
          {step > 0 && (
            <TouchableOpacity style={styles.prevBtn} onPress={() => setStep((s) => (s - 1) as Step)} accessibilityLabel="Previous step">
              <Text style={styles.prevBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {step < 3 ? (
            <TouchableOpacity style={[styles.nextBtn, step === 0 && { flex: 1 }]} onPress={handleNext} accessibilityLabel="Continue">
              <Text style={styles.nextBtnText}>Continue →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextBtn} onPress={handleSubmit} disabled={saving} accessibilityLabel="Submit application">
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.nextBtnText}>Submit Application ✓</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: C.BG },
  centered:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backRow:            { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 11, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:           { color: C.PRIMARY, fontSize: 16, fontWeight: '600' },
  stepBar:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.CARD },
  stepDot:            { width: 26, height: 26, borderRadius: 13, backgroundColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  stepDotActive:      { backgroundColor: C.PRIMARY },
  stepNum:            { fontSize: 13, fontWeight: '700', color: C.TEXT2 },
  stepNumActive:      { color: '#fff' },
  stepLine:           { flex: 1, height: 2, backgroundColor: C.BORDER, marginHorizontal: 4 },
  stepLineActive:     { backgroundColor: C.PRIMARY },
  scrollContent:      { padding: 14, paddingBottom: 40 },
  headerCard:         { backgroundColor: C.CARD, borderRadius: 12, padding: 14, marginBottom: 14 },
  formTitle:          { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 3 },
  formSub:            { fontSize: 13, color: C.TEXT2 },
  sectionLabel:       { fontSize: 12, fontWeight: '700', color: C.TEXT2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 5, marginTop: 10 },
  input:              { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, padding: 11, fontSize: 14, color: C.TEXT },
  inputDisabled:      { backgroundColor: C.BG, color: C.TEXT2 },
  phoneRow:           { flexDirection: 'row', gap: 7, alignItems: 'center' },
  countryCode:        { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  countryCodeText:    { fontSize: 14, color: C.TEXT, fontWeight: '600' },
  genderRow:          { flexDirection: 'row', gap: 8, marginTop: 2 },
  genderChip:         { flex: 1, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  genderChipActive:   { backgroundColor: `${C.PRIMARY}15`, borderColor: C.PRIMARY },
  genderChipText:     { fontSize: 13, color: C.TEXT2, fontWeight: '500' },
  genderChipTextActive: { color: C.PRIMARY, fontWeight: '700' },
  uploadZone:         { borderWidth: 2, borderColor: C.BORDER, borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', backgroundColor: C.BG, marginBottom: 2 },
  uploadText:         { fontSize: 13, color: C.TEXT2, textAlign: 'center', fontWeight: '500' },
  uploadSub:          { fontSize: 11, color: C.TEXT3, marginTop: 3 },
  warningBox:         { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 10, marginTop: 12 },
  warningText:        { fontSize: 12, color: '#92400E', lineHeight: 16 },
  navFooter:          { flexDirection: 'row', gap: 10, marginTop: 20 },
  prevBtn:            { borderWidth: 1, borderColor: C.BORDER, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  prevBtnText:        { color: C.PRIMARY, fontSize: 16, fontWeight: '600' },
  nextBtn:            { flex: 1, backgroundColor: C.PRIMARY, borderRadius: 10, padding: 13, alignItems: 'center' },
  nextBtnText:        { color: '#fff', fontWeight: '700', fontSize: 15 },
});