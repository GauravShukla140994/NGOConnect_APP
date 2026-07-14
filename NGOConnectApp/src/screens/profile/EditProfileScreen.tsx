import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import AppConfig from '../../config/AppConfig';
import {
  getMyProfile, updateProfile,
  getMySkills, addSkill, removeSkill,
  getMyInterests, saveInterests,
  getSafetyPrefs, updateSafetyPrefs,
  getMyDocuments,
} from '../../api/user.api';
import ContactUpdateModal from '../../components/profile/ContactUpdateModal';
import DocumentUploadSection from '../../components/common/DocumentUploadSection';
import { lookupApi } from '../../api/lookup.api';
import { uploadFile } from '../../api/upload.api';
import { useAuthStore } from '../../store/authStore';
import type { UserProfile, UserSkill, UserInterest, LookupValue, UserDocument } from '../../types/api.types';

const C = AppConfig.COLORS;
const L = AppConfig.LOOKUP;

// Step labels matching prototype
const STEPS = ['Basic', 'Professional', 'Location', 'Skills', 'Documents', 'Review'] as const;

// Subtitle text for each Emergency Visibility option (ValueCode → subtitle)
const EMERG_VIS_SUB: Record<string, string> = {
  ADMIN_ONLY:  'Most private · Admin sees alert only',
  ADMIN_MODS:  'Recommended · Faster response',
  ALL_MEMBERS: 'Maximum reach · Fastest help',
};
type Step = 0 | 1 | 2 | 3 | 4 | 5;

const GENDER_OPTIONS = [
  { label: 'Male',   value: 0 },
  { label: 'Female', value: 0 },
  { label: 'Other',  value: 0 },
];

// -----------------------------------------------------------------
// DOB picker helpers (YYYY-MM-DD ↔ Date)
// -----------------------------------------------------------------
function parseDOB(s: string): Date {
  if (!s || s.length < 10) return new Date(2000, 0, 1);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function formatDOB(d: Date): string {
  return [
    String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// -----------------------------------------------------------------
// Step Indicator — circles + connecting lines
// -----------------------------------------------------------------
function StepBar({ current }: { current: Step }) {
  return (
    <View style={styles.stepBar}>
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.stepItem}>
            <View style={[
              styles.stepCircle,
              i < current && styles.stepCircleDone,
              i === current && styles.stepCircleActive,
            ]}>
              {i < current
                ? <Text style={styles.stepCheck}>{'✓'}</Text>
                : <Text style={[styles.stepNum, i === current && styles.stepNumActive]}>{i + 1}</Text>
              }
            </View>
          </View>
          {i < STEPS.length - 1 && (
            <View style={[styles.stepLine, i < current && styles.stepLineDone]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// -----------------------------------------------------------------
// Field + Label helper
// -----------------------------------------------------------------
function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}{required ? <Text style={{ color: C.RED }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      style={[styles.input, props.editable === false && styles.inputDisabled]}
      placeholderTextColor={C.TEXT3}
      {...props}
    />
  );
}

// -----------------------------------------------------------------
// Main Screen
// -----------------------------------------------------------------
export default function EditProfileScreen() {
  const nav      = useNavigation<any>();
  const insets   = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState<Step>(0);
  const { setUser } = useAuthStore();

  // Loading / saving states
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [uploading,  setUploading]  = useState(false);

  // --- Step 1: Basic Info ---
  const [photoUrl,   setPhotoUrl]   = useState('');
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,        setEmail]        = useState('');
  const [countryCode,  setCountryCode]  = useState('');   // read-only, from registration
  const [mobile,       setMobile]       = useState('');   // read-only, from registration
  const [genderLkpId, setGenderLkpId] = useState<number | undefined>(undefined);
  const [genderOptions, setGenderOptions] = useState<LookupValue[]>([]);
  const [dob,        setDob]        = useState('');
  const [dobPickerVisible, setDobPickerVisible] = useState(false);
  const [dobPickerDate,    setDobPickerDate]    = useState(new Date(2000, 0, 1));

  // --- Step 2: Professional ---
  const [occupation,    setOccupation]    = useState('');
  const [organisation,  setOrganisation]  = useState('');
  const [educationLkpId, setEducationLkpId] = useState<number | undefined>(undefined);
  const [educationOptions, setEducationOptions] = useState<LookupValue[]>([]);
  const [fieldOfStudy,  setFieldOfStudy]  = useState('');
  const [workExpLkpId,  setWorkExpLkpId]  = useState<number | undefined>(undefined);
  const [workExpOptions, setWorkExpOptions] = useState<LookupValue[]>([]);
  const [volunteerExp,  setVolunteerExp]  = useState('');
  const [bio,           setBio]           = useState('');

  // --- Step 3: Location ---
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city,         setCity]         = useState('');
  const [state,        setState]        = useState('');
  const [pincode,      setPincode]      = useState('');
  const [country,      setCountry]      = useState('India');

  // --- Step 4: Skills & Interests ---
  const [docs,         setDocs]         = useState<UserDocument[]>([]);
  const [skills,       setSkills]       = useState<UserSkill[]>([]);
  const [newSkill,     setNewSkill]     = useState('');
  const [interests,    setInterests]    = useState<UserInterest[]>([]);
  const [interestOpts, setInterestOpts] = useState<LookupValue[]>([]);
  const [selectedInterestIds, setSelectedInterestIds] = useState<number[]>([]);

  // --- Contact Update Modal ---
  const [contactModalType,    setContactModalType]    = useState<'EMAIL' | 'PHONE'>('PHONE');
  const [contactModalVisible, setContactModalVisible] = useState(false);

  // --- Safety Preferences (shown in Step 0) ---
  const [emergVisibilityLkpId, setEmergVisibilityLkpId] = useState<number | undefined>(undefined);
  const [autoShareDurLkpId,    setAutoShareDurLkpId]    = useState<number | undefined>(undefined);
  const [allowLocDuringSos,    setAllowLocDuringSos]    = useState(true);
  const [allowLocDuringProj,   setAllowLocDuringProj]   = useState(true);
  const [emergVisOptions,      setEmergVisOptions]      = useState<LookupValue[]>([]);
  const [autoShareOptions,     setAutoShareOptions]     = useState<LookupValue[]>([]);

  // -----------------------------------------------------------------
  // Load all data on mount
  // -----------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [profileRes, skillsRes, interestRes, genderRes, eduRes, workRes, interestOptsRes,
             safetyRes, emergVisRes, autoShareRes, docsRes] =
        await Promise.allSettled([
          getMyProfile(),
          getMySkills(),
          getMyInterests(),
          lookupApi.getValuesByTypeCode(L.GENDER),
          lookupApi.getValuesByTypeCode(L.EDUCATION),
          lookupApi.getValuesByTypeCode(L.WORK_EXP),
          lookupApi.getValuesByTypeCode(L.INTEREST),
          getSafetyPrefs(),
          lookupApi.getValuesByTypeCode(L.EMERGENCY_VISIBILITY),
          lookupApi.getValuesByTypeCode(L.AUTO_SHARE_DURATION),
          getMyDocuments(),
        ]);

      // Debug: log raw API response so you can verify field names + values
      if (profileRes.status === 'fulfilled') {
        console.log('[EditProfile] GET /user/profile response:', JSON.stringify(profileRes.value.data, null, 2));
      } else {
        console.warn('[EditProfile] GET /user/profile REJECTED:', profileRes.reason);
      }

      if (profileRes.status === 'fulfilled' && profileRes.value.data?.isSuccess) {
        const p: UserProfile = profileRes.value.data.data!;
        setPhotoUrl(p.profilePhoto   ?? '');
        setFirstName(p.firstName     ?? '');
        setLastName(p.lastName       ?? '');
        setEmail(p.email             ?? '');
        setCountryCode(p.countryCode ?? '');
        setMobile(p.mobile           ?? '');
        setGenderLkpId(p.genderLkpId ?? undefined);
        setDob(p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : '');
        setOccupation(p.occupation   ?? '');
        setOrganisation(p.organisation ?? '');
        setEducationLkpId(p.educationLkpId ?? undefined);
        setFieldOfStudy(p.fieldOfStudy  ?? '');
        setWorkExpLkpId(p.workExpLkpId  ?? undefined);
        setVolunteerExp(p.volunteerExp  ?? '');
        setBio(p.bio                    ?? '');
        setAddressLine1(p.addressLine1  ?? '');
        setAddressLine2(p.addressLine2  ?? '');
        setCity(p.city                  ?? '');
        setState(p.state                ?? '');
        setPincode(p.pincode            ?? '');
        setCountry(p.country            ?? 'India');
      } else if (profileRes.status === 'fulfilled' && !profileRes.value.data?.isSuccess) {
        // API returned isSuccess=0 — show the actual message from backend
        const msg = profileRes.value.data?.message ?? 'Profile could not be loaded.';
        console.warn('[EditProfile] isSuccess=0:', msg);
        setLoadError(msg);
      } else if (profileRes.status === 'rejected') {
        const err: any = profileRes.reason;
        const status   = err?.response?.status;
        const apiMsg   = err?.response?.data?.message;
        const netMsg   = err?.message ?? 'Network error';
        const detail   = apiMsg ?? netMsg;
        setLoadError(`HTTP ${status ?? 'ERR'}: ${detail}`);
      }

      // Debug: also log skills result to see if auth is working for other endpoints
      console.log('[EditProfile] skills result:', skillsRes.status,
        skillsRes.status === 'fulfilled' ? skillsRes.value.data?.isSuccess : (skillsRes as any).reason?.message);

      if (skillsRes.status === 'fulfilled' && skillsRes.value.data?.isSuccess)
        setSkills(skillsRes.value.data.data ?? []);

      if (interestRes.status === 'fulfilled' && interestRes.value.data?.isSuccess) {
        const saved = interestRes.value.data.data ?? [];
        setInterests(saved);
        setSelectedInterestIds(saved.map((i: UserInterest) => i.interestLkpId));
      }

      if (genderRes.status === 'fulfilled' && genderRes.value.data?.isSuccess)
        setGenderOptions(genderRes.value.data.data ?? []);

      if (eduRes.status === 'fulfilled' && eduRes.value.data?.isSuccess)
        setEducationOptions(eduRes.value.data.data ?? []);

      if (workRes.status === 'fulfilled' && workRes.value.data?.isSuccess)
        setWorkExpOptions(workRes.value.data.data ?? []);

      if (interestOptsRes.status === 'fulfilled' && interestOptsRes.value.data?.isSuccess)
        setInterestOpts(interestOptsRes.value.data.data ?? []);

      // Safety Preferences lookups
      let emergOpts: LookupValue[] = [];
      let shareOpts: LookupValue[] = [];
      if (emergVisRes.status === 'fulfilled' && emergVisRes.value.data?.isSuccess) {
        emergOpts = emergVisRes.value.data.data ?? [];
        setEmergVisOptions(emergOpts);
      }
      if (autoShareRes.status === 'fulfilled' && autoShareRes.value.data?.isSuccess) {
        shareOpts = autoShareRes.value.data.data ?? [];
        setAutoShareOptions(shareOpts);
      }

      // Safety Preferences values — if NOT_FOUND (new user) default to recommended options
      if (safetyRes.status === 'fulfilled' && safetyRes.value.data?.isSuccess && safetyRes.value.data.data) {
        const sp = safetyRes.value.data.data;
        setEmergVisibilityLkpId(sp.emergVisibilityLkpId ?? undefined);
        setAutoShareDurLkpId(sp.autoShareDurLkpId ?? undefined);
        setAllowLocDuringSos(sp.allowLocDuringSos ?? true);
        setAllowLocDuringProj(sp.allowLocDuringProj ?? true);
      } else {
        // First time — pre-select recommended defaults: ADMIN_MODS + HOUR_1
        const defEmerg = emergOpts.find(o => o.valueCode === 'ADMIN_MODS') ?? emergOpts[1] ?? emergOpts[0];
        const defShare = shareOpts.find(o => o.valueCode === 'HOUR_1')    ?? shareOpts[1] ?? shareOpts[0];
        if (defEmerg) setEmergVisibilityLkpId(defEmerg.lookupValueId);
        if (defShare) setAutoShareDurLkpId(defShare.lookupValueId);
      }

      // Documents
      if (docsRes.status === 'fulfilled' && docsRes.value.data?.isSuccess)
        setDocs(docsRes.value.data.data ?? []);

    } catch (e: any) {
      setLoadError(e?.message ?? 'Unexpected error. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // -----------------------------------------------------------------
  // Photo upload
  // -----------------------------------------------------------------
  const handlePickPhoto = useCallback(async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.didCancel || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.uri) return;
    setUploading(true);
    try {
      const url = await uploadFile(
        asset.uri,
        asset.fileName ?? 'profile.jpg',
        asset.type ?? 'image/jpeg',
        AppConfig.UPLOAD_MODULES.USER_PHOTOS,
      );
      setPhotoUrl(url);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not upload photo.';
      console.error('[EditProfile] Photo upload error:', JSON.stringify(err?.response?.data ?? err?.message ?? err));
      Alert.alert('Upload Failed', msg);
    } finally {
      setUploading(false);
    }
  }, []);

  // -----------------------------------------------------------------
  // Per-step validation
  // -----------------------------------------------------------------
  const validateStep = useCallback((s: Step): boolean => {
    if (s === 0) {
      if (!firstName.trim()) {
        Alert.alert('Required', 'First name is required before you can proceed.');
        return false;
      }
    }
    return true;
  }, [firstName]);

  const goNext = useCallback(() => {
    if (!validateStep(step)) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setStep(s => Math.min(s + 1, 5) as Step);
  }, [step, validateStep]);

  const goPrev = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setStep(s => Math.max(s - 1, 0) as Step);
  }, []);

  // -----------------------------------------------------------------
  // Skills
  // -----------------------------------------------------------------
  const handleAddSkill = useCallback(async () => {
    const name = newSkill.trim();
    if (!name) return;
    try {
      await addSkill({ skillName: name });
      setSkills(prev => [...prev, { userSkillId: Date.now(), skillName: name } as UserSkill]);
      setNewSkill('');
    } catch { Alert.alert('Error', 'Could not add skill.'); }
  }, [newSkill]);

  const handleRemoveSkill = useCallback(async (id: number) => {
    try {
      await removeSkill(id);
      setSkills(prev => prev.filter(s => s.userSkillId !== id));
    } catch { Alert.alert('Error', 'Could not remove skill.'); }
  }, []);

  // -----------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!firstName.trim()) {
      Alert.alert('Required', 'First name is required.');
      return;
    }
    setSaving(true);
    try {
      // 1. Save safety prefs (only when LkpIds are selected — NOT NULL in DB)
      if (emergVisibilityLkpId && autoShareDurLkpId) {
        await updateSafetyPrefs({
          emergVisibilityLkpId,
          autoShareDurLkpId,
          allowLocDuringSos,
          allowLocDuringProj,
        });
      }

      // 2. Save interests
      if (selectedInterestIds.length > 0) {
        await saveInterests(selectedInterestIds);
      }

      // 3. Save profile
      const payload: Record<string, unknown> = {};
      const set = (k: string, v: string | number | undefined) => {
        if (v !== undefined && v !== '') payload[k] = v;
      };
      set('firstName',     firstName.trim());
      set('lastName',      lastName.trim());
      set('bio',           bio.trim());
      set('profilePhoto',  photoUrl.trim());
      set('genderLkpId',   genderLkpId);
      if (dob && dob.length === 10) payload.dateOfBirth = dob;
      set('occupation',    occupation.trim());
      set('organisation',  organisation.trim());
      set('volunteerExp',  volunteerExp.trim());
      set('educationLkpId', educationLkpId);
      set('fieldOfStudy',  fieldOfStudy.trim());
      set('workExpLkpId',  workExpLkpId);
      set('addressLine1',  addressLine1.trim());
      set('addressLine2',  addressLine2.trim());
      set('city',          city.trim());
      set('state',         state.trim());
      set('pincode',       pincode.trim());
      set('country',       country.trim() || 'India');

      const res = await updateProfile(payload as any);
      if (res.data?.isSuccess) {
        // Refresh authStore so HomeScreen avatar updates immediately
        try {
          const fresh = await getMyProfile();
          if (fresh.data?.isSuccess && fresh.data.data) {
            setUser(fresh.data.data);
          }
        } catch { /* non-critical — profile saved, store refresh failed */ }

        Alert.alert('Saved!', 'Your profile has been updated.', [
          { text: 'OK', onPress: () => nav.goBack() },
        ]);
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not save profile.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not reach server.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }, [
    firstName, lastName, bio, photoUrl, genderLkpId, dob,
    occupation, organisation, volunteerExp, educationLkpId, fieldOfStudy,
    workExpLkpId, addressLine1, addressLine2, city, state, pincode, country,
    selectedInterestIds, nav,
    emergVisibilityLkpId, autoShareDurLkpId, allowLocDuringSos, allowLocDuringProj,
  ]);

  // -----------------------------------------------------------------
  // DOB date picker
  // -----------------------------------------------------------------
  const openDobPicker = () => {
    setDobPickerDate(dob ? parseDOB(dob) : new Date(2000, 0, 1));
    setDobPickerVisible(true);
  };

  const applyDob = (d: Date) => {
    setDob(formatDOB(d));
    setDobPickerVisible(false);
  };

  const onDobPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setDobPickerVisible(false);
      if (event.type === 'set' && selected) applyDob(selected);
    } else {
      if (selected) setDobPickerDate(selected);
    }
  };

  const renderDobPicker = () => {
    if (!dobPickerVisible) return null;
    const maxDate = new Date();

    if (Platform.OS === 'android') {
      return (
        <DateTimePicker
          value={dobPickerDate}
          mode="date"
          display="default"
          maximumDate={maxDate}
          onChange={onDobPickerChange}
        />
      );
    }

    return (
      <Modal transparent animationType="slide" visible={dobPickerVisible}>
        <View style={styles.dobOverlay}>
          <View style={styles.dobSheet}>
            <View style={styles.dobSheetHeader}>
              <TouchableOpacity onPress={() => setDobPickerVisible(false)}>
                <Text style={styles.dobCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.dobSheetTitle}>Date of Birth</Text>
              <TouchableOpacity onPress={() => applyDob(dobPickerDate)}>
                <Text style={styles.dobDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={dobPickerDate}
              mode="date"
              display="spinner"
              maximumDate={maxDate}
              onChange={onDobPickerChange}
              style={{ height: 200 }}
            />
          </View>
        </View>
      </Modal>
    );
  };

  // -----------------------------------------------------------------
  // Avatar initials
  // -----------------------------------------------------------------
  const avatarInitials = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || 'ME';

  // -----------------------------------------------------------------
  // Loading / Error states
  // -----------------------------------------------------------------
  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
          <Text style={styles.loadingText}>Loading your profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Go back">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Edit Profile</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>⚠️</Text>
          <Text style={styles.errTitle}>Could not load profile</Text>
          <Text style={styles.errMsg}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={load} accessibilityLabel="Retry">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  return (
    <SafeAreaView style={styles.root} edges={['top']}>

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Edit Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Step bar */}
      <StepBar current={step} />

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ---- Step 0: Basic Info ---- */}
        {step === 0 && (
          <View>
            <Text style={styles.stepTitle}>Basic Information</Text>

            {/* Photo picker */}
            <View style={styles.photoSection}>
              <TouchableOpacity
                onPress={handlePickPhoto}
                disabled={uploading}
                style={styles.photoWrap}
                accessibilityLabel="Change profile photo"
              >
                {photoUrl
                  ? <Image source={{ uri: photoUrl }} style={styles.photoImg} />
                  : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={styles.photoInitials}>{avatarInitials}</Text>
                    </View>
                  )
                }
                <View style={styles.photoBadge}>
                  {uploading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.photoBadgeText}>📷</Text>
                  }
                </View>
              </TouchableOpacity>
              <Text style={styles.photoHint}>Tap to change photo</Text>
            </View>

            <Field label="First Name" required>
              <Input
                value={firstName}
                onChangeText={setFirstName}
                placeholder="John"
                accessibilityLabel="First name"
              />
            </Field>

            <Field label="Last Name">
              <Input
                value={lastName}
                onChangeText={setLastName}
                placeholder="Doe"
                accessibilityLabel="Last name"
              />
            </Field>

            <Field label="Email">
              {email ? (
                <>
                  <View style={styles.lockedRow}>
                    <Text style={styles.lockedIcon}>🔒</Text>
                    <Text style={styles.lockedValue}>{email}</Text>
                  </View>
                  <Text style={styles.readOnlyNote}>Email is verified and locked to your account</Text>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.addContactBtn}
                  onPress={() => { setContactModalType('EMAIL'); setContactModalVisible(true); }}
                  accessibilityLabel="Add email address"
                >
                  <Text style={styles.addContactBtnText}>+ Add Email Address</Text>
                </TouchableOpacity>
              )}
            </Field>

            <Field label="Mobile Number">
              {mobile ? (
                <>
                  <View style={styles.lockedRow}>
                    <Text style={styles.lockedIcon}>🔒</Text>
                    <View style={styles.phoneRow}>
                      <View style={[styles.inputDisabledBox, styles.countryCodeBox]}>
                        <Text style={styles.countryCodeText}>{countryCode || '+91'}</Text>
                      </View>
                      <View style={[styles.inputDisabledBox, { flex: 1 }]}>
                        <Text style={styles.disabledText}>{mobile}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.readOnlyNote}>Mobile is verified and locked to your account</Text>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.addContactBtn}
                  onPress={() => { setContactModalType('PHONE'); setContactModalVisible(true); }}
                  accessibilityLabel="Add phone number"
                >
                  <Text style={styles.addContactBtnText}>+ Add Phone Number</Text>
                </TouchableOpacity>
              )}
            </Field>

            <Field label="Gender">
              <View style={styles.chipRow}>
                {(genderOptions.length > 0 ? genderOptions : [
                  { lookupValueId: 1, valueName: 'Male' },
                  { lookupValueId: 2, valueName: 'Female' },
                  { lookupValueId: 3, valueName: 'Other' },
                ] as any[]).map((g: any) => (
                  <TouchableOpacity
                    key={g.lookupValueId}
                    style={[styles.chip, genderLkpId === g.lookupValueId && styles.chipActive]}
                    onPress={() => setGenderLkpId(g.lookupValueId)}
                    accessibilityLabel={g.valueName}
                  >
                    <Text style={[styles.chipText, genderLkpId === g.lookupValueId && styles.chipTextActive]}>
                      {g.valueName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Date of Birth">
              <TouchableOpacity
                style={styles.dobPickerBtn}
                onPress={openDobPicker}
                activeOpacity={0.75}
                accessibilityLabel="Select date of birth"
              >
                <Text style={[styles.dobPickerBtnText, !dob && styles.dobPickerPlaceholder]}>
                  {dob || 'Select date of birth'}
                </Text>
                <Text style={styles.dobPickerIcon}>📅</Text>
              </TouchableOpacity>
            </Field>

            {/* ── Safety Preferences ─────────────────────────────────── */}
            <View style={safetyStyles.card}>

              {/* Card header */}
              <View style={safetyStyles.cardHeader}>
                <Text style={safetyStyles.cardIcon}>🛡️</Text>
                <View>
                  <Text style={safetyStyles.cardTitle}>Safety Preferences</Text>
                  <Text style={safetyStyles.cardSub}>Controls how your SOS alerts are shared</Text>
                </View>
              </View>

              {/* Emergency Visibility */}
              <Text style={safetyStyles.sectionLabel}>
                Emergency Visibility — Who can see my SOS alerts?
              </Text>
              {emergVisOptions.map((opt: LookupValue) => {
                const selected = emergVisibilityLkpId === opt.lookupValueId;
                return (
                  <TouchableOpacity
                    key={opt.lookupValueId}
                    style={[safetyStyles.radioRow, selected && safetyStyles.radioRowSelected]}
                    onPress={() => setEmergVisibilityLkpId(opt.lookupValueId)}
                    activeOpacity={0.7}
                    accessibilityLabel={opt.valueName}
                  >
                    <View style={[safetyStyles.radioCircle, selected && safetyStyles.radioCircleSelected]}>
                      {selected && <View style={safetyStyles.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[safetyStyles.radioLabel, selected && safetyStyles.radioLabelSelected]}>
                        {opt.valueName}
                      </Text>
                      <Text style={safetyStyles.radioSub}>
                        {EMERG_VIS_SUB[opt.valueCode] ?? ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Auto Share Duration */}
              <Text style={[safetyStyles.sectionLabel, { marginTop: 18 }]}>
                Auto Share Duration — Stop sharing location after
              </Text>
              <View style={styles.chipRow}>
                {autoShareOptions.map((opt: LookupValue) => {
                  const selected = autoShareDurLkpId === opt.lookupValueId;
                  return (
                    <TouchableOpacity
                      key={opt.lookupValueId}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => setAutoShareDurLkpId(opt.lookupValueId)}
                      accessibilityLabel={opt.valueName}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {opt.valueName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Live Location Permissions */}
              <Text style={[safetyStyles.sectionLabel, { marginTop: 18 }]}>
                Live Location Permissions
              </Text>

              <TouchableOpacity
                style={safetyStyles.checkRow}
                onPress={() => setAllowLocDuringSos(v => !v)}
                activeOpacity={0.7}
                accessibilityLabel="Allow location sharing during SOS"
              >
                <View style={[safetyStyles.checkbox, allowLocDuringSos && safetyStyles.checkboxChecked]}>
                  {allowLocDuringSos && <Text style={safetyStyles.checkMark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={safetyStyles.checkLabel}>Allow location sharing during SOS</Text>
                  <Text style={safetyStyles.checkSub}>Approved helpers can see your live location</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[safetyStyles.checkRow, { marginTop: 10 }]}
                onPress={() => setAllowLocDuringProj(v => !v)}
                activeOpacity={0.7}
                accessibilityLabel="Allow location sharing during Projects"
              >
                <View style={[safetyStyles.checkbox, allowLocDuringProj && safetyStyles.checkboxChecked]}>
                  {allowLocDuringProj && <Text style={safetyStyles.checkMark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={safetyStyles.checkLabel}>Allow location sharing during Projects</Text>
                  <Text style={safetyStyles.checkSub}>Shared until you check out from a session</Text>
                </View>
              </TouchableOpacity>

            </View>
          </View>
        )}

        {/* ---- Step 1: Professional ---- */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Professional Details</Text>

            <Field label="Bio">
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself..."
                placeholderTextColor={C.TEXT3}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                accessibilityLabel="Bio"
              />
            </Field>

            <Field label="Occupation">
              <Input
                value={occupation}
                onChangeText={setOccupation}
                placeholder="Software Engineer"
                accessibilityLabel="Occupation"
              />
            </Field>

            <Field label="Organisation / Company">
              <Input
                value={organisation}
                onChangeText={setOrganisation}
                placeholder="Your company"
                accessibilityLabel="Organisation"
              />
            </Field>

            <Field label="Education">
              <View style={styles.chipRow}>
                {educationOptions.map((e: any) => (
                  <TouchableOpacity
                    key={e.lookupValueId}
                    style={[styles.chip, educationLkpId === e.lookupValueId && styles.chipActive]}
                    onPress={() => setEducationLkpId(e.lookupValueId)}
                    accessibilityLabel={e.valueName}
                  >
                    <Text style={[styles.chipText, educationLkpId === e.lookupValueId && styles.chipTextActive]}>
                      {e.valueName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Field of Study">
              <Input
                value={fieldOfStudy}
                onChangeText={setFieldOfStudy}
                placeholder="Computer Science"
                accessibilityLabel="Field of study"
              />
            </Field>

            <Field label="Work Experience">
              <View style={styles.chipRow}>
                {workExpOptions.map((w: any) => (
                  <TouchableOpacity
                    key={w.lookupValueId}
                    style={[styles.chip, workExpLkpId === w.lookupValueId && styles.chipActive]}
                    onPress={() => setWorkExpLkpId(w.lookupValueId)}
                    accessibilityLabel={w.valueName}
                  >
                    <Text style={[styles.chipText, workExpLkpId === w.lookupValueId && styles.chipTextActive]}>
                      {w.valueName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Volunteer Experience">
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={volunteerExp}
                onChangeText={setVolunteerExp}
                placeholder="Describe any previous volunteer experience..."
                placeholderTextColor={C.TEXT3}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="Volunteer experience"
              />
            </Field>
          </View>
        )}

        {/* ---- Step 2: Location ---- */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Location</Text>

            <Field label="Address Line 1">
              <Input
                value={addressLine1}
                onChangeText={setAddressLine1}
                placeholder="House / Flat / Building"
                accessibilityLabel="Address line 1"
              />
            </Field>

            <Field label="Address Line 2">
              <Input
                value={addressLine2}
                onChangeText={setAddressLine2}
                placeholder="Street / Area (optional)"
                accessibilityLabel="Address line 2"
              />
            </Field>

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Field label="City">
                  <Input
                    value={city}
                    onChangeText={setCity}
                    placeholder="Mumbai"
                    accessibilityLabel="City"
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Pincode">
                  <Input
                    value={pincode}
                    onChangeText={setPincode}
                    placeholder="400001"
                    keyboardType="numeric"
                    maxLength={6}
                    accessibilityLabel="Pincode"
                  />
                </Field>
              </View>
            </View>

            <Field label="State">
              <Input
                value={state}
                onChangeText={setState}
                placeholder="Maharashtra"
                accessibilityLabel="State"
              />
            </Field>

            <Field label="Country">
              <Input
                value={country}
                onChangeText={setCountry}
                placeholder="India"
                accessibilityLabel="Country"
              />
            </Field>
          </View>
        )}

        {/* ---- Step 3: Skills & Interests ---- */}
        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Skills & Interests</Text>

            {/* Skills */}
            <Text style={styles.subSection}>My Skills</Text>
            <Text style={styles.hint}>Add skills you bring to volunteer work.</Text>
            <View style={styles.addSkillRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={newSkill}
                onChangeText={setNewSkill}
                placeholder="e.g. Photography, Teaching"
                placeholderTextColor={C.TEXT3}
                onSubmitEditing={handleAddSkill}
                returnKeyType="done"
                accessibilityLabel="New skill"
              />
              <Pressable
                style={styles.addBtn}
                onPress={handleAddSkill}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                accessibilityLabel="Add skill"
              >
                <Text style={styles.addBtnText}>+ Add</Text>
              </Pressable>
            </View>
            <View style={styles.tagRow}>
              {skills.map(s => (
                <View key={s.userSkillId} style={styles.skillTag}>
                  <Text style={styles.skillTagText}>{s.skillName}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveSkill(s.userSkillId)}
                    accessibilityLabel={`Remove ${s.skillName}`}
                  >
                    <Text style={styles.removeIcon}> ✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {skills.length === 0 && <Text style={styles.emptyHint}>No skills added yet.</Text>}
            </View>

            {/* Interests */}
            <Text style={[styles.subSection, { marginTop: 24 }]}>Interests</Text>
            <Text style={styles.hint}>Select causes you care about.</Text>
            <View style={styles.tagRow}>
              {interestOpts.map((opt: any) => {
                const selected = selectedInterestIds.includes(opt.lookupValueId);
                return (
                  <TouchableOpacity
                    key={opt.lookupValueId}
                    style={[styles.chip, { marginBottom: 0 }, selected && styles.chipActive]}
                    onPress={() => setSelectedInterestIds(prev =>
                      selected
                        ? prev.filter(id => id !== opt.lookupValueId)
                        : [...prev, opt.lookupValueId]
                    )}
                    accessibilityLabel={`Toggle ${opt.valueName}`}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {opt.valueName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ---- Step 4: Documents ---- */}
        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>Documents</Text>
            <Text style={[styles.hint, { marginBottom: 16 }]}>
              Upload identity and address proofs. These are reused automatically when you apply to join any NGO.
            </Text>
            <DocumentUploadSection
              initialDocs={docs}
              onDocsChange={setDocs}
            />
          </View>
        )}

        {/* ---- Step 5: Review & Save ---- */}
        {step === 5 && (
          <View>
            <Text style={styles.stepTitle}>Review & Save</Text>

            {/* Photo preview */}
            {photoUrl ? (
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Image source={{ uri: photoUrl }} style={styles.reviewPhoto} />
              </View>
            ) : null}

            {[
              ['Full Name', [firstName, lastName].filter(Boolean).join(' ')],
              ['Email', email],
              ['Date of Birth', dob],
              ['Occupation', occupation],
              ['Organisation', organisation],
              ['Field of Study', fieldOfStudy],
              ['Volunteer Experience', volunteerExp],
              ['Bio', bio],
              ['City', city],
              ['State', state],
              ['Country', country],
            ].filter(([, v]) => v).map(([label, value]) => (
              <View key={label} style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>{label}</Text>
                <Text style={styles.reviewValue}>{value}</Text>
              </View>
            ))}
            {skills.length > 0 && (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Skills</Text>
                <Text style={styles.reviewValue}>{skills.map(s => s.skillName).join(', ')}</Text>
              </View>
            )}
            {selectedInterestIds.length > 0 && (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Interests</Text>
                <Text style={styles.reviewValue}>
                  {interestOpts
                    .filter((o: any) => selectedInterestIds.includes(o.lookupValueId))
                    .map((o: any) => o.valueName)
                    .join(', ')}
                </Text>
              </View>
            )}
            {docs.length > 0 && (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Documents</Text>
                <Text style={styles.reviewValue}>
                  {docs.map(d => d.docTypeName).join(', ')}
                </Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Footer — safe area aware */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
        {step > 0 && (
          <TouchableOpacity
            style={styles.prevBtn}
            onPress={goPrev}
            accessibilityLabel="Previous step"
          >
            <Text style={styles.prevText}>← Back</Text>
          </TouchableOpacity>
        )}
        {step < 5 ? (
          <Pressable
            style={[styles.nextBtn, step > 0 && { flex: 1 }]}
            onPress={goNext}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            accessibilityLabel="Next step"
          >
            <Text style={styles.nextText}>Next  →</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.65 }]}
            onPress={handleSave}
            disabled={saving}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            accessibilityLabel="Save profile"
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.nextText}>Save Profile  ✓</Text>
            }
          </Pressable>
        )}
      </View>

      {renderDobPicker()}

      {/* Contact Update Modal (add phone / add email) */}
      <ContactUpdateModal
        visible={contactModalVisible}
        type={contactModalType}
        onClose={() => setContactModalVisible(false)}
        onVerified={(verified) => {
          if (contactModalType === 'EMAIL') setEmail(verified);
          else setMobile(verified);
          setContactModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------
// Styles
// -----------------------------------------------------------------
const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.BG },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText:    { color: C.TEXT2, marginTop: 10, fontSize: 13 },

  // Error
  errTitle:       { fontSize: 16, fontWeight: '700', color: C.TEXT, marginBottom: 8, textAlign: 'center' },
  errMsg:         { fontSize: 13, color: C.TEXT2, textAlign: 'center', marginBottom: 20 },
  retryBtn:       { backgroundColor: C.PRIMARY, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:      { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Top bar
  topBar:         {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: C.CARD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4,
  },
  backBtn:        { paddingVertical: 4, paddingRight: 8 },
  backText:       { fontSize: 14, color: C.PRIMARY, fontWeight: '600' },
  topBarTitle:    { fontSize: 16, fontWeight: '700', color: C.TEXT },

  // Step bar
  stepBar:        {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: C.CARD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  stepItem:       { alignItems: 'center' },
  stepCircle:     {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#E8E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: C.PRIMARY,
    shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },
  stepCircleDone: { backgroundColor: '#22C55E' },
  stepNum:        { fontSize: 12, fontWeight: '700', color: C.TEXT2 },
  stepNumActive:  { color: '#fff' },
  stepCheck:      { fontSize: 12, fontWeight: '800', color: '#fff' },
  stepLine:       { flex: 1, height: 2, backgroundColor: '#E8E8F0', marginHorizontal: 4 },
  stepLineDone:   { backgroundColor: '#22C55E' },

  // Scroll
  scrollContent:  { padding: 16, paddingBottom: 8 },
  stepTitle:      { fontSize: 18, fontWeight: '800', color: C.TEXT, marginBottom: 16 },
  subSection:     { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 6 },
  hint:           { fontSize: 12, color: C.TEXT2, marginBottom: 10 },

  // Photo
  photoSection:   { alignItems: 'center', marginBottom: 20 },
  photoWrap:      { width: 90, height: 90, position: 'relative' },
  photoImg:       { width: 90, height: 90, borderRadius: 45 },
  photoPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: C.PRIMARY,
    alignItems: 'center', justifyContent: 'center',
  },
  photoInitials:  { fontSize: 28, fontWeight: '800', color: '#fff' },
  photoBadge:     {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.PRIMARY,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  photoBadgeText: { fontSize: 14 },
  photoHint:      { fontSize: 12, color: C.TEXT2, marginTop: 8 },

  // Fields
  fieldWrap:      { marginBottom: 4 },
  fieldLabel:     { fontSize: 13, fontWeight: '600', color: C.TEXT2, marginBottom: 6, marginTop: 14 },
  input:          {
    backgroundColor: C.INPUT_BG,
    borderWidth: 1.5, borderColor: C.BORDER,
    borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 12,
    fontSize: 14, color: C.TEXT,
  },
  inputDisabled:    { backgroundColor: C.BG, color: C.TEXT2 },
  inputMulti:       { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 },
  readOnlyNote:     { fontSize: 11, color: C.TEXT3, marginTop: 4 },

  // Phone read-only row
  phoneRow:         { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inputDisabledBox: {
    backgroundColor: C.BG, borderWidth: 1.5, borderColor: C.BORDER,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
  },
  countryCodeBox:   { minWidth: 72, justifyContent: 'center', alignItems: 'center' },
  countryCodeText:  { fontSize: 14, fontWeight: '600', color: C.TEXT2 },
  disabledText:     { fontSize: 14, color: C.TEXT2 },

  // Chips
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip:           {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: C.BORDER, backgroundColor: C.CARD,
  },
  chipActive:     { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  chipText:       { fontSize: 13, color: C.TEXT2 },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  // 2-column row
  row2:           { flexDirection: 'row', gap: 10 },

  // Skills
  addSkillRow:    { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  addBtn:         {
    backgroundColor: C.PRIMARY,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10,
  },
  addBtnText:     { color: '#fff', fontWeight: '700', fontSize: 13 },
  tagRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillTag:       {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.PRIMARY_LIGHT,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  skillTagText:   { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  removeIcon:     { fontSize: 12, color: C.PRIMARY, fontWeight: '700' },
  emptyHint:      { fontSize: 13, color: C.TEXT3, fontStyle: 'italic' },

  // Review
  reviewPhoto:    { width: 80, height: 80, borderRadius: 40 },
  reviewRow:      {
    backgroundColor: C.CARD, borderRadius: 10, padding: 12,
    marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  reviewLabel:    { fontSize: 11, fontWeight: '700', color: C.TEXT2, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewValue:    { fontSize: 14, color: C.TEXT },

  // Footer
  footer:         {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: C.CARD,
    borderTopWidth: 1, borderTopColor: C.BORDER,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 6,
  },
  prevBtn:        {
    borderWidth: 1.5, borderColor: C.BORDER,
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  prevText:       { fontSize: 14, color: C.TEXT2, fontWeight: '600' },
  nextBtn:        {
    flex: 1, backgroundColor: C.PRIMARY,
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 5,
  },
  saveBtn:        {
    flex: 1, backgroundColor: '#22C55E',
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 5,
  },
  nextText:       { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Locked contact fields
  lockedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.BG, borderWidth: 1.5, borderColor: C.BORDER,
    borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12,
  },
  lockedIcon:  { fontSize: 16 },
  lockedValue: { flex: 1, fontSize: 14, color: C.TEXT2 },

  // Add contact button (shown when field is empty)
  addContactBtn: {
    borderWidth: 1.5, borderColor: C.PRIMARY, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.PRIMARY + '0A',
  },
  addContactBtnText: { fontSize: 14, color: C.PRIMARY, fontWeight: '700' },

  // DOB date picker button
  dobPickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.BORDER, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: C.CARD,
  },
  dobPickerBtnText:    { fontSize: 14, color: C.TEXT,  fontWeight: '500' },
  dobPickerPlaceholder:{ fontSize: 14, color: C.TEXT3, fontWeight: '400' },
  dobPickerIcon:       { fontSize: 16 },

  // iOS bottom-sheet modal
  dobOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  dobSheet:      { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  dobSheetHeader:{
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  dobSheetTitle: { fontSize: 15, fontWeight: '600', color: C.TEXT },
  dobCancel:     { fontSize: 14, color: C.TEXT2 },
  dobDone:       { fontSize: 14, color: C.PRIMARY, fontWeight: '700' },
});

// Safety Preferences card styles (separate sheet for clarity)
const safetyStyles = StyleSheet.create({
  card: {
    marginTop: 24,
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  cardIcon:  { fontSize: 22, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  cardSub:   { fontSize: 12, color: '#EF4444', marginTop: 2 },

  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10,
  },

  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#E5E7EB', padding: 14, marginBottom: 8,
  },
  radioRowSelected: {
    borderColor: C.PRIMARY, backgroundColor: '#EEF2FF',
  },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleSelected: { borderColor: C.PRIMARY },
  radioDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: C.PRIMARY,
  },
  radioLabel:         { fontSize: 14, fontWeight: '600', color: '#111827' },
  radioLabelSelected: { color: C.PRIMARY },
  radioSub:           { fontSize: 12, color: '#6B7280', marginTop: 2 },

  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: C.PRIMARY, borderColor: C.PRIMARY,
  },
  checkMark:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  checkSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
