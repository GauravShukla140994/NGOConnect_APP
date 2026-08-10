/**
 * VideoFeedPlayer — Instagram / YouTube-Shorts style in-feed video.
 * Compatible with react-native-video v6.x
 *
 * Behaviour:
 *  • Auto-plays when isActive=true, pauses immediately on scroll-away
 *  • Muted by default; tap anywhere → toggle mute (global state from HomeScreen)
 *  • Center mute-icon flashes on tap, fades out after ~800 ms
 *  • Live progress bar + elapsed / total time display (bottom-left, like Reels)
 *  • Buffering spinner shown only when active
 *  • Small corner mute badge always visible while active
 *  • ▶ VIDEO pill badge top-left
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Video from 'react-native-video';

interface Props {
  uri:           string;
  isActive:      boolean;
  muted:         boolean;
  onToggleMute:  () => void;
  onSingleTap?:  () => void;   // open FeedShortsModal; if absent, falls back to mute toggle
  onDoubleTap?:  () => void;
  width:         number;
  height:        number;
}

function fmtTime(secs: number): string {
  const s = Math.floor(secs);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function VideoFeedPlayer({
  uri, isActive, muted, onToggleMute, onSingleTap, onDoubleTap, width, height,
}: Props) {

  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready,       setReady]       = useState(false);   // video loaded + ready
  const [buffering,   setBuffering]   = useState(false);

  // Animated value for the center mute-icon flash
  const muteFlashOpacity = useRef(new Animated.Value(0)).current;
  const muteFlashAnim    = useRef<Animated.CompositeAnimation | null>(null);
  const muteFlashTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset time counter when this post leaves the viewport
  useEffect(() => {
    if (!isActive) setCurrentTime(0);
  }, [isActive]);

  const showMuteFlash = useCallback(() => {
    muteFlashAnim.current?.stop();
    if (muteFlashTimer.current) clearTimeout(muteFlashTimer.current);

    muteFlashOpacity.setValue(1);
    muteFlashTimer.current = setTimeout(() => {
      muteFlashAnim.current = Animated.timing(muteFlashOpacity, {
        toValue:  0,
        duration: 500,
        useNativeDriver: true,
      });
      muteFlashAnim.current.start();
    }, 800);
  }, [muteFlashOpacity]);

  // ── Heart animation (rendered INSIDE the video View — correct z layer) ──────
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const heartScale   = useRef(new Animated.Value(0.3)).current;
  const heartY       = useRef(new Animated.Value(0)).current;

  const triggerHeart = useCallback(() => {
    heartOpacity.setValue(0);
    heartScale.setValue(0.3);
    heartY.setValue(0);
    // Flat parallel — no sequence blocking on spring settle time.
    // Phase 1 (0–200ms): fade in + elastic scale-up
    // Phase 2 (500–850ms): fade out + float up
    Animated.parallel([
      Animated.timing(heartOpacity, {
        toValue: 1, duration: 150, useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 1.2, duration: 220,
        easing: Easing.out(Easing.elastic(1.5)),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(heartOpacity, { toValue: 0,   duration: 350, useNativeDriver: true }),
          Animated.timing(heartY,       { toValue: -65, duration: 350, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, [heartOpacity, heartScale, heartY]);

  // ── Double-tap vs single-tap ─────────────────────────────────────────────
  // Single-tap  → toggle mute (delayed 300ms so we can cancel on double-tap)
  // Double-tap  → show heart + fire onDoubleTap (like) — mute is NOT toggled
  // Timer is 300ms (= double-tap window) so it never fires before detection.
  const lastTapRef  = useRef(0);
  const tapTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap confirmed — cancel pending action, show heart + like
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      lastTapRef.current = 0;
      triggerHeart();
      onDoubleTap?.();
    } else {
      lastTapRef.current = now;
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        if (onSingleTap) {
          // Open fullscreen Shorts viewer — mute is controllable via the corner badge
          onSingleTap();
        } else {
          // Fallback (no modal handler): behave as before — toggle mute
          onToggleMute();
          showMuteFlash();
        }
      }, 300);
    }
  }, [onToggleMute, showMuteFlash, onSingleTap, onDoubleTap, triggerHeart]);

  // ── v6-compatible callbacks ────────────────────────────────────────────────
  const handleLoad = useCallback((data: any) => {
    console.log('[VideoFeedPlayer] onLoad uri=' + uri, 'duration=' + data?.duration);
    setDuration(data?.duration ?? 0);
    setReady(true);
    setBuffering(false);
  }, [uri]);

  const handleProgress = useCallback((data: any) => {
    setCurrentTime(data?.currentTime ?? 0);
  }, []);

  const handleBuffer = useCallback((data: any) => {
    // v5: { isBuffering }  |  v6: { isBuffering } — same shape
    setBuffering(data?.isBuffering ?? false);
  }, []);

  const handleError = useCallback((err: any) => {
    console.error('[VideoFeedPlayer] onError uri=' + uri, JSON.stringify(err));
    setReady(false);
  }, [uri]);

  const handleReadyForDisplay = useCallback(() => {
    setReady(true);
  }, []);

  const progress     = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const progressPct  = `${Math.round(progress * 100)}%` as any;
  const showTime     = ready && duration > 0;

  return (
    <View style={[styles.container, { width, height }]}>

      {/* ── Video ───────────────────────────────────────────────── */}
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        paused={!isActive}
        muted={muted}
        repeat={true}
        controls={false}
        disableFocus={true}
        progressUpdateInterval={250}
        onLoad={handleLoad}
        onProgress={handleProgress}
        onBuffer={handleBuffer}
        onError={handleError}
        onReadyForDisplay={handleReadyForDisplay}
      />

      {/* ── Progress bar (bottom edge) ───────────────────────────── */}
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: progressPct }]} />
      </View>

      {/* ── Time display (bottom-left: elapsed / total) ──────────── */}
      {showTime && (
        <View style={styles.timeBadge} pointerEvents="none">
          <Text style={styles.timeText}>
            {fmtTime(currentTime)}
            <Text style={styles.timeSep}> / </Text>
            {fmtTime(duration)}
          </Text>
        </View>
      )}

      {/* ── Center mute flash ─────────────────────────────────────── */}
      <Animated.View
        style={[styles.muteFlashWrap, { opacity: muteFlashOpacity }]}
        pointerEvents="none"
      >
        <View style={styles.muteFlashBg}>
          <Text style={styles.muteFlashIcon}>{muted ? '🔇' : '🔊'}</Text>
        </View>
      </Animated.View>

      {/* Corner mute badge moved below Pressable — rendered after it in JSX
           so it sits ABOVE the Pressable in z-order and receives taps first.
           Tapping the badge toggles mute; tapping anywhere else opens modal. */}

      {/* ── VIDEO pill (top-left) ─────────────────────────────────── */}
      <View style={styles.videoPill} pointerEvents="none">
        <Text style={styles.videoPillText}>▶  VIDEO</Text>
      </View>

      {/* ── Buffering spinner ─────────────────────────────────────── */}
      {isActive && buffering && (
        <View style={styles.bufferingWrap} pointerEvents="none">
          <View style={styles.bufferingRing} />
        </View>
      )}

      {/* ── Dim overlay when not active (fill only, no flex centering) ── */}
      {!isActive && (
        <View style={styles.pausedDimOverlay} pointerEvents="none" />
      )}

      {/* ── Play button — direct flex child so container centers it ──── */}
      {/* Video is absoluteFill → out of flex flow, play circle gets      */}
      {/* centered by container's alignItems/justifyContent (same pattern */}
      {/* as SavedPostsScreen's singleVideoWrap).                         */}
      {!isActive && (
        <View style={styles.pausedPlayBtn} pointerEvents="none">
          <Text style={styles.pausedPlayIcon}>▶</Text>
        </View>
      )}

      {/* ── Touch capture overlay — LAST non-heart child so it sits above
           the native Video SurfaceView and receives touches everywhere.
           TouchableWithoutFeedback cannot do this on Android because the
           native video surface consumes touches before the JS responder
           system. A Pressable child rendered after <Video> is above it
           in the Android View z-order and intercepts correctly. ─────── */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        android_ripple={null}
        accessibilityLabel="Tap to view fullscreen, double-tap to like"
      />

      {/* ── Corner mute badge — ABOVE Pressable so badge tap is received first ── */}
      {isActive && (
        <TouchableOpacity
          style={styles.muteCorner}
          onPress={() => { onToggleMute(); showMuteFlash(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
        >
          <Text style={styles.muteCornerIcon}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      )}

      {/* ── Double-tap heart — AFTER the Pressable so it renders above it ── */}
      <Animated.Text
        style={[
          styles.heartOverlay,
          {
            opacity:   heartOpacity,
            transform: [{ scale: heartScale }, { translateY: heartY }],
          },
        ]}
        pointerEvents="none"
      >
        ❤️
      </Animated.Text>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    // Centers the play button when paused (Video is absoluteFill → out of flex flow)
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Progress bar
  progressTrack: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          3,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  progressFill: {
    height:          '100%' as any,
    backgroundColor: '#fff',
    borderRadius:    2,
  },

  // Time display
  timeBadge: {
    position:        'absolute',
    bottom:          10,
    left:            10,
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:    10,
  },
  timeText: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
  },
  timeSep: {
    color:      'rgba(255,255,255,0.55)',
    fontWeight: '400',
  },

  // Center mute flash
  muteFlashWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  muteFlashBg: {
    width:           76,
    height:          76,
    borderRadius:    38,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  muteFlashIcon: { fontSize: 32 },

  // Corner mute badge
  muteCorner: {
    position:        'absolute',
    bottom:          10,
    right:           10,
    width:           34,
    height:          34,
    borderRadius:    17,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  muteCornerIcon: { fontSize: 15 },

  // VIDEO pill
  videoPill: {
    position:          'absolute',
    top:               10,
    left:              10,
    backgroundColor:   'rgba(0,0,0,0.52)',
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      10,
  },
  videoPillText: {
    color:         '#fff',
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 0.8,
  },

  // Buffering ring
  bufferingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bufferingRing: {
    width:       44,
    height:      44,
    borderRadius: 22,
    borderWidth:  3,
    borderColor:  'rgba(255,255,255,0.75)',
    borderTopColor: 'transparent',
  },

  // Double-tap heart overlay (inside video, correct z-order)
  heartOverlay: {
    position:  'absolute',
    alignSelf: 'center',
    top:       '35%',
    fontSize:  80,
    zIndex:    20,
  },

  // Dim overlay — fills the frame when not active (no flex centering here)
  pausedDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  // Play button — direct flex child of container, centered by container's
  // alignItems/justifyContent (same pattern as SavedPostsScreen)
  pausedPlayBtn: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  pausedPlayIcon: {
    color:      '#fff',
    fontSize:   22,
    marginLeft: 3,
  },
});
