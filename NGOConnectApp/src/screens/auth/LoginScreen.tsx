import React, { useState, useMemo, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { authApi } from '../../api/auth.api';
import AppConfig from '../../config/AppConfig';
import { storage } from '../../api/apiClient';
import { COUNTRIES, DEFAULT_COUNTRY, EMAIL_REGEX } from '../../constants/countries';

const C = AppConfig.COLORS;

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

const FEATURES = [
  { icon: '🏛️', label: 'Discover NGOs' },
  { icon: '👥', label: 'Join Communities' },
  { icon: '📈', label: 'Make Impact' },
];

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [tab,             setTab]             = useState<'mobile' | 'email'>('mobile');
  const [phone,           setPhone]           = useState('');
  const [email,           setEmail]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [country,         setCountry]         = useState(DEFAULT_COUNTRY);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch,   setCountrySearch]   = useState('');
  const [termsAccepted,   setTermsAccepted]   = useState(false);
  const [showCheckbox,    setShowCheckbox]    = useState(false);
  const [legalUrl,        setLegalUrl]        = useState('');
  const [showLegal,       setShowLegal]       = useState(false);

  // Show checkbox only for new users (terms not yet accepted)
  useEffect(() => {
    const accepted = storage.getBoolean('terms_accepted');
    if (!accepted) setShowCheckbox(true);
  }, []);

  const handleCheckboxToggle = () => {
    const next = !termsAccepted;
    setTermsAccepted(next);
    if (next) storage.set('terms_accepted', true);
  };

  // Filter country list by search
  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.dial.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  }, [countrySearch]);

  const handleSendOtp = async () => {
    if (tab === 'mobile') {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < country.minLen) {
        Alert.alert(
          'Invalid Number',
          `Please enter a valid ${country.minLen}-digit mobile number for ${country.name} (${country.dial}).`
        );
        return;
      }
      if (digits.length > country.maxLen) {
        Alert.alert(
          'Invalid Number',
          `Mobile number for ${country.name} should not exceed ${country.maxLen} digits.`
        );
        return;
      }
      setLoading(true);
      try {
        const res = await authApi.sendOtp({ recipient: digits, countryCode: country.dial, purposeLkpId: 1 });
        if (res.data.isSuccess === 1) {
          navigation.navigate('Otp', { recipient: digits, countryCode: country.dial });
        } else {
          Alert.alert('Error', res.data.message || 'Unable to send OTP. Please try again.');
        }
      } catch (e: any) {
        const msg = e?.response
          ? `Server error (${e.response.status}): ${e.response.data?.message || 'Unable to send OTP.'}`
          : 'Network error — cannot reach the server. Check your connection.';
        Alert.alert('Error', msg);
      } finally {
        setLoading(false);
      }
    } else {
      // Email tab
      if (!email.trim()) {
        Alert.alert('Email Required', 'Please enter your email address.');
        return;
      }
      if (!EMAIL_REGEX.test(email.trim())) {
        Alert.alert('Invalid Email', 'Please enter a valid email address (e.g. you@example.com).');
        return;
      }
      setLoading(true);
      try {
        // countryCode is [Required] on the backend model — pass '+91' as placeholder
        // (the SP does not store CountryCode for email OTPs)
        const res = await authApi.sendOtp({ recipient: email.trim(), countryCode: '+91', purposeLkpId: 1 });
        if (res.data.isSuccess === 1) {
          navigation.navigate('Otp', { recipient: email.trim(), countryCode: '' });
        } else {
          Alert.alert('Error', res.data.message || 'Unable to send OTP. Please try again.');
        }
      } catch (e: any) {
        const msg = e?.response
          ? `Server error (${e.response.status}): ${e.response.data?.message || 'Unable to send OTP.'}`
          : 'Network error — cannot reach the server. Check your connection.';
        Alert.alert('Error', msg);
      } finally {
        setLoading(false);
      }
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
                <Text style={styles.logoIcon}>{'♡'}</Text>
              </View>
              <Text style={styles.brandName}>RippleHub</Text>
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
                  <Text style={[styles.tabIcon, tab === 'mobile' && styles.tabIconActive]}>{'📱'}</Text>
                  <Text style={[styles.tabText, tab === 'mobile' && styles.tabTextActive]}>Mobile</Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, tab === 'email' && styles.tabActive]}
                  onPress={() => setTab('email')}
                  android_ripple={{ color: 'rgba(107,78,255,0.08)', borderless: false }}
                  accessibilityLabel="Sign in with email"
                >
                  <Text style={[styles.tabIcon, tab === 'email' && styles.tabIconActive]}>{'✉️'}</Text>
                  <Text style={[styles.tabText, tab === 'email' && styles.tabTextActive]}>Email</Text>
                </Pressable>
              </View>

              {/* Mobile input */}
              {tab === 'mobile' && (
                <>
                  <Text style={styles.inputLabel}>Mobile Number</Text>
                  <View style={styles.phoneRow}>
                    {/* Country picker trigger */}
                    <TouchableOpacity
                      style={styles.countryPicker}
                      onPress={() => { setCountrySearch(''); setShowCountryPicker(true); }}
                      activeOpacity={0.7}
                      accessibilityLabel="Select country code"
                    >
                      <Text style={styles.flag}>{country.flag}</Text>
                      <Text style={styles.countryCode}>{country.dial}</Text>
                      <Text style={styles.countryChevron}>▾</Text>
                    </TouchableOpacity>

                    <TextInput
                      style={styles.phoneInput}
                      placeholder={country.placeholder}
                      placeholderTextColor={C.TEXT3}
                      keyboardType="phone-pad"
                      maxLength={country.maxLen}
                      value={phone}
                      onChangeText={t => setPhone(t.replace(/\D/g, ''))}
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
                    autoCorrect={false}
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
                disabled={loading || (showCheckbox && !termsAccepted)}
                accessibilityLabel="Send OTP"
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Send OTP</Text>
                }
              </Pressable>

              {/* Terms — checkbox for new users, plain text for returning */}
              {showCheckbox ? (
                <View style={styles.checkRow}>
                  <TouchableOpacity
                    onPress={handleCheckboxToggle}
                    style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
                    activeOpacity={0.7}
                    accessibilityLabel="Accept terms and privacy policy"
                  >
                    {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                  <Text style={styles.checkLabel}>
                    {'By continuing, you agree to our '}
                    <Text style={styles.link} onPress={() => { setLegalUrl('https://www.ripplehub.app/terms'); setShowLegal(true); }}>Terms of Service</Text>
                    {' and '}
                    <Text style={styles.link} onPress={() => { setLegalUrl('https://www.ripplehub.app/privacy'); setShowLegal(true); }}>Privacy Policy</Text>
                  </Text>
                </View>
              ) : (
                <Text style={styles.terms}>
                  {'By continuing, you agree to our '}
                  <Text style={styles.link} onPress={() => { setLegalUrl('https://www.ripplehub.app/terms'); setShowLegal(true); }}>Terms of Service</Text>
                  {' and '}
                  <Text style={styles.link} onPress={() => { setLegalUrl('https://www.ripplehub.app/privacy'); setShowLegal(true); }}>Privacy Policy</Text>
                </Text>
              )}
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

      {/* ── Legal WebView Modal ───────────────────────────────────────── */}
      <Modal
        visible={showLegal}
        animationType="slide"
        onRequestClose={() => setShowLegal(false)}
      >
        <SafeAreaView style={styles.legalRoot} edges={['top']}>
          <View style={styles.legalHeader}>
            <TouchableOpacity onPress={() => setShowLegal(false)} style={styles.legalBack}>
              <Text style={styles.legalBackText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.legalTitle} numberOfLines={1}>
              {legalUrl.includes('terms') ? 'Terms of Service' : 'Privacy Policy'}
            </Text>
            <View style={{ width: 70 }} />
          </View>
          <WebView source={{ uri: legalUrl }} style={{ flex: 1 }} />
        </SafeAreaView>
      </Modal>

      {/* ── Country Picker Modal ──────────────────────────────────────── */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowCountryPicker(false)}>
          <Pressable style={[styles.pickerSheet, { paddingBottom: insets.bottom + 8 }]} onPress={e => e.stopPropagation()}>
            {/* Handle */}
            <View style={styles.pickerHandle} />

            {/* Title */}
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
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
                <TouchableOpacity onPress={() => setCountrySearch('')}>
                  <Text style={{ color: C.TEXT2, fontSize: 15, paddingHorizontal: 6 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Country list */}
            <FlatList
              data={filteredCountries}
              keyExtractor={item => item.code}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.pickerSep} />}
              renderItem={({ item }) => {
                const selected = item.code === country.code;
                return (
                  <TouchableOpacity
                    style={[styles.countryPicker, selected && { backgroundColor: C.PRIMARY + '10' }]}
                    onPress={() => { setCountry(item); setShowCountryPicker(false); setCountrySearch(''); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.flag}>{item.flag}</Text>
                    <Text style={[styles.countryCode, { flex: 1 }, selected && { color: C.PRIMARY, fontWeight: '700' }]}>{item.name}</Text>
                    <Text style={[styles.countryCode, selected && { color: C.PRIMARY }]}>{item.dial}</Text>
                    {selected && <Text style={{ color: C.PRIMARY, marginLeft: 6, fontSize: 13 }}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={{ color: C.TEXT2, textAlign: 'center', padding: 20 }}>No countries found</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.BG },
  scroll:         { flexGrow: 1 },

  // Brand
  brandBlock:    { alignItems: 'center', paddingTop: 32, paddingBottom: 8 },
  logoCircle:    { width: 72, height: 72, borderRadius: 22, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoIcon:      { fontSize: 34 },
  brandName:     { fontSize: 26, fontWeight: '800', color: C.TEXT, letterSpacing: -0.5 },
  brandTagline:  { fontSize: 14, color: C.TEXT2, marginTop: 4 },

  // Card
  card:          { margin: 16, backgroundColor: C.CARD, borderRadius: 20, padding: 20, ...{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 } },
  cardTitle:     { fontSize: 20, fontWeight: '800', color: C.TEXT, marginBottom: 4 },
  cardSubtitle:  { fontSize: 14, color: C.TEXT2, marginBottom: 20 },

  // Tabs
  tabRow:         { flexDirection: 'row', backgroundColor: C.BG, borderRadius: 10, padding: 3, marginBottom: 18 },
  tab:            { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabActive:      { backgroundColor: C.CARD, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText:        { fontSize: 14, color: C.TEXT2, fontWeight: '500' },
  tabTextActive:  { color: C.TEXT, fontWeight: '700' },
  tabIcon:        { fontSize: 16 },
  tabIconActive:  { fontSize: 16 },

  // Phone input
  inputLabel:    { fontSize: 13, fontWeight: '600', color: C.TEXT2, marginBottom: 8 },
  phoneRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.INPUT_BG, borderRadius: 12, borderWidth: 1, borderColor: C.BORDER, marginBottom: 16, overflow: 'hidden' },
  countryChevron:{ fontSize: 12, color: C.TEXT2, paddingRight: 8 },
  phoneInput:    { flex: 1, fontSize: 16, color: C.TEXT, paddingVertical: 14, paddingRight: 14 },
  emailInput:    { backgroundColor: C.INPUT_BG, borderRadius: 12, borderWidth: 1, borderColor: C.BORDER, fontSize: 16, color: C.TEXT, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 16 },

  // Button
  btn:            { backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  btnText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
  terms:          { fontSize: 12, color: C.TEXT2, textAlign: 'center', lineHeight: 18 },
  link:           { color: C.PRIMARY, fontWeight: '600' },

  // Terms checkbox (new users)
  checkRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox:       { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: C.TEXT3, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkboxChecked:{ backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  checkmark:      { color: '#fff', fontSize: 11, fontWeight: '800' },
  checkLabel:     { flex: 1, fontSize: 12, color: C.TEXT2, lineHeight: 18 },

  // Legal WebView modal
  legalRoot:      { flex: 1, backgroundColor: '#fff' },
  legalHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  legalBack:      { width: 70 },
  legalBackText:  { fontSize: 15, color: C.PRIMARY, fontWeight: '600' },
  legalTitle:     { flex: 1, fontSize: 16, fontWeight: '700', color: C.TEXT, textAlign: 'center' },

  // Features
  featureLabel:  { fontSize: 13, fontWeight: '700', color: C.TEXT2, marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  featureRow:    { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 24 },
  featureCard:   { flex: 1, backgroundColor: C.CARD, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  featureIcon:   { fontSize: 24 },
  featureText:   { fontSize: 12, fontWeight: '600', color: C.TEXT, textAlign: 'center' },

  // Country picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet:   { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  pickerHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  pickerHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  pickerTitle:   { fontSize: 16, fontWeight: '700', color: C.TEXT },
  pickerClose:   { fontSize: 18, color: C.TEXT2, padding: 4 },
  pickerSearchBox:   { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: C.INPUT_BG, borderRadius: 10, paddingHorizontal: 10, gap: 6 },
  pickerSearchIcon:  { fontSize: 16 },
  pickerSearchInput: { flex: 1, fontSize: 14, color: C.TEXT, paddingVertical: 10 },
  countryPicker: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  flag:          { fontSize: 22, width: 32, textAlign: 'center' },
  countryCode:   { fontSize: 14, color: C.TEXT },
  pickerSep:     { height: 1, backgroundColor: C.BORDER, marginLeft: 58 },
});