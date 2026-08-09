/**
 * MediaPreviewModal.tsx
 * Fullscreen media viewer — images (with pinch-to-zoom + pan) and videos.
 * Swipe left/right to navigate between multiple items.
 *
 * Zoom behaviour (images only):
 *   - Pinch with two fingers → zoom in (max 5×)
 *   - When zoomed: single-finger drag pans the image
 *   - Double-tap → toggle between 1× and 2.5× zoom
 *   - Release below 1× → springs back to 1×
 *   - At 1×: single-finger horizontal swipe is passed to the FlatList (slide navigation)
 *
 * Key fix notes:
 *   - panHandlers are on the container View, NOT Animated.Image
 *     (Animated.Image doesn't forward touches reliably on all RN versions)
 *   - onStartShouldSetPanResponderCapture returns true for 2-finger touches
 *     so the FlatList scroll responder never gets the pinch gesture
 *   - FlatList scrollEnabled is toggled off while a pinch is in progress
 *     (belt-and-suspenders fix for Android touch negotiation)
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import Video from 'react-native-video';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 5;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MediaItem {
  uri:  string;
  type: 'IMAGE' | 'VIDEO';
}

interface Props {
  visible:       boolean;
  items:         MediaItem[];
  initialIndex?: number;
  onClose:       () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pinchDistance(touches: any[]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Zoomable image slide ───────────────────────────────────────────────────────

interface ZoomableProps {
  uri:          string;
  onPinchStart: () => void;   // tells FlatList to disable scroll
  onPinchEnd:   () => void;   // tells FlatList to re-enable scroll
}

function ZoomableImageSlide({ uri, onPinchStart, onPinchEnd }: ZoomableProps) {
  const scale      = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Mutable snapshot of current transform — avoids calling .getValue() on Animated
  const st = useRef({
    scale:        1,
    tx:           0,
    ty:           0,
    // pinch state
    pinchInitDist:  0,
    pinchInitScale: 1,
    isPinching:     false,
    // pan state (single-finger drag when zoomed)
    panStartX:  0,
    panStartY:  0,
    panInitTx:  0,
    panInitTy:  0,
    // double-tap state
    lastTap: 0,
  }).current;

  function clampedTranslation(newTx: number, newTy: number, currentScale: number) {
    const maxTx = (SCREEN_W * (currentScale - 1)) / 2;
    const maxTy = (SCREEN_H * (currentScale - 1)) / 2;
    return {
      tx: Math.max(-maxTx, Math.min(maxTx, newTx)),
      ty: Math.max(-maxTy, Math.min(maxTy, newTy)),
    };
  }

  function resetZoom(animated = true) {
    if (animated) {
      Animated.parallel([
        Animated.spring(scale,      { toValue: 1, useNativeDriver: true, bounciness: 4 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      ]).start();
    } else {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
    st.scale = 1;
    st.tx    = 0;
    st.ty    = 0;
  }

  function zoomToScale(targetScale: number, animated = true) {
    const { tx, ty } = clampedTranslation(st.tx, st.ty, targetScale);
    st.scale = targetScale;
    st.tx    = tx;
    st.ty    = ty;
    if (animated) {
      Animated.parallel([
        Animated.spring(scale,      { toValue: targetScale, useNativeDriver: true, bounciness: 3 }),
        Animated.spring(translateX, { toValue: tx,          useNativeDriver: true, bounciness: 3 }),
        Animated.spring(translateY, { toValue: ty,          useNativeDriver: true, bounciness: 3 }),
      ]).start();
    } else {
      scale.setValue(targetScale);
      translateX.setValue(tx);
      translateY.setValue(ty);
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      // ── CRITICAL FIX 1: capture 2-finger start immediately ──────────────
      // When 2 fingers land, this fires before the FlatList scroll responder
      // gets a chance — guaranteeing we own the pinch gesture on both iOS and Android.
      onStartShouldSetPanResponderCapture: (evt) =>
        evt.nativeEvent.touches.length >= 2,

      // Claim start for single-finger when already zoomed (enables panning)
      onStartShouldSetPanResponder: () => st.scale > 1.01,

      // Claim move when 2 fingers present OR already zoomed
      onMoveShouldSetPanResponder: (evt) =>
        evt.nativeEvent.touches.length >= 2 || st.scale > 1.01,

      // Belt-and-suspenders capture for move as well
      onMoveShouldSetPanResponderCapture: (evt) =>
        evt.nativeEvent.touches.length >= 2,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          // Pinch start — disable FlatList scroll
          onPinchStart();
          st.isPinching     = true;
          st.pinchInitDist  = pinchDistance(touches);
          st.pinchInitScale = st.scale;
        } else {
          // Single finger
          st.isPinching = false;
          st.panStartX  = touches[0].pageX;
          st.panStartY  = touches[0].pageY;
          st.panInitTx  = st.tx;
          st.panInitTy  = st.ty;

          // Double-tap detection
          if (st.scale <= 1.01) {
            const now = Date.now();
            if (now - st.lastTap < 300) {
              // Double-tap at 1× → zoom to 2.5×
              st.lastTap = 0;
              zoomToScale(2.5);
            } else {
              st.lastTap = now;
            }
          } else {
            // Double-tap while zoomed → reset to 1×
            const now = Date.now();
            if (now - st.lastTap < 300) {
              st.lastTap = 0;
              resetZoom();
            } else {
              st.lastTap = now;
            }
          }
        }
      },

      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          // Pinch
          if (!st.isPinching) {
            onPinchStart();
            st.isPinching     = true;
            st.pinchInitDist  = pinchDistance(touches);
            st.pinchInitScale = st.scale;
          }
          const newDist  = pinchDistance(touches);
          const rawScale = st.pinchInitScale * (newDist / st.pinchInitDist);
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
          st.scale = newScale;
          scale.setValue(newScale);

          // Re-clamp translation as scale changes
          const { tx, ty } = clampedTranslation(st.tx, st.ty, newScale);
          st.tx = tx;
          st.ty = ty;
          translateX.setValue(tx);
          translateY.setValue(ty);

        } else if (touches.length === 1 && st.scale > 1.01 && !st.isPinching) {
          // Single-finger pan while zoomed
          const dx = touches[0].pageX - st.panStartX;
          const dy = touches[0].pageY - st.panStartY;
          const { tx, ty } = clampedTranslation(st.panInitTx + dx, st.panInitTy + dy, st.scale);
          st.tx = tx;
          st.ty = ty;
          translateX.setValue(tx);
          translateY.setValue(ty);
        }
      },

      onPanResponderRelease: () => {
        if (st.isPinching) onPinchEnd();
        st.isPinching = false;
        if (st.scale < MIN_SCALE) resetZoom(true);
      },

      onPanResponderTerminate: () => {
        if (st.isPinching) onPinchEnd();
        st.isPinching = false;
      },
    }),
  ).current;

  return (
    // ── CRITICAL FIX 2: panHandlers on the View, not Animated.Image ──────
    // Animated.Image doesn't reliably forward touch events to PanResponder
    // on all React Native versions. The container View is the correct target.
    <View style={slide.container} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={[
          slide.media,
          { transform: [{ scale }, { translateX }, { translateY }] },
        ]}
        resizeMode="contain"
      />
      <DoubleTapHint />
    </View>
  );
}

// ── Double-tap hint ────────────────────────────────────────────────────────────

function DoubleTapHint() {
  const opacity = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();
    }, 1500);
    return () => clearTimeout(t);
  }, [opacity]);

  return (
    <Animated.View style={[slide.hint, { opacity }]}>
      <Text style={slide.hintText}>Pinch to zoom • Double-tap to zoom</Text>
    </Animated.View>
  );
}

// ── Single video slide ─────────────────────────────────────────────────────────

function VideoSlide({ uri, active }: { uri: string; active: boolean }) {
  const [paused, setPaused] = useState(!active);
  const [error,  setError]  = useState(false);

  React.useEffect(() => { setPaused(!active); }, [active]);

  if (error) {
    return (
      <View style={slide.container}>
        <Text style={slide.errorText}>⚠️ Could not play video</Text>
      </View>
    );
  }

  return (
    <View style={slide.container}>
      <Video
        source={{ uri }}
        style={slide.media}
        resizeMode="contain"
        paused={paused}
        controls
        onError={() => setError(true)}
        repeat={false}
      />
      {paused && (
        <TouchableOpacity style={slide.playOverlay} onPress={() => setPaused(false)}>
          <View style={slide.playBtn}>
            <Text style={slide.playIcon}>▶</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Slide styles ───────────────────────────────────────────────────────────────

const slide = StyleSheet.create({
  container: {
    width:           SCREEN_W,
    height:          SCREEN_H,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#000',
    overflow:        'hidden',
  },
  media: {
    width:  SCREEN_W,
    height: SCREEN_H,
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems:     'center',
    justifyContent: 'center',
  },
  playBtn: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  playIcon: {
    fontSize:   28,
    color:      '#fff',
    marginLeft: 4,
  },
  errorText: {
    color:    '#fff',
    fontSize: 14,
  },
  hint: {
    position:          'absolute',
    bottom:            80,
    alignSelf:         'center',
    backgroundColor:   'rgba(0,0,0,0.55)',
    borderRadius:      20,
    paddingHorizontal: 14,
    paddingVertical:   6,
  },
  hintText: {
    color:    '#fff',
    fontSize: 12,
  },
});

// ── Main modal ─────────────────────────────────────────────────────────────────

export default function MediaPreviewModal({
  visible,
  items,
  initialIndex = 0,
  onClose,
}: Props) {
  const [activeIndex,   setActiveIndex]   = useState(initialIndex);
  // ── CRITICAL FIX 3: disable FlatList scroll during pinch ──────────────
  // Without this Android's scroll responder competes with and can steal the
  // pinch gesture even after the PanResponder has claimed it.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const listRef = useRef<FlatList>(null);

  React.useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      setScrollEnabled(true);
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 50);
    }
  }, [visible, initialIndex]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const handlePinchStart = useCallback(() => setScrollEnabled(false), []);
  const handlePinchEnd   = useCallback(() => setScrollEnabled(true),  []);

  if (!items || items.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <SafeAreaView style={styles.root}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          {items.length > 1 && (
            <Text style={styles.counter}>{activeIndex + 1} / {items.length}</Text>
          )}
          <View style={styles.backBtn} />
        </View>

        {/* ── Slides ── */}
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={scrollEnabled}          // disabled during pinch
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          windowSize={3}
          getItemLayout={(_, index) => ({
            length: SCREEN_W,
            offset: SCREEN_W * index,
            index,
          })}
          renderItem={({ item, index }) =>
            item.type === 'VIDEO' ? (
              <VideoSlide uri={item.uri} active={index === activeIndex} />
            ) : (
              <ZoomableImageSlide
                key={index}
                uri={item.uri}
                onPinchStart={handlePinchStart}
                onPinchEnd={handlePinchEnd}
              />
            )
          }
        />

        {/* ── Dot indicators ── */}
        {items.length > 1 && (
          <View style={styles.dotsRow}>
            {items.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ── Modal styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#000',
  },
  header: {
    position:          'absolute',
    top:               0,
    left:              0,
    right:             0,
    zIndex:            10,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 12,
    paddingVertical:   12,
    backgroundColor:   'rgba(0,0,0,0.4)',
  },
  backBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize:   24,
    color:      '#fff',
    fontWeight: '700',
  },
  counter: {
    color:      '#fff',
    fontSize:   14,
    fontWeight: '600',
  },
  dotsRow: {
    position:       'absolute',
    bottom:         24,
    left:           0,
    right:          0,
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            6,
  },
  dot: {
    width:           7,
    height:          7,
    borderRadius:    4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width:           18,
  },
});
