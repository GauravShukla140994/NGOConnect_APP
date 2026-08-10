import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { lookupApi } from '../../api/lookup.api';
import { sosApi } from '../../api/sos.api';
import { getSafetyPrefs } from '../../api/user.api';
import { useAdminStore } from '../../store/adminStore';

const C   = AppConfig.COLORS;
const RED = C.RED ?? '#EF4444';

// ── Alert type metadata ───────────────────────────────────────────────────────
const TYPE_META: Record<string, {
  emoji: string; iconBg: string; label: string; subtitle: string; color: string; bg: string;
}> = {
  SOS_ALERT:          { emoji: '🚨', iconBg: '#FEE2E2', label: 'SOS Alert',          subtitle: 'Immediate danger · Need urgent help right now',          color: '#EF4444', bg: '#FEF2F2' },
  HELP_REQUEST:       { emoji: '🆘', iconBg: '#FEF3C7', label: 'Help Request',        subtitle: 'Need assistance · Lost, injured or stuck',                color: '#D97706', bg: '#FFFBEB' },
  MISSING_VOLUNTEER:  { emoji: '🔍', iconBg: '#EDE9FE', label: 'Missing Volunteer',   subtitle: 'Report a volunteer who is unreachable or missing',         color: '#7C3AED', bg: '#EDE9FE' },
  SAFE_ARRIVAL:       { emoji: '✅', iconBg: '#D1FAE5', label: 'Safe Arrival',        subtitle: 'Confirm you have safely reached your destination',         color: '#059669', bg: '#ECFDF5' },
};

interface LookupValue { lookupValueId: number; valueCode: string; valueName: string; }

interface LocationState {
  lat:       number;
  lng:       number;
  areaName:  string;   // "Whitefield Area, Bengaluru · Karnataka"
  updatedAt: Date;
}

// ── Nominatim reverse geocoding (OSM — free, no API key) ─────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`;
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'RippleHub/1.0 (ripplehub.app)' },
    });
    if (!res.ok) { return ''; }
    const data = await res.json();
    const addr = data.address ?? {};
    const area  = addr.suburb ?? addr.neighbourhood ?? addr.village ?? addr.town ?? '';
    const city  = addr.city   ?? addr.city_district ?? addr.county  ?? '';
    const state = addr.state  ?? '';
    return [area, city, state].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

// ── Time-ago helper ───────────────────────────────────────────────────────────
function timeAgoLabel(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 10)  { return 'Updated just now'; }
  if (secs < 60)  { return `Updated ${secs}s ago`; }
  if (secs < 120) { return 'Updated 1 min ago'; }
  return `Updated ${Math.floor(secs / 60)} mins ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SosTriggerScreen() {
  const nav                        = useNavigation<any>();
  const { selectedOrg, activeOrg } = useAdminStore();
  const orgId                      = selectedOrg?.orgId ?? activeOrg?.orgId;
  const orgName                    = selectedOrg?.orgName ?? activeOrg?.orgName;

  const [types,       setTypes]       = useState<LookupValue[]>([]);
  const [selected,    setSelected]    = useState<LookupValue | null>(null);
  const [description, setDescription] = useState('');
  const [location,    setLocation]    = useState<LocationState | null>(null);
  const [locLoading,  setLocLoading]  = useState(false);
  const [locError,    setLocError]    = useState('');
  const [timeLabel,   setTimeLabel]   = useState('Updated just now');
  const [sending,          setSending]          = useState(false);
  const [error,            setError]            = useState('');
  const [visibilityLabel,  setVisibilityLabel]  = useState('Admin + Moderators');

  // Update "Updated X ago" label every 10s
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!location) { return; }
    setTimeLabel(timeAgoLabel(location.updatedAt));
    timerRef.current = setInterval(() => {
      setTimeLabel(timeAgoLabel(location.updatedAt));
    }, 10000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); } };
  }, [location]);

  // Pulse animation for the send button
  const pulse = useRef(new Animated.Value(0)).current;
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    startPulse();
    // Load alert types from DB
    lookupApi.getValuesByTypeCode(AppConfig.LOOKUP.SOS_ALERT_TYPE)
      .then((res) => {
        if (res.data?.isSuccess && res.data.data) {
          const list = res.data.data as LookupValue[];
          setTypes(list);
          const def = list.find((t) => t.valueCode === 'SOS_ALERT');
          if (def) { setSelected(def); }
        }
      })
      .catch(() => {});
    // Load user's saved SOS visibility preference
    getSafetyPrefs()
      .then((res) => {
        const label = res.data?.data?.emergVisibility;
        if (label) { setVisibilityLabel(label); }
      })
      .catch(() => {});
    fetchLocation();
  }, []);

  // ── Fetch GPS + reverse geocode ─────────────────────────────────────────────
  // Two-stage strategy:
  //   Stage 1 — high-accuracy GPS (satellite). Fast on devices with a warm GPS
  //             chip or clear sky view. Timeout: 8s to keep UX snappy.
  //   Stage 2 — network location (cell towers + WiFi). Works indoors, in power-
  //             saving mode, and on devices with slow GPS hardware. This is why
  //             the Home screen works on all devices — it uses this mode only.
  // Fallback ensures users in genuine emergencies are never stuck on the error
  // screen simply because GPS satellite lock took too long.
  const fetchLocation = () => {
    setLocLoading(true);
    setLocError('');

    const onSuccess = async (pos: { coords: { latitude: number; longitude: number } }) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const areaName = await reverseGeocode(lat, lng);
      setLocation({ lat, lng, areaName: areaName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, updatedAt: new Date() });
      setLocLoading(false);
    };

    const onFinalError = () => {
      setLocError('Could not get GPS location. Please enable location permissions.');
      setLocLoading(false);
    };

    // Stage 1: try GPS (high accuracy), 8-second window
    Geolocation.getCurrentPosition(
      onSuccess,
      () => {
        // Stage 2: GPS timed out → fall back to network location (cell + WiFi)
        Geolocation.getCurrentPosition(
          onSuccess,
          onFinalError,
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  };

  // ── Send SOS ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!selected) { setError('Please select an alert type.'); return; }
    if (!location) { setError('Location is required. Please enable GPS.'); return; }

    // Confirm before sending (this is a real emergency feature)
    Alert.alert(
      'Confirm SOS Alert',
      `Send a "${TYPE_META[selected.valueCode]?.label ?? selected.valueName}" alert to all active members?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Now', style: 'destructive',
          onPress: doSend,
        },
      ],
    );
  };

  const doSend = async () => {
    if (!selected || !location) { return; }
    setError('');
    setSending(true);
    try {
      const res = await sosApi.trigger({
        alertTypeLkpId: selected.lookupValueId,
        orgId,
        latitude:       location.lat,
        longitude:      location.lng,
        approxLocation: location.areaName,
        description:    description.trim() || undefined,
      });
      if (res.data?.isSuccess && res.data.data) {
        const { sosIncidentId } = res.data.data;
        // Navigate to SosActive — community page will pick up the alert on next poll
        nav.replace('SosActive', { sosIncidentId, isVictim: true });
      } else {
        setError(res.data?.message ?? 'Failed to send SOS. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const selectedMeta  = selected ? (TYPE_META[selected.valueCode] ?? null) : null;
  const activeColor   = selectedMeta?.color ?? RED;
  const typeList      = types.length > 0
    ? types
    : Object.keys(TYPE_META).map((code) => ({ valueCode: code, valueName: TYPE_META[code].label, lookupValueId: 0 }));

  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={styles.backArrow}>{'← Back'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.sosTag}>
            <Text style={styles.sosTagTxt}>SOS</Text>
          </View>
          <Text style={[styles.headerTitle, { color: RED }]}>SOS Alert</Text>
        </View>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Warning Banner ──────────────────────────────────────────── */}
        <View style={styles.warningBanner}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>This is a real emergency feature</Text>
            <Text style={styles.warningBody}>
              Your alert will be sent immediately to your{orgName ? ` ${orgName}` : ''} organisation based on your Safety Preferences. Only use in genuine situations.
            </Text>
          </View>
        </View>

        {/* ── Alert Type List ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>SELECT ALERT TYPE</Text>
        {typeList.map((t) => {
          const meta       = TYPE_META[t.valueCode];
          if (!meta) { return null; }
          const isSelected = selected?.valueCode === t.valueCode;
          return (
            <TouchableOpacity
              key={t.valueCode}
              style={[
                styles.typeRow,
                isSelected && { borderColor: meta.color, borderWidth: 2, backgroundColor: meta.bg },
              ]}
              onPress={() => { setSelected(t); setError(''); }}
              accessibilityLabel={meta.label}
              activeOpacity={0.75}
            >
              <View style={[styles.typeIconBox, { backgroundColor: meta.iconBg }]}>
                <Text style={styles.typeEmoji}>{meta.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeLabel, isSelected && { color: meta.color }]}>{meta.label}</Text>
                <Text style={styles.typeSubtitle}>{meta.subtitle}</Text>
              </View>
              {isSelected && (
                <View style={[styles.selectedDot, { backgroundColor: meta.color }]} />
              )}
            </TouchableOpacity>
          );
        })}

        {/* ── Description ─────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Description (optional)</Text>
        <TextInput
          style={styles.descInput}
          placeholder={`Describe your situation, nearest landmark, or any\ndetails that help responders find you...`}
          placeholderTextColor={C.TEXT3}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
        />

        {/* ── Location Row ─────────────────────────────────────────────── */}
        <View style={styles.locCard}>
          {locLoading ? (
            <View style={styles.locRow}>
              <ActivityIndicator size="small" color={C.PRIMARY} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.locTitle}>Getting your location...</Text>
                <Text style={styles.locSub}>Using GPS · Please wait</Text>
              </View>
            </View>
          ) : location ? (
            <View style={styles.locRow}>
              <Text style={styles.locPin}>📍</Text>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.locTitle}>Your approximate location will be shared</Text>
                <Text style={styles.locAreaName}>{location.areaName}</Text>
                <Text style={styles.locSub}>{timeLabel}</Text>
              </View>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTxt}>Live</Text>
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.locError}>{locError || 'Location not available'}</Text>
              <TouchableOpacity style={styles.locBtn} onPress={fetchLocation} accessibilityLabel="Get location">
                <Text style={styles.locBtnTxt}>📍 Get My Location</Text>
              </TouchableOpacity>
            </View>
          )}
          {location ? (
            <TouchableOpacity onPress={fetchLocation} style={styles.refreshBtn} accessibilityLabel="Refresh location">
              <Text style={styles.refreshTxt}>🔄 Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Visibility note ──────────────────────────────────────────── */}
        <View style={styles.visibilityRow}>
          <Text style={styles.visibilityIcon}>ℹ️</Text>
          <Text style={styles.visibilityTxt}>
            {'Alert visible to '}
            <Text style={{ fontWeight: '700' }}>{visibilityLabel}</Text>
            {' (per Safety Preferences).'}
          </Text>
        </View>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTxt}>⚠️  {error}</Text>
          </View>
        ) : null}

        {/* ── Send Button ──────────────────────────────────────────────── */}
        <Animated.View style={[styles.sendWrap, { opacity: pulseOpacity }]}>
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: sending ? '#999' : RED }]}
            onPress={handleSend}
            disabled={sending}
            accessibilityLabel="Send SOS alert"
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <View style={styles.sosBadge}>
                  <Text style={styles.sosBadgeTxt}>SOS</Text>
                </View>
                <Text style={styles.sendLabel}>SEND SOS ALERT NOW</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.disclaimer}>
          This alert will notify all active members of your NGO.{'\n'}Only use in genuine emergency situations.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.BG },

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER, paddingHorizontal: 12, paddingVertical: 10 },
  backBtn:        { width: 64, paddingVertical: 4 },
  backArrow:      { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerCenter:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle:    { fontSize: 17, fontWeight: '800' },
  sosTag:         { backgroundColor: RED, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  sosTagTxt:      { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  scroll:         { padding: 16, paddingBottom: 40 },

  // Warning banner
  warningBanner:  { flexDirection: 'row', gap: 10, backgroundColor: '#FFF7ED', borderRadius: 12, borderWidth: 1, borderColor: '#FED7AA', padding: 14, marginBottom: 20 },
  warningIcon:    { fontSize: 20, marginTop: 1 },
  warningTitle:   { fontSize: 13, fontWeight: '700', color: '#C2410C', marginBottom: 4 },
  warningBody:    { fontSize: 12, color: '#92400E', lineHeight: 17 },

  // Section label
  sectionLabel:   { fontSize: 11, fontWeight: '800', color: C.TEXT2, letterSpacing: 0.7, marginBottom: 10, marginTop: 4 },

  // Type cards — vertical list
  typeRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.CARD, borderRadius: 14, borderWidth: 1, borderColor: C.BORDER, padding: 13, marginBottom: 10 },
  typeIconBox:    { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeEmoji:      { fontSize: 22 },
  typeLabel:      { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  typeSubtitle:   { fontSize: 12, color: C.TEXT2, lineHeight: 16 },
  selectedDot:    { width: 10, height: 10, borderRadius: 5 },

  // Description
  descInput:      { backgroundColor: C.CARD, borderRadius: 14, borderWidth: 1, borderColor: C.BORDER, padding: 14, fontSize: 13, color: C.TEXT, minHeight: 90, marginBottom: 14, marginTop: 2 },

  // Location card
  locCard:        { backgroundColor: C.CARD, borderRadius: 14, borderWidth: 1, borderColor: C.BORDER, padding: 14, marginBottom: 10 },
  locRow:         { flexDirection: 'row', alignItems: 'flex-start' },
  locPin:         { fontSize: 20, marginTop: 1 },
  locTitle:       { fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  locAreaName:    { fontSize: 12, color: C.TEXT2, marginBottom: 2 },
  locSub:         { fontSize: 11, color: C.TEXT3 },
  livePill:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  liveDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  liveTxt:        { fontSize: 12, color: '#22C55E', fontWeight: '700' },
  refreshBtn:     { marginTop: 10, alignSelf: 'flex-start' },
  refreshTxt:     { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },
  locError:       { fontSize: 13, color: RED, marginBottom: 10 },
  locBtn:         { backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, alignSelf: 'flex-start' },
  locBtnTxt:      { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Visibility note
  visibilityRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: `${C.PRIMARY}08`, borderRadius: 10, padding: 10, marginBottom: 16 },
  visibilityIcon: { fontSize: 13, marginTop: 1 },
  visibilityTxt:  { flex: 1, fontSize: 12, color: C.TEXT2, lineHeight: 17 },
  visibilityLink: { fontWeight: '600' },

  // Error
  errorBox:       { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorTxt:       { fontSize: 13, color: RED, lineHeight: 18 },

  // Send button — full-width banner style
  sendWrap:       { marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  sendBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 16 },
  sosBadge:       { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  sosBadgeTxt:    { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  sendLabel:      { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 1.2 },

  disclaimer:     { fontSize: 11, color: C.TEXT3, textAlign: 'center', lineHeight: 17 },
});
