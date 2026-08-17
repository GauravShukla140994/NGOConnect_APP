/**
 * ProjectDetailScreen — rich project detail with OSM map
 *
 * Sections:
 *  1. Hero card — title, org, category, status
 *  2. Schedule card — type, dates, times, duration
 *  3. Location & Map card — address, Leaflet map (user → project), distance
 *  4. Capacity card — filled / total, progress bar, spots left
 *  5. Description card
 *  6. Skills card
 *  7. Sticky apply footer (safe-area aware)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import AppConfig from '../../config/AppConfig';
import { get, apply, flexCheckIn, flexCheckOut, getVolunteerEligibility } from '../../api/project.api';
import { useAuthStore } from '../../store/authStore';
import type { VolunteerEligibilityResult } from '../../api/project.api';
import type { Project } from '../../types/api.types';

const C = AppConfig.COLORS;

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R  = 6371;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km: number): string {
  if (km < 1) { return `${Math.round(km * 1000)} m`; }
  return `${km.toFixed(1)} km`;
}

const SCHED_LABEL: Record<string, string> = {
  ONE_TIME:  '📅 One-Time',
  RECURRING: '🔄 Recurring',
  FLEXIBLE:  '📆 Flexible',
};

const CAT_COLOR: Record<string, string> = {
  Community:      C.TEAL,
  Environment:    '#16A34A',
  Education:      C.PRIMARY,
  Healthcare:     '#F59E0B',
  'Animal Welfare':'#8B5CF6',
  Sports:         '#EF4444',
  Arts:           '#EC4899',
};

// ── Leaflet map HTML (static two-point map, no API key) ──────────────────────
// Project marker rendered immediately; user marker injected once GPS returns.

function buildMapHtml(projLat: number, projLng: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%}
    .proj-icon{
      width:36px;height:36px;
      background:#EF4444;border:3px solid #fff;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.28);
    }
    .you-icon{
      width:30px;height:30px;
      background:${C.PRIMARY};border:3px solid #fff;border-radius:50%;
      box-shadow:0 0 0 6px ${C.PRIMARY}33;
    }
    .leaflet-tooltip{
      background:rgba(0,0,0,0.75);border:none;border-radius:10px;
      color:#fff;font-size:11px;font-weight:700;padding:3px 9px;
      white-space:nowrap;
    }
    .leaflet-tooltip::before{display:none}
    .leaflet-control-zoom{border:none!important}
    .leaflet-control-zoom a{
      width:30px!important;height:30px!important;line-height:30px!important;
      border-radius:7px!important;font-size:16px!important;
      box-shadow:0 1px 5px rgba(0,0,0,0.18)!important;border:none!important;
      margin-bottom:3px!important;
    }
    .leaflet-control-attribution{display:none}
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var projLat = ${projLat}, projLng = ${projLng};
  var map = L.map('map',{zoomControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  map.setView([projLat, projLng], 14);

  var projIcon = L.divIcon({className:'',html:'<div class="proj-icon"></div>',iconSize:[36,36],iconAnchor:[18,36]});
  var projMarker = L.marker([projLat,projLng],{icon:projIcon}).addTo(map)
    .bindTooltip('Project location',{permanent:true,direction:'top',offset:[0,-38]});

  var userMarker = null;
  var routeLine  = null;

  function setUser(lat, lng) {
    var youIcon = L.divIcon({className:'',html:'<div class="you-icon"></div>',iconSize:[30,30],iconAnchor:[15,15]});
    if (!userMarker) {
      userMarker = L.marker([lat,lng],{icon:youIcon}).addTo(map)
        .bindTooltip('You',{permanent:true,direction:'top',offset:[0,-18]});
    } else {
      userMarker.setLatLng([lat,lng]);
    }
    if (routeLine) { map.removeLayer(routeLine); }
    routeLine = L.polyline([[lat,lng],[projLat,projLng]], {
      color:'${C.PRIMARY}', weight:3, opacity:0.75, dashArray:'8,6'
    }).addTo(map);
    map.fitBounds([[lat,lng],[projLat,projLng]], {padding:[48,48]});
  }
</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const projectId: number = route.params?.projectId ?? 1;

  const webViewRef  = useRef<any>(null);
  const [project, setProject]   = useState<Project | null>(null);
  const [loading, setLoading]   = useState(true);
  const [applying, setApplying]       = useState(false);
  const [applied, setApplied]         = useState(false);
  const [flexBusy, setFlexBusy]       = useState(false);
  const [checkedIn, setCheckedIn]     = useState(false);
  const [eligibility, setEligibility] = useState<VolunteerEligibilityResult | null>(null);
  const currentUser = useAuthStore(s => s.user);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Load project
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get(projectId);
      if (res.data?.isSuccess) { setProject(res.data.data); }
    } catch {
      Alert.alert('Error', 'Could not load project details.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Fetch volunteer eligibility for RECURRING/FLEXIBLE once project loads
  useEffect(() => {
    if (!project || !currentUser) return;
    const isRF = project.scheduleType === 'RECURRING' || project.scheduleType === 'FLEXIBLE';
    if (!isRF || project.applicationStatusCode !== 'APPROVED') return;
    getVolunteerEligibility(project.projectId, currentUser.userId)
      .then(res => { if (res.data?.isSuccess) setEligibility(res.data.data ?? null); })
      .catch(() => {});
  }, [project, currentUser]);

  // Fetch user GPS
  useEffect(() => {
    const Geolocation = require('@react-native-community/geolocation').default;
    Geolocation.getCurrentPosition(
      (pos: any) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => { /* GPS unavailable — map shows project marker only */ },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, []);

  // Once both map and GPS are ready, inject user marker
  useEffect(() => {
    if (!mapReady || !userCoords) { return; }
    webViewRef.current?.injectJavaScript(
      `setUser(${userCoords.lat}, ${userCoords.lng}); true;`
    );
  }, [mapReady, userCoords]);

  const handleApply = useCallback(async () => {
    if (applied) { return; }
    setApplying(true);
    try {
      const res = await apply(projectId);
      if (res.data?.isSuccess) {
        setApplied(true);
        Alert.alert('Applied!', 'Your application has been submitted for review.');
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not apply.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setApplying(false);
    }
  }, [projectId, applied]);

  const handleFlexCheckIn = useCallback(async () => {
    setFlexBusy(true);
    try {
      const res = await flexCheckIn(projectId);
      if (res.data?.isSuccess) {
        setCheckedIn(true);
        Alert.alert('Checked In', res.data.message ?? 'You are now checked in for today\'s session.');
      } else {
        Alert.alert('Check-In Failed', res.data?.message ?? 'Could not check in.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setFlexBusy(false);
    }
  }, [projectId]);

  const handleFlexCheckOut = useCallback(async () => {
    setFlexBusy(true);
    try {
      const res = await flexCheckOut(projectId);
      if (res.data?.isSuccess) {
        setCheckedIn(false);
        const hours = res.data.data?.hoursLogged ?? 0;
        Alert.alert('Checked Out', `Session complete! You logged ${hours.toFixed(2)} hours.`);
      } else {
        Alert.alert('Check-Out Failed', res.data?.message ?? 'Could not check out.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setFlexBusy(false);
    }
  }, [projectId]);

  const openMaps = useCallback(() => {
    if (!project) { return; }
    const lat  = project.latitude;
    const lng  = project.longitude;
    const addr = encodeURIComponent(project.address ?? project.locationName ?? project.title ?? '');
    const url  = lat && lng
      ? Platform.OS === 'ios'
        ? `maps:?q=${addr}&ll=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${addr})`
      : `https://maps.google.com/?q=${addr}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${addr}`)
    );
  }, [project]);

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopBar onBack={() => nav.goBack()} />
        <View style={s.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopBar onBack={() => nav.goBack()} />
        <View style={s.centered}>
          <Text style={s.errorText}>Could not load project.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const catColor    = CAT_COLOR[project.categoryName ?? ''] ?? C.PRIMARY;
  const max         = project.maxParticipants ?? project.maxVolunteers ?? 0;
  const curr        = project.currentParticipants ?? project.approvedCount ?? 0;
  const spots       = project.spotsLeft ?? (max > 0 ? max - curr : null);
  const isFull      = spots !== null && spots <= 0 && max > 0;
  const pct         = max > 0 ? Math.min(Math.round((curr / max) * 100), 100) : 0;
  const spotColor   = isFull ? '#EF4444' : (spots !== null && spots <= 5 ? '#F59E0B' : C.TEAL);
  const isApproved  = project.applicationStatusCode === 'APPROVED';
  const isPending   = project.applicationStatusCode === 'PENDING';
  const hasMap      = !!(project.latitude && project.longitude);
  const distKm      = hasMap && userCoords
    ? haversineKm(userCoords.lat, userCoords.lng, project.latitude!, project.longitude!)
    : null;

  // Schedule display
  const schedLabel  = SCHED_LABEL[project.scheduleType ?? ''] ?? null;
  const dateRange   = project.startDate
    ? project.endDate && project.endDate !== project.startDate
      ? `${project.startDate} – ${project.endDate}`
      : project.startDate
    : (project.oneTimeDate ?? project.recurStart ?? project.flexFromDate ?? null);
  const timeRange   = project.startTime ?? project.sessionStartTime
    ? `${project.startTime ?? project.sessionStartTime}${(project.endTime ?? project.sessionEndTime) ? ` – ${project.endTime ?? project.sessionEndTime}` : ''}`
    : null;
  const days        = project.recurrenceDays ?? project.recurDays ?? null;
  const dur         = project.durationMinutes ? `${project.durationMinutes} min/session` : null;

  const address     = [project.address, project.locationName, project.city, project.state]
    .filter(Boolean).join(', ');

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopBar onBack={() => nav.goBack()} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── 1. Hero card ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.heroTopRow}>
            <View style={[s.catPill, { backgroundColor: `${catColor}18` }]}>
              <Text style={[s.catPillText, { color: catColor }]}>
                {project.categoryName ?? 'Project'}
              </Text>
            </View>
            {project.statusCode ? (
              <View style={[s.statusPill, { backgroundColor: `${C.TEAL}15` }]}>
                <Text style={[s.statusPillText, { color: C.TEAL }]}>
                  {project.statusCode}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={s.projTitle}>{project.title ?? project.projectName}</Text>
          {project.orgName ? (
            <TouchableOpacity
              onPress={() => nav.navigate('NgoProfile', { orgId: project.orgId })}
              accessibilityLabel={`View ${project.orgName} profile`}
            >
              <Text style={s.orgName}>🏢 {project.orgName}</Text>
            </TouchableOpacity>
          ) : null}
          {project.requiresApproval ? (
            <View style={s.approvalBadge}>
              <Text style={s.approvalText}>⚠️ Requires admin approval</Text>
            </View>
          ) : null}
        </View>

        {/* ── 2. Schedule card ─────────────────────────────────────────── */}
        {(schedLabel || dateRange || timeRange || days || dur) ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Schedule</Text>
            {schedLabel ? (
              <View style={[s.schedBadge, { backgroundColor: `${C.PRIMARY}12` }]}>
                <Text style={[s.schedBadgeText, { color: C.PRIMARY }]}>{schedLabel}</Text>
              </View>
            ) : null}
            <View style={s.infoList}>
              {days ? (
                <View style={s.infoRow}>
                  <Text style={s.infoIcon}>📆</Text>
                  <Text style={s.infoText}>{days}</Text>
                </View>
              ) : null}
              {dateRange ? (
                <View style={s.infoRow}>
                  <Text style={s.infoIcon}>🗓</Text>
                  <Text style={s.infoText}>{dateRange}</Text>
                </View>
              ) : null}
              {timeRange ? (
                <View style={s.infoRow}>
                  <Text style={s.infoIcon}>🕐</Text>
                  <Text style={s.infoText}>{timeRange}</Text>
                </View>
              ) : null}
              {dur ? (
                <View style={s.infoRow}>
                  <Text style={s.infoIcon}>⏱</Text>
                  <Text style={s.infoText}>{dur}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── 3. Location & Map card ────────────────────────────────────── */}
        {(hasMap || address) ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Location</Text>

            {address ? (
              <View style={s.infoRow}>
                <Text style={[s.infoIcon, { color: '#EF4444' }]}>📍</Text>
                <Text style={[s.infoText, { flex: 1 }]}>{address}</Text>
              </View>
            ) : null}

            {distKm !== null ? (
              <View style={s.distBadge}>
                <Text style={s.distBadgeText}>
                  📏 {fmtDist(distKm)} from your location
                </Text>
              </View>
            ) : null}

            {hasMap ? (
              <View style={s.mapContainer}>
                <WebView
                  ref={webViewRef}
                  source={{ html: buildMapHtml(project.latitude!, project.longitude!) }}
                  style={s.mapWebView}
                  scrollEnabled={false}
                  onLoadEnd={() => setMapReady(true)}
                  originWhitelist={['*']}
                  javaScriptEnabled
                />
              </View>
            ) : null}

            <TouchableOpacity style={s.directionsBtn} onPress={openMaps} accessibilityLabel="Get directions">
              <Text style={s.directionsBtnText}>🗺  Get Directions</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── 4. Capacity card ─────────────────────────────────────────── */}
        {max > 0 ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Capacity</Text>
            <View style={s.capacityRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.capacityMain}>
                  <Text style={{ fontWeight: '800', color: C.TEXT }}>{curr}</Text>
                  <Text style={{ color: C.TEXT2 }}> / {max} volunteers filled</Text>
                </Text>
                <View style={s.capBar}>
                  <View style={[s.capBarFill, { width: `${pct}%` as any, backgroundColor: spotColor }]} />
                </View>
              </View>
              <View style={[s.spotsBadge, { backgroundColor: `${spotColor}18` }]}>
                <Text style={[s.spotsBadgeText, { color: spotColor }]}>
                  {isFull ? 'Full' : `${spots} left`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── 5. Description card ───────────────────────────────────────── */}
        {project.description ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>About this project</Text>
            <Text style={s.description}>{project.description}</Text>
          </View>
        ) : null}

        {/* ── 6. Skills card ────────────────────────────────────────────── */}
        {project.skills?.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Skills needed</Text>
            <View style={s.tagRow}>
              {project.skills.map((sk, i) => (
                <View
                  key={i}
                  style={[s.skillTag, sk.isRequired && { borderColor: C.PRIMARY, borderWidth: 1 }]}
                >
                  <Text style={s.skillTagText}>{sk.skillName}</Text>
                  {sk.isRequired ? <Text style={[s.skillTagReq, { color: C.PRIMARY }]}> *</Text> : null}
                </View>
              ))}
            </View>
            <Text style={s.skillNote}>* Required skills</Text>
          </View>
        ) : null}

        {/* ── 7. My Progress card — RECURRING/FLEXIBLE approved volunteers ── */}
        {isApproved && eligibility && (
          project.scheduleType === 'RECURRING' || project.scheduleType === 'FLEXIBLE'
        ) ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>My Progress</Text>

            {/* Eligibility badge */}
            <View style={[s.eligBadge,
              { backgroundColor: eligibility.isEligibleForCert ? '#D1FAE5' : '#FEF3C7' }]}>
              <Text style={[s.eligBadgeText,
                { color: eligibility.isEligibleForCert ? '#059669' : '#D97706' }]}>
                {eligibility.isEligibleForCert
                  ? '✅  Eligible for certificate'
                  : '⏳  Keep going — not yet eligible'}
              </Text>
            </View>

            {/* RECURRING — sessions progress */}
            {project.scheduleType === 'RECURRING' && eligibility.eligibleSessions > 0 && (
              <>
                <View style={s.progressLabelRow}>
                  <Text style={s.progressLabel}>Sessions attended</Text>
                  <Text style={s.progressValue}>
                    {eligibility.attendedCount} / {eligibility.eligibleSessions}
                  </Text>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, {
                    width: `${Math.min(
                      (eligibility.attendedCount / eligibility.eligibleSessions) * 100, 100,
                    )}%` as any,
                    backgroundColor: '#2563EB',
                  }]} />
                </View>
                {eligibility.minAttendPct != null && (
                  <Text style={s.progressHint}>
                    {eligibility.attendancePct?.toFixed(0) ?? 0}% attendance
                    {`  (need ${eligibility.minAttendPct}%)`}
                  </Text>
                )}
              </>
            )}

            {/* FLEXIBLE — hours progress */}
            {project.scheduleType === 'FLEXIBLE' && (
              <View style={s.progressLabelRow}>
                <Text style={s.progressLabel}>Hours logged</Text>
                <Text style={s.progressValue}>
                  {(eligibility.totalHoursLogged ?? 0).toFixed(1)} hrs
                </Text>
              </View>
            )}

            <View style={[s.progressLabelRow, { marginTop: 6 }]}>
              <Text style={s.progressLabel}>Total sessions</Text>
              <Text style={s.progressValue}>{eligibility.totalSessions}</Text>
            </View>
          </View>
        ) : null}

      </ScrollView>

      {/* ── Sticky footer ─────────────────────────────────────────────────── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {/* FLEXIBLE + APPROVED + ACTIVE → show Check-In / Check-Out */}
        {isApproved && project.scheduleType === 'FLEXIBLE' && project.statusCode === 'ACTIVE' ? (
          checkedIn ? (
            <TouchableOpacity
              style={[s.footerBtn, { backgroundColor: '#EF4444' }]}
              onPress={handleFlexCheckOut}
              disabled={flexBusy}
            >
              {flexBusy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.footerBtnText}>🔴 Check Out</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.footerBtn, { backgroundColor: C.TEAL }]}
              onPress={handleFlexCheckIn}
              disabled={flexBusy}
            >
              {flexBusy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.footerBtnText}>🟢 Check In for Today</Text>
              }
            </TouchableOpacity>
          )
        ) : isApproved ? (
          <View style={[s.footerBtn, { backgroundColor: C.TEAL }]}>
            <Text style={s.footerBtnText}>✓ Already Approved</Text>
          </View>
        ) : isPending ? (
          <View style={[s.footerBtn, { backgroundColor: '#F59E0B' }]}>
            <Text style={s.footerBtnText}>⏳ Application Pending</Text>
          </View>
        ) : applied ? (
          <View style={[s.footerBtn, { backgroundColor: C.TEAL }]}>
            <Text style={s.footerBtnText}>✓ Application Submitted</Text>
          </View>
        ) : isFull ? (
          <View style={[s.footerBtn, { backgroundColor: C.BORDER }]}>
            <Text style={[s.footerBtnText, { color: C.TEXT2 }]}>No Spots Available</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={s.footerBtn}
            onPress={handleApply}
            disabled={applying}
            accessibilityLabel="Apply for project"
          >
            {applying
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.footerBtnText}>Apply for Selected Sessions</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Small sub-component ───────────────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.topBar}>
      <TouchableOpacity onPress={onBack} accessibilityLabel="Go back">
        <Text style={s.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={s.topBarTitle}>Project Details</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.BG },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:      { color: C.PRIMARY, fontSize: 16, fontWeight: '600' },
  topBarTitle:   { fontSize: 16, fontWeight: '700', color: C.TEXT },
  errorText:     { fontSize: 15, color: C.TEXT2, fontWeight: '600', marginBottom: 12 },
  retryBtn:      { backgroundColor: C.PRIMARY, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText:     { color: '#fff', fontWeight: '700' },

  // Cards
  card:          { margin: 12, marginBottom: 0, backgroundColor: C.CARD, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle:     { fontSize: 13, fontWeight: '700', color: C.TEXT2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },

  // Hero
  heroTopRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catPill:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catPillText:   { fontSize: 11, fontWeight: '700' },
  statusPill:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText:{ fontSize: 11, fontWeight: '700' },
  projTitle:     { fontSize: 20, fontWeight: '800', color: C.TEXT, lineHeight: 26, marginBottom: 5 },
  orgName:       { fontSize: 13, color: C.PRIMARY, fontWeight: '600', marginBottom: 6 },
  approvalBadge: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 4 },
  approvalText:  { fontSize: 12, color: '#92400E', fontWeight: '600' },

  // Schedule
  schedBadge:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 10 },
  schedBadgeText:{ fontSize: 12, fontWeight: '700' },

  // Info rows
  infoList:      { gap: 8 },
  infoRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoIcon:      { fontSize: 14, width: 22, color: C.PRIMARY },
  infoText:      { flex: 1, fontSize: 13, color: C.TEXT, lineHeight: 18 },

  // Location
  distBadge:     { backgroundColor: `${C.PRIMARY}10`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8, marginBottom: 10 },
  distBadgeText: { fontSize: 12, fontWeight: '600', color: C.PRIMARY },
  mapContainer:  { height: 220, borderRadius: 12, overflow: 'hidden', marginTop: 4, marginBottom: 10 },
  mapWebView:    { flex: 1 },
  directionsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: `${C.PRIMARY}12`, borderRadius: 10, paddingVertical: 10, marginTop: 2 },
  directionsBtnText: { fontSize: 13, fontWeight: '700', color: C.PRIMARY },

  // Capacity
  capacityRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  capacityMain:  { fontSize: 13, color: C.TEXT, marginBottom: 7 },
  capBar:        { height: 6, backgroundColor: C.BG, borderRadius: 3, overflow: 'hidden' },
  capBarFill:    { height: '100%' as any, borderRadius: 3 },
  spotsBadge:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignItems: 'center' },
  spotsBadgeText:{ fontSize: 13, fontWeight: '800' },

  // Description
  description:   { fontSize: 14, color: C.TEXT, lineHeight: 21 },

  // Skills
  tagRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 6 },
  skillTag:      { backgroundColor: `${C.PRIMARY}12`, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, flexDirection: 'row' },
  skillTagText:  { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },
  skillTagReq:   { fontSize: 12, fontWeight: '700' },
  skillNote:     { fontSize: 11, color: C.TEXT3, marginTop: 2 },

  // Progress section
  eligBadge:       { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', marginBottom: 12 },
  eligBadgeText:   { fontSize: 12, fontWeight: '700' },
  progressLabelRow:{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel:   { fontSize: 12, color: C.TEXT2 },
  progressValue:   { fontSize: 12, fontWeight: '700', color: C.TEXT },
  progressTrack:   { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill:    { height: 6, borderRadius: 3 },
  progressHint:    { fontSize: 11, color: C.TEXT2, marginBottom: 6 },

  // Footer
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER, paddingHorizontal: 14, paddingTop: 12 },
  footerBtn:     { backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  footerBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
