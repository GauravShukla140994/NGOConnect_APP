import React, {useState, useRef, useEffect, useCallback} from 'react';
import {View, Text, Image, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator} from 'react-native';

const LOGO = require('../../assets/images/logo.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {AuthStackParamList} from '../../navigation/AuthNavigator';
import {authApi} from '../../api/auth.api';
import {useAuthStore} from '../../store/authStore';
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
        login(res.data.data);
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
});

export default OtpScreen;
