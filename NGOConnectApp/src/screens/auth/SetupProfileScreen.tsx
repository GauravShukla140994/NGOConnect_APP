/**
 * SetupProfileScreen
 * Shown to new users immediately after OTP verification.
 * Collects: First name, Last name, Profile photo (optional).
 * On "Get Started" → PATCH /user/profile → login() → Home.
 * On "Skip"        → login() directly → Home (profile stays empty).
 *
 * Tokens are already in tokenStorage (set by OtpScreen) so API calls work.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useAuthStore } from '../../store/authStore';
import { userApi } from '../../api/user.api';
import { uploadFile } from '../../api/upload.api';
import AppConfig from '../../config/AppConfig';

const LOGO = require('../../assets/images/logo.png');
const C = AppConfig.COLORS;

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SetupProfile'>;
  route: RouteProp<AuthStackParamList, 'SetupProfile'>;
};

export default function SetupProfileScreen({ route }: Props) {
  const { tokens } = route.params;
  const login = useAuthStore(state => state.login);

  const [firstName,    setFirstName]    = useState('');
  const [lastName,     setLastName]     = useState('');
  const [photoUri,     setPhotoUri]     = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [saving,       setSaving]       = useState(false);

  // ── Pick photo from gallery ────────────────────────────────────────────────
  const handlePickPhoto = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, maxWidth: 800, maxHeight: 800 },
      (response) => {
        if (response.didCancel || response.errorCode) { return; }
        const asset = response.assets?.[0];
        if (asset?.uri) { setPhotoUri(asset.uri); }
      },
    );
  };

  // ── Complete setup ─────────────────────────────────────────────────────────
  const handleGetStarted = async () => {
    const first = firstName.trim();
    const last  = lastName.trim();

    if (!first) {
      Alert.alert('First name required', 'Please enter your first name to continue.');
      return;
    }

    setSaving(true);
    try {
      let profilePhoto: string | undefined;

      // Upload photo first if one was picked
      if (photoUri) {
        setUploading(true);
        try {
          const fileName = `profile_${Date.now()}.jpg`;
          profilePhoto = await uploadFile(photoUri, fileName, 'image/jpeg', 'user-photos');
        } catch {
          // Non-fatal — skip photo, still save name
          Alert.alert('Photo upload failed', 'We couldn\'t upload your photo. You can add it later from your profile.');
        } finally {
          setUploading(false);
        }
      }

      await userApi.updateProfile({
        firstName: first,
        lastName:  last,
        ...(profilePhoto ? { profilePhoto } : {}),
      });
    } catch {
      // Silently continue — worst case they land on Home with a blank name they can fix
    } finally {
      setSaving(false);
    }

    // Complete login regardless of profile save success
    login(tokens);
  };

  // ── Skip setup entirely ────────────────────────────────────────────────────
  const handleSkip = () => {
    login(tokens);
  };

  const isLoading = saving || uploading;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={C.BG} translucent={false} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Brand */}
            <View style={styles.brandBlock}>
              <Image source={LOGO} style={styles.logoImage} resizeMode="cover" />
              <Text style={styles.brandName}>RippleHub</Text>
            </View>

            {/* Heading */}
            <Text style={styles.heading}>Let's set up your profile</Text>
            <Text style={styles.subheading}>
              This is how other volunteers and NGOs will see you.
            </Text>

            {/* Avatar picker */}
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={handlePickPhoto}
              activeOpacity={0.8}
              accessibilityLabel="Add profile photo"
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarIcon}>📷</Text>
                  <Text style={styles.avatarHint}>Add Photo</Text>
                </View>
              )}
              {/* Edit badge */}
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeText}>✎</Text>
              </View>
            </TouchableOpacity>

            {/* Name fields */}
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>First name <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Rahul"
                  placeholderTextColor={C.TEXT2}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  maxLength={50}
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Sharma"
                  placeholderTextColor={C.TEXT2}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  maxLength={50}
                  editable={!isLoading}
                  onSubmitEditing={handleGetStarted}
                />
              </View>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={[styles.btn, isLoading && styles.btnDisabled]}
              onPress={handleGetStarted}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Get Started 🚀</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              disabled={isLoading}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.BG },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },

  // Brand
  brandBlock:  { alignItems: 'center', paddingTop: 24, paddingBottom: 4 },
  logoImage:   { width: 52, height: 52, borderRadius: 14, marginBottom: 6 },
  brandName:   { fontSize: 18, fontWeight: '800', color: C.TEXT, letterSpacing: -0.5 },

  // Heading
  heading:    { fontSize: 24, fontWeight: '800', color: C.TEXT, textAlign: 'center', marginTop: 24, marginBottom: 6 },
  subheading: { fontSize: 14, color: C.TEXT2, textAlign: 'center', marginBottom: 28, lineHeight: 20 },

  // Avatar
  avatarWrapper: {
    alignSelf: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: C.PRIMARY,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${C.PRIMARY}15`,
    borderWidth: 2,
    borderColor: `${C.PRIMARY}40`,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 28, marginBottom: 2 },
  avatarHint: { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.BG,
  },
  editBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Form
  form:        { gap: 16, marginBottom: 28 },
  fieldGroup:  { gap: 6 },
  label:       { fontSize: 13, fontWeight: '600', color: C.TEXT },
  required:    { color: '#EF4444' },
  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${C.PRIMARY}30`,
    backgroundColor: C.CARD,
    paddingHorizontal: 16,
    fontSize: 15,
    color: C.TEXT,
  },

  // Buttons
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: C.PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn:     { alignItems: 'center', paddingVertical: 10 },
  skipText:    { fontSize: 14, color: C.TEXT2, textDecorationLine: 'underline' },
});
