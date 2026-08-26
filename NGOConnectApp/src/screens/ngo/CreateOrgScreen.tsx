import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker, { types as DocTypes } from 'react-native-document-picker';
import { uploadFile } from '../../api/upload.api';
import { Image } from 'react-native';
import { orgApi } from '../../api/org.api';
import { lookupApi } from '../../api/lookup.api';
import { COUNTRIES, DEFAULT_COUNTRY } from '../../constants/countries';
import type { LookupValue } from '../../types/api.types';
import type { Country } from '../../constants/countries';

const C = AppConfig.COLORS;
const TOTAL_STEPS = 5;

interface FormData {
  // Step 1 — Basic Info
  orgName: string;
  orgTypeLkpId: number | null;
  registrationNumber: string;
  isNonRegistered: boolean;   // true = organisation has no govt registration number
  categoryLkpId: number | null;
  logoUrl: string;
  logoLocalUri: string;
  // Step 2 — Contact & Location
  contactPerson: string;
  contactEmail: string;
  contactPhoneCountry: Country;
  contactPhone: string;        // digits only, no dial code
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
  // Step 4 — Documents & Certifications
  regCertLocalUri: string;
  regCertUrl: string;
  regCertFileName: string;
  otherDocLocalUri: string;
  otherDocUrl: string;
  otherDocFileName: string;
  is80G: boolean;
  is12A: boolean;
}

const INITIAL: FormData = {
  orgName: '', orgTypeLkpId: null, registrationNumber: '', isNonRegistered: false, categoryLkpId: null, logoUrl: '', logoLocalUri: '',
  contactPerson: '', contactEmail: '',
  contactPhoneCountry: DEFAULT_COUNTRY, contactPhone: '',
  website: '',
  addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', country: 'India',
  about: '', mission: '', vision: '',
  regCertLocalUri: '', regCertUrl: '', regCertFileName: '',
  otherDocLocalUri: '', otherDocUrl: '', otherDocFileName: '',
  is80G: false, is12A: false,
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

/* ─── Dropdown Picker ──────────────────────────────────────────────────────── */
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

/* ─── Phone Field with Country Code ───────────────────────────────────────── */
function PhoneField({
  label, required, phoneCountry, phone, onCountryPress, onPhoneChange,
}: {
  label: string;
  required?: boolean;
  phoneCountry: Country;
  phone: string;
  onCountryPress: () => void;
  onPhoneChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label} {required && <Text style={{ color: C.RED }}>*</Text>}</Text>
      <View style={styles.phoneRow}>
        <TouchableOpacity
          style={styles.countryPickerBtn}
          onPress={onCountryPress}
          activeOpacity={0.7}
          accessibilityLabel="Select country code"
        >
          <Text style={styles.flagText}>{phoneCountry.flag}</Text>
          <Text style={styles.dialText}>{phoneCountry.dial}</Text>
          <Text style={styles.chevronText}>▾</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.phoneInput}
          value={phone}
          onChangeText={v => onPhoneChange(v.replace(/\D/g, ''))}
          placeholder={phoneCountry.placeholder}
          placeholderTextColor={C.TEXT2}
          keyboardType="phone-pad"
          maxLength={phoneCountry.maxLen}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

/* ─── Toggle Field ─────────────────────────────────────────────────────────── */
function ToggleField({ label, subtitle, value, onValueChange }: {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.toggleSub}>{subtitle}</Text>}
      </View>
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

/* ─── Document Upload Field ────────────────────────────────────────────────── */
function DocUploadField({ label, subtitle, required, localUri, uploadedUrl, fileName, onPick }: {
  label: string;
  subtitle?: string;
  required?: boolean;
  localUri: string;
  uploadedUrl: string;
  fileName?: string;
  onPick: () => void;
}) {
  const hasLocal  = !!localUri;
  const hasRemote = !!uploadedUrl && !localUri;  // pre-existing S3 file, not yet replaced
  const hasFile   = hasLocal || hasRemote;

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label} {required && <Text style={{ color: C.RED }}>*</Text>}</Text>
      {!!subtitle && <Text style={styles.docSubtitle}>{subtitle}</Text>}

      {/* Row shown when a saved remote file exists */}
      {hasRemote && (
        <View style={styles.docRemoteRow}>
          <Text style={{ fontSize: 18, marginRight: 8 }}>📄</Text>
          <Text style={styles.docRemoteFileName} numberOfLines={1}>
            {fileName || 'Document uploaded'}
          </Text>
          <TouchableOpacity
            style={styles.docDownloadBtn}
            onPress={() => Linking.openURL(uploadedUrl)}
            accessibilityLabel="Download document"
          >
            <Text style={styles.docDownloadIcon}>⬇</Text>
            <Text style={styles.docDownloadLabel}>View</Text>
          </TouchableOpacity>
        </View>
      )}

      <Pressable
        style={[styles.docUploadBox, hasFile && styles.docUploadBoxDone, hasRemote && { marginTop: 8, paddingVertical: 14 }]}
        onPress={onPick}
        android_ripple={{ color: 'rgba(107,78,255,0.1)', borderless: false }}
        accessibilityLabel={`Upload ${label}`}
      >
        {hasLocal ? (
          <>
            <Text style={{ fontSize: 24, marginBottom: 4 }}>✅</Text>
            <Text style={styles.docUploadDoneText}>New file selected</Text>
            <Text style={styles.docUploadChangeText}>Tap to change</Text>
          </>
        ) : hasRemote ? (
          <>
            <Text style={{ fontSize: 18, marginBottom: 2 }}>🔄</Text>
            <Text style={styles.docUploadChangeText}>Tap to replace file</Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 24, marginBottom: 4 }}>📎</Text>
            <Text style={styles.docUploadPrimary}>Tap to upload</Text>
            <Text style={styles.docUploadSub}>PDF, JPG, PNG · max 10 MB</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

/* ─── Main Screen ──────────────────────────────────────────────────────────── */
export default function CreateOrgScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();

  // Resubmit mode — set when navigating from RejectedOrgCard
  const isResubmit    = route.params?.mode === 'resubmit';
  const resubmitOrgId = route.params?.orgId as number | undefined;

  const [step,               setStep]               = useState(1);
  const [form,               setForm]               = useState<FormData>(INITIAL);
  const [orgTypes,           setOrgTypes]           = useState<LookupValue[]>([]);
  const [categories,         setCategories]         = useState<LookupValue[]>([]);
  const [orgDocTypes,        setOrgDocTypes]        = useState<LookupValue[]>([]);
  const [submitting,         setSubmitting]         = useState(false);
  const [uploading,          setUploading]          = useState(false);
  const [loadingProfile,     setLoadingProfile]     = useState(isResubmit);
  const [prefillCategoryCode,setPrefillCategoryCode]= useState<string | null>(null);

  // Country picker state
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch,     setCountrySearch]     = useState('');
  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.dial.includes(countrySearch))
    : COUNTRIES;

  const set = useCallback((key: keyof FormData, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const pickLogo = useCallback(async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, maxWidth: 400, maxHeight: 400 });
      if (result.didCancel || !result.assets?.length) return;
      set('logoLocalUri', result.assets[0].uri ?? '');
      set('logoUrl', '');
    } catch { Alert.alert('Error', 'Could not open image picker.'); }
  }, [set]);

  const pickDoc = useCallback(async (field: 'regCert' | 'otherDoc') => {
    try {
      // DocumentPicker opens the file manager — supports PDF, images, Word, etc.
      const [picked] = await DocumentPicker.pick({
        type: [DocTypes.pdf, DocTypes.images, DocTypes.allFiles],
        allowMultiSelection: false,
        copyTo: 'cachesDirectory',
      });
      const uri  = picked.fileCopyUri ?? picked.uri;
      const name = picked.name ?? uri.split('/').pop() ?? 'document';
      if (field === 'regCert') {
        set('regCertLocalUri',  uri);
        set('regCertUrl',       '');
        set('regCertFileName',  name);
      } else {
        set('otherDocLocalUri', uri);
        set('otherDocUrl',      '');
        set('otherDocFileName', name);
      }
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) { return; } // user cancelled — silent
      Alert.alert('Error', 'Could not open file picker. Please try again.');
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
    // DOCUMENT_TYPE_ORG — needed to resolve REG_CERT / OTHER LookupValueIds after registration
    lookupApi.getValuesByTypeCode('DOCUMENT_TYPE_ORG').then(res => {
      if (res.data?.isSuccess) setOrgDocTypes(res.data.data ?? []);
    }).catch(() => {});
  }, []);

  // Resubmit mode — load full org profile + existing documents to pre-fill the form
  useEffect(() => {
    if (!isResubmit || !resubmitOrgId) return;

    Promise.all([
      orgApi.getProfile(resubmitOrgId),
      orgApi.getDocuments(resubmitOrgId),
    ]).then(([profileRes, docsRes]) => {
      // ── Profile ──────────────────────────────────────────────────────────────
      if (profileRes.data?.isSuccess && profileRes.data.data) {
        const o = profileRes.data.data;
        setForm(prev => ({
          ...prev,
          orgName:            o.orgName ?? '',
          orgTypeLkpId:       o.orgTypeLkpId ?? null,
          registrationNumber: (o as any).regNumber ?? o.registrationNumber ?? '',
          isNonRegistered:    !!(o.isNonRegistered),
          logoUrl:            o.logoUrl ?? '',
          contactPerson:      o.contactPerson ?? '',
          contactEmail:       o.contactEmail ?? '',
          // Match stored phone (+919815854851) against COUNTRIES dial codes to strip correctly.
          // Greedy regex like /^\+\d{1,3}/ wrongly strips +919 instead of +91.
          ...(() => {
            const raw = o.contactPhone ?? '';
            if (!raw.startsWith('+')) return { contactPhone: raw };
            const matched = COUNTRIES
              .slice()
              .sort((a, b) => b.dial.length - a.dial.length)  // longest dial code first
              .find(c => raw.startsWith(c.dial));
            if (matched) return { contactPhoneCountry: matched, contactPhone: raw.slice(matched.dial.length).trim() };
            return { contactPhone: raw.replace(/^\+\d{1,4}\s?/, '') };
          })(),
          website:            o.website ?? '',
          addressLine1:       o.addressLine1 ?? '',
          addressLine2:       o.addressLine2 ?? '',
          city:               o.city ?? '',
          state:              o.state ?? '',
          pincode:            o.pincode ?? '',
          country:            o.country ?? 'India',
          about:              o.about ?? '',
          mission:            o.mission ?? '',
          vision:             o.vision ?? '',
          is80G:              !!((o as any).is80GEligible ?? o.is80G),
          is12A:              !!((o as any).is12AEligible ?? o.is12A),
        }));
        if (o.category) setPrefillCategoryCode(o.category);
      } else {
        const msg  = profileRes.data?.message ?? 'Unknown error from API';
        const code = profileRes.data?.errorCode ?? '';
        Alert.alert('Could not load organisation data', `Server said: "${msg}" (${code})`);
      }

      // ── Documents ────────────────────────────────────────────────────────────
      if (docsRes.data?.isSuccess && Array.isArray(docsRes.data.data)) {
        const docs = docsRes.data.data;
        const regCert  = docs.find((d: any) => d.valueCode === 'REG_CERT'  || d.documentTypeCode === 'REG_CERT');
        const otherDoc = docs.find((d: any) => d.valueCode === 'OTHER'     || d.documentTypeCode === 'OTHER');
        setForm(prev => ({
          ...prev,
          regCertUrl:      regCert?.fileUrl   ?? prev.regCertUrl,
          regCertFileName: regCert?.fileName  ?? prev.regCertFileName,
          otherDocUrl:     otherDoc?.fileUrl  ?? prev.otherDocUrl,
          otherDocFileName:otherDoc?.fileName ?? prev.otherDocFileName,
        }));
      }
    }).catch((err: any) => {
      console.error('[CreateOrg/resubmit] load failed:', err?.message);
      Alert.alert('Could not load organisation', 'Failed to fetch organisation details. Please go back and try again.');
    }).finally(() => setLoadingProfile(false));
  }, [isResubmit, resubmitOrgId]);

  // Resolve categoryLkpId once categories are loaded and we have the ValueCode
  useEffect(() => {
    if (!prefillCategoryCode || !categories.length) return;
    const cat = categories.find(c => c.valueCode === prefillCategoryCode);
    if (cat) setForm(f => ({ ...f, categoryLkpId: cat.lookupValueId }));
  }, [prefillCategoryCode, categories]);

  // Validate current step
  const validateStep = (): string | null => {
    if (step === 1) {
      if (!form.orgName.trim())              return 'Organisation Name is required.';
      if (!form.orgTypeLkpId)                return 'Please select an Organisation Type.';
      if (!form.isNonRegistered && !form.registrationNumber.trim())
        return 'Registration Number is required, or select "Not Registered".';
      if (!form.categoryLkpId)               return 'Please select a Category.';
    }
    if (step === 2) {
      if (!form.contactPerson.trim())        return 'Contact person name is required.';
      if (!form.contactEmail.trim())         return 'Contact email is required.';
      if (!form.contactPhone.trim())         return 'Contact phone number is required.';
      if (form.contactPhone.length < form.contactPhoneCountry.minLen)
        return `Phone number must be at least ${form.contactPhoneCountry.minLen} digits for ${form.contactPhoneCountry.name}.`;
      if (!form.city.trim())                 return 'City is required.';
      if (!form.state.trim())                return 'State is required.';
    }
    if (step === 3) {
      if (!form.about.trim())                return 'Please describe your organization.';
    }
    // Step 4 (Documents) — Registration Certificate is optional for now
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

    // 1. Upload logo
    let finalLogoUrl = form.logoUrl.trim();
    if (form.logoLocalUri) {
      try {
        setUploading(true);
        const ext  = form.logoLocalUri.split('.').pop() ?? 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        finalLogoUrl = await uploadFile(form.logoLocalUri, `logo_${Date.now()}.${ext}`, mime, AppConfig.UPLOAD_MODULES.ORG_LOGOS);
      } catch {
        Alert.alert('Upload Note', 'Logo upload failed — you can update it later.');
      }
    }

    // 2. Upload registration certificate
    let regCertFinalUrl = form.regCertUrl;
    if (form.regCertLocalUri) {
      try {
        const ext  = form.regCertLocalUri.split('.').pop() ?? 'jpg';
        const mime = ext === 'pdf' ? 'application/pdf' : (ext === 'png' ? 'image/png' : 'image/jpeg');
        regCertFinalUrl = await uploadFile(form.regCertLocalUri, `regcert_${Date.now()}.${ext}`, mime, AppConfig.UPLOAD_MODULES.ORG_DOCUMENTS);
      } catch {
        Alert.alert('Upload Note', 'Registration certificate upload failed — you can add it later.');
      }
    }

    // 3. Upload other document
    let otherDocFinalUrl = form.otherDocUrl;
    if (form.otherDocLocalUri) {
      try {
        const ext  = form.otherDocLocalUri.split('.').pop() ?? 'jpg';
        const mime = ext === 'pdf' ? 'application/pdf' : (ext === 'png' ? 'image/png' : 'image/jpeg');
        otherDocFinalUrl = await uploadFile(form.otherDocLocalUri, `otherdoc_${Date.now()}.${ext}`, mime, AppConfig.UPLOAD_MODULES.ORG_DOCUMENTS);
      } catch { /* silent */ }
    }

    setUploading(false);

    // 4. Register org
    try {
      const fullPhone = form.contactPhone.trim()
        ? `${form.contactPhoneCountry.dial} ${form.contactPhone.trim()}`
        : undefined;
      const res = await orgApi.register({
        orgName:            form.orgName.trim(),
        orgTypeLkpId:       form.orgTypeLkpId!,
        registrationNumber: form.isNonRegistered ? undefined : form.registrationNumber.trim() || undefined,
        isNonRegistered:    form.isNonRegistered,
        category:           categories.find(c => c.lookupValueId === form.categoryLkpId)?.valueCode ?? '',
        logoUrl:            finalLogoUrl || undefined,
        contactPerson:      form.contactPerson.trim(),
        contactEmail:       form.contactEmail.trim(),
        contactPhone:       fullPhone,
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
        is80GEligible:      form.is80G,
        is12AEligible:      form.is12A,
      } as any);

      if (res.data?.isSuccess) {
        const newOrgId = (res.data.data as any)?.orgId;

        // 5. Save documents to OrgDocuments table now that we have an orgId.
        //    registrationCertUrl / otherDocumentUrl are NOT fields on Org_Register —
        //    they must be posted separately to POST /org/{orgId}/documents.
        if (newOrgId) {
          const regCertType  = orgDocTypes.find(d => d.valueCode === 'REG_CERT');
          const otherDocType = orgDocTypes.find(d => d.valueCode === 'OTHER');

          if (regCertFinalUrl && regCertType) {
            try {
              await orgApi.uploadDocument(newOrgId, {
                documentTypeLkpId: regCertType.lookupValueId,
                fileUrl:           regCertFinalUrl,
                fileName:          form.regCertFileName || 'registration_certificate',
              });
            } catch { /* non-fatal — admin can re-upload later */ }
          }

          if (otherDocFinalUrl && otherDocType) {
            try {
              await orgApi.uploadDocument(newOrgId, {
                documentTypeLkpId: otherDocType.lookupValueId,
                fileUrl:           otherDocFinalUrl,
                fileName:          form.otherDocFileName || 'other_document',
              });
            } catch { /* non-fatal */ }
          }
        }

        Alert.alert(
          '🎉 Organisation Created!',
          'Your NGO has been registered and is under review. You\'ll be notified once approved.',
          [{
            text: 'View Profile',
            onPress: () => nav.replace('NgoProfile', { orgId: newOrgId }),
          }, {
            text: 'My Organisations',
            onPress: () => nav.replace('MyOrgs'),
          }],
        );
      } else {
        Alert.alert('Registration Failed', res.data?.message ?? 'Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Registration Failed',
        err?.response?.data?.message ?? err?.message ?? 'Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = async () => {
    if (!resubmitOrgId) return;
    setSubmitting(true);

    // 1. Upload logo if user picked a new one
    let finalLogoUrl = form.logoUrl.trim();
    if (form.logoLocalUri) {
      try {
        setUploading(true);
        const ext  = form.logoLocalUri.split('.').pop() ?? 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        finalLogoUrl = await uploadFile(form.logoLocalUri, `logo_${Date.now()}.${ext}`, mime, AppConfig.UPLOAD_MODULES.ORG_LOGOS);
      } catch {
        Alert.alert('Upload Note', 'Logo upload failed — you can update it later.');
      }
    }

    // 2. Upload any new documents picked in step 4
    let regCertFinalUrl = form.regCertUrl;
    if (form.regCertLocalUri) {
      try {
        const ext  = form.regCertLocalUri.split('.').pop() ?? 'jpg';
        const mime = ext === 'pdf' ? 'application/pdf' : (ext === 'png' ? 'image/png' : 'image/jpeg');
        regCertFinalUrl = await uploadFile(form.regCertLocalUri, `regcert_${Date.now()}.${ext}`, mime, AppConfig.UPLOAD_MODULES.ORG_DOCUMENTS);
      } catch {
        Alert.alert('Upload Note', 'Registration certificate upload failed — you can add it later.');
      }
    }
    let otherDocFinalUrl = form.otherDocUrl;
    if (form.otherDocLocalUri) {
      try {
        const ext  = form.otherDocLocalUri.split('.').pop() ?? 'jpg';
        const mime = ext === 'pdf' ? 'application/pdf' : (ext === 'png' ? 'image/png' : 'image/jpeg');
        otherDocFinalUrl = await uploadFile(form.otherDocLocalUri, `otherdoc_${Date.now()}.${ext}`, mime, AppConfig.UPLOAD_MODULES.ORG_DOCUMENTS);
      } catch { /* silent */ }
    }
    setUploading(false);

    // 3. Post any newly uploaded docs to OrgDocuments
    const regCertType  = orgDocTypes.find(d => d.valueCode === 'REG_CERT');
    const otherDocType = orgDocTypes.find(d => d.valueCode === 'OTHER');
    if (regCertFinalUrl && form.regCertLocalUri && regCertType) {
      try { await orgApi.uploadDocument(resubmitOrgId, { documentTypeLkpId: regCertType.lookupValueId, fileUrl: regCertFinalUrl, fileName: form.regCertFileName || 'registration_certificate' }); }
      catch { /* non-fatal */ }
    }
    if (otherDocFinalUrl && form.otherDocLocalUri && otherDocType) {
      try { await orgApi.uploadDocument(resubmitOrgId, { documentTypeLkpId: otherDocType.lookupValueId, fileUrl: otherDocFinalUrl, fileName: form.otherDocFileName || 'other_document' }); }
      catch { /* non-fatal */ }
    }

    // 4. Resubmit core org fields
    try {
      const fullPhone = form.contactPhone.trim()
        ? `${form.contactPhoneCountry.dial} ${form.contactPhone.trim()}`
        : undefined;
      const res = await orgApi.resubmit(resubmitOrgId, {
        orgName:       form.orgName.trim(),
        category:      categories.find(c => c.lookupValueId === form.categoryLkpId)?.valueCode,
        contactPerson: form.contactPerson.trim() || undefined,
        about:         form.about.trim() || undefined,
        mission:       form.mission.trim() || undefined,
        vision:        form.vision.trim() || undefined,
        logoUrl:       finalLogoUrl || undefined,
        contactEmail:  form.contactEmail.trim() || undefined,
        contactPhone:  fullPhone,
        website:       form.website.trim() || undefined,
        addressLine1:  form.addressLine1.trim() || undefined,
        addressLine2:  form.addressLine2.trim() || undefined,
        pincode:       form.pincode.trim() || undefined,
        city:          form.city.trim() || undefined,
        state:         form.state.trim() || undefined,
        country:          form.country.trim() || 'India',
        is80GEligible:    form.is80G,
        is12AEligible:    form.is12A,
      });
      if (res.data?.isSuccess) {
        Alert.alert(
          '✅ Resubmitted!',
          "Your organisation has been submitted for review again. You'll be notified once approved.",
          [{ text: 'OK', onPress: () => nav.replace('MyOrgs') }],
        );
      } else {
        Alert.alert('Resubmit Failed', res.data?.message ?? 'Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Resubmit Failed',
        err?.response?.data?.message ?? err?.message ?? 'Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = [
    'Basic Information',
    'Contact & Location',
    'About & Mission',
    'Documents & Certifications',
    'Review & Submit',
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} accessibilityLabel="Back">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isResubmit ? 'Edit & Resubmit' : 'Create Organisation'}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Step bar */}
        <View style={styles.stepBarContainer}>
          <StepBar current={step} />
        </View>

        {/* Loading overlay while fetching org profile in resubmit mode */}
        {loadingProfile && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={C.PRIMARY} />
            <Text style={{ color: C.TEXT2, marginTop: 12, fontSize: 14 }}>Loading organisation details…</Text>
          </View>
        )}

        {!loadingProfile && (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>

          {/* Step label */}
          <Text style={styles.stepLabel}>{stepTitles[step - 1].toUpperCase()}</Text>

          {/* ── STEP 1: Basic Information ── */}
          {step === 1 && (
            <>
              <Field
                label="Organisation Name" required value={form.orgName}
                onChange={v => set('orgName', v)} placeholder="e.g., Green Earth Foundation"
              />
              <DropdownPicker
                label="Organisation Type" placeholder="Select type"
                items={orgTypes} selectedId={form.orgTypeLkpId}
                onSelect={(id) => set('orgTypeLkpId', id)}
              />
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
                onPress={() => {
                  set('isNonRegistered', !form.isNonRegistered);
                  if (!form.isNonRegistered) set('registrationNumber', '');
                }}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4,
                  borderWidth: 2, borderColor: form.isNonRegistered ? '#7C3AED' : '#CBD5E0',
                  backgroundColor: form.isNonRegistered ? '#7C3AED' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {form.isNonRegistered && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 13, color: '#4B5563', flex: 1 }}>
                  Organisation is not registered / no registration number available
                </Text>
              </TouchableOpacity>
              {!form.isNonRegistered && (
                <Field
                  label="Registration Number" required value={form.registrationNumber}
                  onChange={v => set('registrationNumber', v)} placeholder="REG/2024/12345"
                />
              )}
              <DropdownPicker
                label="Category" placeholder="Select category"
                items={categories} selectedId={form.categoryLkpId}
                onSelect={(id) => set('categoryLkpId', id)}
              />
              {/* Logo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Logo Upload</Text>
                <Pressable
                  style={styles.uploadBox} onPress={pickLogo}
                  android_ripple={{ color: 'rgba(107,78,255,0.1)', borderless: false }}
                  accessibilityLabel="Upload organisation logo"
                >
                  {(form.logoLocalUri || form.logoUrl) ? (
                    <>
                      <Image
                        source={{ uri: form.logoLocalUri || form.logoUrl }}
                        style={styles.logoPreview}
                        resizeMode="cover"
                      />
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
                {/* Only show URL paste input when no logo is set — hides raw CDN URLs */}
                {!form.logoLocalUri && !form.logoUrl && (
                  <TextInput
                    style={[styles.input, { marginTop: 8 }]}
                    value={form.logoUrl}
                    onChangeText={v => { set('logoUrl', v); set('logoLocalUri', ''); }}
                    placeholder="Or paste logo URL"
                    placeholderTextColor={C.TEXT2}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                )}
              </View>
            </>
          )}

          {/* ── STEP 2: Contact & Location ── */}
          {step === 2 && (
            <>
              <Field label="Contact Person" required value={form.contactPerson}
                onChange={v => set('contactPerson', v)} placeholder="Full name of primary contact" />

              <Field label="Contact Email" required value={form.contactEmail}
                onChange={v => set('contactEmail', v)} placeholder="contact@yourorg.org"
                keyboardType="email-address" />

              <PhoneField
                label="Contact Phone" required
                phoneCountry={form.contactPhoneCountry}
                phone={form.contactPhone}
                onCountryPress={() => { setCountrySearch(''); setShowCountryPicker(true); }}
                onPhoneChange={v => set('contactPhone', v)}
              />

              <Field label="Website" value={form.website}
                onChange={v => set('website', v)} placeholder="https://yourorg.org" />

              <Field label="Address Line 1" value={form.addressLine1}
                onChange={v => set('addressLine1', v)} placeholder="Building / Street" />
              <Field label="Address Line 2" value={form.addressLine2}
                onChange={v => set('addressLine2', v)} placeholder="Area / Landmark" />
              <Field label="City" required value={form.city}
                onChange={v => set('city', v)} placeholder="Mumbai" />
              <Field label="State" required value={form.state}
                onChange={v => set('state', v)} placeholder="Maharashtra" />
              <Field label="Pincode" value={form.pincode}
                onChange={v => set('pincode', v)} placeholder="400001" keyboardType="numeric" />
              <Field label="Country" value={form.country}
                onChange={v => set('country', v)} placeholder="India" />
            </>
          )}

          {/* ── STEP 3: About & Mission ── */}
          {step === 3 && (
            <>
              <Field
                label="About" required multiline value={form.about}
                onChange={v => set('about', v)}
                placeholder="Describe your organisation, its work, and the impact it creates..."
              />
              <Field
                label="Mission" multiline value={form.mission}
                onChange={v => set('mission', v)}
                placeholder="What is your organisation's mission?"
              />
              <Field
                label="Vision" multiline value={form.vision}
                onChange={v => set('vision', v)}
                placeholder="What future does your organisation envision?"
              />
            </>
          )}

          {/* ── STEP 4: Documents & Certifications ── */}
          {step === 4 && (
            <>
              <View style={styles.stepHint}>
                <Text style={styles.stepHintText}>
                  Upload supporting documents to help us verify your organisation faster. Documents are reviewed by the RippleHub team and are not shown publicly.
                </Text>
              </View>

              {/* Registration Certificate */}
              <DocUploadField
                label="Registration Certificate"
                subtitle="Upload your NGO registration certificate (PDF or photo)"
                localUri={form.regCertLocalUri}
                uploadedUrl={form.regCertUrl}
                fileName={form.regCertFileName}
                onPick={() => pickDoc('regCert')}
              />

              {/* Other Documents */}
              <DocUploadField
                label="Other Supporting Document"
                subtitle="Any additional proof of operations, tax filings, or government approvals"
                localUri={form.otherDocLocalUri}
                uploadedUrl={form.otherDocUrl}
                fileName={form.otherDocFileName}
                onPick={() => pickDoc('otherDoc')}
              />

              {/* Divider */}
              <View style={styles.certDivider}>
                <View style={styles.certDividerLine} />
                <Text style={styles.certDividerLabel}>TAX CERTIFICATIONS</Text>
                <View style={styles.certDividerLine} />
              </View>

              <View style={styles.certCard}>
                <ToggleField
                  label="80G Certified"
                  subtitle="Donations to your NGO are tax-exempt for donors under Section 80G"
                  value={form.is80G}
                  onValueChange={v => set('is80G', v)}
                />
                <View style={styles.toggleDivider} />
                <ToggleField
                  label="12A Registered"
                  subtitle="Your NGO is exempt from paying income tax under Section 12A"
                  value={form.is12A}
                  onValueChange={v => set('is12A', v)}
                />
              </View>
            </>
          )}

          {/* ── STEP 5: Review & Submit ── */}
          {step === 5 && (
            <>
              <ReviewSection title="Basic Information">
                <ReviewRow label="Organisation Name"    value={form.orgName} />
                <ReviewRow label="Organisation Type"   value={orgTypes.find(t => t.lookupValueId === form.orgTypeLkpId)?.valueName} />
                <ReviewRow label="Registration No."   value={form.isNonRegistered ? 'Not Registered' : form.registrationNumber} />
                <ReviewRow label="Category"            value={categories.find(c => c.lookupValueId === form.categoryLkpId)?.valueName} />
              </ReviewSection>

              <ReviewSection title="Contact & Location">
                <ReviewRow label="Contact Person"  value={form.contactPerson} />
                <ReviewRow label="Contact Email"   value={form.contactEmail} />
                <ReviewRow label="Contact Phone"   value={form.contactPhoneCountry.dial + ' ' + form.contactPhone} />
                {form.website ? <ReviewRow label="Website" value={form.website} /> : null}
                <ReviewRow label="City / State"    value={[form.city, form.state].filter(Boolean).join(', ')} />
                {form.country ? <ReviewRow label="Country" value={form.country} /> : null}
              </ReviewSection>

              <ReviewSection title="About & Mission">
                <ReviewRow label="About"   value={form.about}   multiline />
                {form.mission ? <ReviewRow label="Mission" value={form.mission} multiline /> : null}
                {form.vision  ? <ReviewRow label="Vision"  value={form.vision}  multiline /> : null}
              </ReviewSection>

              <ReviewSection title="Documents & Certifications">
                <ReviewRow label="Registration Cert." value={form.regCertLocalUri || form.regCertUrl ? 'File attached ✓' : 'Not uploaded'} />
                <ReviewRow label="Other Document"     value={form.otherDocLocalUri || form.otherDocUrl ? 'File attached ✓' : 'Not uploaded'} />
                <ReviewRow label="80G Certified"      value={form.is80G ? 'Yes ✓' : 'No'} />
                <ReviewRow label="12A Registered"     value={form.is12A ? 'Yes ✓' : 'No'} />
              </ReviewSection>

              <View style={styles.reviewNote}>
                <Text style={styles.reviewNoteText}>
                  {isResubmit
                    ? '📋 Please review your details above. Tap "Resubmit for Review" when ready — the RippleHub team will be notified.'
                    : "📋 After submission, your organisation will be reviewed by the RippleHub team. You'll receive a notification once approved."}
                </Text>
              </View>
            </>
          )}

        </ScrollView>
        )} {/* end !loadingProfile */}

        {/* Continue / Submit button */}
        {!loadingProfile && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          <Pressable
            style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.85 }, (submitting || uploading) && { opacity: 0.6 }]}
            onPress={step < TOTAL_STEPS ? goNext : (isResubmit ? handleResubmit : handleSubmit)}
            disabled={submitting || uploading}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            accessibilityLabel={step < TOTAL_STEPS ? 'Continue' : (isResubmit ? 'Resubmit' : 'Submit')}
          >
            {submitting || uploading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.continueBtnText}>
                  {step < TOTAL_STEPS ? `Continue →` : (isResubmit ? 'Resubmit for Review' : 'Submit & Register')}
                </Text>
            }
          </Pressable>
        </View>
        )} {/* end !loadingProfile */}

      </KeyboardAvoidingView>

      {/* ── Country Code Picker Modal ────────────────────────────────────── */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowCountryPicker(false)}>
          <Pressable style={[styles.pickerSheet, { paddingBottom: insets.bottom + 8 }]} onPress={e => e.stopPropagation()}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Country Code</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)} hitSlop={10}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* Search */}
            <View style={styles.pickerSearchBox}>
              <Text style={styles.pickerSearchIcon}>🔍</Text>
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search country or code…"
                placeholderTextColor={C.TEXT3}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {countrySearch.length > 0 && (
                <TouchableOpacity onPress={() => setCountrySearch('')} hitSlop={8}>
                  <Text style={{ color: C.TEXT2, fontSize: 15, paddingHorizontal: 6 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* List */}
            <FlatList
              data={filteredCountries}
              keyExtractor={item => item.code}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.pickerSep} />}
              renderItem={({ item }) => {
                const selected = item.code === form.contactPhoneCountry.code;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, selected && { backgroundColor: C.PRIMARY + '10' }]}
                    onPress={() => {
                      set('contactPhoneCountry', item);
                      setShowCountryPicker(false);
                      setCountrySearch('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerFlag}>{item.flag}</Text>
                    <Text style={[styles.pickerName, { flex: 1 }, selected && { color: C.PRIMARY, fontWeight: '700' }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.pickerDial, selected && { color: C.PRIMARY }]}>{item.dial}</Text>
                    {selected && <Text style={{ color: C.PRIMARY, marginLeft: 6, fontSize: 13 }}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={{ color: C.TEXT2, textAlign: 'center', padding: 24 }}>No countries found</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ─── Review Section wrapper ───────────────────────────────────────────────── */
function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.reviewSection}>
      <Text style={styles.reviewSectionTitle}>{title}</Text>
      <View style={styles.reviewCard}>{children}</View>
    </View>
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
  container:            { flex: 1, backgroundColor: C.BG },

  // Header
  header:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.CARD,
                          borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:             { fontSize: 16, color: C.PRIMARY, fontWeight: '600', minWidth: 70 },
  headerTitle:          { fontSize: 16, fontWeight: '700', color: C.TEXT },

  // Step bar
  stepBarContainer:     { backgroundColor: C.CARD, paddingVertical: 16, paddingHorizontal: 24,
                          borderBottomWidth: 1, borderBottomColor: C.BORDER },
  stepBar:              { flexDirection: 'row', alignItems: 'center' },
  stepCircle:           { width: 28, height: 28, borderRadius: 14, backgroundColor: C.CARD,
                          borderWidth: 1.5, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  stepCircleActive:     { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  stepCircleDone:       { backgroundColor: C.TEAL, borderColor: C.TEAL },
  stepNum:              { fontSize: 11, fontWeight: '700', color: C.TEXT2 },
  stepNumActive:        { color: '#fff' },
  stepLine:             { flex: 1, height: 2, backgroundColor: C.BORDER },
  stepLineDone:         { backgroundColor: C.TEAL },

  // Scroll content
  scrollContent:        { padding: 16, paddingBottom: 24 },
  stepLabel:            { fontSize: 11, fontWeight: '700', color: C.TEXT2, letterSpacing: 1.2, marginBottom: 16 },

  // Fields
  fieldGroup:           { marginBottom: 14 },
  label:                { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 6 },
  input:                { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER,
                          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.TEXT },
  inputMulti:           { minHeight: 100, paddingTop: 12 },

  // Phone row
  phoneRow:             { flexDirection: 'row', gap: 8 },
  countryPickerBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5,
                          backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER,
                          borderRadius: 10, paddingHorizontal: 10, paddingVertical: 12, minWidth: 90 },
  flagText:             { fontSize: 18 },
  dialText:             { fontSize: 13, fontWeight: '600', color: C.TEXT },
  chevronText:          { fontSize: 10, color: C.TEXT2 },
  phoneInput:           { flex: 1, backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER,
                          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.TEXT },

  // Dropdown
  dropdownBtn:          { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10,
                          paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row',
                          justifyContent: 'space-between', alignItems: 'center' },
  dropdownBtnText:      { fontSize: 14, color: C.TEXT },
  dropdownList:         { backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER, borderRadius: 10,
                          marginTop: 4, overflow: 'hidden', shadowColor: '#000',
                          shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 5 },
  dropdownItem:         { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  dropdownItemSelected: { backgroundColor: C.PRIMARY_LIGHT },
  dropdownItemText:     { fontSize: 14, color: C.TEXT },

  // Upload box (logo)
  uploadBox:            { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER,
                          borderRadius: 10, borderStyle: 'dashed', alignItems: 'center',
                          justifyContent: 'center', paddingVertical: 24 },
  logoPreview:          { width: 80, height: 80, borderRadius: 12 },
  uploadPrimary:        { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  uploadSub:            { fontSize: 12, color: C.TEXT2, marginTop: 3 },

  // Step 4 — Documents
  stepHint:             { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, marginBottom: 16,
                          borderWidth: 1, borderColor: '#BFDBFE' },
  stepHintText:         { fontSize: 12, color: '#1D4ED8', lineHeight: 18 },
  docSubtitle:          { fontSize: 12, color: C.TEXT2, marginBottom: 6 },
  docUploadBox:         { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER,
                          borderRadius: 10, borderStyle: 'dashed', alignItems: 'center',
                          justifyContent: 'center', paddingVertical: 22, gap: 2 },
  docUploadBoxDone:     { borderStyle: 'solid', borderColor: C.TEAL, backgroundColor: '#ECFDF5' },
  docUploadPrimary:     { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  docUploadSub:         { fontSize: 12, color: C.TEXT2 },
  docUploadDoneText:    { fontSize: 13, color: '#059669', fontWeight: '700' },
  docUploadChangeText:  { fontSize: 11, color: C.TEXT2, marginTop: 2 },
  docRemoteRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4',
                          borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 8,
                          paddingHorizontal: 12, paddingVertical: 10 },
  docRemoteFileName:    { flex: 1, fontSize: 13, color: C.TEXT1, fontWeight: '500' },
  docDownloadBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4,
                          backgroundColor: C.PRIMARY, borderRadius: 6,
                          paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
  docDownloadIcon:      { fontSize: 12, color: '#fff' },
  docDownloadLabel:     { fontSize: 12, color: '#fff', fontWeight: '600' },

  // Certifications
  certDivider:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 18 },
  certDividerLine:      { flex: 1, height: 1, backgroundColor: C.BORDER },
  certDividerLabel:     { fontSize: 10, fontWeight: '700', color: C.TEXT3, letterSpacing: 1.2 },
  certCard:             { backgroundColor: C.CARD, borderRadius: 14, paddingHorizontal: 14,
                          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  toggleRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          paddingVertical: 14 },
  toggleLabel:          { fontSize: 13, color: C.TEXT, fontWeight: '600' },
  toggleSub:            { fontSize: 12, color: C.TEXT2, marginTop: 2, lineHeight: 17 },
  toggleDivider:        { height: 1, backgroundColor: C.BORDER },

  // Review
  reviewSection:        { marginBottom: 12 },
  reviewSectionTitle:   { fontSize: 11, fontWeight: '700', color: C.TEXT3, letterSpacing: 0.8,
                          textTransform: 'uppercase', marginBottom: 6, paddingLeft: 2 },
  reviewCard:           { backgroundColor: C.CARD, borderRadius: 12, overflow: 'hidden',
                          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  reviewRow:            { paddingHorizontal: 14, paddingVertical: 11,
                          borderBottomWidth: 1, borderBottomColor: C.BORDER },
  reviewLabel:          { fontSize: 11, fontWeight: '700', color: C.TEXT2, marginBottom: 3, letterSpacing: 0.4 },
  reviewValue:          { fontSize: 14, color: C.TEXT, fontWeight: '500' },
  reviewNote:           { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 14, marginTop: 8,
                          borderWidth: 1, borderColor: '#BFDBFE' },
  reviewNoteText:       { fontSize: 13, color: '#1D4ED8', lineHeight: 20 },

  // Footer
  footer:               { backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER, padding: 16 },
  continueBtn:          { backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 14,
                          alignItems: 'center', shadowColor: '#6B4EFF',
                          shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 6, elevation: 4 },
  continueBtnText:      { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Country picker modal
  pickerOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet:          { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20,
                          maxHeight: '75%' },
  pickerHandle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER,
                          alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  pickerHeader:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          paddingHorizontal: 16, paddingVertical: 12,
                          borderBottomWidth: 1, borderBottomColor: C.BORDER },
  pickerTitle:          { fontSize: 16, fontWeight: '700', color: C.TEXT },
  pickerClose:          { fontSize: 18, color: C.TEXT2 },
  pickerSearchBox:      { flexDirection: 'row', alignItems: 'center', margin: 12,
                          backgroundColor: C.INPUT_BG, borderRadius: 10,
                          borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  pickerSearchIcon:     { fontSize: 14 },
  pickerSearchInput:    { flex: 1, fontSize: 14, color: C.TEXT, padding: 0 },
  pickerSep:            { height: 1, backgroundColor: C.BORDER },
  pickerItem:           { flexDirection: 'row', alignItems: 'center',
                          paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  pickerFlag:           { fontSize: 20 },
  pickerName:           { fontSize: 14, color: C.TEXT },
  pickerDial:           { fontSize: 13, color: C.TEXT2, fontWeight: '600' },
});
