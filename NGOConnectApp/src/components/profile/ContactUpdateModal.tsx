/**
 * ContactUpdateModal
 *
 * Two-step modal for adding a missing phone or email to a user's profile:
 *   Step 1 — Enter the contact value (phone number or email address)
 *             Phone: includes country picker (same list as LoginScreen)
 *   Step 2 — Enter the 6-digit OTP sent to that contact
 *
 * On success it calls onVerified(value) so the parent screen can update
 * its local state and show the field as locked.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppConfig from '../../config/AppConfig';
import { sendContactOtp, verifyContactOtp } from '../../api/user.api';
import { COUNTRIES, DEFAULT_COUNTRY, EMAIL_REGEX, Country } from '../../constants/countries';

const C = AppConfig.COLORS;

interface Props {
  visible:    boolean;
  type:       'EMAIL' | 'PHONE';
  onClose:    () => void;
  onVerified: (value: string) => void;
}

export default function ContactUpdateModal({ visible, type, onClose, onVerified }: Props) {
  const isPhone = type === 'PHONE';

  const [step,            setStep]            = useState<1 | 2>(1);
  const [value,           setValue]           = useState('');
  const [otp,             setOtp]             = useState('');
  const [sending,         setSending]         = useState(false);
  const [verifying,       setVerifying]       = useState(false);
  const [countdown,       setCountdown]       = useState(0);

  // Country picker state (phone only)
  const [country,         setCountry]         = useState<Country>(DEFAULT_COUNTRY);
  const [showPicker,      setShowPicker]      = useState(false);
  const [pickerSearch,    setPickerSearch]    = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filtered country list
  const filteredCountries = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.dial.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  }, [pickerSearch]);

  const resetModal = useCallback(() => {
    setStep(1);
    setValue('');
    setOtp('');
    setSending(false);
    setVerifying(false);
    setCountdown(0);
    setShowPicker(false);
    setPickerSearch('');
    setCountry(DEFAULT_COUNTRY);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [resetModal, onClose]);

  const startCountdown = useCallback((seconds = 60) => {
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      Alert.alert('Required', isPhone ? 'Please enter a phone number.' : 'Please enter an email address.');
      return;
    }
    if (isPhone) {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length < country.minLen) {
        Alert.alert('Invalid Number', `Please enter a valid ${country.minLen}-digit number for ${country.name} (${country.dial}).`);
        return;
      }
      if (digits.length > country.maxLen) {
        Alert.alert('Invalid Number', `Number for ${country.name} must not exceed ${country.maxLen} digits.`);
        return;
      }
    } else {
      if (!EMAIL_REGEX.test(trimmed)) {
        Alert.alert('Invalid Email', 'Please enter a valid email address (e.g. you@example.com).');
        return;
      }
    }

    setSending(true);
    try {
      const res = await sendContactOtp(type, trimmed, isPhone ? country.dial : undefined);
      if (res.data?.isSuccess) {
        setStep(2);
        startCountdown(60);
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not send OTP.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Network error.');
    } finally {
      setSending(false);
    }
  }, [value, type, isPhone, country, startCountdown]);

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    if (otp.length !== 6) {
      Alert.alert('Required', 'Please enter the 6-digit OTP.');
      return;
    }
    setVerifying(true);
    try {
      const res = await verifyContactOtp(type, value.trim(), otp.trim());
      if (res.data?.isSuccess) {
        onVerified(value.trim());
        resetModal();
        onClose();
      } else {
        Alert.alert('Error', res.data?.message ?? 'Verification failed.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Network error.');
    } finally {
      setVerifying(false);
    }
  }, [otp, type, value, onVerified, resetModal, onClose]);

  const handleResend = useCallback(() => {
    setOtp('');
    setStep(1);
    if (timerRef.current) clearInterval(timerRef.current);
    setCountdown(0);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaProvider>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.sheet}>

          {/* ── Country picker view (inline — replaces form, avoids nested modal) ── */}
          {showPicker ? (
            <>
              {/* Picker header */}
              <View style={s.header}>
                <TouchableOpacity onPress={() => { setShowPicker(false); setPickerSearch(''); }} style={s.backBtn}>
                  <Text style={s.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={s.title}>Select Country</Text>
                <View style={{ width: 60 }} />
              </View>

              {/* Search */}
              <View style={s.searchBox}>
                <Text style={s.searchIcon}>🔍</Text>
                <TextInput
                  style={s.searchInput}
                  placeholder="Search country or code…"
                  placeholderTextColor={C.TEXT3}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoFocus
                />
                {pickerSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setPickerSearch('')}>
                    <Text style={{ color: C.TEXT2, fontSize: 15, paddingHorizontal: 6 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Country list */}
              <FlatList
                data={filteredCountries}
                keyExtractor={item => item.code}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={s.sep} />}
                renderItem={({ item }) => {
                  const selected = item.code === country.code;
                  return (
                    <TouchableOpacity
                      style={[s.countryRow, selected && s.countryRowSelected]}
                      onPress={() => { setCountry(item); setValue(''); setShowPicker(false); setPickerSearch(''); }}
                      activeOpacity={0.7}
                    >
                      <Text style={s.countryFlag}>{item.flag}</Text>
                      <Text style={[s.countryName, selected && { color: C.PRIMARY, fontWeight: '700' }]}>{item.name}</Text>
                      <Text style={[s.countryDial, selected && { color: C.PRIMARY, fontWeight: '700' }]}>{item.dial}</Text>
                      {selected && <Text style={{ color: C.PRIMARY, marginLeft: 8, fontSize: 14 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={s.emptyText}>No countries found</Text>}
              />

              <SafeAreaView edges={['bottom']} style={{ minHeight: 16 }} />
            </>
          ) : (
            <>
              {/* ── Normal form view ── */}

              {/* Header */}
              <View style={s.header}>
                <Text style={s.title}>
                  {isPhone ? '📱 Add Phone Number' : '✉️ Add Email Address'}
                </Text>
                <TouchableOpacity onPress={handleClose} style={s.closeBtn} accessibilityLabel="Close">
                  <Text style={s.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Step indicator */}
              <View style={s.stepRow}>
                <View style={[s.stepDot, step >= 1 && s.stepDotActive]} />
                <View style={[s.stepLine, step >= 2 && s.stepLineActive]} />
                <View style={[s.stepDot, step >= 2 && s.stepDotActive]} />
              </View>

              {/* ── Step 1: Enter contact ── */}
              {step === 1 && (
                <View style={s.body}>
                  <Text style={s.bodyTitle}>
                    {isPhone ? 'Enter your phone number' : 'Enter your email address'}
                  </Text>
                  <Text style={s.bodyHint}>
                    We'll send a 6-digit verification code to confirm it's yours.
                  </Text>

                  {isPhone ? (
                    <View style={s.phoneRow}>
                      {/* Country picker trigger */}
                      <TouchableOpacity
                        style={s.countryBox}
                        onPress={() => { setPickerSearch(''); setShowPicker(true); }}
                        activeOpacity={0.7}
                        accessibilityLabel="Select country code"
                      >
                        <Text style={s.countryBoxFlag}>{country.flag}</Text>
                        <Text style={s.countryBoxDial}>{country.dial}</Text>
                        <Text style={s.countryBoxChevron}>▾</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[s.input, { flex: 1, marginBottom: 0 }]}
                        value={value}
                        onChangeText={t => setValue(t.replace(/\D/g, ''))}
                        placeholder={country.placeholder}
                        placeholderTextColor={C.TEXT3}
                        keyboardType="phone-pad"
                        maxLength={country.maxLen}
                        accessibilityLabel="Phone number"
                        autoFocus
                      />
                    </View>
                  ) : (
                    <TextInput
                      style={s.input}
                      value={value}
                      onChangeText={setValue}
                      placeholder="email@example.com"
                      placeholderTextColor={C.TEXT3}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel="Email address"
                      autoFocus
                    />
                  )}

                  <Pressable
                    style={[s.primaryBtn, sending && s.btnDisabled]}
                    onPress={handleSendOtp}
                    disabled={sending}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                    accessibilityLabel="Send OTP"
                  >
                    {sending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={s.primaryBtnText}>Send OTP →</Text>
                    }
                  </Pressable>
                </View>
              )}

              {/* ── Step 2: Enter OTP ── */}
              {step === 2 && (
                <View style={s.body}>
                  <Text style={s.bodyTitle}>Enter the verification code</Text>
                  <Text style={s.bodyHint}>
                    We sent a 6-digit code to {isPhone ? `${country.dial} ${value}` : value}.
                  </Text>

                  <TextInput
                    style={s.input}
                    value={otp}
                    onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor={C.TEXT3}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    accessibilityLabel="OTP code"
                  />

                  <Pressable
                    style={[s.primaryBtn, verifying && s.btnDisabled]}
                    onPress={handleVerify}
                    disabled={verifying}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                    accessibilityLabel="Verify OTP"
                  >
                    {verifying
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={s.primaryBtnText}>Verify &amp; Save ✓</Text>
                    }
                  </Pressable>

                  <TouchableOpacity
                    style={s.backBtn}
                    onPress={() => { setStep(1); setOtp(''); }}
                    accessibilityLabel="Go back"
                  >
                    <Text style={s.backText}>← Change {isPhone ? 'number' : 'email'}</Text>
                  </TouchableOpacity>
                </View>
              )}

            </>
          )}
        </View>
      </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 0 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:           { fontSize: 16, fontWeight: '700', color: '#111827' },
  closeBtn:        { padding: 4 },
  closeText:       { fontSize: 18, color: '#6B7280' },
  stepRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  stepDot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5E7EB' },
  stepDotActive:   { backgroundColor: '#6B4EFF' },
  stepLine:        { flex: 1, height: 2, backgroundColor: '#E5E7EB' },
  stepLineActive:  { backgroundColor: '#6B4EFF' },
  body:            { paddingHorizontal: 16, paddingBottom: 16 },
  bodyTitle:       { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  bodyHint:        { fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 18 },
  phoneRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  countryBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 12, gap: 4 },
  countryBoxFlag:  { fontSize: 18 },
  countryBoxDial:  { fontSize: 13, fontWeight: '600', color: '#111827' },
  countryBoxChevron: { fontSize: 11, color: '#6B7280' },
  input:           { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827', marginBottom: 14 },
  primaryBtn:      { backgroundColor: '#6B4EFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled:     { opacity: 0.6 },
  backBtn:         { alignItems: 'center', paddingVertical: 12 },
  backText:        { fontSize: 14, color: '#6B7280' },
  searchBox:       { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, gap: 6 },
  searchIcon:      { fontSize: 16 },
  searchInput:     { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 10 },
  countryRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  countryRowSelected: { backgroundColor: '#F0EDFF' },
  countryFlag:     { fontSize: 22, width: 32 },
  countryName:     { fontSize: 14, color: '#111827', flex: 1 },
  countryDial:     { fontSize: 13, color: '#6B7280' },
  sep:             { height: 1, backgroundColor: '#F3F4F6', marginLeft: 58 },
  emptyText:       { textAlign: 'center', color: '#9CA3AF', padding: 20 },
});
