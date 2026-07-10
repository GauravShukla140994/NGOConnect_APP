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
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Video from 'react-native-video';

interface Props {
  uri:          string;
  isActive:     boolean;
  muted:        boolean;
  onToggleMute: () => void;
  width:        number;
  height:       number;
}

function fmtTime(secs: number): string {
  const s = Math.floor(secs);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function VideoFeedPlayer({
  uri, isActive, muted, onToggleMute, width, height,
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

  const handleTap = useCallback(() => {
    onToggleMute();
    showMuteFlash();
  }, [onToggleMute, showMuteFlash]);

  // ── v6-compatible callbacks ────────────────────────────────────────────────
  const handleLoad = useCallback((data: any) => {
    setDuration(data?.duration ?? 0);
    setReady(true);
    setBuffering(false);
  }, []);

  const handleProgress = useCallback((data: any) => {
    setCurrentTime(data?.currentTime ?? 0);
  }, []);

  const handleBuffer = useCallback((data: any) => {
    // v5: { isBuffering }  |  v6: { isBuffering } — same shape
    setBuffering(data?.isBuffering ?? false);
  }, []);

  const handleError = useCallback(() => {
    setReady(false);
  }, []);

  const handleReadyForDisplay = useCallback(() => {
    setReady(true);
  }, []);

  const progress     = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const progressPct  = `${Math.round(progress * 100)}%` as any;
  const showTime     = ready && duration > 0;

  return (
    <TouchableWithoutFeedback
      onPress={handleTap}
      accessibilityLabel={muted ? 'Tap to unmute' : 'Tap to mute'}
    >
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
          bufferConfig={{
            minBufferMs:                      2500,
            maxBufferMs:                      15000,
            bufferForPlaybackMs:              1500,
            bufferForPlaybackAfterRebufferMs: 3000,
          }}
        />

        {/* ── Progress bar (bottom edge) ───────────────────────────── */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressPct }]} />
        </View>

        {/* ── Time display (bottom-left: elapsed / total) ──────────── */}
        {showTime && (
          <View style={styles.timeBadge}>
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

        {/* ── Corner mute badge ─────────────────────────────────────── */}
        {isActive && (
          <View style={styles.muteCorner}>
            <Text style={styles.muteCornerIcon}>{muted ? '🔇' : '🔊'}</Text>
          </View>
        )}

        {/* ── VIDEO pill (top-left) ─────────────────────────────────── */}
        <View style={styles.videoPill}>
          <Text style={styles.videoPillText}>▶  VIDEO</Text>
        </View>

        {/* ── Buffering spinner ─────────────────────────────────────── */}
        {isActive && buffering && (
          <View style={styles.bufferingWrap} pointerEvents="none">
            <View style={styles.bufferingRing} />
          </View>
        )}

        {/* ── Paused play-button hint (when in viewport but not playing yet) */}
        {!isActive && (
          <View style={styles.pausedHint} pointerEvents="none">
            <View style={styles.pausedPlayBtn}>
              <Text style={styles.pausedPlayIcon}>▶</Text>
            </View>
          </View>
        )}

      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
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

  // Paused play hint (when off-screen / not yet active)
  pausedHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
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
