import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import DocumentPicker, { types as DocTypes } from 'react-native-document-picker';
import { launchImageLibrary } from 'react-native-image-picker';
import AppConfig from '../../config/AppConfig';
import { useAuthStore } from '../../store/authStore';
import { submitSupportContact } from '../../api/support.api';
import { uploadFile } from '../../api/upload.api';

const C = AppConfig.COLORS;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Category options ─────────────────────────────────────────────────────────

const CATEGORIES = [
  { code: 'GENERAL_QUERY',    label: 'General Query',         emoji: '💬' },
  { code: 'DONATION_SUPPORT', label: 'Donation Support',      emoji: '💳' },
  { code: 'ORG_APPROVAL',     label: 'Organisation Approval', emoji: '🏢' },
  { code: 'BUG_REPORT',       label: 'Bug Report',            emoji: '🐛' },
  { code: 'FEEDBACK',         label: 'Feedback',              emoji: '⭐' },
] as const;

type CategoryCode = typeof CATEGORIES[number]['code'];

interface Attachment {
  uri:      string;
  name:     string;
  mimeType: string;
  isImage:  boolean;   // true → show thumbnail
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HelpSupportScreen() {
  const nav       = useNavigation();
  const user      = useAuthStore(s => s.user);
  const scrollRef = useRef<ScrollView>(null);

  const [category,     setCategory]     = useState<CategoryCode | null>(null);
  const [subject,      setSubject]      = useState('');
  const [description,  setDescription]  = useState('');
  const [contactName,  setContactName]  = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [attachment,   setAttachment]   = useState<Attachment | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [submitted,    setSubmitted]    = useState(false);

  // Pre-fill contact details from profile.
  // useEffect is needed because useState only reads the initial value once on mount;
  // if user hasn't loaded yet (or the profile was fetched async), the fields stay blank.
  useEffect(() => {
    if (!user) return;
    const name = user.fullName?.trim()
      || [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    if (name)        setContactName(name);
    if (user.email)  setContactEmail(user.email);
  }, [user]);

  // ── Attachment pickers ─────────────────────────────────────────────────────

  const showAttachmentOptions = () => {
    Alert.alert(
      'Add Attachment',
      'Choose a file to attach (max 5 MB)',
      [
        { text: 'Photo / Image',      onPress: pickImage    },
        { text: 'PDF / Video / File', onPress: pickDocument },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const pickImage = async () => {
    launchImageLibrary(
      { mediaType: 'mixed', quality: 0.8, videoQuality: 'medium' },
      response => {
        if (response.didCancel || response.errorCode) return;
        const asset = response.assets?.[0];
        if (!asset?.uri) return;

        const size = asset.fileSize ?? 0;
        if (size > MAX_BYTES) {
          Alert.alert('File too large', 'Please select a file under 5 MB.');
          return;
        }
        setAttachment({
          uri:      asset.uri,
          name:     asset.fileName ?? `image_${Date.now()}.jpg`,
          mimeType: asset.type     ?? 'image/jpeg',
          isImage:  true,
        });
      },
    );
  };

  const pickDocument = async () => {
    try {
      const [picked] = await DocumentPicker.pick({
        type: [DocTypes.pdf, DocTypes.video, DocTypes.allFiles],
        allowMultiSelection: false,
        copyTo: 'cachesDirectory',
      });

      const size = picked.size ?? 0;
      if (size > MAX_BYTES) {
        Alert.alert('File too large', 'Please select a file under 5 MB.');
        return;
      }
      setAttachment({
        uri:      picked.fileCopyUri ?? picked.uri,
        name:     picked.name  ?? `file_${Date.now()}`,
        mimeType: picked.type  ?? 'application/octet-stream',
        isImage:  false,
      });
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) return;
      Alert.alert('Could not open file picker', err?.message ?? 'Please try again.');
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('Category required', 'Please select a category for your query.');
      return;
    }
    if (!subject.trim()) {
      Alert.alert('Subject required', 'Please enter a subject.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please describe your issue or feedback.');
      return;
    }
    if (!contactEmail.trim()) {
      Alert.alert('Email required', 'Please provide an email so we can reply to you.');
      return;
    }
    if (!contactName.trim()) {
      Alert.alert('Name required', 'Please provide your name.');
      return;
    }

    const selectedCategory = CATEGORIES.find(c => c.code === category)!;

    setLoading(true);
    try {
      // 1. Upload attachment if present
      let attachmentUrl: string | undefined;
      if (attachment) {
        try {
          attachmentUrl = await uploadFile(
            attachment.uri,
            attachment.name,
            attachment.mimeType,
            'support-attachments',
          );
        } catch {
          // Upload failure is non-blocking — ask user if they want to proceed
          const proceed = await new Promise<boolean>(resolve =>
            Alert.alert(
              'Attachment upload failed',
              'We could not upload the file. Send without attachment?',
              [
                { text: 'Send anyway', onPress: () => resolve(true)  },
                { text: 'Cancel',      onPress: () => resolve(false), style: 'cancel' },
              ],
            ),
          );
          if (!proceed) { setLoading(false); return; }
        }
      }

      // 2. Submit support request
      const res = await submitSupportContact({
        categoryCode:  selectedCategory.code,
        categoryLabel: selectedCategory.label,
        subject:       subject.trim(),
        description:   description.trim(),
        contactEmail:  contactEmail.trim(),
        contactName:   contactName.trim(),
        attachmentUrl,
      });

      console.log('[Support] raw res.data:', JSON.stringify(res.data));

      if (res.data?.isSuccess === 1) {
        setSubmitted(true);
      } else {
        Alert.alert('Could not send', res.data?.message ?? 'Please try again.');
      }
    } catch (err: any) {
      // Axios error: extract the API message from the response body if available
      const apiMessage = err?.response?.data?.message;
      Alert.alert(
        'Could not send',
        apiMessage ?? 'Please check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Help & Support</Text>
          <View style={{ width: 70 }} />
        </View>

        <View style={s.successWrap}>
          <Text style={s.successIcon}>✅</Text>
          <Text style={s.successTitle}>Message Sent!</Text>
          <Text style={s.successMsg}>
            We've received your request and will get back to you at{'\n'}
            <Text style={s.successEmail}>{contactEmail}</Text>
            {'\n'}within 1–2 business days.
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => nav.goBack()}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Help & Support</Text>
        <View style={{ width: 70 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Subtitle */}
          <Text style={s.subtitle}>
            We're here to help. Select a category and describe your issue.
          </Text>

          {/* Category picker */}
          <Text style={s.label}>Category <Text style={s.required}>*</Text></Text>
          <View style={s.chips}>
            {CATEGORIES.map(cat => {
              const active = category === cat.code;
              return (
                <TouchableOpacity
                  key={cat.code}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => setCategory(cat.code)}
                  activeOpacity={0.7}>
                  <Text style={[s.chipText, active && s.chipTextActive]}>
                    {cat.emoji} {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Subject */}
          <Text style={s.label}>Subject <Text style={s.required}>*</Text></Text>
          <TextInput
            style={s.input}
            placeholder="Brief summary of your issue"
            placeholderTextColor={C.TEXT3}
            value={subject}
            onChangeText={setSubject}
            maxLength={255}
            returnKeyType="next"
          />

          {/* Description */}
          <Text style={s.label}>Description <Text style={s.required}>*</Text></Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder="Please describe your issue in detail…"
            placeholderTextColor={C.TEXT3}
            value={description}
            onChangeText={setDescription}
            maxLength={2000}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <Text style={s.charCount}>{description.length}/2000</Text>

          {/* Attachment */}
          <Text style={s.label}>Attachment <Text style={s.optional}>(optional · max 5 MB)</Text></Text>
          {attachment ? (
            <View style={s.attachCard}>
              {attachment.isImage ? (
                <Image source={{ uri: attachment.uri }} style={s.attachThumb} resizeMode="cover" />
              ) : (
                <View style={s.attachIcon}>
                  <Text style={s.attachIconText}>
                    {attachment.mimeType.includes('pdf') ? '📄' :
                     attachment.mimeType.includes('video') ? '🎬' : '📁'}
                  </Text>
                </View>
              )}
              <View style={s.attachInfo}>
                <Text style={s.attachName} numberOfLines={1}>{attachment.name}</Text>
                <Text style={s.attachReady}>Ready to upload</Text>
              </View>
              <TouchableOpacity onPress={() => setAttachment(null)} style={s.attachRemove}>
                <Text style={s.attachRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.attachBtn} onPress={showAttachmentOptions} activeOpacity={0.7}>
              <Text style={s.attachBtnIcon}>📎</Text>
              <Text style={s.attachBtnText}>Attach a file</Text>
              <Text style={s.attachBtnHint}>PDF, image or video</Text>
            </TouchableOpacity>
          )}

          {/* Contact details */}
          <Text style={s.sectionTitle}>Your Contact Details</Text>
          <Text style={s.sectionHint}>
            Pre-filled from your profile. Edit if needed — we'll reply here.
          </Text>

          <Text style={s.label}>Name <Text style={s.required}>*</Text></Text>
          <TextInput
            style={s.input}
            placeholder="Your name"
            placeholderTextColor={C.TEXT3}
            value={contactName}
            onChangeText={setContactName}
            maxLength={100}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
          />

          <Text style={s.label}>Email <Text style={s.required}>*</Text></Text>
          <TextInput
            style={s.input}
            placeholder="Your email address"
            placeholderTextColor={C.TEXT3}
            value={contactEmail}
            onChangeText={setContactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={150}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
          />

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, loading && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>Send Message</Text>
            }
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: C.BG },

  header:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
                       paddingVertical: 14, backgroundColor: C.CARD,
                       borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:           { width: 70 },
  backText:          { fontSize: 15, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:       { flex: 1, fontSize: 17, fontWeight: '700', color: C.TEXT, textAlign: 'center' },

  scroll:            { padding: 20 },

  subtitle:          { fontSize: 14, color: C.TEXT2, lineHeight: 20, marginBottom: 24 },

  label:             { fontSize: 13, fontWeight: '600', color: C.TEXT, marginBottom: 8, marginTop: 16 },
  required:          { color: C.RED },
  optional:          { color: C.TEXT3, fontWeight: '400' },

  chips:             { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:              { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                       borderWidth: 1.5, borderColor: C.BORDER, backgroundColor: C.CARD },
  chipActive:        { borderColor: C.PRIMARY, backgroundColor: '#EEF0FF' },
  chipText:          { fontSize: 13, color: C.TEXT2, fontWeight: '500' },
  chipTextActive:    { color: C.PRIMARY, fontWeight: '700' },

  input:             { backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER,
                       borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                       fontSize: 14, color: C.TEXT },
  textArea:          { height: 130, paddingTop: 12 },
  charCount:         { fontSize: 11, color: C.TEXT3, textAlign: 'right', marginTop: 4 },

  // Attachment
  attachBtn:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
                       backgroundColor: C.CARD, borderRadius: 10, borderWidth: 1,
                       borderColor: C.BORDER, borderStyle: 'dashed' },
  attachBtnIcon:     { fontSize: 20 },
  attachBtnText:     { fontSize: 14, fontWeight: '600', color: C.PRIMARY, flex: 1 },
  attachBtnHint:     { fontSize: 11, color: C.TEXT3 },

  attachCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
                       backgroundColor: C.CARD, borderRadius: 10, borderWidth: 1,
                       borderColor: C.BORDER },
  attachThumb:       { width: 52, height: 52, borderRadius: 8, backgroundColor: C.BG },
  attachIcon:        { width: 52, height: 52, borderRadius: 8, backgroundColor: '#EEF0FF',
                       alignItems: 'center', justifyContent: 'center' },
  attachIconText:    { fontSize: 24 },
  attachInfo:        { flex: 1 },
  attachName:        { fontSize: 13, fontWeight: '600', color: C.TEXT },
  attachReady:       { fontSize: 11, color: '#16a34a', marginTop: 3 },
  attachRemove:      { padding: 6 },
  attachRemoveText:  { fontSize: 16, color: C.TEXT2 },

  sectionTitle:      { fontSize: 15, fontWeight: '700', color: C.TEXT, marginTop: 28, marginBottom: 4 },
  sectionHint:       { fontSize: 12, color: C.TEXT3, marginBottom: 4 },

  submitBtn:         { backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 15,
                       alignItems: 'center', marginTop: 28 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Success
  successWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon:       { fontSize: 56, marginBottom: 20 },
  successTitle:      { fontSize: 22, fontWeight: '800', color: C.TEXT, marginBottom: 12 },
  successMsg:        { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 22 },
  successEmail:      { color: C.PRIMARY, fontWeight: '600' },
  doneBtn:           { backgroundColor: C.PRIMARY, borderRadius: 12, paddingHorizontal: 40,
                       paddingVertical: 14, marginTop: 32 },
  doneBtnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
});
