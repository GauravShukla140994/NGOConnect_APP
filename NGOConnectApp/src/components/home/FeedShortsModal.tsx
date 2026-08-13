/**
 * FeedShortsModal.tsx — Ripple Feed viewer (NGO Connect native identity)
 *
 * Design: deep indigo/purple background, cause-category pill, NGO-focused sidebar.
 *
 * Navigation:
 *   Swipe UP / DOWN  → next / previous post
 *   Swipe L / R      → next / previous media within a post
 *   Pinch (2 finger) → live zoom (springs back on release)
 *   Double-tap       → ripple the post (like)
 *
 *   ┌─────────────────────────────────────────┐
 *   │ ✕   🌱 Environment        1/3  ● ● ●   │  ← cause pill + counter
 *   │                                          │
 *   │           FULLSCREEN  MEDIA              │
 *   │                                          │
 *   │                                     ❤️  │
 *   │                                    1.2k  │
 *   │                                     💬  │
 *   │                                     42   │  ← sidebar
 *   │                                     🔖  │
 *   │                                     🤝  │  ← Volunteer (replaces Report)
 *   │ [avatar]  Author · Org name   + Follow  │
 *   │ Caption text (2 lines)…more             │
 *   └─────────────────────────────────────────┘
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import Video from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { Post } from '../../types/api.types';
import AppConfig from '../../config/AppConfig';
import { feedApi } from '../../api/feed.api';
import { orgApi } from '../../api/org.api';

const { width: SW, height: SH } = Dimensions.get('window');
const C = AppConfig.COLORS;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FeedShortsModalProps {
  visible:              boolean;
  posts:                Post[];
  initialPostIndex?:    number;
  onClose:              () => void;
  onLike:               (postId: number, wasLiked: boolean) => void;
  onCommentPress:       (post: Post) => void;
  onDelete?:            (postId: number) => void;
  onVolunteerPress?:    (post: Post) => void;
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function parseMedia(post: Post): { urls: string[]; types: ('IMAGE' | 'VIDEO')[] } {
  const rawUrls = post.mediaUrls as unknown;
  const urls: string[] = Array.isArray(rawUrls)
    ? (rawUrls as string[])
    : typeof rawUrls === 'string' && rawUrls
      ? rawUrls.split(',').map(u => u.trim()).filter(Boolean)
      : [];

  const rawTypes = post.mediaTypes as unknown;
  const typeArr: ('IMAGE' | 'VIDEO')[] = urls.map((_, i) => {
    if (typeof rawTypes === 'string' && rawTypes) {
      return rawTypes.split(',')[i]?.trim() === 'VIDEO' ? 'VIDEO' : 'IMAGE';
    }
    return 'IMAGE';
  });

  return { urls, types: typeArr };
}

function fmtCount(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getInitials(name: string): string {
  return (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = ['#7C3AED', '#0369A1', '#047857', '#B45309', '#BE123C'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name ?? '').length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── Cause pill ─────────────────────────────────────────────────────────────────
// Maps an NGO's category name (from post fields) to an emoji + label.
// Returns null when no category info is available so the pill is simply hidden.

const CAUSE_MAP: Record<string, string> = {
  environment: '🌱', education: '📚', health: '🏥', healthcare: '🏥',
  food: '🍱', hunger: '🍱', women: '👩', children: '👶', child: '👶',
  animal: '🐾', animals: '🐾', water: '💧', disability: '♿',
  elderly: '🧓', livelihood: '💼', disaster: '🆘', community: '🏘️',
  arts: '🎨', sports: '⚽', legal: '⚖️', mental: '🧠',
};

function getCausePill(post: Post): { emoji: string; label: string } | null {
  const raw: string =
    (post as any).categoryName ??
    (post as any).orgCategory ??
    (post as any).causeCategory ??
    (post as any).orgCategoryName ??
    '';
  if (!raw) return null;
  const key   = raw.toLowerCase().split(/[\s_/-]/)[0];
  const emoji = CAUSE_MAP[key] ?? '💜';
  const label = raw.length > 18 ? raw.slice(0, 16) + '…' : raw;
  return { emoji, label };
}

function pinchDistance(touches: any[]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── ZoomableImageSlide ─────────────────────────────────────────────────────────
// Identical pinch-to-zoom logic as MediaPreviewModal (with all 3 fixes applied).
// Adds onFreeze / onUnfreeze to propagate freeze-scroll up to both FlatLists.

interface ZoomableSlideProps {
  uri:          string;
  onFreeze:     () => void;
  onUnfreeze:   () => void;
  onDoubleTap?: (x: number, y: number) => void;
}

function ZoomableImageSlide({ uri, onFreeze, onUnfreeze, onDoubleTap }: ZoomableSlideProps) {
  const scale      = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Keep onDoubleTap in a ref so it always calls the latest version
  // without stale closure over liked/likeCount state.
  const onDoubleTapRef = useRef(onDoubleTap);
  React.useEffect(() => { onDoubleTapRef.current = onDoubleTap; }, [onDoubleTap]);

  // Double-tap: handled via Pressable (below), NOT the PanResponder.
  // Tracking the last tap time via a ref avoids stale closures.
  const lastTapRef = useRef(0);

  const st = useRef({
    scale: 1, tx: 0, ty: 0,
    pinchInitDist: 0, pinchInitScale: 1, isPinching: false,
  }).current;

  function clamp(newTx: number, newTy: number, s: number) {
    const mx = (SW * (s - 1)) / 2;
    const my = (SH * (s - 1)) / 2;
    return { tx: Math.max(-mx, Math.min(mx, newTx)), ty: Math.max(-my, Math.min(my, newTy)) };
  }

  function resetZoom(anim = true) {
    if (anim) {
      Animated.parallel([
        Animated.spring(scale,      { toValue: 1, useNativeDriver: true, bounciness: 4 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      ]).start();
    } else {
      scale.setValue(1); translateX.setValue(0); translateY.setValue(0);
    }
    st.scale = 1; st.tx = 0; st.ty = 0;
    onUnfreeze();
  }

  function zoomTo(target: number) {
    const { tx, ty } = clamp(st.tx, st.ty, target);
    st.scale = target; st.tx = tx; st.ty = ty;
    Animated.parallel([
      Animated.spring(scale,      { toValue: target, useNativeDriver: true, bounciness: 3 }),
      Animated.spring(translateX, { toValue: tx,     useNativeDriver: true, bounciness: 3 }),
      Animated.spring(translateY, { toValue: ty,     useNativeDriver: true, bounciness: 3 }),
    ]).start();
    if (target > 1) onFreeze(); else onUnfreeze();
  }

  const panResponder = useRef(PanResponder.create({
    // Only capture when 2 fingers are present — never steal single-finger gestures
    onStartShouldSetPanResponderCapture: (evt) =>
      evt.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponderCapture: (evt) =>
      evt.nativeEvent.touches.length >= 2,

    // Single-finger: NEVER claim — let the outer vertical FlatList handle swipes.
    // Double-tap is handled by the Pressable overlay in the return block instead.
    onStartShouldSetPanResponder: () => false,

    onPanResponderGrant: (evt) => {
      const t = evt.nativeEvent.touches;
      if (t.length >= 2) {
        onFreeze();
        st.isPinching     = true;
        st.pinchInitDist  = pinchDistance(t);
        st.pinchInitScale = st.scale;
      }
    },

    onPanResponderMove: (evt) => {
      const t = evt.nativeEvent.touches;
      if (t.length >= 2) {
        if (!st.isPinching) {
          onFreeze();
          st.isPinching     = true;
          st.pinchInitDist  = pinchDistance(t);
          st.pinchInitScale = st.scale;
        }
        const raw = st.pinchInitScale * (pinchDistance(t) / st.pinchInitDist);
        const s   = Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
        st.scale = s;
        scale.setValue(s);
        const { tx, ty } = clamp(st.tx, st.ty, s);
        st.tx = tx; st.ty = ty;
        translateX.setValue(tx); translateY.setValue(ty);
      }
      // Single-finger move is ignored — FlatList handles swipe navigation
    },

    onPanResponderRelease: () => {
      if (st.isPinching) {
        st.isPinching = false;
        // Spring back to 1× when fingers lift — zoom is live only while pinching
        resetZoom();
      }
    },
    onPanResponderTerminate: () => {
      if (st.isPinching) {
        st.isPinching = false;
        resetZoom();
      }
    },
  })).current;

  // Double-tap via Pressable overlay — does NOT steal swipes from outer FlatList
  // (Pressable yields to parent scroll when movement is detected).
  const handleTap = useCallback((evt: any) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      const { pageX, pageY } = evt.nativeEvent;
      onDoubleTapRef.current?.(pageX, pageY);
    } else {
      lastTapRef.current = now;
    }
  }, []);

  return (
    // panHandlers on the View handles pinch (2-finger capture phase).
    // The Pressable overlay handles single-finger taps for double-tap detection.
    <View style={s.slideContainer} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={[s.slideMedia, { transform: [{ scale }, { translateX }, { translateY }] }]}
        resizeMode="contain"
      />
      {/* Transparent overlay: captures taps for double-tap without stealing swipes */}
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        onPress={handleTap}
      />
    </View>
  );
}

// ── VideoSlide ─────────────────────────────────────────────────────────────────

function VideoSlide({ uri, active }: { uri: string; active: boolean }) {
  const [paused, setPaused] = useState(!active);
  const [error,  setError]  = useState(false);
  React.useEffect(() => { setPaused(!active); }, [active]);

  if (error) {
    return (
      <View style={s.slideContainer}>
        <Text style={{ color: '#fff', fontSize: 14 }}>⚠️ Could not play video</Text>
      </View>
    );
  }
  return (
    <View style={s.slideContainer}>
      <Video
        source={{ uri }}
        style={s.slideMedia}
        resizeMode="cover"
        paused={paused}
        controls
        repeat
        onError={() => setError(true)}
      />
    </View>
  );
}

// ── PostDescriptionSheet ───────────────────────────────────────────────────────
// YouTube-style "Description" bottom sheet — opens when user taps "…more"

interface DescriptionSheetProps {
  visible:          boolean;
  post:             Post;
  onClose:          () => void;
  viewCountOverride?: number;
}

function PostDescriptionSheet({ visible, post, onClose, viewCountOverride }: DescriptionSheetProps) {
  const insets = useSafeAreaInsets();
  const name   = post.authorName ?? post.orgName ?? 'NGO';
  const bg     = avatarColor(name);
  const ini    = getInitials(name);

  function fmtDate(iso: string | undefined | null): string {
    if (!iso) return '';
    const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const sheetH = Math.round(SH * 0.65);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={ds.overlay} onPress={onClose}>
        <Pressable style={[ds.sheet, { height: sheetH, paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {/* swallow taps so backdrop press doesn't fire */}}
        >
          {/* Drag handle */}
          <View style={ds.handle} />

          {/* Header */}
          <View style={ds.header}>
            <Text style={ds.headerTitle}>Description</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={ds.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={ds.body} showsVerticalScrollIndicator={false}>

            {/* Author row */}
            <View style={ds.authorRow}>
              {post.profilePhoto ? (
                <Image source={{ uri: post.profilePhoto }} style={ds.avatar} />
              ) : (
                <View style={[ds.avatar, ds.avatarFallback, { backgroundColor: bg }]}>
                  <Text style={ds.avatarText}>{ini}</Text>
                </View>
              )}
              <View>
                <Text style={ds.authorName}>{name}</Text>
                {post.orgName && post.orgName !== name && (
                  <Text style={ds.orgName}>{post.orgName}</Text>
                )}
              </View>
            </View>

            {/* Stats — 3 cards only */}
            <View style={ds.statsRow}>
              <View style={ds.statCard}>
                <Text style={ds.statValue}>{fmtCount(post.likeCount ?? 0)}</Text>
                <Text style={ds.statLabel}>Likes</Text>
              </View>
              <View style={ds.statCard}>
                <Text style={ds.statValue}>{fmtCount(post.commentCount ?? 0)}</Text>
                <Text style={ds.statLabel}>Comments</Text>
              </View>
              <View style={ds.statCard}>
                <Text style={ds.statValue}>{fmtCount(viewCountOverride ?? (post as any).viewCount ?? 0)}</Text>
                <Text style={ds.statLabel}>Views</Text>
              </View>
            </View>

            {/* Posted date — separate label below cards */}
            <Text style={ds.postedLabel}>📅 Posted {fmtDate(post.createdAt)}</Text>

            {/* Full caption */}
            {!!post.content && (
              <Text style={ds.caption}>{post.content}</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── PostShortsSlide ────────────────────────────────────────────────────────────
// One "card" in the vertical feed: media + right sidebar + bottom info.

interface PostSlideProps {
  post:               Post;
  isActive:           boolean;
  onFreeze:           () => void;
  onUnfreeze:         () => void;
  onLike:             (postId: number, wasLiked: boolean) => void;
  onComment:          (post: Post) => void;
  onDelete?:          (postId: number) => void;
  onVolunteerPress?:  (post: Post) => void;
  currentUserId?:     number;
  viewCountOverride?: number;  // local session increment from dwell tracker
}

function PostShortsSlide({
  post, isActive, onFreeze, onUnfreeze,
  onLike, onComment, onDelete, onVolunteerPress, currentUserId, viewCountOverride,
}: PostSlideProps) {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { urls, types } = parseMedia(post);

  // Inner horizontal FlatList scroll — frozen during pinch
  const [innerScrollEnabled, setInnerScrollEnabled] = useState(true);
  const [activeMedia, setActiveMedia] = useState(0);

  // Local optimistic state
  const [liked,           setLiked]           = useState(!!post.isLiked);
  const [likeCount,       setLikeCount]       = useState(post.likeCount ?? 0);
  const [saved,           setSaved]           = useState(!!(post.isSaved));
  const [following,       setFollowing]       = useState(!!(post.isFollowing));
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  // Live view count — fetched from server when description sheet opens
  const [liveViewCount,   setLiveViewCount]   = useState<number | null>(null);

  // Floating heart animation (double-tap to like)
  const [heartPos, setHeartPos] = useState<{ x: number; y: number } | null>(null);
  const heartAnim  = useRef(new Animated.Value(0)).current;
  const heartScale = heartAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.4, 1] });

  const innerListRef = useRef<FlatList>(null);

  const handleFreeze = useCallback(() => {
    setInnerScrollEnabled(false);
    onFreeze();
  }, [onFreeze]);

  const handleUnfreeze = useCallback(() => {
    setInnerScrollEnabled(true);
    onUnfreeze();
  }, [onUnfreeze]);

  const handleLike = useCallback(() => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    onLike(post.postId!, wasLiked);
  }, [liked, post.postId, onLike]);

  const handleDoubleTap = useCallback((x: number, y: number) => {
    // Only trigger like (not unlike) — same as YouTube Shorts behavior
    if (!liked) {
      setLiked(true);
      setLikeCount(c => c + 1);
      onLike(post.postId!, false);
    }
    // Always show the heart animation at tap position
    setHeartPos({ x, y });
    heartAnim.setValue(0);
    Animated.sequence([
      Animated.spring(heartAnim, { toValue: 1, useNativeDriver: true, bounciness: 14 }),
      Animated.delay(350),
      Animated.timing(heartAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setHeartPos(null));
  }, [liked, post.postId, onLike, heartAnim]);

  const handleSave = useCallback(async () => {
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) await feedApi.unsavePost(post.postId!);
      else          await feedApi.savePost(post.postId!);
    } catch {
      setSaved(wasSaved); // rollback
    }
  }, [saved, post.postId]);

  const handleFollow = useCallback(async () => {
    if (!post.orgId) return;
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) await orgApi.unfollowOrg(post.orgId);
      else              await orgApi.followOrg(post.orgId);
    } catch {
      setFollowing(wasFollowing);
    }
  }, [following, post.orgId]);

  const handleVolunteer = useCallback(() => {
    if (onVolunteerPress) {
      onVolunteerPress(post);
      return;
    }
    if (post.orgId) {
      navigation.navigate('NgoProfile', { orgId: post.orgId, initialTab: 'Volunteer' });
    }
  }, [post, onVolunteerPress, navigation]);

  const onViewableChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveMedia(viewableItems[0].index);
    }
  }, []);

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const name      = post.authorName ?? post.orgName ?? 'NGO';
  const bg        = avatarColor(name);
  const initials  = getInitials(name);
  const caption   = post.content ?? '';
  const isLong    = caption.length > 80;
  const isOwnPost = currentUserId && Number(currentUserId) === Number(post.userId);

  return (
    <View style={{ width: SW, height: SH, backgroundColor: BRAND.BG }}>

      {/* ── Media (horizontal paging for multi-item posts) ── */}
      {urls.length === 0 ? (
        // Text-only post — show dark card with caption
        <View style={[s.slideContainer, { justifyContent: 'center', paddingHorizontal: 32 }]}>
          <Text style={{ color: '#fff', fontSize: 18, textAlign: 'center', lineHeight: 28 }}>
            {caption}
          </Text>
        </View>
      ) : urls.length === 1 ? (
        types[0] === 'VIDEO'
          ? <VideoSlide uri={urls[0]} active={isActive} />
          : <ZoomableImageSlide uri={urls[0]} onFreeze={handleFreeze} onUnfreeze={handleUnfreeze} onDoubleTap={handleDoubleTap} />
      ) : (
        <FlatList
          ref={innerListRef}
          data={urls}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={innerScrollEnabled}
          onViewableItemsChanged={onViewableChanged}
          viewabilityConfig={viewConfig}
          getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
          renderItem={({ item: url, index }) =>
            types[index] === 'VIDEO'
              ? <VideoSlide uri={url} active={isActive && activeMedia === index} />
              : <ZoomableImageSlide
                  key={index}
                  uri={url}
                  onFreeze={handleFreeze}
                  onUnfreeze={handleUnfreeze}
                  onDoubleTap={handleDoubleTap}
                />
          }
        />
      )}

      {/* ── Multi-media dots + counter (top-right) ── */}
      {urls.length > 1 && (
        <View style={[s.mediaCounter, { top: insets.top + 52 }]}>
          <Text style={s.mediaCounterText}>{activeMedia + 1} / {urls.length}</Text>
          <View style={s.dotsRow}>
            {urls.map((_, i) => (
              <View key={i} style={[s.dot, i === activeMedia && s.dotActive]} />
            ))}
          </View>
        </View>
      )}

      {/* ── Sidebar — floats on the right, NO background, just over the image ── */}
      <View style={[s.sideBar, { bottom: insets.bottom + 100 }]}>
        {/* Like */}
        <TouchableOpacity style={s.sideAction} onPress={handleLike}>
          <Text style={[s.sideIcon, liked && s.sideIconLiked]}>{liked ? '❤️' : '🤍'}</Text>
          <Text style={s.sideLabel}>{fmtCount(likeCount)}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={s.sideAction} onPress={() => onComment(post)}>
          <Text style={s.sideIcon}>💬</Text>
          <Text style={s.sideLabel}>{fmtCount(post.commentCount ?? 0)}</Text>
        </TouchableOpacity>

        {/* Save */}
        <TouchableOpacity style={s.sideAction} onPress={handleSave}>
          <Text style={s.sideIcon}>{saved ? '🔖' : '🏷️'}</Text>
          <Text style={s.sideLabel}>{saved ? 'Saved' : 'Save'}</Text>
        </TouchableOpacity>

        {/* Volunteer — NGO Connect's primary action */}
        {!!post.orgId && (
          <TouchableOpacity style={s.sideAction} onPress={handleVolunteer}>
            <View style={s.volunteerCircle}>
              <Text style={s.sideIcon}>🤝</Text>
            </View>
            <Text style={[s.sideLabel, s.volunteerLabel]}>Volunteer</Text>
          </TouchableOpacity>
        )}

        {/* Delete (own posts only) */}
        {isOwnPost && !!onDelete && (
          <TouchableOpacity style={s.sideAction} onPress={() => onDelete(post.postId!)}>
            <Text style={s.sideIcon}>🗑️</Text>
            <Text style={s.sideLabel}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Scrim — thin fade only behind the author bar ── */}
      <View style={s.scrimOuter} pointerEvents="none" />

      {/* ── Author + caption bar — tight strip at the very bottom ── */}
      <View style={[s.bottomOverlay, { paddingBottom: insets.bottom + 10 }]}>
        {/* Author row */}
        <View style={s.authorRow}>
          {post.profilePhoto ? (
            <Image source={{ uri: post.profilePhoto }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarFallback, { backgroundColor: bg }]}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.authorName} numberOfLines={1}>{name}</Text>
            {post.orgName && post.orgName !== name && (
              <Text style={s.orgName} numberOfLines={1}>{post.orgName}</Text>
            )}
          </View>
          {/* Follow button */}
          {!!post.orgId && (
            <TouchableOpacity
              style={[s.followBtn, following && s.followBtnActive]}
              onPress={handleFollow}
            >
              <Text style={[s.followBtnText, following && s.followBtnTextActive]}>
                {following ? '✓ Following' : '+ Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Caption — always tappable to open the description sheet */}
        {!!caption && (
          <TouchableOpacity
            onPress={async () => {
              setDescriptionOpen(true);
              // Fetch live stats from server so the view count reflects all users
              try {
                const res = await feedApi.getPost(post.postId!);
                const fresh = res.data?.data;
                if (fresh?.viewCount != null) setLiveViewCount(fresh.viewCount);
              } catch { /* fire-and-forget — sheet still shows local estimate */ }
            }}
            activeOpacity={0.75}
          >
            <Text style={s.caption} numberOfLines={2}>{caption}</Text>
            {isLong && <Text style={s.moreLink}>…more</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* Description sheet */}
      <PostDescriptionSheet
        visible={descriptionOpen}
        post={post}
        onClose={() => setDescriptionOpen(false)}
        viewCountOverride={liveViewCount ?? viewCountOverride}
      />

      {/* Floating heart — direct child of slide root so pageX/pageY coords are correct */}
      {heartPos && (
        <Animated.Text
          style={[
            s.heartFloat,
            {
              left:    heartPos.x - 44,
              top:     heartPos.y - 44,
              opacity: heartAnim,
              transform: [{ scale: heartScale }],
            },
          ]}
          pointerEvents="none"
        >
          ❤️
        </Animated.Text>
      )}
    </View>
  );
}

// ── FeedShortsModal ────────────────────────────────────────────────────────────

export default function FeedShortsModal({
  visible,
  posts,
  initialPostIndex = 0,
  onClose,
  onLike,
  onCommentPress,
  onDelete,
  onVolunteerPress,
}: FeedShortsModalProps) {
  const insets = useSafeAreaInsets();

  const [activePost,          setActivePost]          = useState(initialPostIndex);
  // Outer vertical FlatList frozen while any slide's image is being pinched/panned
  const [vertScrollEnabled,   setVertScrollEnabled]   = useState(true);

  const outerListRef  = useRef<FlatList>(null);
  // ── View tracking ─────────────────────────────────────────────────────────────
  // Buffer of postIds the user has dwelled on for ≥1.5 s. Flushed to /feed/viewed
  // when the modal closes or the buffer reaches 10 items.
  const viewedBuffer  = useRef<Set<number>>(new Set());
  const dwellTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local view-count overrides: postId → incremented count.
  // The count from the feed load is a snapshot; this keeps the displayed
  // number up-to-date within the session without a full feed refresh.
  const [localViewCounts, setLocalViewCounts] = useState<Record<number, number>>({});

  const flushViewed = useCallback(() => {
    const ids = Array.from(viewedBuffer.current);
    if (ids.length === 0) return;
    viewedBuffer.current.clear();
    feedApi.markPostsViewed(ids).catch(() => {/* fire-and-forget */});
  }, []);

  // Start a 1.5 s dwell timer whenever the active post changes.
  // Only commits a view if the user stays on the post long enough.
  React.useEffect(() => {
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    const post = posts[activePost];
    if (!post?.postId) return;
    dwellTimer.current = setTimeout(() => {
      const id = post.postId!;
      // Only count once per session per post (mirrors server deduplication)
      if (!viewedBuffer.current.has(id)) {
        viewedBuffer.current.add(id);
        // Immediately bump the displayed count so UI stays in sync
        setLocalViewCounts(prev => ({
          ...prev,
          [id]: (prev[id] ?? ((post as any).viewCount ?? 0)) + 1,
        }));
      }
      if (viewedBuffer.current.size >= 10) flushViewed();
    }, 1500);
    return () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
    };
  }, [activePost, posts, flushViewed]);

  // Flush when the modal closes
  React.useEffect(() => {
    if (!visible) flushViewed();
  }, [visible, flushViewed]);

  React.useEffect(() => {
    if (visible) {
      setActivePost(initialPostIndex);
      setVertScrollEnabled(true);
      setTimeout(() => {
        outerListRef.current?.scrollToIndex({ index: initialPostIndex, animated: false });
      }, 50);
    }
  }, [visible, initialPostIndex]);

  const onViewableChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActivePost(viewableItems[0].index);
    }
  }, []);

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const handleFreeze   = useCallback(() => setVertScrollEnabled(false), []);
  const handleUnfreeze = useCallback(() => setVertScrollEnabled(true),  []);

  if (!posts || posts.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: BRAND.BG }}>

        {/* ── Vertical post FlatList ── */}
        <FlatList
          ref={outerListRef}
          data={posts}
          keyExtractor={item => String(item.postId)}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          scrollEnabled={vertScrollEnabled}
          onViewableItemsChanged={onViewableChanged}
          viewabilityConfig={viewConfig}
          getItemLayout={(_, index) => ({ length: SH, offset: SH * index, index })}
          initialScrollIndex={initialPostIndex}
          windowSize={3}
          maxToRenderPerBatch={3}
          renderItem={({ item, index }) => (
            <PostShortsSlide
              post={item}
              isActive={index === activePost}
              onFreeze={handleFreeze}
              onUnfreeze={handleUnfreeze}
              onLike={onLike}
              onComment={onCommentPress}
              onDelete={onDelete}
              onVolunteerPress={onVolunteerPress}
              viewCountOverride={localViewCounts[item.postId!]}
            />
          )}
        />

        {/* ── Close button (absolute, top-left) ── */}
        <TouchableOpacity
          style={[s.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.closeIcon}>✕</Text>
        </TouchableOpacity>

        {/* ── Cause category pill (absolute, top-left, after close button) ── */}
        {(() => {
          const pill = getCausePill(posts[activePost]);
          if (!pill) return null;
          return (
            <View style={[s.causePill, { top: insets.top + 14 }]}>
              <Text style={s.causePillText}>{pill.emoji} {pill.label}</Text>
            </View>
          );
        })()}

      </View>
    </Modal>
  );
}

// ── Brand palette — NGO Connect native purple ──────────────────────────────────
const BRAND = {
  BG:          '#120a2e',   // deep indigo base
  PILL_BG:     'rgba(124, 58, 237, 0.42)',
  PILL_TEXT:   '#d8b4fe',
  OVERLAY:     'rgba(18, 10, 46, 0.82)',  // purple-tinted bottom scrim
  VOLUNTEER:   'rgba(124, 58, 237, 0.50)',
  FOLLOW_ACTIVE_BG:   '#7c3aed',
  FOLLOW_ACTIVE_TEXT: '#fff',
  DOT_ACTIVE:  '#a78bfa',
  DOT:         'rgba(167, 139, 250, 0.35)',
  CLOSE_BG:    'rgba(124, 58, 237, 0.35)',
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // slide
  slideContainer: {
    width: SW, height: SH,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.BG, overflow: 'hidden',
  },
  slideMedia: { width: SW, height: SH },

  // multi-media dots (top-right of each slide)
  mediaCounter: {
    position: 'absolute', right: 12,
    alignItems: 'flex-end',
  },
  mediaCounterText: { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  dotsRow:   { flexDirection: 'row', gap: 4 },
  dot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: BRAND.DOT },
  dotActive: { width: 14, backgroundColor: BRAND.DOT_ACTIVE },

  // gradient scrim — 3 layered views simulate a top-to-bottom fade
  // covers only ~220px from bottom; media above that is fully visible
  // thin gradient fade only behind the author bar — NOT behind the full sidebar
  scrimOuter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 130,
    backgroundColor: 'rgba(18,10,46,0.55)',
  },

  // author + caption strip — tight at the very bottom, no sidebar inside
  bottomOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 72,  // leave room for sidebar
    paddingHorizontal: 12,
    paddingTop: 10,
  },

  // author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  avatar:        { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.7)' },
  avatarFallback:{ alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  authorName: {
    color: '#fff', fontSize: 13, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  orgName: {
    color: 'rgba(216,180,254,0.9)', fontSize: 11, marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // follow button — purple when active
  followBtn: {
    borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.7)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4,
  },
  followBtnActive:     { backgroundColor: BRAND.FOLLOW_ACTIVE_BG, borderColor: BRAND.FOLLOW_ACTIVE_BG },
  followBtnText:       { color: '#fff', fontSize: 11, fontWeight: '600' },
  followBtnTextActive: { color: '#fff' },

  // caption
  caption: {
    color: 'rgba(255,255,255,0.95)', fontSize: 12, lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  moreLink: {
    color: BRAND.PILL_TEXT, fontSize: 12, marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // right sidebar
  sideBar: {
    position: 'absolute', right: 10,
    alignItems: 'center', gap: 18,
  },
  sideAction: { alignItems: 'center', gap: 2 },
  sideIcon: {
    fontSize: 26,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sideIconLiked: {},
  sideLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Volunteer button circle
  volunteerCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: BRAND.VOLUNTEER,
    alignItems: 'center', justifyContent: 'center',
  },
  volunteerLabel: {},

  // floating heart (double-tap)
  heartFloat: {
    position: 'absolute',
    fontSize:  88,
    zIndex:    50,
    pointerEvents: 'none' as any,
  },

  // close button — purple tint
  closeBtn: {
    position: 'absolute', left: 14,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: BRAND.CLOSE_BG,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20,
  },
  closeIcon: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // cause category pill
  causePill: {
    position: 'absolute', left: 58, zIndex: 20,
    backgroundColor: BRAND.PILL_BG,
    borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  causePillText: { color: BRAND.PILL_TEXT, fontSize: 11, fontWeight: '700' },

  // post counter (top-right)
  postCounter: {
    position: 'absolute', right: 14, zIndex: 20,
    alignItems: 'flex-end',
  },
  postCounterText: { color: 'rgba(216,180,254,0.8)', fontSize: 12, fontWeight: '600' },
});

// ── Description sheet styles ────────────────────────────────────────────────────

const ds = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18,10,46,0.72)',
  },
  sheet: {
    backgroundColor: '#1a1040',    // deep purple, matches brand
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(167,139,250,0.35)',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(167,139,250,0.2)',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  closeBtn:    { fontSize: 18, color: 'rgba(167,139,250,0.7)' },

  body: { paddingHorizontal: 20, paddingTop: 16 },

  // Author
  authorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20,
  },
  avatar:        { width: 40, height: 40, borderRadius: 20 },
  avatarFallback:{ alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  authorName:    { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  orgName:       { color: 'rgba(216,180,254,0.7)', fontSize: 12, marginTop: 2 },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: 10, marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(124,58,237,0.22)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  statValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  statLabel: { color: 'rgba(216,180,254,0.65)', fontSize: 11 },
  postedLabel: {
    color: 'rgba(216,180,254,0.55)',
    fontSize: 12,
    marginBottom: 16,
    marginTop: -10,
  },

  // Caption
  caption: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
});
