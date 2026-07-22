/**
 * CreateFeedPostModal — "Create Feed Post" bottom sheet.
 *
 * Layout strategy (Android + iOS):
 *   The sheet is absolutely positioned with `bottom: kbHeight`.
 *   When the keyboard opens, kbHeight increases → sheet slides UP above the
 *   keyboard instead of being covered by it.  maxHeight is capped so the sheet
 *   never overflows the screen top.
 *
 *   KEYBOARD CLOSED → full content: text input + media picker + visibility options
 *   KEYBOARD OPEN   → text input (taller) + compact action bar (media icon + vis chip)
 *                     Media and visibility sections collapse; tap the vis chip to
 *                     dismiss the keyboard and reach the full options again.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import AppConfig from '../../config/AppConfig';
import { lookupApi } from '../../api/lookup.api';
import { createPost } from '../../api/feed.api';
import { uploadFile } from '../../api/upload.api';
import type { LookupValue, Organisation, UserProfile } from '../../types/api.types';

const C        = AppConfig.COLORS;
const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;

const MAX_SHEET_H = Math.round(SCREEN_H * 0.92);

const VIS_META: Record<string, { icon: string; sub: (org: string) => string }> = {
  PUBLIC:      { icon: '🌐', sub: () => 'Anyone on RippleHub' },
  ORG_MEMBERS: { icon: '👥', sub: (org) => `Only ${org} members` },
  FOLLOWERS:   { icon: '👤', sub: () => 'People who follow you' },
};

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface MediaItem {
  uri:       string;
  url:       string | null;
  uploading: boolean;
  aspect:    number;
  isVideo:   boolean;
  duration?: number;
}

interface Props {
  visible:    boolean;
  onClose:    () => void;
  onPosted:   () => void;
  user:       UserProfile | null;
  activeOrg:  Organisation | null;
  roleLabel?: string;
}

export default function CreateFeedPostModal({
  visible, onClose, onPosted, user, activeOrg, roleLabel = 'Member',
}: Props) {
  const insets    = useSafeAreaInsets();
  const inputRef  = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [content,         setContent]        = useState('');
  const [mediaItems,      setMediaItems]      = useState<MediaItem[]>([]);
  const [submitting,      setSubmitting]      = useState(false);
  const [visOptions,      setVisOptions]      = useState<LookupValue[]>([]);
  const [visLkpId,        setVisLkpId]        = useState<number | undefined>(undefined);
  const [visReady,        setVisReady]        = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [kbHeight,        setKbHeight]        = useState(0);

  const MAX_MEDIA    = 5;
  const anyUploading = mediaItems.some(m => m.uploading);

  // ── Load visibility lookup once ────────────────────────────────────────────
  useEffect(() => {
    lookupApi.getValuesByTypeCode(AppConfig.LOOKUP.POST_VISIBILITY)
      .then(res => {
        if (res.data?.isSuccess) {
          // FOLLOWERS hidden for now
          const opts: LookupValue[] = (res.data.data ?? []).filter(
            (o: LookupValue) => o.valueCode !== 'FOLLOWERS',
          );
          setVisOptions(opts);
          const pub = opts.find(o => o.valueCode === 'PUBLIC') ?? opts[0];
          if (pub) setVisLkpId(pub.lookupValueId);
        }
      })
      .finally(() => setVisReady(true));
  }, []);

  // ── Keyboard tracking ──────────────────────────────────────────────────────
  // We track the keyboard height and use it to position the sheet via
  // `bottom: kbHeight` so the sheet always sits ON TOP of the keyboard,
  // not behind it.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, e => {
      setKbHeight(e.endCoordinates.height);
      setKeyboardVisible(true);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 60);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKbHeight(0);
      setKeyboardVisible(false);
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  // ── Auto-focus on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // ── Reset on close ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setContent('');
    setMediaItems([]);
  }, []);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Media picker ───────────────────────────────────────────────────────────
  const handlePickMedia = useCallback(async () => {
    const slots = MAX_MEDIA - mediaItems.length;
    if (slots <= 0) {
      Alert.alert('Limit reached', `Maximum ${MAX_MEDIA} images per post.`);
      return;
    }
    const result = await launchImageLibrary({
      mediaType: 'mixed', quality: 0.8, selectionLimit: slots,
    });
    if (result.didCancel || !result.assets?.length) return;

    const assets   = result.assets.filter(a => a.uri);
    const startIdx = mediaItems.length;

    const pending: MediaItem[] = assets.map(a => ({
      uri:       a.uri!,
      url:       null,
      uploading: true,
      aspect:    a.width && a.height && a.height > 0 ? a.width / a.height : 4 / 3,
      isVideo:   (a.type ?? '').startsWith('video/'),
      duration:  (a as any).duration ?? undefined,
    }));
    setMediaItems(prev => [...prev, ...pending]);

    assets.forEach((asset, i) => {
      const idx = startIdx + i;
      uploadFile(
        asset.uri!,
        asset.fileName ?? `media_${i}.jpg`,
        asset.type     ?? 'image/jpeg',
        AppConfig.UPLOAD_MODULES.POST_MEDIA,
      )
        .then(url => {
          setMediaItems(prev =>
            prev.map((item, j) => j === idx ? { ...item, url, uploading: false } : item),
          );
        })
        .catch((err: any) => {
          setMediaItems(prev => prev.filter((_, j) => j !== idx));
          Alert.alert('Upload Failed', err?.message ?? 'Could not upload media.');
        });
    });
  }, [mediaItems]);

  // ── Publish ────────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!content.trim()) { Alert.alert('Empty post', 'Write something first.'); return; }
    if (anyUploading)    { Alert.alert('Please wait', 'Media still uploading…'); return; }
    setSubmitting(true);
    try {
      const uploadedUrls = mediaItems.filter(m => m.url).map(m => m.url!);
      const res = await createPost({
        content:         content.trim(),
        orgId:           activeOrg?.orgId,
        mediaUrls:       uploadedUrls.length > 0 ? uploadedUrls : undefined,
        visibilityLkpId: visLkpId,
      });
      if (res.data?.isSuccess === 1) { reset(); onPosted(); onClose(); }
      else Alert.alert('Error', res.data?.message ?? 'Could not post.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Connection error.');
    } finally {
      setSubmitting(false);
    }
  }, [content, anyUploading, mediaItems, activeOrg, visLkpId, reset, onPosted, onClose]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const userInitials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'ME';
  const userName     = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'You';
  const orgName      = activeOrg?.orgName ?? activeOrg?.name ?? 'RippleHub';
  const selVis       = visOptions.find(o => o.lookupValueId === visLkpId);
  const visIcon      = selVis ? (VIS_META[selVis.valueCode]?.icon ?? '🌐') : '🌐';
  const visSub       = selVis ? (VIS_META[selVis.valueCode]?.sub(orgName) ?? 'Public') : 'Public';

  // The maximum height the sheet can occupy so it never clips above the status bar
  const sheetMaxHeight = keyboardVisible
    ? SCREEN_H - kbHeight - insets.top - 10
    : MAX_SHEET_H;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      {/* Covers the full screen. Tap dismisses keyboard first, then modal.  */}
      <Pressable
        style={s.backdrop}
        onPress={() => {
          if (keyboardVisible) Keyboard.dismiss();
          else handleClose();
        }}
      />

      {/* ── Sheet — absolutely pinned above the keyboard ───────────────────── */}
      {/* `bottom: kbHeight` is the key: when the keyboard is 350px tall, the  */}
      {/* sheet bottom edge sits exactly 350px from the screen bottom = above   */}
      {/* the keyboard, never behind it.                                        */}
      <View
        style={[
          s.sheet,
          {
            bottom:    kbHeight,
            maxHeight: sheetMaxHeight,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={s.handle} />

        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Create Feed Post</Text>
            <Text style={s.headerSub} numberOfLines={1}>{visSub}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={s.closeBtn} accessibilityLabel="Close">
            <Text style={s.closeX}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ── Author card ───────────────────────────────────────────────── */}
        <View style={s.authorCard}>
          {user?.profilePhoto
            ? <Image source={{ uri: user.profilePhoto }} style={s.authorAvatar} />
            : <View style={s.authorAvatarFallback}>
                <Text style={s.authorInitials}>{userInitials}</Text>
              </View>
          }
          <View style={{ flex: 1 }}>
            <Text style={s.authorName}>{userName}</Text>
            <Text style={s.authorRole}>
              <Text style={{ color: C.PRIMARY }}>{roleLabel}</Text>
              {' · '}{orgName}
            </Text>
          </View>
        </View>

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.bodyContent}
        >
          {/* Text input — grows taller when keyboard is open */}
          <TextInput
            ref={inputRef}
            style={[s.input, keyboardVisible && s.inputExpanded]}
            placeholder="What do you want to share?"
            placeholderTextColor={C.TEXT3}
            multiline
            value={content}
            onChangeText={setContent}
            maxLength={1000}
            textAlignVertical="top"
            accessibilityLabel="Post content"
          />
          <Text style={s.charCount}>{content.length}/1000</Text>

          {/* ─── KEYBOARD OPEN: compact action bar ─────────────────────── */}
          {keyboardVisible && (
            <View style={s.compactBar}>
              <TouchableOpacity
                style={s.compactAction}
                onPress={handlePickMedia}
                activeOpacity={0.7}
              >
                <Text style={s.compactActionIcon}>🖼</Text>
                <Text style={s.compactActionLabel}>
                  Photo / Video{mediaItems.length > 0 ? ` (${mediaItems.length})` : ''}
                </Text>
              </TouchableOpacity>

              {/* Tap chip → dismiss keyboard → show full visibility options */}
              <TouchableOpacity
                style={s.visChip}
                onPress={() => Keyboard.dismiss()}
                activeOpacity={0.7}
              >
                <Text style={s.visChipText}>{visIcon} {selVis?.valueName ?? 'Public'}</Text>
                <Text style={s.visChipArrow}>▾</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─── KEYBOARD CLOSED: full media + visibility ──────────────── */}
          {!keyboardVisible && (
            <>
              {/* Media */}
              <Text style={s.sectionLabel}>
                Attach Images / Video{' '}
                <Text style={{ color: C.TEXT3, fontWeight: '400' }}>
                  ({mediaItems.length}/{MAX_MEDIA})
                </Text>
              </Text>

              {mediaItems.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.mediaThumbnailRow}
                >
                  {mediaItems.map((item, idx) => (
                    <View key={idx} style={s.mediaThumbnailWrap}>
                      <Image source={{ uri: item.uri }} style={s.mediaThumbnail} resizeMode="cover" />

                      {item.isVideo && !item.uploading && (
                        <View style={s.videoThumbOverlay}>
                          <View style={s.videoPlayBadge}>
                            <Text style={s.videoPlayIcon}>▶</Text>
                          </View>
                          {item.duration != null && (
                            <View style={s.videoDurationBadge}>
                              <Text style={s.videoDurationText}>{formatDuration(item.duration)}</Text>
                            </View>
                          )}
                        </View>
                      )}

                      {item.uploading && (
                        <View style={s.mediaOverlay}>
                          <ActivityIndicator color="#fff" size="small" />
                        </View>
                      )}

                      {!item.uploading && (
                        <TouchableOpacity
                          style={s.mediaRemove}
                          onPress={() => setMediaItems(prev => prev.filter((_, j) => j !== idx))}
                        >
                          <Text style={s.mediaRemoveText}>✕</Text>
                        </TouchableOpacity>
                      )}

                      {!item.uploading && item.url && (
                        <View style={s.mediaUploadedBadge}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓</Text>
                        </View>
                      )}
                    </View>
                  ))}

                  {mediaItems.length < MAX_MEDIA && (
                    <TouchableOpacity style={s.mediaAddMore} onPress={handlePickMedia} activeOpacity={0.7}>
                      <Text style={s.mediaAddMoreIcon}>+</Text>
                      <Text style={s.mediaAddMoreLabel}>Add</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              ) : (
                <TouchableOpacity style={s.mediaPicker} onPress={handlePickMedia} activeOpacity={0.7}>
                  <Text style={s.mediaPickerIcon}>🖼</Text>
                  <Text style={s.mediaPickerLabel}>Tap to attach photos or video</Text>
                  <Text style={s.mediaPickerHint}>Up to {MAX_MEDIA} images · JPG, PNG, MP4</Text>
                </TouchableOpacity>
              )}

              {/* Visibility */}
              <Text style={[s.sectionLabel, { marginTop: 16 }]}>Visibility</Text>
              {visReady
                ? visOptions.map(opt => {
                    const meta     = VIS_META[opt.valueCode];
                    const selected = visLkpId === opt.lookupValueId;
                    return (
                      <TouchableOpacity
                        key={opt.lookupValueId}
                        style={[s.visRow, selected && s.visRowSel]}
                        onPress={() => setVisLkpId(opt.lookupValueId)}
                        activeOpacity={0.75}
                      >
                        <Text style={s.visIcon}>{meta?.icon ?? '🔒'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.visLabel, selected && s.visLabelSel]}>{opt.valueName}</Text>
                          <Text style={s.visSub}>{meta?.sub(orgName) ?? ''}</Text>
                        </View>
                        <View style={[s.radio, selected && s.radioSel]}>
                          {selected && <View style={s.radioDot} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                : <ActivityIndicator color={C.PRIMARY} style={{ marginVertical: 16 }} />
              }
            </>
          )}
        </ScrollView>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <TouchableOpacity
            style={s.draftBtn}
            onPress={() => { Alert.alert('Draft saved', 'Draft sync coming soon.'); handleClose(); }}
            disabled={submitting}
          >
            <Text style={s.draftText}>Save Draft</Text>
          </TouchableOpacity>

          <Pressable
            style={[
              s.publishBtn,
              (submitting || anyUploading || !content.trim()) && s.publishBtnOff,
            ]}
            onPress={handlePublish}
            disabled={submitting || anyUploading || !content.trim()}
            android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.publishText}>Publish</Text>
            }
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // ── Backdrop: full screen, behind the sheet ──────────────────────────────
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  // ── Sheet: absolutely positioned, bottom tracks keyboard ─────────────────
  sheet: {
    position: 'absolute',
    left: 0, right: 0,
    // `bottom` is set dynamically via style prop (= kbHeight)
    backgroundColor:      '#fff',
    borderTopLeftRadius:  22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14, shadowRadius: 14, elevation: 18,
  },

  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#DDD', alignSelf: 'center', marginTop: 10,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F8',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  headerSub:   { fontSize: 12, color: C.PRIMARY, marginTop: 3 },
  closeBtn:    { padding: 4, marginLeft: 8 },
  closeX:      { fontSize: 20, color: '#999', fontWeight: '500', lineHeight: 24 },

  // ── Author card ──────────────────────────────────────────────────────────
  authorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8F8FC', borderRadius: 12,
    marginHorizontal: 16, marginVertical: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  authorAvatar:         { width: 40, height: 40, borderRadius: 20 },
  authorAvatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
  authorInitials: { fontSize: 14, fontWeight: '800', color: '#fff' },
  authorName:     { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  authorRole:     { fontSize: 12, color: '#666', marginTop: 1 },

  // ── Body ─────────────────────────────────────────────────────────────────
  body:        { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 12 },

  // Text input
  input: {
    minHeight: 80, fontSize: 15, color: '#1A1A2E', lineHeight: 22,
    textAlignVertical: 'top', paddingTop: 8, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F8', marginBottom: 4,
  },
  // Taller when keyboard is open so the writing area is clearly visible
  inputExpanded: { minHeight: 160 },
  charCount: { fontSize: 11, color: '#aaa', textAlign: 'right', marginBottom: 10 },

  // ── Compact bar (keyboard open) ───────────────────────────────────────────
  compactBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 8, paddingBottom: 4,
    borderTopWidth: 1, borderTopColor: '#F0F0F8', gap: 8,
  },
  compactAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F4F4FF', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, flex: 1,
  },
  compactActionIcon:  { fontSize: 16 },
  compactActionLabel: { fontSize: 13, color: C.PRIMARY, fontWeight: '600', flex: 1 },

  visChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F4F4FF', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  visChipText:  { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  visChipArrow: { fontSize: 10, color: C.PRIMARY },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },

  // ── Media empty picker ───────────────────────────────────────────────────
  mediaPicker: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#E0E0EC', borderRadius: 12,
    paddingVertical: 24, alignItems: 'center', backgroundColor: '#FAFAFF', marginBottom: 4,
  },
  mediaPickerIcon:  { fontSize: 28, marginBottom: 6 },
  mediaPickerLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
  mediaPickerHint:  { fontSize: 11, color: '#999', marginTop: 2 },

  // ── Media thumbnails ─────────────────────────────────────────────────────
  mediaThumbnailRow: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  mediaThumbnailWrap: {
    width: 90, height: 90, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F0F0F8',
  },
  mediaThumbnail: { width: '100%', height: '100%' },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  mediaRemove: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center',
  },
  mediaRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  mediaUploadedBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center',
  },
  mediaAddMore: {
    width: 90, height: 90, borderRadius: 10,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#D0D0E8',
    backgroundColor: '#FAFAFF', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  mediaAddMoreIcon:  { fontSize: 26, color: C.PRIMARY },
  mediaAddMoreLabel: { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },

  // Video overlays
  videoThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center',
  },
  videoPlayBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center',
  },
  videoPlayIcon: { fontSize: 12, color: '#111', marginLeft: 2 },
  videoDurationBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  videoDurationText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // ── Visibility radio rows ─────────────────────────────────────────────────
  visRow:    {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1.5,
    borderColor: '#E5E7EB', backgroundColor: '#fff', marginBottom: 8,
  },
  visRowSel: { borderColor: C.PRIMARY, backgroundColor: '#EEF2FF' },
  visIcon:   { fontSize: 20 },
  visLabel:  { fontSize: 14, fontWeight: '600', color: '#111' },
  visLabelSel: { color: C.PRIMARY },
  visSub:    { fontSize: 12, color: '#6B7280', marginTop: 1 },
  radio:     {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: '#CCC', alignItems: 'center', justifyContent: 'center',
  },
  radioSel:  { borderColor: C.PRIMARY },
  radioDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: C.PRIMARY },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F0F0F8',
  },
  draftBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  draftText:    { fontSize: 14, fontWeight: '600', color: '#374151' },
  publishBtn:   {
    flex: 1.4, paddingVertical: 13, borderRadius: 12, backgroundColor: C.PRIMARY,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  publishBtnOff:{ opacity: 0.5 },
  publishText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
});
