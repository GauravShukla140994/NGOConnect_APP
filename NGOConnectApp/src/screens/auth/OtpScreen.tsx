import React, {useState, useRef, useEffect, useCallback} from 'react';
import {View, Text, Image, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Animated, Modal} from 'react-native';

const LOGO = require('../../assets/images/logo.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {AuthStackParamList} from '../../navigation/AuthNavigator';
import {authApi} from '../../api/auth.api';
import {useAuthStore} from '../../store/authStore';
import {tokenStorage} from '../../api/apiClient';
import {userApi} from '../../api/user.api';
import {AuthTokens} from '../../types/api.types';
import AppConfig from '../../config/AppConfig';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Otp'>;
  route: RouteProp<AuthStackParamList, 'Otp'>;
};

const OTP_LENGTH = 6;

const OtpScreen = ({navigation, route}: Props) => {
  const {recipient, countryCode} = route.params;
  // Single string state — much simpler to work with for auto-fill
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(AppConfig.OTP_RESEND_SECONDS);
  const hiddenInput = useRef<TextInput>(null);
  const login = useAuthStore(state => state.login);

  // ── Revival modal state ────────────────────────────────────────────────────
  const [revivalVisible,  setRevivalVisible]  = useState(false);
  const [reviving,        setReviving]        = useState(false);
  const [reviveDone,      setReviveDone]      = useState(false);
  const [pendingTokens,   setPendingTokens]   = useState<AuthTokens | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const REVIVE_DURATION_MS = 5000;

  useEffect(() => {
    const timer = setInterval(() => {
      setResendTimer(t => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // autoFocus alone is unreliable on Android for hidden inputs — force-focus after mount
  useEffect(() => {
    const t = setTimeout(() => hiddenInput.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  // Auto-verify the moment all 6 digits are present (handles auto-fill on both platforms)
  useEffect(() => {
    if (otp.length === OTP_LENGTH) {
      verify(otp);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleOtpChange = (val: string) => {
    // Strip non-digits (safety net for paste), cap at 6
    const cleaned = val.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(cleaned);
  };

  const verify = useCallback(async (code: string) => {
    if (code.length < OTP_LENGTH) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({recipient, otpCode: code, purposeLkpId: 1, countryCode});
      if (res.data.isSuccess === 1 && res.data.data) {
        const tokens = res.data.data;
        if (tokens.isPendingDeletion) {
          // Account is in the 30-day grace window — store tokens so API calls
          // work, but DON'T set isAuthenticated yet. Show the revival modal first.
          tokenStorage.setTokens(tokens);
          setPendingTokens(tokens);
          setRevivalVisible(true);
        } else {
          login(tokens);
        }
      } else {
        Alert.alert('Invalid OTP', res.data.message);
        setOtp('');
        hiddenInput.current?.focus();
      }
    } catch {
      Alert.alert('Error', 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [countryCode, login, recipient]);

  // Called when user taps "Recover My Account" in the revival modal
  const handleRevive = useCallback(() => {
    if (!pendingTokens) return;
    setReviving(true);
    progressAnim.setValue(0);

    // Animate the progress bar over REVIVE_DURATION_MS
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: REVIVE_DURATION_MS,
      useNativeDriver: false,
    }).start();

    // Call the API in parallel — complete after 5s OR after API responds, whichever is later
    const apiCall = userApi.reviveAccount();
    const delay   = new Promise(res => setTimeout(res, REVIVE_DURATION_MS));

    Promise.all([apiCall, delay]).then(([apiRes]) => {
      setReviving(false);
      if (apiRes.data?.isSuccess) {
        setReviveDone(true);
        // Brief "restored" state, then log in
        setTimeout(() => {
          setRevivalVisible(false);
          setReviveDone(false);
          login(pendingTokens);
        }, 800);
      } else {
        tokenStorage.clearTokens();
        setPendingTokens(null);
        setRevivalVisible(false);
        Alert.alert('Could Not Restore', apiRes.data?.message ?? 'The recovery window may have passed. Please sign up again.');
      }
    }).catch(() => {
      setReviving(false);
      tokenStorage.clearTokens();
      setPendingTokens(null);
      setRevivalVisible(false);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    });
  }, [pendingTokens, login, progressAnim]);

  // User chose to skip revival — offer to start fresh instead of just closing
  const handleSkipRevival = useCallback(() => {
    Alert.alert(
      'Start Fresh?',
      'Your old account will remain deleted. We\'ll create a brand-new account with the same number — zero history, clean slate.',
      [
        {
          text: 'Yes, Start Fresh',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await authApi.createFreshAccount();
              if (res.data?.isSuccess === 1 && res.data.data) {
                setRevivalVisible(false);
                login(res.data.data);
              } else {
                Alert.alert('Error', res.data?.message ?? 'Could not create fresh account. Please try again.');
              }
            } catch {
              Alert.alert('Error', 'Something went wrong. Please try again.');
            }
          },
        },
        {
          text: 'Go Back',
          style: 'cancel',
          // Dismiss alert — revival modal stays open
        },
      ],
    );
  }, [login]);

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      // countryCode is '' for email logins — backend [Required] needs a non-empty value
      await authApi.sendOtp({recipient, countryCode: countryCode || '+91', purposeLkpId: 1});
      setResendTimer(AppConfig.OTP_RESEND_SECONDS);
      setOtp('');
      hiddenInput.current?.focus();
    } catch {
      Alert.alert('Error', 'Could not resend OTP.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Brand */}
        <View style={styles.brandBlock}>
          <Image source={LOGO} style={styles.logoImage} resizeMode="cover" />
          <Text style={styles.brandName}>RippleHub</Text>
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.subtitle}>
          Sent to {countryCode ? `${countryCode} ${recipient}` : recipient}
        </Text>

        {/* Wrapper anchors the hidden input to the OTP row bounds */}
        <View style={styles.otpWrapper}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => hiddenInput.current?.focus()}
            style={styles.otpRow}>
            {Array.from({length: OTP_LENGTH}).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.otpBox,
                  otp.length === i && styles.otpBoxCursor,
                  otp[i] ? styles.otpBoxFilled : null,
                ]}>
                <Text style={styles.otpDigit}>{otp[i] ?? ''}</Text>
              </View>
            ))}
          </TouchableOpacity>

          {/*
            Hidden TextInput — the only real input element.
            opacity:0.01 (NOT 0) — Android skips focus on fully-transparent elements.
            textContentType="oneTimeCode" → iOS 12+ shows SMS code above keyboard.
            autoComplete="sms-otp"        → Android 11+ autofill reads OTP from SMS.
            Both platforms fire onChangeText with the full 6-digit string on auto-fill.
          */}
          <TextInput
            ref={hiddenInput}
            value={otp}
            onChangeText={handleOtpChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            caretHidden
            style={styles.hiddenInput}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, otp.length < OTP_LENGTH && styles.btnDisabled]}
          onPress={() => verify(otp)}
          disabled={loading || otp.length < OTP_LENGTH}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Verify & Login</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResend} disabled={resendTimer > 0}>
          <Text style={[styles.resend, resendTimer > 0 && styles.resendDisabled]}>
            {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
          </Text>
        </TouchableOpacity>
      </View>
      {/* ── Account Revival Modal ──────────────────────────────────────── */}
      <Modal visible={revivalVisible} transparent animationType="fade">
        <View style={styles.revivalOverlay}>
          <View style={styles.revivalSheet}>

            {/* Header */}
            <Text style={styles.revivalEmoji}>{reviveDone ? '🎉' : '👋'}</Text>
            <Text style={styles.revivalTitle}>
              {reviveDone ? 'Welcome Back!' : 'We Found Your Account'}
            </Text>
            <Text style={styles.revivalSubtitle}>
              {reviveDone
                ? 'Your account has been fully restored. Taking you home…'
                : 'Looks like this account was recently deleted.\nYou still have time to get it back.'}
            </Text>

            {/* Grace info cards */}
            {!reviving && !reviveDone && (
              <>
                <View style={styles.revivalInfoRow}>
                  <Text style={styles.revivalInfoIcon}>🕐</Text>
                  <Text style={styles.revivalInfoText}>
                    Your account is in a <Text style={styles.revivalBold}>30-day grace period</Text> — all your data, history, and badges are safe.
                  </Text>
                </View>
                <View style={styles.revivalInfoRow}>
                  <Text style={styles.revivalInfoIcon}>💚</Text>
                  <Text style={styles.revivalInfoText}>
                    Tap <Text style={styles.revivalBold}>Recover</Text> to restore everything instantly.
                  </Text>
                </View>
              </>
            )}

            {/* Progress bar (shown during revival) */}
            {(reviving || reviveDone) && (
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    reviveDone && styles.progressDone,
                    {
                      width: reviveDone
                        ? '100%'
                        : progressAnim.interpolate({
                            inputRange:  [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                    },
                  ]}
                />
              </View>
            )}
            {reviving && (
              <Text style={styles.progressLabel}>Restoring your account…</Text>
            )}

            {/* Action buttons */}
            {!reviving && !reviveDone && (
              <>
                <TouchableOpacity style={styles.revivalBtn} onPress={handleRevive}>
                  <Text style={styles.revivalBtnText}>💚 Recover My Account</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.revivalSkipBtn} onPress={handleSkipRevival}>
                  <Text style={styles.revivalSkipText}>No thanks, let it go</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:      {flex: 1, backgroundColor: AppConfig.COLORS.BG},
  inner:          {flex: 1, padding: 24},
  brandBlock:     {alignItems: 'center', paddingTop: 16, paddingBottom: 20},
  logoImage:      {width: 64, height: 64, borderRadius: 16, marginBottom: 8},
  brandName:      {fontSize: 20, fontWeight: '800', color: AppConfig.COLORS.TEXT, letterSpacing: -0.5},
  back:           {marginBottom: 20, marginTop: 0},
  backText:       {color: AppConfig.COLORS.PRIMARY, fontSize: 16, fontWeight: '600'},
  title:          {fontSize: 22, fontWeight: '700', color: AppConfig.COLORS.TEXT, marginBottom: 6},
  subtitle:       {fontSize: 14, color: AppConfig.COLORS.TEXT2, marginBottom: 32},
  otpWrapper:     {position: 'relative', marginBottom: 32},
  otpRow:         {flexDirection: 'row', gap: 10},
  // Visual box — now a View, not TextInput
  otpBox:         {flex: 1, aspectRatio: 1, borderRadius: 12, borderWidth: 1.5,
                   borderColor: AppConfig.COLORS.BORDER, backgroundColor: AppConfig.COLORS.CARD,
                   alignItems: 'center', justifyContent: 'center'},
  otpBoxCursor:   {borderColor: AppConfig.COLORS.PRIMARY},               // active position indicator
  otpBoxFilled:   {borderColor: AppConfig.COLORS.PRIMARY, backgroundColor: AppConfig.COLORS.PRIMARY_LIGHT},
  otpDigit:       {fontSize: 22, fontWeight: '700', color: AppConfig.COLORS.TEXT},
  // Covers the entire OTP row area — any tap opens keyboard.
  // opacity:0.01 (NOT 0): Android will not focus a fully-transparent element.
  hiddenInput:    {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01},
  btn:            {backgroundColor: AppConfig.COLORS.PRIMARY, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16},
  btnDisabled:    {opacity: 0.5},
  btnText:        {color: '#fff', fontSize: 16, fontWeight: '700'},
  resend:         {textAlign: 'center', color: AppConfig.COLORS.PRIMARY, fontSize: 14, fontWeight: '600'},
  resendDisabled: {color: AppConfig.COLORS.TEXT3},

  // ── Revival modal ──────────────────────────────────────────────────────────
  revivalOverlay:   {flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24},
  revivalSheet:     {backgroundColor: AppConfig.COLORS.CARD, borderRadius: 20, padding: 28, width: '100%', alignItems: 'center'},
  revivalEmoji:     {fontSize: 48, marginBottom: 12},
  revivalTitle:     {fontSize: 22, fontWeight: '800', color: AppConfig.COLORS.TEXT, textAlign: 'center', marginBottom: 8},
  revivalSubtitle:  {fontSize: 14, color: AppConfig.COLORS.TEXT2, textAlign: 'center', lineHeight: 20, marginBottom: 24},
  revivalInfoRow:   {flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14, width: '100%'},
  revivalInfoIcon:  {fontSize: 20, marginTop: 1},
  revivalInfoText:  {fontSize: 13, color: AppConfig.COLORS.TEXT2, lineHeight: 19, flex: 1},
  revivalBold:      {fontWeight: '700', color: AppConfig.COLORS.TEXT},
  progressTrack:    {width: '100%', height: 8, backgroundColor: AppConfig.COLORS.BORDER, borderRadius: 4, overflow: 'hidden', marginBottom: 10, marginTop: 8},
  progressFill:     {height: '100%', backgroundColor: AppConfig.COLORS.PRIMARY, borderRadius: 4},
  progressDone:     {backgroundColor: '#059669'},
  progressLabel:    {fontSize: 13, color: AppConfig.COLORS.TEXT2, marginBottom: 8},
  revivalBtn:       {width: '100%', backgroundColor: AppConfig.COLORS.PRIMARY, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 10},
  revivalBtnText:   {fontSize: 16, fontWeight: '700', color: '#fff'},
  revivalSkipBtn:   {paddingVertical: 8},
  revivalSkipText:  {fontSize: 13, color: AppConfig.COLORS.TEXT3, textDecorationLine: 'underline'},
});

export default OtpScreen;
