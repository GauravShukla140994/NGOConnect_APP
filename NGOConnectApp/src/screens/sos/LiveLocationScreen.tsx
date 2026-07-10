/**
 * LiveLocationScreen — s-live-location
 *
 * Shown to an approved SOS responder. Displays the victim's live GPS position
 * relative to the responder on a custom map view (react-native-maps is NOT
 * installed, so we render a light-themed grid canvas with Haversine-positioned
 * circle markers). Polls getLatestLocation every 10 seconds.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import { sosApi } from '../../api/sos.api';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

// ── GPS helpers ───────────────────────────────────────────────────────────────

function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R  = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Returns azimuth bearing in degrees (0 = North, 90 = East…) */
function bearingDeg(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y   = Math.sin(Δλ) * Math.cos(φ2);
  const x   = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function formatDistance(m: number): string {
  if (m < 1000) { return `~${Math.max(50, Math.round(m / 50) * 50)} m`; }
  return `~${(m / 1000).toFixed(1)} km`;
}

function walkTime(m: number): string {
  const mins = Math.max(1, Math.ceil(m / 84)); // 84 m/min ≈ 5 km/h
  if (mins < 60) { return `~${mins} min walk`; }
  return `~${Math.floor(mins / 60)}h ${mins % 60}min walk`;
}

function timeAgoShort(iso: string | undefined | null): string {
  if (!iso) { return '—'; }
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5)    { return 'just now'; }
  if (diff < 60)   { return `${diff}s ago`; }
  if (diff < 3600) { return `${Math.floor(diff / 60)}m ago`; }
  return `${Math.floor(diff / 3600)}h ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Marker position calculator ────────────────────────────────────────────────

interface Coord { x: number; y: number; }

function calcPositions(
  mapW: number, mapH: number,
  userLat: number, userLon: number,
  victimLat: number, victimLon: number,
  distMetres: number,
): { you: Coord; victim: Coord } {
  // "You" sits at roughly 65%, 68% of map (lower-right, like prototype)
  const youX = mapW * 0.65;
  const youY = mapH * 0.68;

  const MAX_DIST  = 3000;  // metres → capped for pixel scale
  const scaled    = Math.min(distMetres, MAX_DIST);
  const pxPerM    = (Math.min(mapW, mapH) * 0.40) / MAX_DIST;

  const bearing  = bearingDeg(userLat, userLon, victimLat, victimLon);
  const rad      = (bearing * Math.PI) / 180;

  const vx = youX + scaled * pxPerM * Math.sin(rad);
  const vy = youY - scaled * pxPerM * Math.cos(rad);
  const M  = 50; // margin

  return {
    you:    { x: youX, y: youY },
    victim: {
      x: Math.max(M, Math.min(mapW - M, vx)),
      y: Math.max(M, Math.min(mapH - M, vy)),
    },
  };
}

// ── Pulse animation hook ──────────────────────────────────────────────────────

function usePulse() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.8, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,   duration: 900, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
      ]),
    ).start();
  }, [scale]);
  return scale;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LiveLocationScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const { sosIncidentId } = route.params as { sosIncidentId: number };

  const [incident,    setIncident]    = useState<any>(null);
  const [victimLoc,   setVictimLoc]   = useState<{ latitude: number; longitude: number } | null>(null);
  const [userLoc,     setUserLoc]     = useState<{ latitude: number; longitude: number } | null>(null);
  const [lastUpdate,  setLastUpdate]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseScale = usePulse();

  // ── Data fetching ────────────────────────────────────────────────────────────

  const loadIncident = useCallback(async () => {
    try {
      const res = await sosApi.getById(sosIncidentId);
      if (res.data?.isSuccess && res.data.data) {
        setIncident(res.data.data);
      }
    } catch { /* silent */ }
  }, [sosIncidentId]);

  const fetchVictimLocation = useCallback(async () => {
    try {
      const res = await sosApi.getLatestLocation(sosIncidentId);
      if (res.data?.isSuccess && res.data.data) {
        const { latitude, longitude, loggedAt } = res.data.data as any;
        setVictimLoc({ latitude: Number(latitude), longitude: Number(longitude) });
        if (loggedAt) { setLastUpdate(String(loggedAt)); }
      }
    } catch { /* silent */ }
    finally   { setLoading(false); }
  }, [sosIncidentId]);

  const fetchUserLocation = useCallback(() => {
    Geolocation.getCurrentPosition(
      (pos) => setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      ()    => { /* permission denied — map will show victim only */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }, []);

  useEffect(() => {
    loadIncident();
    fetchVictimLocation();
    fetchUserLocation();

    pollRef.current = setInterval(() => {
      fetchVictimLocation();
      fetchUserLocation();
    }, 10000);

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); }
    };
  }, [loadIncident, fetchVictimLocation, fetchUserLocation]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const victimName: string =
    (incident?.userName as string | undefined)?.trim() ||
    (incident?.firstName && incident?.lastName
      ? `${incident.firstName} ${incident.lastName}`
      : null) ||
    'Volunteer';

  const victimFirstName = victimName.split(' ')[0] ?? 'Volunteer';

  let distMetres: number | null = null;
  if (userLoc && victimLoc) {
    distMetres = haversineMetres(
      userLoc.latitude,  userLoc.longitude,
      victimLoc.latitude, victimLoc.longitude,
    );
  }

  const MAP_PAD = 14;
  const MAP_W   = screenW - MAP_PAD * 2;
  const MAP_H   = 260;

  const positions =
    userLoc && victimLoc
      ? calcPositions(MAP_W, MAP_H, userLoc.latitude, userLoc.longitude, victimLoc.latitude, victimLoc.longitude, distMetres ?? 0)
      : null;

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleNavigate = useCallback(() => {
    if (!victimLoc) {
      Alert.alert('Location Unavailable', "The volunteer's location hasn't been received yet.");
      return;
    }
    const url = `https://maps.google.com/?daddr=${victimLoc.latitude},${victimLoc.longitude}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open maps application.'));
  }, [victimLoc]);

  const handleCall = useCallback(() => {
    Alert.alert(
      'Contact Volunteer',
      'Direct calling requires the volunteer to share their phone number. Please coordinate through your NGO admin channel.',
      [{ text: 'OK' }],
    );
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  const initials = victimName
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Red header ──────────────────────────────────────────────────────── */}
      <View style={styles.redHeader}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => nav.goBack()}
            accessibilityLabel="Go back"
          >
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Live Location · SOS</Text>

          <Text style={styles.headerTime}>
            {lastUpdate ? timeAgoShort(lastUpdate) : '—'}
          </Text>
        </View>

        <Text style={styles.headerBanner}>
          You are an approved helper. Live location updates every 10 seconds.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Person info row ────────────────────────────────────────────────── */}
        <View style={styles.personCard}>
          <View style={styles.personAvatar}>
            <Text style={styles.personAvatarTxt}>{initials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.personNameRow}>
              <Text style={styles.personName} numberOfLines={1}>{victimName}</Text>
              <View style={styles.sosActivePill}>
                <Text style={styles.sosActiveTxt}>⚠ SOS Active</Text>
              </View>
            </View>
            <Text style={styles.personMeta} numberOfLines={1}>
              {[
                incident?.orgName,
                incident?.createdAt ? 'Sent at ' + fmtTime(incident.createdAt) : null,
              ].filter(Boolean).join('  ·  ')}
            </Text>
          </View>

          <View style={styles.liveBox}>
            <Text style={styles.liveDot}>●</Text>
            <Text style={styles.liveTxt}>Live</Text>
            <Text style={styles.liveAge}>{lastUpdate ? timeAgoShort(lastUpdate) : '—'}</Text>
          </View>
        </View>

        {/* ── Map canvas ────────────────────────────────────────────────────── */}
        <View style={[styles.mapCanvas, { width: MAP_W, height: MAP_H }]}>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((f) => (
            <React.Fragment key={`g${f}`}>
              <View style={[styles.gridH, { top: MAP_H * f }]} />
              <View style={[styles.gridV, { left: MAP_W * f }]} />
            </React.Fragment>
          ))}

          {/* Victim marker (red SOS circle with pulse) */}
          {positions && (
            <View
              style={[
                styles.markerRoot,
                { left: positions.victim.x - 28, top: positions.victim.y - 28 },
              ]}
            >
              {/* Pulse ring */}
              <Animated.View
                style={[
                  styles.victimPulse,
                  { transform: [{ scale: pulseScale }] },
                ]}
              />
              {/* SOS circle */}
              <View style={styles.victimCircle}>
                <Text style={styles.victimCircleTxt}>SOS</Text>
              </View>
              {/* Label pill */}
              <View style={styles.victimLabel}>
                <Text style={styles.victimLabelTxt}>
                  {victimFirstName}
                  {distMetres != null ? ` · ${formatDistance(distMetres)}` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* User marker (purple "You" circle) */}
          {positions && (
            <View
              style={[
                styles.markerRoot,
                { left: positions.you.x - 20, top: positions.you.y - 20 },
              ]}
            >
              <View style={styles.youCircle}>
                <Text style={styles.youCircleTxt}>👤</Text>
              </View>
              <View style={styles.youLabel}>
                <Text style={styles.youLabelTxt}>You</Text>
              </View>
            </View>
          )}

          {/* Loading / unavailable overlay */}
          {!positions && (
            <View style={styles.mapOverlay}>
              <Text style={styles.mapOverlayTxt}>
                {loading ? '📡  Fetching live location…' : '📍  Location not yet available'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Distance pill ──────────────────────────────────────────────────── */}
        {distMetres != null && (
          <View style={styles.distancePill}>
            <Text style={styles.distancePillTxt}>
              📍 {formatDistance(distMetres)}  ·  {walkTime(distMetres)}
            </Text>
          </View>
        )}

        {/* ── Action buttons ─────────────────────────────────────────────────── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.navigateBtn}
            onPress={handleNavigate}
            accessibilityLabel={`Navigate to ${victimFirstName}`}
          >
            <Text style={styles.navigateBtnTxt}>↗  Navigate to {victimFirstName}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.callBtn}
            onPress={handleCall}
            accessibilityLabel="Call"
          >
            <Text style={styles.callBtnTxt}>📞  Call</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer note ────────────────────────────────────────────────────── */}
        <Text style={styles.footerNote}>
          {'Location sharing stops when '}
          <Text style={styles.footerBold}>{victimFirstName}</Text>
          {' resolves SOS or after '}
          <Text style={styles.footerBold}>1 hour</Text>
          {' (per their Safety Preferences).'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },

  // ── Header
  redHeader: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingTop:         8,
    paddingBottom:     12,
  },
  headerTopRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:    8,
  },
  backBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow:  { fontSize: 18, color: '#fff', fontWeight: '700' },
  backLabel:  { fontSize: 14, color: '#fff', fontWeight: '600' },
  headerTitle:{ fontSize: 16, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },
  headerTime: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  headerBanner:{ fontSize: 13, color: '#fff', opacity: 0.92, lineHeight: 18 },

  // ── Scroll content
  scroll: { paddingHorizontal: 14, paddingTop: 14, gap: 14 },

  // ── Person card
  personCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: C.CARD,
    borderRadius:    14,
    padding:         14,
    elevation:       2,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.07,
    shadowRadius:    4,
  },
  personAvatar: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: '#EF4444',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  personAvatarTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  personNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  personName:      { fontSize: 14, fontWeight: '800', color: C.TEXT },
  sosActivePill:   { backgroundColor: '#FEF2F2', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  sosActiveTxt:    { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  personMeta:      { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  liveBox:         { alignItems: 'flex-end', flexShrink: 0 },
  liveDot:         { fontSize: 9, color: '#10B981', fontWeight: '800' },
  liveTxt:         { fontSize: 12, fontWeight: '800', color: '#10B981' },
  liveAge:         { fontSize: 11, color: C.TEXT2, marginTop: 2 },

  // ── Map canvas
  mapCanvas: {
    borderRadius:    16,
    backgroundColor: '#E8EFF7',
    overflow:        'hidden',
    alignSelf:       'center',
    elevation:       2,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.08,
    shadowRadius:    4,
  },
  gridH: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          1,
    backgroundColor: 'rgba(100,130,170,0.15)',
  },
  gridV: {
    position:        'absolute',
    top:             0,
    bottom:          0,
    width:           1,
    backgroundColor: 'rgba(100,130,170,0.15)',
  },

  // ── Markers
  markerRoot: {
    position:   'absolute',
    alignItems: 'center',
  },

  // Victim (red SOS)
  victimPulse: {
    position:        'absolute',
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: 'rgba(239,68,68,0.22)',
    top:             0,
    alignSelf:       'center',
  },
  victimCircle: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: '#EF4444',
    alignItems:      'center',
    justifyContent:  'center',
    elevation:       4,
    shadowColor:     '#EF4444',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.4,
    shadowRadius:    6,
  },
  victimCircleTxt: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  victimLabel: {
    marginTop:       6,
    backgroundColor: '#EF4444',
    borderRadius:    20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  victimLabelTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // User ("You" in purple)
  youCircle: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: '#6D28D9',
    alignItems:      'center',
    justifyContent:  'center',
    elevation:       3,
    shadowColor:     '#6D28D9',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.3,
    shadowRadius:    4,
  },
  youCircleTxt: { fontSize: 18 },
  youLabel: {
    marginTop:       5,
    backgroundColor: '#6D28D9',
    borderRadius:    20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  youLabelTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Map overlay (loading / no data)
  mapOverlay: {
    position:        'absolute',
    top:             0, left: 0, right: 0, bottom: 0,
    alignItems:      'center',
    justifyContent:  'center',
  },
  mapOverlayTxt: { fontSize: 14, color: '#6B7280', fontWeight: '600' },

  // ── Distance pill
  distancePill: {
    alignSelf:       'center',
    backgroundColor: '#1F2937',
    borderRadius:    30,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  distancePillTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── Action buttons
  actionRow: {
    flexDirection: 'row',
    gap:           10,
  },
  navigateBtn: {
    flex:            1,
    backgroundColor: C.PRIMARY,
    borderRadius:    14,
    paddingVertical: 15,
    alignItems:      'center',
    elevation:       2,
    shadowColor:     C.PRIMARY,
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.25,
    shadowRadius:    4,
  },
  navigateBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  callBtn: {
    borderRadius:    14,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems:      'center',
    borderWidth:     1.5,
    borderColor:     '#10B981',
    backgroundColor: '#fff',
  },
  callBtnTxt: { fontSize: 15, fontWeight: '700', color: '#059669' },

  // ── Footer
  footerNote: {
    fontSize:   12,
    color:      C.TEXT2,
    textAlign:  'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  footerBold: { fontWeight: '700', color: C.TEXT },
});
