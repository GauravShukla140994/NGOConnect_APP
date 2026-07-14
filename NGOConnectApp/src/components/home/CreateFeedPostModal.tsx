/**
 * CreateFeedPostModal — "Create Feed Post" bottom sheet.
 *
 * Layout fix: sheet uses a concrete pixel height (not maxHeight) so that
 * the inner ScrollView's flex:1 has a parent dimension to expand into.
 * maxHeight collapses flex children to 0 on Android.
 *
 * API: POST /post { content, orgId, mediaUrls, visibilityLkpId }
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

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
// Max sheet height — 90% of screen. Actual height shrinks when keyboard opens.
const MAX_SHEET_H = Math.round(SCREEN_H * 0.90);

const VIS_META: Record<string, { icon: string; sub: (org: string) => string }> = {
  PUBLIC:      { icon: '🌐', sub: () => 'Anyone on NGO Connect' },
  ORG_MEMBERS: { icon: '👥', sub: (org) => `Only ${org} members` },
  FOLLOWERS:   { icon: '👤', sub: () => 'People who follow you' },
};

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
  const insets   = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  interface MediaItem {
    uri:       string;         // local file URI — shown immediately
    url:       string | null;  // remote URL after upload
    uploading: boolean;
    aspect:    number;         // w/h ratio of original asset
    isVideo:   boolean;        // true = video file
    duration?: number;         // seconds (videos only, from picker)
  }

  const [content,    setContent]    = useState('');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [visOptions, setVisOptions] = useState<LookupValue[]>([]);
  const [visLkpId,   setVisLkpId]   = useState<number | undefined>(undefined);
  const [visReady,   setVisReady]   = useState(false);
  const [kbHeight,   setKbHeight]   = useState(0);

  const MAX_MEDIA = 5;
  const anyUploading = mediaItems.some(m => m.uploading);

  // Load visibility lookup once
  useEffect(() => {
    lookupApi.getValuesByTypeCode(AppConfig.LOOKUP.POST_VISIBILITY)
      .then(res => {
        if (res.data?.isSuccess) {
          const opts: LookupValue[] = res.data.data ?? [];
          setVisOptions(opts);
          const pub = opts.find(o => o.valueCode === 'PUBLIC') ?? opts[0];
          if (pub) setVisLkpId(pub.lookupValueId);
        }
      })
      .finally(() => setVisReady(true));
  }, []);

  // Keyboard listener — shrink sheet height so content stays above keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, e => setKbHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvent, () => setKbHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const reset = useCallback(() => {
    setContent('');
    setMediaItems([]);
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const handlePickMedia = useCallback(async () => {
    const slots = MAX_MEDIA - mediaItems.length;
    if (slots <= 0) { Alert.alert('Limit reached', `Maximum ${MAX_MEDIA} images per post.`); return; }

    const result = await launchImageLibrary({
      mediaType:      'mixed',
      quality:        0.8,
      selectionLimit: slots,   // only allow as many as we have slots for
    });
    if (result.didCancel || !result.assets?.length) return;

    const assets = result.assets.filter(a => a.uri);
    const startIdx = mediaItems.length;

    // Add all as uploading immediately so thumbnails appear right away
    const pending: MediaItem[] = assets.map(a => ({
      uri:       a.uri!,
      url:       null,
      uploading: true,
      aspect:    a.width && a.height && a.height > 0 ? a.width / a.height : 4 / 3,
      isVideo:   (a.type ?? '').startsWith('video/'),
      duration:  (a as any).duration ?? undefined,
    }));
    setMediaItems(prev => [...prev, ...pending]);

    // Upload each in parallel — update its slot on success/fail
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

  const userInitials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'ME';
  const userName     = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'You';
  const orgName      = activeOrg?.orgName ?? activeOrg?.name ?? 'NGO Connect';
  const selVis       = visOptions.find(o => o.lookupValueId === visLkpId);
  const visSub       = selVis ? (VIS_META[selVis.valueCode]?.sub(orgName) ?? 'Public') : 'Public';

  // Dynamic sheet height: shrinks when keyboard opens so the sheet never overflows upward.
  const sheetHeight = Math.min(MAX_SHEET_H, SCREEN_H - kbHeight - insets.top - 10);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={handleClose}>
      <View style={s.kav}>
        {/* Backdrop */}
        <Pressable style={s.backdrop} onPress={handleClose} />

        {/* Sheet — dynamic pixel height, never overflows above keyboard */}
        <View style={[s.sheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 12) }]}>

          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>Create Feed Post</Text>
              <Text style={s.headerSub} numberOfLines={1}>{visSub}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={s.closeBtn} accessibilityLabel="Close">
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Author card */}
          <View style={s.authorCard}>
            {user?.profilePhoto
              ? <Image source={{ uri: user.profilePhoto }} style={s.authorAvatar} />
              : <View style={s.authorAvatarFallback}><Text style={s.authorInitials}>{userInitials}</Text></View>
            }
            <View style={{ flex: 1 }}>
              <Text style={s.authorName}>{userName}</Text>
              <Text style={s.authorRole}><Text style={{ color: C.PRIMARY }}>{roleLabel}</Text>{' · '}{orgName}</Text>
            </View>
          </View>

          {/* Scrollable body — flex:1 fills the remaining sheet height */}
          <ScrollView
            style={s.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.bodyContent}
          >
            {/* Text input */}
            <TextInput
              ref={inputRef}
              style={s.input}
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

            {/* Media — carousel thumbnails + add button */}
            <Text style={s.sectionLabel}>
              Attach Images / Video{' '}
              <Text style={{ color: C.TEXT3, fontWeight: '400' }}>
                ({mediaItems.length}/{MAX_MEDIA})
              </Text>
            </Text>

            {mediaItems.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.mediaThumbnailRow}
              >
                {mediaItems.map((item, idx) => (
                  <View key={idx} style={s.mediaThumbnailWrap}>
                    <Image source={{ uri: item.uri }} style={s.mediaThumbnail} resizeMode="cover" />

                    {/* Video overlay — play icon + duration badge */}
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

                    {/* Upload overlay */}
                    {item.uploading && (
                      <View style={s.mediaOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                        {item.isVideo && (
                          <Text style={{ color: '#fff', fontSize: 10, marginTop: 4 }}>Video…</Text>
                        )}
                      </View>
                    )}
                    {/* Remove button */}
                    {!item.uploading && (
                      <TouchableOpacity
                        style={s.mediaRemove}
                        onPress={() => setMediaItems(prev => prev.filter((_, j) => j !== idx))}
                        accessibilityLabel={item.isVideo ? 'Remove video' : 'Remove image'}
                      >
                        <Text style={s.mediaRemoveText}>✕</Text>
                      </TouchableOpacity>
                    )}
                    {/* Uploaded tick */}
                    {!item.uploading && item.url && (
                      <View style={s.mediaUploadedBadge}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓</Text>
                      </View>
                    )}
                  </View>
                ))}

                {/* Add more button — shown while slots remain */}
                {mediaItems.length < MAX_MEDIA && (
                  <TouchableOpacity style={s.mediaAddMore} onPress={handlePickMedia} activeOpacity={0.7}>
                    <Text style={s.mediaAddMoreIcon}>+</Text>
                    <Text style={s.mediaAddMoreLabel}>Add</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}

            {mediaItems.length === 0 && (
              <TouchableOpacity style={s.mediaPicker} onPress={handlePickMedia} activeOpacity={0.7}>
                <Text style={s.mediaPickerIcon}>🖼</Text>
                <Text style={s.mediaPickerLabel}>Tap to attach photos or video</Text>
                <Text style={s.mediaPickerHint}>Up to {MAX_MEDIA} images · JPG, PNG, MP4 · Max 10MB each</Text>
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
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity style={s.draftBtn} onPress={() => { Alert.alert('Draft saved', 'Draft sync coming soon.'); handleClose(); }} disabled={submitting}>
              <Text style={s.draftText}>Save Draft</Text>
            </TouchableOpacity>
            <Pressable
              style={[s.publishBtn, (submitting || anyUploading || !content.trim()) && s.publishBtnOff]}
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
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Outer container — no KAV; height is managed dynamically via keyboard listener
  kav:      { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },

  sheet: {
    // height is set inline (dynamic). Do NOT set height/maxHeight here.
    backgroundColor:      '#fff',
    borderTopLeftRadius:  22,
    borderTopRightRadius: 22,
    overflow:             'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14, shadowRadius: 14, elevation: 18,
  },

  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginTop: 10 },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F8',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  headerSub:   { fontSize: 12, color: C.PRIMARY, marginTop: 3 },
  closeBtn:    { padding: 4, marginLeft: 8 },
  closeX:      { fontSize: 20, color: '#999', fontWeight: '500', lineHeight: 24 },

  authorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8F8FC', borderRadius: 12,
    marginHorizontal: 16, marginVertical: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  authorAvatar:        { width: 40, height: 40, borderRadius: 20 },
  authorAvatarFallback:{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  authorInitials:      { fontSize: 14, fontWeight: '800', color: '#fff' },
  authorName:          { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  authorRole:          { fontSize: 12, color: '#666', marginTop: 1 },

  // Body — flex:1 so it fills the remaining space between authorCard and footer
  body:        { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 12 },

  input: {
    minHeight: 80, fontSize: 15, color: '#1A1A2E', lineHeight: 22,
    textAlignVertical: 'top', paddingTop: 8, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F8', marginBottom: 4,
  },
  charCount:    { fontSize: 11, color: '#aaa', textAlign: 'right', marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },

  // Media — empty state picker
  mediaPicker: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#E0E0EC', borderRadius: 12,
    paddingVertical: 24, alignItems: 'center', backgroundColor: '#FAFAFF', marginBottom: 4,
  },
  mediaPickerIcon:  { fontSize: 28, marginBottom: 6 },
  mediaPickerLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
  mediaPickerHint:  { fontSize: 11, color: '#999', marginTop: 2 },

  // Media — thumbnail carousel strip
  mediaThumbnailRow: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  mediaThumbnailWrap: {
    width: 90, height: 90, borderRadius: 10, overflow: 'hidden',
    backgroundColor: '#F0F0F8',
  },
  mediaThumbnail:   { width: '100%', height: '100%' },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  mediaRemove: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  mediaRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  mediaUploadedBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: C.TEAL,
    alignItems: 'center', justifyContent: 'center',
  },
  mediaAddMore: {
    width: 90, height: 90, borderRadius: 10,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#D0D0E8',
    backgroundColor: '#FAFAFF',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  mediaAddMoreIcon:  { fontSize: 26, color: C.PRIMARY, fontWeight: '300' },
  mediaAddMoreLabel: { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },

  // Video thumbnail overlays
  videoThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoPlayIcon: { fontSize: 12, color: '#111', marginLeft: 2 },
  videoDurationBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  videoDurationText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Visibility
  visRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff', marginBottom: 8 },
  visRowSel: { borderColor: C.PRIMARY, backgroundColor: '#EEF2FF' },
  visIcon:   { fontSize: 20 },
  visLabel:  { fontSize: 14, fontWeight: '600', color: '#111' },
  visLabelSel: { color: C.PRIMARY },
  visSub:    { fontSize: 12, color: '#6B7280', marginTop: 1 },
  radio:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center' },
  radioSel:  { borderColor: C.PRIMARY },
  radioDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: C.PRIMARY },

  // Footer
  footer:      { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F8' },
  draftBtn:    { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  draftText:   { fontSize: 14, fontWeight: '600', color: '#374151' },
  publishBtn:  { flex: 1.4, paddingVertical: 13, borderRadius: 12, backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center', shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  publishBtnOff: { opacity: 0.5 },
  publishText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
