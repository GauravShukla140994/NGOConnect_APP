/**
 * ContactUpdateModal
 *
 * Two-step modal for adding a missing phone or email to a user's profile:
 *   Step 1 — Enter the contact value (phone number or email address)
 *   Step 2 — Enter the 6-digit OTP sent to that contact
 *
 * On success it calls onVerified(value) so the parent screen can update
 * its local state and show the field as locked.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

const C = AppConfig.COLORS;

interface Props {
  visible:    boolean;
  type:       'EMAIL' | 'PHONE';
  onClose:    () => void;
  onVerified: (value: string) => void;
}

export default function ContactUpdateModal({ visible, type, onClose, onVerified }: Props) {
  const isPhone = type === 'PHONE';

  const [step,       setStep]       = useState<1 | 2>(1);
  const [value,      setValue]      = useState('');
  const [otp,        setOtp]        = useState('');
  const [sending,    setSending]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [countdown,  setCountdown]  = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetModal = useCallback(() => {
    setStep(1);
    setValue('');
    setOtp('');
    setSending(false);
    setVerifying(false);
    setCountdown(0);
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
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
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
    if (isPhone && !/^\d{10}$/.test(trimmed)) {
      Alert.alert('Invalid', 'Please enter a valid 10-digit phone number.');
      return;
    }
    if (!isPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid', 'Please enter a valid email address.');
      return;
    }

    setSending(true);
    try {
      const res = await sendContactOtp(type, trimmed);
      if (res.data?.isSuccess) {
        setStep(2);
        startCountdown(60);
        // OTP is visible in the backend Debug output window during dev testing
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not send OTP.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Network error.');
    } finally {
      setSending(false);
    }
  }, [value, type, isPhone, startCountdown]);

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
                  <View style={s.countryBox}>
                    <Text style={s.countryText}>+91</Text>
                  </View>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={value}
                    onChangeText={setValue}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={C.TEXT3}
                    keyboardType="phone-pad"
                    maxLength={10}
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
              <Text style={s.bodyTitle}>Enter verification code</Text>
              <Text style={s.bodyHint}>
                We sent a 6-digit OTP to{' '}
                <Text style={s.valueHighlight}>{value}</Text>.
                {'\n'}It expires in 10 minutes.
              </Text>

              <TextInput
                style={[s.input, s.otpInput]}
                value={otp}
                onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="— — — — — —"
                placeholderTextColor={C.TEXT3}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                accessibilityLabel="OTP code"
                autoFocus
              />

              <Pressable
                style={[s.primaryBtn, (verifying || otp.length < 6) && s.btnDisabled]}
                onPress={handleVerify}
                disabled={verifying || otp.length < 6}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                accessibilityLabel="Verify OTP"
              >
                {verifying
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Verify & Save ✓</Text>
                }
              </Pressable>

              {/* Resend */}
              <View style={s.resendRow}>
                {countdown > 0 ? (
                  <Text style={s.countdownText}>Resend in {countdown}s</Text>
                ) : (
                  <TouchableOpacity onPress={handleResend} accessibilityLabel="Resend OTP">
                    <Text style={s.resendText}>← Change number / Resend OTP</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Safe-area spacer — useSafeAreaInsets() returns 0 inside Modal on Android;
              native SafeAreaView reads the real inset at the native layer. */}
          <SafeAreaView edges={['bottom']} style={{ minHeight: 16 }} />
        </View>
      </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  title:     { fontSize: 17, fontWeight: '700', color: C.TEXT },
  closeBtn:  { padding: 6 },
  closeText: { fontSize: 18, color: C.TEXT2 },

  // Step indicator
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 40,
    marginVertical: 16,
  },
  stepDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: C.BORDER,
  },
  stepDotActive:  { backgroundColor: C.PRIMARY },
  stepLine:       { flex: 1, height: 2, backgroundColor: C.BORDER, marginHorizontal: 6 },
  stepLineActive: { backgroundColor: C.PRIMARY },

  // Body
  body:      { paddingHorizontal: 20, paddingTop: 8 },
  bodyTitle: { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 6 },
  bodyHint:  { fontSize: 13, color: C.TEXT2, lineHeight: 19, marginBottom: 18 },
  valueHighlight: { fontWeight: '700', color: C.PRIMARY },

  // Phone row
  phoneRow:   { flexDirection: 'row', gap: 8, marginBottom: 16 },
  countryBox: {
    backgroundColor: C.BG, borderWidth: 1.5, borderColor: C.BORDER,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    justifyContent: 'center', alignItems: 'center', minWidth: 64,
  },
  countryText: { fontSize: 14, fontWeight: '600', color: C.TEXT2 },

  // Input
  input: {
    backgroundColor: C.INPUT_BG,
    borderWidth: 1.5, borderColor: C.BORDER,
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: C.TEXT,
    marginBottom: 16,
  },
  otpInput: {
    fontSize: 24, fontWeight: '700', letterSpacing: 8,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: C.PRIMARY, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 8, elevation: 5,
  },
  btnDisabled:    { opacity: 0.55 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Resend
  resendRow:     { marginTop: 16, alignItems: 'center' },
  countdownText: { fontSize: 13, color: C.TEXT3 },
  resendText:    { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
});
