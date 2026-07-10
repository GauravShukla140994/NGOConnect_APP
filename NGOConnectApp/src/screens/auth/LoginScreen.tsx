import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { authApi } from '../../api/auth.api';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

const FEATURES = [
  { icon: '🏛️', label: 'Discover NGOs' },
  { icon: '👥', label: 'Join Communities' },
  { icon: '📈', label: 'Make Impact' },
];

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [tab,     setTab]     = useState<'mobile' | 'email'>('mobile');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (tab === 'mobile') {
      if (phone.length < 10) {
        Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
        return;
      }
      setLoading(true);
      try {
        const res = await authApi.sendOtp({ recipient: phone, countryCode: '+91', purposeLkpId: 1 });
        if (res.data.isSuccess === 1) {
          navigation.navigate('Otp', { recipient: phone, countryCode: '+91' });
        } else {
          Alert.alert('Error', res.data.message);
        }
      } catch {
        Alert.alert('Error', 'Unable to send OTP. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      Alert.alert('Coming Soon', 'Email login will be available soon.');
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#EDEEFF" translucent={false} />
      <SafeAreaView style={styles.root} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* Brand */}
            <View style={styles.brandBlock}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoIcon}>{"♡"}</Text>
              </View>
              <Text style={styles.brandName}>NGO Connect</Text>
              <Text style={styles.brandTagline}>Building communities, sharing impact</Text>
            </View>

            {/* Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome!</Text>
              <Text style={styles.cardSubtitle}>
                Sign in to discover and connect with NGOs
              </Text>

              {/* Tab toggle */}
              <View style={styles.tabRow}>
                <Pressable
                  style={[styles.tab, tab === 'mobile' && styles.tabActive]}
                  onPress={() => setTab('mobile')}
                  android_ripple={{ color: 'rgba(107,78,255,0.08)', borderless: false }}
                  accessibilityLabel="Sign in with mobile"
                >
                  <Text style={[styles.tabIcon, tab === 'mobile' && styles.tabIconActive]}>{"📱"}</Text>
                  <Text style={[styles.tabText, tab === 'mobile' && styles.tabTextActive]}>Mobile</Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, tab === 'email' && styles.tabActive]}
                  onPress={() => setTab('email')}
                  android_ripple={{ color: 'rgba(107,78,255,0.08)', borderless: false }}
                  accessibilityLabel="Sign in with email"
                >
                  <Text style={[styles.tabIcon, tab === 'email' && styles.tabIconActive]}>{"✉️"}</Text>
                  <Text style={[styles.tabText, tab === 'email' && styles.tabTextActive]}>Email</Text>
                </Pressable>
              </View>

              {/* Mobile input */}
              {tab === 'mobile' && (
                <>
                  <Text style={styles.inputLabel}>Mobile Number</Text>
                  <View style={styles.phoneRow}>
                    <View style={styles.countryPicker}>
                      <Text style={styles.flag}>{"🇮🇳"}</Text>
                      <Text style={styles.countryCode}> +91</Text>
                      <Text style={styles.countryChevron}> v</Text>
                    </View>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="234 567 8900"
                      placeholderTextColor={C.TEXT3}
                      keyboardType="phone-pad"
                      maxLength={10}
                      value={phone}
                      onChangeText={setPhone}
                      returnKeyType="done"
                      onSubmitEditing={handleSendOtp}
                      accessibilityLabel="Mobile number"
                    />
                  </View>
                </>
              )}

              {/* Email input */}
              {tab === 'email' && (
                <>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.emailInput}
                    placeholder="you@example.com"
                    placeholderTextColor={C.TEXT3}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                    returnKeyType="done"
                    onSubmitEditing={handleSendOtp}
                    accessibilityLabel="Email address"
                  />
                </>
              )}

              {/* Send OTP button */}
              <Pressable
                style={({ pressed }) => [styles.btn, pressed && { opacity: 0.88 }]}
                android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
                onPress={handleSendOtp}
                disabled={loading}
                accessibilityLabel="Send OTP"
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Send OTP</Text>
                }
              </Pressable>

              {/* Terms */}
              <Text style={styles.terms}>
                {'By continuing, you agree to our '}
                <Text style={styles.link}>Terms of Service</Text>
                {' and '}
                <Text style={styles.link}>Privacy Policy</Text>
              </Text>
            </View>

            {/* Feature strip */}
            <Text style={styles.featureLabel}>What awaits you:</Text>
            <View style={styles.featureRow}>
              {FEATURES.map(f => (
                <View key={f.label} style={styles.featureCard}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                  <Text style={styles.featureText}>{f.label}</Text>
                </View>
              ))}
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#EDEEFF' },
  scroll:        { paddingHorizontal: 20, paddingTop: 28 },

  // Brand
  brandBlock:    { alignItems: 'center', marginBottom: 24 },
  logoCircle:    {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.PRIMARY,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40, shadowRadius: 14, elevation: 10,
  },
  logoIcon:      { fontSize: 32, color: '#fff', lineHeight: 40 },
  brandName:     { fontSize: 26, fontWeight: '800', color: C.PRIMARY, letterSpacing: 0.3 },
  brandTagline:  { fontSize: 13, color: C.TEXT2, marginTop: 5 },

  // Card
  card:          {
    backgroundColor: '#fff',
    borderRadius: 20, padding: 22, marginBottom: 22,
    shadowColor: '#9370FF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 18, elevation: 6,
  },
  cardTitle:     { fontSize: 22, fontWeight: '800', color: C.TEXT, marginBottom: 5 },
  cardSubtitle:  { fontSize: 13, color: C.TEXT2, marginBottom: 20, lineHeight: 19 },

  // Tab toggle
  tabRow:        {
    flexDirection: 'row',
    backgroundColor: '#F2F2F8',
    borderRadius: 14, padding: 4,
    marginBottom: 22, gap: 4,
  },
  tab:           {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 11,
  },
  tabActive:     {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  tabIcon:       { fontSize: 15, opacity: 0.4 },
  tabIconActive: { opacity: 1 },
  tabText:       { fontSize: 14, fontWeight: '500', color: C.TEXT2 },
  tabTextActive: { color: C.PRIMARY, fontWeight: '700' },

  // Inputs
  inputLabel:    { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 8 },
  phoneRow:      { flexDirection: 'row', gap: 8, marginBottom: 20 },
  countryPicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8F8FC', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#E0E0EC',
  },
  flag:          { fontSize: 18 },
  countryCode:   { fontSize: 14, fontWeight: '700', color: C.TEXT },
  countryChevron:{ fontSize: 11, color: C.TEXT2 },
  phoneInput:    {
    flex: 1, backgroundColor: '#F8F8FC',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: C.TEXT,
    borderWidth: 1.5, borderColor: '#E0E0EC',
    letterSpacing: 1.5,
  },
  emailInput:    {
    backgroundColor: '#F8F8FC',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: C.TEXT,
    borderWidth: 1.5, borderColor: '#E0E0EC',
    marginBottom: 20,
  },

  // Button
  btn:           {
    backgroundColor: C.PRIMARY,
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginBottom: 16,
    shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.38, shadowRadius: 12, elevation: 6,
  },
  btnText:       { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  // Terms
  terms:         { fontSize: 11, color: C.TEXT3, textAlign: 'center', lineHeight: 17 },
  link:          { color: C.PRIMARY, fontWeight: '600' },

  // Feature strip
  featureLabel:  { fontSize: 13, color: C.TEXT2, textAlign: 'center', marginBottom: 12 },
  featureRow:    { flexDirection: 'row', gap: 10 },
  featureCard:   {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 18, paddingHorizontal: 8,
    alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  featureIcon:   { fontSize: 24 },
  featureText:   { fontSize: 11, fontWeight: '600', color: C.TEXT2, textAlign: 'center' },
});
