/**
 * WriteReviewSheet.tsx
 * Bottom sheet for submitting an NGO review.
 * Features: star picker, review text (20-500 chars), media picker
 * (up to 5 photos OR 1 video), reviewer type selector.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import AppConfig from '../../config/AppConfig';
import { uploadFile } from '../../api/upload.api';
import { reviewApi, ReviewMediaItem, AddReviewPayload } from '../../api/review.api';

const C = AppConfig.COLORS;

// ── Types ─────────────────────────────────────────────────────────────────────

type ReviewerType = 'VOLUNTEER' | 'DONOR' | 'GENERAL';

interface LocalMedia {
  localUri: string;
  fileName: string;
  mimeType: string;
  type:     'IMAGE' | 'VIDEO';
  preview:  string;
}

interface Props {
  visible:  boolean;
  orgId:    number;
  orgName:  string;
  onClose:  () => void;
  onSuccess: () => void;  // called after successful submit to refresh the list
}

// ── Star labels ───────────────────────────────────────────────────────────────

const STAR_LABELS: Record<number, string> = {
  1: 'Terrible',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

const REVIEWER_TYPES: { value: ReviewerType; emoji: string; label: string }[] = [
  { value: 'VOLUNTEER', emoji: '✅', label: 'Volunteer' },
  { value: 'DONOR',     emoji: '💛', label: 'Donor'     },
  { value: 'GENERAL',   emoji: '👤', label: 'General'   },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function WriteReviewSheet({ visible, orgId, orgName, onClose, onSuccess }: Props) {
  const [rating,       setRating]       = useState(0);
  const [reviewText,   setReviewText]   = useState('');
  const [reviewerType, setReviewerType] = useState<ReviewerType>('VOLUNTEER');
  const [mediaItems,   setMediaItems]   = useState<LocalMedia[]>([]);
  const [submitting,   setSubmitting]   = useState(false);

  // ── Reset state when sheet closes ─────────────────────────────
  function reset() {
    setRating(0);
    setReviewText('');
    setReviewerType('VOLUNTEER');
    setMediaItems([]);
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── Media picker ───────────────────────────────────────────────
  async function pickMedia() {
    const imageCount = mediaItems.filter(m => m.type === 'IMAGE').length;
    const videoCount = mediaItems.filter(m => m.type === 'VIDEO').length;

    if (imageCount >= 5) {
      Alert.alert('Limit reached', 'You can add a maximum of 5 photos.');
      return;
    }

    launchImageLibrary(
      {
        mediaType:      videoCount > 0 ? 'photo' : 'mixed',
        quality:        0.9,
        selectionLimit: 1,
      },
      res => {
        if (res.didCancel || !res.assets?.length) return;
        const asset = res.assets[0];
        if (!asset.uri) return;

        const isVideo = asset.type?.startsWith('video') ?? false;
        if (isVideo && videoCount >= 1) {
          Alert.alert('Limit reached', 'You can add a maximum of 1 video.');
          return;
        }
        if (isVideo && imageCount > 0) {
          Alert.alert('Not allowed', 'Cannot mix photos and a video. Please remove photos first.');
          return;
        }

        setMediaItems(prev => [
          ...prev,
          {
            localUri: asset.uri!,
            fileName: asset.fileName ?? `media_${Date.now()}`,
            mimeType: asset.type   ?? 'image/jpeg',
            type:     isVideo ? 'VIDEO' : 'IMAGE',
            preview:  asset.uri!,
          },
        ]);
      },
    );
  }

  function removeMedia(idx: number) {
    setMediaItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Submit ─────────────────────────────────────────────────────
  async function handleSubmit() {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating.');
      return;
    }
    if (reviewText.replace(/\s/g, '').length < 10) {
      Alert.alert('Too short', 'Review must be at least 10 characters (excluding spaces).');
      return;
    }

    setSubmitting(true);
    try {
      // Upload media first
      const uploadedMedia: ReviewMediaItem[] = [];
      for (const m of mediaItems) {
        const url = await uploadFile(m.localUri, m.fileName, m.mimeType, 'review-media');
        uploadedMedia.push({ url, type: m.type });
      }

      const payload: AddReviewPayload = {
        overallRating: rating,
        reviewText:    reviewText.trim(),
        reviewerType,
        mediaItems:    uploadedMedia,
      };

      const res = await reviewApi.addReview(orgId, payload);
      if (res.data?.isSuccess) {
        Alert.alert('Review submitted!', 'Thank you! Your review is now live.');
        reset();
        onSuccess();
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not submit review. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <Text style={styles.title}>Write a Review</Text>
            <Text style={styles.subtitle}>{orgName}</Text>

            {/* Star picker */}
            <Text style={styles.sectionLabel}>
              Overall Rating <Text style={{ color: C.ERROR ?? '#EF4444' }}>*</Text>
            </Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setRating(n)}>
                  <Text style={[styles.star, n <= rating && styles.starFilled]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.starLabel}>{STAR_LABELS[rating]} — {rating}/5</Text>
            )}

            {/* Review text */}
            <Text style={styles.sectionLabel}>Your Review</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Share your experience with this NGO — what did they do well, what could be better?"
              placeholderTextColor={C.TEXT_SECONDARY}
              multiline
              maxLength={500}
              value={reviewText}
              onChangeText={setReviewText}
            />
            <View style={styles.charCountRow}>
              <Text style={styles.charHint}>Minimum 10 characters (excluding spaces)</Text>
              <Text style={styles.charCount}>{reviewText.length} / 500</Text>
            </View>

            {/* Media picker */}
            <Text style={styles.sectionLabel}>
              Add Photos / Videos{' '}
              <Text style={styles.optionalTag}>(optional)</Text>
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaScroll}>
              {/* Add button */}
              {(mediaItems.filter(m => m.type === 'IMAGE').length < 5) && (
                <TouchableOpacity style={styles.addMediaBtn} onPress={pickMedia}>
                  <Text style={styles.addMediaIcon}>📎</Text>
                  <Text style={styles.addMediaLabel}>Add</Text>
                </TouchableOpacity>
              )}
              {/* Thumbnails */}
              {mediaItems.map((m, idx) => (
                <View key={idx} style={styles.thumbWrapper}>
                  <Image source={{ uri: m.preview }} style={styles.thumb} resizeMode="cover" />
                  {m.type === 'VIDEO' && (
                    <View style={styles.videoBadge}>
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>▶ VID</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(idx)}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.mediaHint}>Up to 5 photos or 1 video · Max 20 MB each</Text>

            {/* Reviewer type */}
            <Text style={styles.sectionLabel}>You are reviewing as</Text>
            <View style={styles.typeRow}>
              {REVIEWER_TYPES.map(rt => (
                <TouchableOpacity
                  key={rt.value}
                  style={[
                    styles.typeBtn,
                    reviewerType === rt.value && styles.typeBtnActive,
                  ]}
                  onPress={() => setReviewerType(rt.value)}
                >
                  <Text style={styles.typeBtnEmoji}>{rt.emoji}</Text>
                  <Text
                    style={[
                      styles.typeBtnText,
                      reviewerType === rt.value && styles.typeBtnTextActive,
                    ]}
                  >
                    {rt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Submit row */}
            <View style={styles.submitRow}>
              <TouchableOpacity style={styles.backBtn} onPress={handleClose}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Submit Review</Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.disclaimer}>
              Reviews are public. One review per Organisation per user.
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetWrapper: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.CARD,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingHorizontal:    18,
    paddingBottom:        Platform.OS === 'ios' ? 36 : 24,
    maxHeight:            '90%',
  },
  handle: {
    width:         40,
    height:         4,
    borderRadius:   2,
    backgroundColor: C.BORDER ?? '#D1D5DB',
    alignSelf:      'center',
    marginVertical: 10,
  },
  title: {
    fontSize:     18,
    fontWeight:   '800',
    color:        C.TEXT_PRIMARY,
    marginBottom: 2,
  },
  subtitle: {
    fontSize:     13,
    color:        C.TEXT_SECONDARY,
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize:     13,
    fontWeight:   '700',
    color:        C.TEXT_PRIMARY,
    marginBottom: 8,
  },
  optionalTag: {
    fontWeight: '400',
    color:      C.TEXT_SECONDARY,
  },
  starRow: {
    flexDirection: 'row',
    gap:           8,
    marginBottom:  4,
  },
  star: {
    fontSize: 36,
    color:    C.BORDER ?? '#D1D5DB',
  },
  starFilled: {
    color: '#F59E0B',
  },
  starLabel: {
    fontSize:     12,
    color:        C.TEXT_SECONDARY,
    marginBottom: 16,
  },
  textInput: {
    borderWidth:     1.5,
    borderColor:     C.BORDER ?? '#E5E7EB',
    borderRadius:    10,
    padding:         12,
    fontSize:        13,
    color:           C.TEXT_PRIMARY,
    backgroundColor: C.BACKGROUND,
    minHeight:       100,
    textAlignVertical: 'top',
    lineHeight:      20,
    marginBottom:    4,
  },
  charCountRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   16,
  },
  charHint: {
    fontSize: 11,
    color:    C.TEXT_SECONDARY,
  },
  charCount: {
    fontSize: 11,
    color:    C.TEXT_SECONDARY,
  },
  mediaScroll: {
    marginBottom: 4,
  },
  addMediaBtn: {
    width:           72,
    height:          72,
    borderRadius:    10,
    borderWidth:     2,
    borderStyle:     'dashed',
    borderColor:     C.BORDER ?? '#D1D5DB',
    backgroundColor: C.BACKGROUND,
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     8,
  },
  addMediaIcon: { fontSize: 22 },
  addMediaLabel: {
    fontSize:   9,
    fontWeight: '600',
    color:      C.TEXT_SECONDARY,
  },
  thumbWrapper: {
    position:     'relative',
    width:        72,
    height:       72,
    borderRadius: 10,
    overflow:     'hidden',
    marginRight:  8,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position:        'absolute',
    bottom:          4,
    left:            4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical:  2,
  },
  removeBtn: {
    position:        'absolute',
    top:             3,
    right:           3,
    width:           18,
    height:          18,
    borderRadius:    9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  mediaHint: {
    fontSize:     10,
    color:        C.TEXT_SECONDARY,
    marginBottom: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap:           8,
    marginBottom:  20,
    flexWrap:      'wrap',
  },
  typeBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      8,
    borderWidth:       1.5,
    borderColor:       C.BORDER ?? '#E5E7EB',
    backgroundColor:   C.BACKGROUND,
  },
  typeBtnEmoji: {
    fontSize: 14,
  },
  typeBtnActive: {
    borderColor:     C.PRIMARY,
    backgroundColor: C.PRIMARY_LIGHT ?? '#EFF6FF',
  },
  typeBtnText: {
    fontSize:   12,
    fontWeight: '600',
    color:      C.TEXT_SECONDARY,
  },
  typeBtnTextActive: {
    color: C.PRIMARY,
  },
  submitRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginBottom:  10,
  },
  backBtn: {
    borderWidth:       1.5,
    borderColor:       C.BORDER ?? '#E5E7EB',
    borderRadius:      12,
    paddingVertical:   14,
    paddingHorizontal: 18,
    alignItems:        'center',
    justifyContent:    'center',
  },
  backBtnText: {
    fontSize:   14,
    fontWeight: '600',
    color:      C.TEXT_PRIMARY,
  },
  submitBtn: {
    flex:            1,
    backgroundColor: C.PRIMARY,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
  },
  submitText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   15,
  },
  disclaimer: {
    fontSize:  11,
    color:     C.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 4,
  },
});
