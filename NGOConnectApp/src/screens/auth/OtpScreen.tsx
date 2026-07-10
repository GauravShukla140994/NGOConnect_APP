import React, {useState, useRef, useEffect} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

const OtpScreen = ({navigation, route}: Props) => {
  const {recipient, countryCode} = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(AppConfig.OTP_RESEND_SECONDS);
  const inputs = useRef<TextInput[]>([]);
  const login = useAuthStore(state => state.login);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendTimer(t => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleChange = (val: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);
    if (val && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({recipient, otpCode: code, purposeLkpId: 1});
      if (res.data.isSuccess === 1 && res.data.data) {
        login(res.data.data);
      } else {
        Alert.alert('Invalid OTP', res.data.message);
      }
    } catch {
      Alert.alert('Error', 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      await authApi.sendOtp({recipient, countryCode, purposeLkpId: 1});
      setResendTimer(AppConfig.OTP_RESEND_SECONDS);
      setOtp(['', '', '', '', '', '']);
    } catch {
      Alert.alert('Error', 'Could not resend OTP.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.subtitle}>
          Sent to {countryCode} {recipient}
        </Text>

        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={el => {if (el) inputs.current[i] = el;}}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              maxLength={1}
              keyboardType="number-pad"
              value={digit}
              onChangeText={val => handleChange(val, i)}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify & Login</Text>}
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
  container: {flex: 1, backgroundColor: AppConfig.COLORS.BG},
  inner: {flex: 1, padding: 24},
  back: {marginBottom: 32, marginTop: 8},
  backText: {color: AppConfig.COLORS.TEXT2, fontSize: 14},
  title: {fontSize: 22, fontWeight: '700', color: AppConfig.COLORS.TEXT, marginBottom: 6},
  subtitle: {fontSize: 14, color: AppConfig.COLORS.TEXT2, marginBottom: 32},
  otpRow: {flexDirection: 'row', gap: 10, marginBottom: 32},
  otpBox: {flex: 1, aspectRatio: 1, borderRadius: 12, borderWidth: 1.5, borderColor: AppConfig.COLORS.BORDER, backgroundColor: AppConfig.COLORS.CARD, textAlign: 'center', fontSize: 22, fontWeight: '700', color: AppConfig.COLORS.TEXT},
  otpBoxFilled: {borderColor: AppConfig.COLORS.PRIMARY, backgroundColor: AppConfig.COLORS.PRIMARY_LIGHT},
  btn: {backgroundColor: AppConfig.COLORS.PRIMARY, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16},
  btnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  resend: {textAlign: 'center', color: AppConfig.COLORS.PRIMARY, fontSize: 14, fontWeight: '600'},
  resendDisabled: {color: AppConfig.COLORS.TEXT3}});

export default OtpScreen;