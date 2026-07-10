import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { launchImageLibrary } from 'react-native-image-picker';
import { uploadFile } from '../../api/upload.api';
import { Image } from 'react-native';
import { orgApi } from '../../api/org.api';
import { lookupApi } from '../../api/lookup.api';
import type { LookupValue } from '../../types/api.types';

const C = AppConfig.COLORS;
const TOTAL_STEPS = 4;

interface FormData {
  // Step 1 — Basic Info
  orgName: string;
  orgTypeLkpId: number | null;
  registrationNumber: string;
  categoryLkpId: number | null;
  logoUrl: string;
  logoLocalUri: string;   // local URI before upload
  // Step 2 — Contact & Location
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  // Step 3 — About & Mission
  about: string;
  mission: string;
  vision: string;
}

const INITIAL: FormData = {
  orgName: '', orgTypeLkpId: null, registrationNumber: '', categoryLkpId: null, logoUrl: '', logoLocalUri: '',
  contactPerson: '', contactEmail: '', contactPhone: '', website: '',
  addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', country: 'India',
  about: '', mission: '', vision: '',
};

/* ─── Step Progress Bar ────────────────────────────────────────────────────── */
function StepBar({ current }: { current: number }) {
  return (
    <View style={styles.stepBar}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const step = i + 1;
        const done    = step < current;
        const active  = step === current;
        return (
          <React.Fragment key={step}>
            <View style={[styles.stepCircle, active && styles.stepCircleActive, done && styles.stepCircleDone]}>
              <Text style={[styles.stepNum, (active || done) && styles.stepNumActive]}>
                {done ? '✓' : step}
              </Text>
            </View>
            {step < TOTAL_STEPS && (
              <View style={[styles.stepLine, done && styles.stepLineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/* ─── Dropdown Picker (simple) ─────────────────────────────────────────────── */
function DropdownPicker({
  label, placeholder, items, selectedId, onSelect,
}: {
  label: string;
  placeholder: string;
  items: LookupValue[];
  selectedId: number | null;
  onSelect: (id: number, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find(i => i.lookupValueId === selectedId);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label} <Text style={{ color: C.RED }}>*</Text></Text>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={() => setOpen(!open)}
        activeOpacity={0.8}
        accessibilityLabel={label}
      >
        <Text style={[styles.dropdownBtnText, !selected && { color: C.TEXT2 }]}>
          {selected ? selected.valueName : placeholder}
        </Text>
        <Text style={{ fontSize: 14, color: C.TEXT2 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownList}>
          {items.map(item => (
            <TouchableOpacity
              key={item.lookupValueId}
              style={[styles.dropdownItem, item.lookupValueId === selectedId && styles.dropdownItemSelected]}
              onPress={() => { onSelect(item.lookupValueId, item.valueCode); setOpen(false); }}
            >
              <Text style={[styles.dropdownItemText, item.lookupValueId === selectedId && { color: C.PRIMARY, fontWeight: '700' }]}>
                {item.valueName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

/* ─── Text Field ───────────────────────────────────────────────────────────── */
function Field({
  label, value, onChange, placeholder, required, multiline, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>
        {label} {required && <Text style={{ color: C.RED }}>*</Text>}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? ''}
        placeholderTextColor={C.TEXT2}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        accessibilityLabel={label}
      />
    </View>
  );
}

/* ─── Main Screen ──────────────────────────────────────────────────────────── */
export default function CreateOrgScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [step,       setStep]       = useState(1);
  const [form,       setForm]       = useState<FormData>(INITIAL);
  const [orgTypes,   setOrgTypes]   = useState<LookupValue[]>([]);
  const [categories, setCategories] = useState<LookupValue[]>([]);
  const [submitting,  setSubmitting]  = useState(false);
  const [uploading,   setUploading]   = useState(false);

  const set = useCallback((key: keyof FormData, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const pickLogo = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 400,
        maxHeight: 400,
        includeBase64: false,
      });
      if (result.didCancel || !result.assets?.length) return;
      const asset = result.assets[0];
      const localUri = asset.uri ?? '';
      set('logoLocalUri', localUri);
      set('logoUrl', '');   // clear old URL, will upload on submit
    } catch {
      Alert.alert('Error', 'Could not open image picker.');
    }
  }, [set]);

  // Load lookup values
  useEffect(() => {
    lookupApi.getValuesByTypeCode(AppConfig.LOOKUP.ORG_TYPE).then(res => {
      if (res.data?.isSuccess) setOrgTypes(res.data.data ?? []);
    }).catch(() => {});

    lookupApi.getValuesByTypeCode(AppConfig.LOOKUP.ORG_CATEGORY).then(res => {
      if (res.data?.isSuccess) setCategories(res.data.data ?? []);
    }).catch(() => {});
  }, []);

  // Validate current step before proceeding
  const validateStep = (): string | null => {
    if (step === 1) {
      if (!form.orgName.trim())         return 'NGO Name is required.';
      if (!form.orgTypeLkpId)           return 'Please select an NGO Type.';
      if (!form.registrationNumber.trim()) return 'Registration Number is required.';
      if (!form.categoryLkpId)          return 'Please select a Category.';
    }
    if (step === 2) {
      if (!form.contactPerson.trim())   return 'Contact person name is required.';
      if (!form.contactEmail.trim())    return 'Contact email is required.';
      if (!form.contactPhone.trim())    return 'Contact phone is required.';
      if (!form.city.trim())            return 'City is required.';
      if (!form.state.trim())           return 'State is required.';
    }
    if (step === 3) {
      if (!form.about.trim())           return 'Please describe your organization.';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep();
    if (err) { Alert.alert('Missing Information', err); return; }
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  };

  const goBack = () => {
    if (step > 1) setStep(s => s - 1);
    else nav.goBack();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    // Upload logo first if a local image was picked
    let finalLogoUrl = form.logoUrl.trim();
    if (form.logoLocalUri) {
      try {
        setUploading(true);
        const ext  = form.logoLocalUri.split('.').pop() ?? 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        finalLogoUrl = await uploadFile(
          form.logoLocalUri,
          `logo_${Date.now()}.${ext}`,
          mime,
          AppConfig.UPLOAD_MODULES.ORG_LOGOS,
        );
      } catch {
        Alert.alert('Upload Failed', 'Could not upload the logo. You can still submit — add it later.');
      } finally {
        setUploading(false);
      }
    }
    try {
      const res = await orgApi.register({
        orgName:            form.orgName.trim(),
        orgTypeLkpId:       form.orgTypeLkpId!,
        registrationNumber: form.registrationNumber.trim(),
        category:           categories.find(c => c.lookupValueId === form.categoryLkpId)?.valueName ?? '',
        logoUrl:            finalLogoUrl || undefined,
        contactPerson:      form.contactPerson.trim(),
        contactEmail:       form.contactEmail.trim(),
        contactPhone:       form.contactPhone.trim(),
        website:            form.website.trim() || undefined,
        addressLine1:       form.addressLine1.trim() || undefined,
        addressLine2:       form.addressLine2.trim() || undefined,
        city:               form.city.trim(),
        state:              form.state.trim(),
        pincode:            form.pincode.trim() || undefined,
        country:            form.country.trim() || 'India',
        about:              form.about.trim(),
        mission:            form.mission.trim() || undefined,
        vision:             form.vision.trim() || undefined,
      });

      if (res.data?.isSuccess) {
        const newOrgId = (res.data.data as any)?.orgId;
        Alert.alert(
          '🎉 Organization Created!',
          'Your NGO has been registered successfully and is under review.',
          [{
            text: 'View Profile',
            onPress: () => {
              nav.replace('NgoProfile', { orgId: newOrgId });
            },
          }, {
            text: 'Go to My Organizations',
            onPress: () => { nav.replace('MyOrgs'); },
          }],
        );
      } else {
        Alert.alert('Registration Failed', res.data?.message ?? 'Please try again.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message
        ?? err?.message
        ?? 'Could not register. Check your connection and try again.';
      Alert.alert('Registration Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = ['Basic Information', 'Contact & Location', 'About & Mission', 'Review & Submit'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} accessibilityLabel="Back">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Organization</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Step bar */}
        <View style={styles.stepBarContainer}>
          <StepBar current={step} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>

          {/* Step label */}
          <Text style={styles.stepLabel}>{stepTitles[step - 1].toUpperCase()}</Text>

          {/* ── STEP 1: Basic Information ── */}
          {step === 1 && (
            <>
              <Field
                label="NGO Name"
                required
                value={form.orgName}
                onChange={v => set('orgName', v)}
                placeholder="e.g., Green Earth Foundation"
              />
              <DropdownPicker
                label="NGO Type"
                placeholder="Select type"
                items={orgTypes}
                selectedId={form.orgTypeLkpId}
                onSelect={(id) => set('orgTypeLkpId', id)}
              />
              <Field
                label="Registration Number"
                required
                value={form.registrationNumber}
                onChange={v => set('registrationNumber', v)}
                placeholder="REG/2024/12345"
              />
              <DropdownPicker
                label="Category"
                placeholder="Select category"
                items={categories}
                selectedId={form.categoryLkpId}
                onSelect={(id) => set('categoryLkpId', id)}
              />
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Logo Upload</Text>
                <Pressable
                  style={styles.uploadBox}
                  onPress={pickLogo}
                  android_ripple={{ color: 'rgba(107,78,255,0.1)', borderless: false }}
                  accessibilityLabel="Upload organization logo"
                >
                  {form.logoLocalUri ? (
                    <>
                      <Image source={{ uri: form.logoLocalUri }} style={styles.logoPreview} />
                      <Text style={[styles.uploadPrimary, { marginTop: 8 }]}>Tap to change</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 28, marginBottom: 8 }}>↑</Text>
                      <Text style={styles.uploadPrimary}>Tap to upload logo</Text>
                      <Text style={styles.uploadSub}>PNG, JPG up to 2MB</Text>
                    </>
                  )}
                </Pressable>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  value={form.logoUrl}
                  onChangeText={v => { set('logoUrl', v); set('logoLocalUri', ''); }}
                  placeholder="Or paste logo URL"
                  placeholderTextColor={C.TEXT2}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
            </>
          )}

          {/* ── STEP 2: Contact & Location ── */}
          {step === 2 && (
            <>
              <Field label="Contact Person" required value={form.contactPerson} onChange={v => set('contactPerson', v)} placeholder="Full name of primary contact" />
              <Field label="Contact Email" required value={form.contactEmail} onChange={v => set('contactEmail', v)} placeholder="contact@yourorg.org" keyboardType="email-address" />
              <Field label="Contact Phone" required value={form.contactPhone} onChange={v => set('contactPhone', v)} placeholder="+91 98765 43210" keyboardType="phone-pad" />
              <Field label="Website" value={form.website} onChange={v => set('website', v)} placeholder="https://yourorg.org" />
              <Field label="Address Line 1" value={form.addressLine1} onChange={v => set('addressLine1', v)} placeholder="Building / Street" />
              <Field label="Address Line 2" value={form.addressLine2} onChange={v => set('addressLine2', v)} placeholder="Area / Landmark" />
              <Field label="City" required value={form.city} onChange={v => set('city', v)} placeholder="Mumbai" />
              <Field label="State" required value={form.state} onChange={v => set('state', v)} placeholder="Maharashtra" />
              <Field label="Pincode" value={form.pincode} onChange={v => set('pincode', v)} placeholder="400001" keyboardType="numeric" />
              <Field label="Country" value={form.country} onChange={v => set('country', v)} placeholder="India" />
            </>
          )}

          {/* ── STEP 3: About & Mission ── */}
          {step === 3 && (
            <>
              <Field
                label="About"
                required
                multiline
                value={form.about}
                onChange={v => set('about', v)}
                placeholder="Describe your organization, its work, and the impact it creates..."
              />
              <Field
                label="Mission"
                multiline
                value={form.mission}
                onChange={v => set('mission', v)}
                placeholder="What is your organization's mission?"
              />
              <Field
                label="Vision"
                multiline
                value={form.vision}
                onChange={v => set('vision', v)}
                placeholder="What future does your organization envision?"
              />
            </>
          )}

          {/* ── STEP 4: Review & Submit ── */}
          {step === 4 && (
            <>
              <ReviewRow label="NGO Name"              value={form.orgName} />
              <ReviewRow label="NGO Type"              value={orgTypes.find(t => t.lookupValueId === form.orgTypeLkpId)?.valueName} />
              <ReviewRow label="Registration Number"   value={form.registrationNumber} />
              <ReviewRow label="Category"              value={categories.find(c => c.lookupValueId === form.categoryLkpId)?.valueName} />
              <ReviewRow label="Contact Person"        value={form.contactPerson} />
              <ReviewRow label="Contact Email"         value={form.contactEmail} />
              <ReviewRow label="Contact Phone"         value={form.contactPhone} />
              {form.website ? <ReviewRow label="Website" value={form.website} /> : null}
              <ReviewRow label="City / State"          value={[form.city, form.state].filter(Boolean).join(', ')} />
              {form.country ? <ReviewRow label="Country" value={form.country} /> : null}
              <ReviewRow label="About"                 value={form.about} multiline />
              {form.mission ? <ReviewRow label="Mission" value={form.mission} multiline /> : null}
              {form.vision  ? <ReviewRow label="Vision"  value={form.vision}  multiline /> : null}

              <View style={styles.reviewNote}>
                <Text style={styles.reviewNoteText}>
                  📋 After submission, your organization will be reviewed by the NGO Connect team. You'll receive a notification once approved.
                </Text>
              </View>
            </>
          )}

        </ScrollView>

        {/* Continue / Submit button */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          <Pressable
            style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.85 }, (submitting || uploading) && { opacity: 0.6 }]}
            onPress={step < TOTAL_STEPS ? goNext : handleSubmit}
            disabled={submitting || uploading}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            accessibilityLabel={step < TOTAL_STEPS ? 'Continue' : 'Submit'}
          >
            {submitting || uploading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.continueBtnText}>
                  {step < TOTAL_STEPS ? `Continue →` : 'Submit & Register'}
                </Text>
            }
          </Pressable>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ─── Review Row ───────────────────────────────────────────────────────────── */
function ReviewRow({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, multiline && { lineHeight: 22 }]} numberOfLines={multiline ? 6 : 2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: C.BG },

  // Header
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:           { fontSize: 15, color: C.TEXT, fontWeight: '500', width: 60 },
  headerTitle:        { fontSize: 16, fontWeight: '700', color: C.TEXT },

  // Step bar
  stepBarContainer:   { backgroundColor: C.CARD, paddingVertical: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  stepBar:            { flexDirection: 'row', alignItems: 'center' },
  stepCircle:         { width: 32, height: 32, borderRadius: 16, backgroundColor: C.CARD, borderWidth: 1.5, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  stepCircleActive:   { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  stepCircleDone:     { backgroundColor: C.TEAL, borderColor: C.TEAL },
  stepNum:            { fontSize: 13, fontWeight: '700', color: C.TEXT2 },
  stepNumActive:      { color: '#fff' },
  stepLine:           { flex: 1, height: 2, backgroundColor: C.BORDER },
  stepLineDone:       { backgroundColor: C.TEAL },

  // Scroll content
  scrollContent:      { padding: 16, paddingBottom: 24 },
  stepLabel:          { fontSize: 11, fontWeight: '700', color: C.TEXT2, letterSpacing: 1.2, marginBottom: 16 },

  // Fields
  fieldGroup:         { marginBottom: 14 },
  label:              { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 6 },
  input:              { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.TEXT },
  inputMulti:         { minHeight: 100, paddingTop: 12 },

  // Dropdown
  dropdownBtn:        { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownBtnText:    { fontSize: 14, color: C.TEXT },
  dropdownList:       { backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER, borderRadius: 10, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 5 },
  dropdownItem:       { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  dropdownItemSelected:{ backgroundColor: C.PRIMARY_LIGHT },
  dropdownItemText:   { fontSize: 14, color: C.TEXT },

  // Upload box
  uploadBox:          { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  logoPreview:        { width: 80, height: 80, borderRadius: 12 },
  uploadPrimary:      { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  uploadSub:          { fontSize: 12, color: C.TEXT2, marginTop: 3 },

  // Review
  reviewRow:          { backgroundColor: C.CARD, borderRadius: 10, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  reviewLabel:        { fontSize: 11, fontWeight: '700', color: C.TEXT2, marginBottom: 4, letterSpacing: 0.5 },
  reviewValue:        { fontSize: 14, color: C.TEXT, fontWeight: '500' },
  reviewNote:         { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  reviewNoteText:     { fontSize: 13, color: '#1D4ED8', lineHeight: 20 },

  // Footer
  footer:             { backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER, padding: 16 },
  continueBtn:        { backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: 'center', shadowColor: '#6B4EFF', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 6, elevation: 4 },
  continueBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});
