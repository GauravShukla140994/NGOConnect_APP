/**
 * LiveLocationScreen — s-live-location
 *
 * Shown to an approved SOS responder.
 * - Real street map via OpenStreetMap + Leaflet.js inside a WebView (no API key needed)
 * - Pulsing red SOS marker for victim, purple "You" marker for responder
 * - Markers update every 10 seconds via injectJavaScript
 * - "Navigate to [Name]" opens Google Maps / default maps app with
 *   BOTH start (your GPS) and destination (victim GPS) pre-filled
 * - "Call" opens phone dialer
 *
 * Package required: npm install react-native-webview
 * Android: auto-links. iOS: cd ios && pod install
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
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

// ── Leaflet map HTML (OpenStreetMap tiles, no API key) ────────────────────────
// Loaded once into WebView. Markers are added/moved via injectJavaScript calls.

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    #map { width: 100%; height: 100%; }

    .sos-icon {
      width: 48px; height: 48px;
      background: #EF4444;
      border: 3px solid #fff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 11px; font-weight: 900; letter-spacing: 0.5px;
      animation: sosPulse 1.5s ease-out infinite;
    }

    @keyframes sosPulse {
      0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
      70%  { box-shadow: 0 0 0 18px rgba(239,68,68,0); }
      100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
    }

    .you-icon {
      width: 38px; height: 38px;
      background: #6B4EFF;
      border: 3px solid #fff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      box-shadow: 0 2px 10px rgba(107,78,255,0.40);
    }

    .leaflet-tooltip {
      background: rgba(0,0,0,0.76);
      border: none;
      border-radius: 12px;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 9px;
      box-shadow: none;
      white-space: nowrap;
    }
    .leaflet-tooltip::before { display: none; }

    .leaflet-control-zoom { border: none !important; }
    .leaflet-control-zoom a {
      width: 32px !important; height: 32px !important;
      line-height: 32px !important;
      border-radius: 8px !important;
      font-size: 18px !important;
      box-shadow: 0 1px 6px rgba(0,0,0,0.18) !important;
      margin-bottom: 4px !important;
      border: none !important;
    }
    .leaflet-control-attribution { display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true });

    var tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Notify React Native when the first batch of tiles finishes loading
    tileLayer.once('load', function() {
      window.ReactNativeWebView.postMessage('TILES_LOADED');
    });

    // Default view — India centred; will snap to real coords on first marker set
    map.setView([20.5937, 78.9629], 5);

    var markers = {};

    function makeIcon(type) {
      if (type === 'sos') {
        return L.divIcon({
          className: '',
          html: '<div class="sos-icon">SOS</div>',
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          tooltipAnchor: [0, 30],
        });
      }
      return L.divIcon({
        className: '',
        html: '<div class="you-icon">&#128100;</div>',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        tooltipAnchor: [0, 24],
      });
    }

    function fitAll() {
      var pts = Object.values(markers).map(function(m) {
        var ll = m.getLatLng(); return [ll.lat, ll.lng];
      });
      if (pts.length === 1) {
        map.setView(pts[0], 16, { animate: true });
      } else if (pts.length > 1) {
        map.fitBounds(pts, { padding: [70, 70], animate: true, maxZoom: 17 });
      }
    }

    // Called from React Native via injectJavaScript
    // id: 'victim' | 'you'   type: 'sos' | 'you'   label: display text
    window.setMarker = function(id, lat, lng, type, label) {
      if (markers[id]) {
        markers[id].setLatLng([lat, lng]);
      } else {
        markers[id] = L.marker([lat, lng], { icon: makeIcon(type) })
          .addTo(map)
          .bindTooltip(label, {
            permanent: true,
            direction: 'bottom',
            offset: [0, type === 'sos' ? 30 : 24],
          });
      }
      fitAll();
    };

    window.removeMarker = function(id) {
      if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
    };
  </script>
</body>
</html>
`;

// ── Pulse animation for "Live" dot ────────────────────────────────────────────

function usePulse() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,   duration: 800, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
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
  const webRef = useRef<WebView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseScale = usePulse();

  const { sosIncidentId } = route.params as { sosIncidentId: number };

  const [incident,   setIncident]   = useState<any>(null);
  const [victimLoc,  setVictimLoc]  = useState<{ latitude: number; longitude: number } | null>(null);
  const [userLoc,    setUserLoc]    = useState<{ latitude: number; longitude: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [loading,     setLoading]    = useState(true);
  // tilesLoaded = Leaflet JS + OSM tiles are ready; safe to call window.setMarker via injectJavaScript.
  // We do NOT use WebView onLoad (HTML DOM ready) because Leaflet loads from CDN AFTER the DOM,
  // so window.setMarker would not exist yet when onLoad fires.
  const [tilesLoaded, setTilesLoaded] = useState(false);

  // ── Victim name helpers ─────────────────────────────────────────────────────

  const victimName: string =
    (incident?.userName as string | undefined)?.trim() ||
    (incident?.firstName && incident?.lastName
      ? `${incident.firstName} ${incident.lastName}`
      : null) ||
    'Volunteer';

  const victimFirstName = victimName.split(' ')[0] ?? 'Volunteer';

  const initials = victimName
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // ── Inject marker into Leaflet ──────────────────────────────────────────────

  const injectMarker = useCallback(
    (id: string, lat: number, lng: number, type: 'sos' | 'you', label: string) => {
      if (!webRef.current) { return; }
      webRef.current.injectJavaScript(
        `window.setMarker(${JSON.stringify(id)}, ${lat}, ${lng}, ${JSON.stringify(type)}, ${JSON.stringify(label)}); true;`,
      );
    },
    [],
  );

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
        const lat = Number(latitude);
        const lng = Number(longitude);
        setVictimLoc({ latitude: lat, longitude: lng });
        if (loggedAt) { setLastUpdate(String(loggedAt)); }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [sosIncidentId]);

  const fetchUserLocation = useCallback(() => {
    // enableHighAccuracy: false — uses network/WiFi location; works indoors where GPS satellite
    // lock would fail or timeout. SOS responders are often indoors when they first open this screen.
    Geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => { /* permission denied or location unavailable */ },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  // ── Mount: start polling ─────────────────────────────────────────────────────

  useEffect(() => {
    loadIncident();
    fetchVictimLocation();
    fetchUserLocation();

    pollRef.current = setInterval(() => {
      fetchVictimLocation();
      fetchUserLocation();
    }, AppConfig.SOS_LOCATION_INTERVAL_MS);

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); }
    };
  }, [loadIncident, fetchVictimLocation, fetchUserLocation]);

  // ── Update victim marker in map whenever location changes ──────────────────
  // Guard on tilesLoaded (not mapReady/onLoad) — Leaflet JS finishes loading from CDN
  // AFTER the HTML DOM is ready, so window.setMarker only exists once tiles load.

  useEffect(() => {
    if (!tilesLoaded || !victimLoc) { return; }
    injectMarker(
      'victim',
      victimLoc.latitude,
      victimLoc.longitude,
      'sos',
      victimFirstName,
    );
  }, [tilesLoaded, victimLoc, victimFirstName, injectMarker]);

  // ── Update "You" marker in map whenever user location changes ─────────────

  useEffect(() => {
    if (!tilesLoaded || !userLoc) { return; }
    injectMarker('you', userLoc.latitude, userLoc.longitude, 'you', 'You');
  }, [tilesLoaded, userLoc, injectMarker]);

  // ── Distance calculation ──────────────────────────────────────────────────

  const distMetres: number | null =
    userLoc && victimLoc
      ? haversineMetres(
          userLoc.latitude,  userLoc.longitude,
          victimLoc.latitude, victimLoc.longitude,
        )
      : null;

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleNavigate = useCallback(() => {
    if (!victimLoc) {
      Alert.alert('Location Unavailable', "The volunteer's location hasn't been received yet.");
      return;
    }
    const dest   = `${victimLoc.latitude},${victimLoc.longitude}`;
    const origin = userLoc ? `&origin=${userLoc.latitude},${userLoc.longitude}` : '';

    // Opens Google Maps app (Android) or Safari → Google Maps (iOS)
    // Both start (your GPS) and destination are pre-filled, travelmode=walking
    const url = `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}&travelmode=walking`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open maps application.'));
  }, [victimLoc, userLoc]);

  const handleCall = useCallback(() => {
    const phone = incident?.phone || incident?.mobile || incident?.phoneNumber;
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert(
        'Contact Volunteer',
        'The volunteer has not shared their phone number. Please coordinate through your NGO admin channel.',
        [{ text: 'OK' }],
      );
    }
  }, [incident]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Red header ────────────────────────────────────────────────────── */}
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

      {/* ── Person info card ──────────────────────────────────────────────── */}
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
          <View style={styles.liveRow}>
            <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseScale }] }]} />
            <Text style={styles.liveTxt}>Live</Text>
          </View>
          <Text style={styles.liveAge}>{lastUpdate ? timeAgoShort(lastUpdate) : '—'}</Text>
        </View>
      </View>

      {/* ── Real map (OpenStreetMap + Leaflet) ───────────────────────────── */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webRef}
          source={{ html: MAP_HTML }}
          style={styles.map}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          onMessage={(e) => {
            // TILES_LOADED is sent by tileLayer.once('load') in MAP_HTML.
            // At this point Leaflet JS is fully initialised and window.setMarker is defined.
            if (e.nativeEvent.data === 'TILES_LOADED') {
              setTilesLoaded(true);
            }
          }}
        />

        {/* Loading overlay — shown until tiles render AND first GPS fix arrives */}
        {(!tilesLoaded || (loading && !victimLoc)) && (
          <View style={styles.mapOverlay}>
            <ActivityIndicator size="large" color={C.PRIMARY} />
            <Text style={styles.mapOverlayTxt}>
              {!tilesLoaded ? 'Loading map…' : 'Fetching live location…'}
            </Text>
          </View>
        )}

        {/* Distance pill — floats over the map once we have both locations */}
        {tilesLoaded && distMetres != null && (
          <View style={styles.distancePill}>
            <Text style={styles.distancePillTxt}>
              📍 {formatDistance(distMetres)}  ·  {walkTime(distMetres)}
            </Text>
          </View>
        )}
      </View>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <View style={[styles.actionArea, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.navigateBtn, !victimLoc && styles.btnDisabled]}
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

        <Text style={styles.footerNote}>
          {'Location sharing stops when '}
          <Text style={styles.footerBold}>{victimFirstName}</Text>
          {' resolves SOS or after '}
          <Text style={styles.footerBold}>1 hour</Text>
          {' (per their Safety Preferences).'}
        </Text>
      </View>

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },

  // ── Red header
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
  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow:   { fontSize: 18, color: '#fff', fontWeight: '700' },
  backLabel:   { fontSize: 14, color: '#fff', fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },
  headerTime:  { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  headerBanner:{ fontSize: 13, color: '#fff', opacity: 0.92, lineHeight: 18 },

  // ── Person card
  personCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: C.CARD,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
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
  personAvatarTxt:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  personNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  personName:       { fontSize: 14, fontWeight: '800', color: C.TEXT },
  sosActivePill:    { backgroundColor: '#FEF2F2', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  sosActiveTxt:     { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  personMeta:       { fontSize: 12, color: C.TEXT2, marginTop: 2 },
  liveBox:          { alignItems: 'flex-end', flexShrink: 0 },
  liveRow:          { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#10B981',
  },
  liveTxt:  { fontSize: 12, fontWeight: '800', color: '#10B981' },
  liveAge:  { fontSize: 11, color: C.TEXT2, marginTop: 3 },

  // ── Map
  mapContainer: {
    flex:     1,
    position: 'relative',
  },
  map: {
    flex: 1,
    backgroundColor: '#E8EFF7',
  },
  mapLoading: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#E8EFF7',
    alignItems:      'center',
    justifyContent:  'center',
  },
  mapLoadingTxt: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  mapOverlay: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(232,239,247,0.82)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  mapOverlayTxt: { fontSize: 14, color: '#374151', fontWeight: '600' },

  // Distance pill (floating over map)
  distancePill: {
    position:        'absolute',
    bottom:          16,
    alignSelf:       'center',
    backgroundColor: '#1F2937',
    borderRadius:    30,
    paddingHorizontal: 20,
    paddingVertical: 10,
    elevation:        4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.3,
    shadowRadius:    6,
  },
  distancePillTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── Action area
  actionArea: {
    backgroundColor: C.CARD,
    paddingHorizontal: 14,
    paddingTop:       14,
    borderTopWidth:   1,
    borderTopColor:   C.BORDER,
    gap:              10,
  },
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
  btnDisabled:    { opacity: 0.5 },
  navigateBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  callBtn: {
    borderRadius:       14,
    paddingVertical:    15,
    paddingHorizontal:  22,
    alignItems:         'center',
    borderWidth:        1.5,
    borderColor:        '#10B981',
    backgroundColor:    '#fff',
  },
  callBtnTxt: { fontSize: 15, fontWeight: '700', color: '#059669' },

  // ── Footer note
  footerNote: {
    fontSize:   12,
    color:      C.TEXT2,
    textAlign:  'center',
    lineHeight: 18,
  },
  footerBold: { fontWeight: '700', color: C.TEXT },
});
