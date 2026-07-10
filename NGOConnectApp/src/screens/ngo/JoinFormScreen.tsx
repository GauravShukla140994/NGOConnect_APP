import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { getMyProfile, updateProfile, getMyDocuments, getMySkills } from '../../api/user.api';
import { requestMembership } from '../../api/org.api';
import DocumentUploadSection from '../../components/common/DocumentUploadSection';
import type { UserProfile, UserDocument, UserSkill } from '../../types/api.types';

const C = AppConfig.COLORS;

const STEPS = ['Personal Info', 'Address & Professional', 'Volunteer Info', 'Documents'] as const;
type Step = 0 | 1 | 2 | 3;

const GENDER_OPTIONS = [
  { label: 'Male',   value: 1 },
  { label: 'Female', value: 2 },
  { label: 'Other',  value: 3 },
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
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const orgId: number  = route.params?.orgId  ?? 1;
  const orgName: string = route.params?.orgName ?? 'NGO';

  const [step,    setStep]    = useState<Step>(0);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Step 0: Personal Info ──────────────────────────────────────────
  const [firstName,    setFirstName]    = useState('');
  const [lastName,     setLastName]     = useState('');
  const [email,        setEmail]        = useState('');
  const [countryCode,  setCountryCode]  = useState('');   // read-only, from registration
  const [mobile,       setMobile]       = useState('');   // read-only, from registration
  const [dob,       setDob]       = useState('');
  const [genderId,  setGenderId]  = useState<number | undefined>(undefined);

  // ── Step 1: Address & Professional ────────────────────────────────
  const [address,      setAddress]      = useState('');
  const [city,         setCity]         = useState('');
  const [stateName,    setStateName]    = useState('');
  const [pincode,      setPincode]      = useState('');
  const [occupation,   setOccupation]   = useState('');
  const [organisation, setOrganisation] = useState('');

  // ── Step 2: Volunteer Info ─────────────────────────────────────────
  const [volunteerExp, setVolunteerExp] = useState('');
  const [skills,       setSkills]       = useState<UserSkill[]>([]);
  const [newSkill,     setNewSkill]     = useState('');
  const [message,      setMessage]      = useState('');

  // ── Step 3: Documents ─────────────────────────────────────────────
  const [docs, setDocs] = useState<UserDocument[]>([]);

  // ── Load profile + skills + docs on mount ─────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [profileRes, skillsRes, docsRes] = await Promise.allSettled([
          getMyProfile(),
          getMySkills(),
          getMyDocuments(),
        ]);

        if (profileRes.status === 'fulfilled' && profileRes.value.data?.isSuccess && profileRes.value.data.data) {
          const p: UserProfile = profileRes.value.data.data;
          setFirstName(p.firstName   ?? '');
          setLastName(p.lastName     ?? '');
          setEmail(p.email           ?? '');
          setCountryCode(p.countryCode ?? '');
          setMobile(p.mobile           ?? '');
          setDob(p.dateOfBirth?.slice(0, 10) ?? '');
          setGenderId(p.genderLkpId  ?? undefined);
          setAddress(p.addressLine1  ?? '');
          setCity(p.city             ?? '');
          setStateName(p.state       ?? '');
          setPincode(p.pincode       ?? '');
          setOccupation(p.occupation ?? '');
          setOrganisation(p.organisation ?? '');
          setVolunteerExp(p.volunteerExp ?? '');
        }

        if (skillsRes.status === 'fulfilled' && skillsRes.value.data?.isSuccess)
          setSkills(skillsRes.value.data.data ?? []);

        if (docsRes.status === 'fulfilled' && docsRes.value.data?.isSuccess)
          setDocs(docsRes.value.data.data ?? []);

      } catch { /* prefill silently */ }
      setLoading(false);
    })();
  }, []);

  // ── Skills helpers (same pattern as EditProfileScreen) ────────────
  const handleAddSkill = useCallback(() => {
    const name = newSkill.trim();
    if (!name) return;
    // Prevent duplicate (case-insensitive)
    if (skills.some(s => s.skillName.toLowerCase() === name.toLowerCase())) {
      setNewSkill('');
      return;
    }
    setSkills(prev => [...prev, { userSkillId: Date.now(), skillName: name } as UserSkill]);
    setNewSkill('');
  }, [newSkill, skills]);

  const handleRemoveSkill = useCallback((id: number) => {
    setSkills(prev => prev.filter(s => s.userSkillId !== id));
  }, []);

  // ── Navigation ────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (step === 0 && !firstName.trim()) {
      Alert.alert('Required', 'First name is required.'); return;
    }
    if (step === 1 && !city.trim()) {
      Alert.alert('Required', 'City is required.'); return;
    }
    if (step < 3) setStep(s => (s + 1) as Step);
  }, [step, firstName, city]);

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      // 1. Persist any profile changes made during the join flow
      const profileRes = await updateProfile({
        firstName:    firstName.trim(),
        lastName:     lastName.trim(),
        dateOfBirth:  dob || undefined,
        genderLkpId:  genderId,
        addressLine1: address.trim(),
        city:         city.trim(),
        state:        stateName.trim(),
        pincode:      pincode.trim(),
        occupation:   occupation.trim(),
        organisation: organisation.trim(),
        volunteerExp: volunteerExp.trim(),
      });

      if (!profileRes.data?.isSuccess) {
        Alert.alert('Error', profileRes.data?.message ?? 'Could not save profile changes.');
        return;
      }

      // 2. Submit membership request
      const res = await requestMembership(orgId, {
        prevNgoExperience: volunteerExp.trim()                             || undefined,
        volunteerSkills:   skills.map(s => s.skillName).join(', ')        || undefined,
        whyJoin:           message.trim() || 'I would like to join your organization.',
      });
      if (res.data?.isSuccess) {
        Alert.alert(
          'Application Submitted!',
          'Your application will be reviewed within 2-3 business days.',
          [{ text: 'OK', onPress: () => nav.goBack() }],
        );
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not submit application.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Network error. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }, [firstName, lastName, dob, genderId, address, city, stateName, pincode,
      occupation, organisation, volunteerExp, message, orgId, nav]);

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  const FL = (label: string, required = false) => (
    <Text style={styles.fieldLabel}>
      {label}{required && <Text style={{ color: '#EF4444' }}> *</Text>}
    </Text>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => step === 0 ? nav.goBack() : setStep(s => (s - 1) as Step)}
        accessibilityLabel="Go back"
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <StepBar current={step} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Step 0: Personal Info ── */}
        {step === 0 && (
          <View>
            <View style={styles.headerCard}>
              <Text style={styles.formTitle}>Membership Application</Text>
              <Text style={styles.formSub}>Apply to join <Text style={{ fontWeight: '700' }}>{orgName}</Text></Text>
            </View>

            <Text style={styles.sectionLabel}>Personal Information</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>ℹ️  These details are from your profile and cannot be edited here.</Text>
            </View>

            {FL('First Name', true)}
            <TextInput style={[styles.input, styles.inputDisabled]} value={firstName}
              editable={false} accessibilityLabel="First name (read only)" />

            {FL('Last Name')}
            <TextInput style={[styles.input, styles.inputDisabled]} value={lastName}
              editable={false} accessibilityLabel="Last name (read only)" />

            {FL('Email Address')}
            <TextInput style={[styles.input, styles.inputDisabled]} value={email}
              editable={false} accessibilityLabel="Email (read only)" />
            <Text style={styles.readOnlyNote}>Email cannot be changed here</Text>

            {FL('Mobile Number')}
            <View style={styles.phoneRow}>
              <View style={[styles.input, styles.inputDisabled, styles.countryCodeBox]}>
                <Text style={styles.countryCodeText}>{countryCode || '+?'}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.inputDisabled, { flex: 1 }]}
                value={mobile}
                editable={false}
                placeholderTextColor={C.TEXT3}
                accessibilityLabel="Mobile number (read only)"
              />
            </View>
            <Text style={styles.readOnlyNote}>Mobile number cannot be changed here</Text>

            {FL('Date of Birth')}
            <TextInput style={[styles.input, styles.inputDisabled]} value={dob}
              editable={false} accessibilityLabel="Date of birth (read only)" />

            {FL('Gender')}
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map(g => (
                <TouchableOpacity
                  key={g.value}
                  disabled
                  style={[styles.genderChip, genderId === g.value && styles.genderChipActive, styles.genderChipDisabled]}
                >
                  <Text style={[styles.genderChipText, genderId === g.value && styles.genderChipTextActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Step 1: Address & Professional ── */}
        {step === 1 && (
          <View>
            <Text style={styles.sectionLabel}>Address & Professional</Text>

            {FL('Current Address')}
            <TextInput style={[styles.input, styles.inputMulti]} value={address}
              onChangeText={setAddress} placeholder="Street address..."
              placeholderTextColor={C.TEXT3} multiline />

            {FL('City', true)}
            <TextInput style={styles.input} value={city} onChangeText={setCity}
              placeholder="City" placeholderTextColor={C.TEXT3} />

            {FL('State / Province')}
            <TextInput style={styles.input} value={stateName} onChangeText={setStateName}
              placeholder="State or Province" placeholderTextColor={C.TEXT3} />

            {FL('Postal / Zip Code')}
            <TextInput style={styles.input} value={pincode} onChangeText={setPincode}
              placeholder="Postal code" keyboardType="default" placeholderTextColor={C.TEXT3} />

            {FL('Occupation', true)}
            <TextInput style={styles.input} value={occupation} onChangeText={setOccupation}
              placeholder="e.g. Software Engineer" placeholderTextColor={C.TEXT3} />

            {FL('Organisation / Company')}
            <TextInput style={styles.input} value={organisation} onChangeText={setOrganisation}
              placeholder="Company or institution" placeholderTextColor={C.TEXT3} />
          </View>
        )}

        {/* ── Step 2: Volunteer Info ── */}
        {step === 2 && (
          <View>
            <Text style={styles.sectionLabel}>Volunteer Information</Text>

            {FL('Previous Volunteer / NGO Experience')}
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={volunteerExp}
              onChangeText={setVolunteerExp}
              placeholder="List any NGOs or volunteer work you've done..."
              placeholderTextColor={C.TEXT3}
              multiline
            />

            {/* Skills — tag-based, auto-filled from profile */}
            {FL('Skills & Expertise')}
            <Text style={styles.hintText}>Your saved skills are pre-filled. Add or remove as needed.</Text>
            <View style={styles.addSkillRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={newSkill}
                onChangeText={setNewSkill}
                placeholder="Add a skill, e.g. Teaching"
                placeholderTextColor={C.TEXT3}
                onSubmitEditing={handleAddSkill}
                returnKeyType="done"
              />
              <Pressable style={styles.addBtn} onPress={handleAddSkill}>
                <Text style={styles.addBtnText}>+ Add</Text>
              </Pressable>
            </View>
            <View style={styles.tagRow}>
              {skills.map(s => (
                <View key={s.userSkillId} style={styles.skillTag}>
                  <Text style={styles.skillTagText}>{s.skillName}</Text>
                  <TouchableOpacity onPress={() => handleRemoveSkill(s.userSkillId)}>
                    <Text style={styles.removeIcon}> ✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {skills.length === 0 && (
                <Text style={styles.emptyHint}>No skills added yet.</Text>
              )}
            </View>

            {FL('Message to Organisation')}
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={message}
              onChangeText={setMessage}
              placeholder="Why do you want to join this NGO?"
              placeholderTextColor={C.TEXT3}
              multiline
            />
          </View>
        )}

        {/* ── Step 3: Documents ── */}
        {step === 3 && (
          <View>
            <Text style={styles.sectionLabel}>Document Uploads</Text>
            <Text style={styles.hintText}>
              Documents are saved to your profile and auto-filled next time you apply to any NGO.
            </Text>
            <DocumentUploadSection
              initialDocs={docs}
              onDocsChange={setDocs}
            />
            <View style={[styles.warningBox, { marginTop: 16 }]}>
              <Text style={styles.warningText}>⚠️ Your application will be reviewed within 2-3 business days.</Text>
            </View>
          </View>
        )}

        {/* ── Navigation footer ── */}
        <View style={styles.navFooter}>
          {step > 0 && (
            <TouchableOpacity
              style={styles.prevBtn}
              onPress={() => setStep(s => (s - 1) as Step)}
              accessibilityLabel="Previous step"
            >
              <Text style={styles.prevBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {step < 3 ? (
            <TouchableOpacity
              style={[styles.nextBtn, step === 0 && { flex: 1 }]}
              onPress={handleNext}
              accessibilityLabel="Continue"
            >
              <Text style={styles.nextBtnText}>Continue →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, saving && { opacity: 0.65 }]}
              onPress={handleSubmit}
              disabled={saving}
              accessibilityLabel="Submit application"
            >
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
  container:    { flex: 1, backgroundColor: C.BG },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  backRow:      {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 11, backgroundColor: C.CARD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  backText:     { color: C.TEXT2, fontSize: 14 },

  stepBar:      {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: C.CARD,
  },
  stepDot:      { width: 26, height: 26, borderRadius: 13, backgroundColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  stepDotActive:{ backgroundColor: C.PRIMARY },
  stepNum:      { fontSize: 13, fontWeight: '700', color: C.TEXT2 },
  stepNumActive:{ color: '#fff' },
  stepLine:     { flex: 1, height: 2, backgroundColor: C.BORDER, marginHorizontal: 4 },
  stepLineActive: { backgroundColor: C.PRIMARY },

  scrollContent:{ padding: 14, paddingBottom: 40 },

  headerCard:   { backgroundColor: C.CARD, borderRadius: 12, padding: 14, marginBottom: 14 },
  formTitle:    { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 3 },
  formSub:      { fontSize: 13, color: C.TEXT2 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: C.TEXT2,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 5, marginTop: 12 },
  readOnlyNote: { fontSize: 11, color: C.TEXT3, marginTop: 3 },
  hintText:     { fontSize: 12, color: C.TEXT2, marginBottom: 10, marginTop: 2 },

  input:        {
    backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER,
    borderRadius: 10, padding: 11, fontSize: 14, color: C.TEXT,
  },
  inputDisabled:    { backgroundColor: C.BG, color: C.TEXT2 },
  inputMulti:       { height: 80, textAlignVertical: 'top', paddingTop: 10 },

  phoneRow:         { flexDirection: 'row', gap: 8, alignItems: 'center' },
  countryCodeBox:   { paddingHorizontal: 14, justifyContent: 'center', minWidth: 72 },
  countryCodeText:  { fontSize: 14, fontWeight: '600', color: C.TEXT2 },

  infoBox:      { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, padding: 10, marginBottom: 6 },
  infoBoxText:  { fontSize: 12, color: '#1D4ED8', lineHeight: 16 },

  genderRow:    { flexDirection: 'row', gap: 8, marginTop: 4 },
  genderChip:   { flex: 1, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  genderChipActive:    { backgroundColor: `${C.PRIMARY}15`, borderColor: C.PRIMARY },
  genderChipDisabled:  { opacity: 0.6 },
  genderChipText:      { fontSize: 13, color: C.TEXT2, fontWeight: '500' },
  genderChipTextActive:{ color: C.PRIMARY, fontWeight: '700' },

  // Skills
  addSkillRow:  { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  addBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
  addBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  tagRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  skillTag:     {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.PRIMARY_LIGHT,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  skillTagText: { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  removeIcon:   { fontSize: 12, color: C.PRIMARY, fontWeight: '700' },
  emptyHint:    { fontSize: 13, color: C.TEXT3, fontStyle: 'italic' },

  warningBox:   { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 10 },
  warningText:  { fontSize: 12, color: '#92400E', lineHeight: 16 },

  navFooter:    { flexDirection: 'row', gap: 10, marginTop: 20 },
  prevBtn:      { borderWidth: 1, borderColor: C.BORDER, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  prevBtnText:  { color: C.TEXT2, fontWeight: '600' },
  nextBtn:      { flex: 1, backgroundColor: C.PRIMARY, borderRadius: 10, padding: 13, alignItems: 'center' },
  nextBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
