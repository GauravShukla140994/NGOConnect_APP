/**
 * ProjectDetailScreen — rich project detail with OSM map
 * Route: 'ProjectDetail' (AppNavigator)
 *
 * Sections:
 *  1. Hero card  — title, org, category pill, status, approval flag
 *  2. Schedule   — type badge, days, date range, time, duration
 *  3. Location   — address, distance badge, 220px OSM map (user → project), directions
 *  4. Capacity   — filled / total, progress bar, spots badge
 *  5. Description
 *  6. Skills
 *  7. Sticky footer (safe-area aware — clears Android nav buttons)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import AppConfig from '../../config/AppConfig';
import { get, apply } from '../../api/project.api';
import type { Project } from '../../types/api.types';
import { fmtDate, fmtDateRange, fmtTime, fmtTimeRange, isProjectExpired } from '../../utils/dateUtils';

const C = AppConfig.COLORS;

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const SCHED_LABEL: Record<string, string> = {
  ONE_TIME: '📅 One-Time Event',
  RECURRING: '🔄 Recurring',
  FLEXIBLE: '📆 Flexible / Open',
};

const CAT_COLOR: Record<string, string> = {
  Community: C.TEAL,
  Environment: '#16A34A',
  Education: C.PRIMARY,
  Healthcare: '#F59E0B',
  'Animal Welfare': '#8B5CF6',
  Sports: '#EF4444',
  Arts: '#EC4899',
};

// ── OSM/Leaflet map HTML (no API key) ─────────────────────────────────────────
// Project pin shown immediately; user dot + dashed line injected once GPS resolves.

function buildMapHtml(projLat: number, projLng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%}
    .proj-pin{width:28px;height:28px;background:#EF4444;border:3px solid #fff;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.28)}
    .you-dot{width:24px;height:24px;background:${C.PRIMARY};border:3px solid #fff;
      border-radius:50%;box-shadow:0 0 0 5px ${C.PRIMARY}40}
    .leaflet-tooltip{background:rgba(0,0,0,0.72);border:none;border-radius:10px;
      color:#fff;font-size:11px;font-weight:700;padding:3px 8px;white-space:nowrap}
    .leaflet-tooltip::before{display:none}
    .leaflet-control-zoom{border:none!important}
    .leaflet-control-zoom a{width:28px!important;height:28px!important;
      line-height:28px!important;border-radius:6px!important;font-size:15px!important;
      box-shadow:0 1px 5px rgba(0,0,0,0.18)!important;border:none!important;margin-bottom:3px!important}
    .leaflet-control-attribution{display:none}
  </style>
</head>
<body><div id="map"></div>
<script>
  var pLat=${projLat},pLng=${projLng};
  var map=L.map('map',{zoomControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  map.setView([pLat,pLng],14);
  var pIcon=L.divIcon({className:'',html:'<div class="proj-pin"></div>',iconSize:[28,28],iconAnchor:[14,28]});
  L.marker([pLat,pLng],{icon:pIcon}).addTo(map)
    .bindTooltip('Project',{permanent:true,direction:'top',offset:[0,-30]});
  var uMarker=null,uLine=null;
  function setUser(lat,lng){
    var uIcon=L.divIcon({className:'',html:'<div class="you-dot"></div>',iconSize:[24,24],iconAnchor:[12,12]});
    if(!uMarker){uMarker=L.marker([lat,lng],{icon:uIcon}).addTo(map)
      .bindTooltip('You',{permanent:true,direction:'top',offset:[0,-16]});}
    else{uMarker.setLatLng([lat,lng]);}
    if(uLine){map.removeLayer(uLine);}
    uLine=L.polyline([[lat,lng],[pLat,pLng]],
      {color:'${C.PRIMARY}',weight:3,opacity:0.7,dashArray:'8,6'}).addTo(map);
    map.fitBounds([[lat,lng],[pLat,pLng]],{padding:[44,44]});
  }
</script>
</body></html>`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const insets    = useSafeAreaInsets();
  const nav       = useNavigation<any>();
  const route     = useRoute<any>();
  const projectId: number = route.params?.projectId ?? 1;

  const webRef = useRef<any>(null);
  const [project,    setProject]    = useState<Project | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [applying,   setApplying]   = useState(false);
  const [applied,    setApplied]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapReady,   setMapReady]   = useState(false);

  // Load project data — called on mount AND on every focus return
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get(projectId);
      if (res.data?.isSuccess) {
        setProject(res.data.data);
        setApplied(false); // server data now reflects true application state
      }
    } catch {
      Alert.alert('Error', 'Could not load project details.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Pull-to-refresh: silent reload — no full-page spinner, only the pull indicator
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await get(projectId);
      if (res.data?.isSuccess) { setProject(res.data.data); setApplied(false); }
    } catch { /* silent on pull-to-refresh failure */ }
    finally { setRefreshing(false); }
  }, [projectId]);

  // Re-fetch every time the screen comes into focus (catches changes from child screens)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Fetch user GPS once
  useEffect(() => {
    const Geo = require('@react-native-community/geolocation').default;
    Geo.getCurrentPosition(
      (pos: any) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* GPS unavailable — map shows project pin only */ },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, []);

  // Inject user marker once map + GPS are both ready
  useEffect(() => {
    if (!mapReady || !userCoords) { return; }
    webRef.current?.injectJavaScript(`setUser(${userCoords.lat},${userCoords.lng});true;`);
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

  const openDirections = useCallback(() => {
    if (!project) { return; }
    const lat  = project.latitude;
    const lng  = project.longitude;
    const addr = encodeURIComponent(
      [project.address, project.locationName, project.city].filter(Boolean).join(', ') || project.title || ''
    );
    const url = lat && lng
      ? Platform.OS === 'ios'
        ? `maps:?q=${addr}&ll=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${addr})`
      : `https://maps.google.com/?q=${addr}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${addr}`));
  }, [project]);

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <TopBar onBack={() => nav.goBack()} />
        <View style={s.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <TopBar onBack={() => nav.goBack()} />
        <View style={s.centered}>
          <Text style={s.errText}>Could not load project.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const catColor   = CAT_COLOR[project.categoryName ?? ''] ?? C.PRIMARY;
  const max        = project.maxParticipants ?? project.maxVolunteers ?? 0;
  const curr       = project.currentParticipants ?? project.approvedCount ?? 0;
  const spots      = project.spotsLeft ?? (max > 0 ? max - curr : null);
  const isFull     = spots !== null && spots <= 0 && max > 0;
  const pct        = max > 0 ? Math.min(Math.round((curr / max) * 100), 100) : 0;
  const spotColor  = isFull ? '#EF4444' : (spots !== null && spots <= 5 ? '#F59E0B' : C.TEAL);
  const isApproved  = project.applicationStatusCode === 'APPROVED';
  const isPending   = project.applicationStatusCode === 'PENDING';
  const isWithdrawn = project.applicationStatusCode === 'WITHDRAWN';
  // Projects reached via Explore > NGO profile > Projects/Volunteer tabs include
  // past/inactive ones (history), but applying only makes sense on a live project.
  const isClosed   = ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(project.statusCode ?? '')
    || isProjectExpired(project as any);

  const hasMap = !!(project.latitude && project.longitude);
  const distKm = hasMap && userCoords
    ? haversineKm(userCoords.lat, userCoords.lng, project.latitude!, project.longitude!)
    : null;

  const schedLabel = SCHED_LABEL[project.scheduleType ?? ''] ?? null;
  const days       = project.recurrenceDays ?? project.recurDays ?? null;
  const dateRange  = (() => {
    const s = project.startDate ?? project.oneTimeDate ?? project.recurStart ?? project.flexFromDate;
    const e = project.endDate ?? project.recurEnd ?? project.flexToDate;
    if (!s) { return null; }
    return e && e !== s ? fmtDateRange(s, e) : fmtDate(s);
  })();
  const timeRange = (() => {
    const st = project.startTime ?? project.sessionStartTime;
    const en = project.endTime ?? project.sessionEndTime;
    return st ? fmtTimeRange(st, en) : null;
  })();
  const dur     = project.durationMinutes ? `${project.durationMinutes} min/session` : null;
  const address = [project.address, project.locationName, project.city, project.state]
    .filter(Boolean).join(', ');

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <TopBar onBack={() => nav.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[C.PRIMARY]}
            tintColor={C.PRIMARY}
          />
        }
      >
        {/* 1 ── Hero ──────────────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.heroTop}>
            <View style={[s.pill, { backgroundColor: `${catColor}18` }]}>
              <Text style={[s.pillText, { color: catColor }]}>{project.categoryName ?? 'Project'}</Text>
            </View>
            {project.statusCode ? (
              <View style={[s.pill, { backgroundColor: `${C.TEAL}15` }]}>
                <Text style={[s.pillText, { color: C.TEAL }]}>{project.statusCode}</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.title}>{project.title ?? project.projectName}</Text>
          {project.orgName ? (
            <TouchableOpacity onPress={() => nav.navigate('NgoProfile', { orgId: project.orgId })}>
              <Text style={s.orgName}>🏢 {project.orgName}</Text>
            </TouchableOpacity>
          ) : null}
          {project.requiresApproval ? (
            <View style={s.approvalBadge}>
              <Text style={s.approvalText}>⚠️ Requires admin approval after applying</Text>
            </View>
          ) : null}
        </View>

        {/* 2 ── Schedule ──────────────────────────────────────────────────── */}
        {(schedLabel || days || dateRange || timeRange || dur) ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>SCHEDULE</Text>
            {schedLabel ? (
              <View style={[s.schedBadge, { backgroundColor: `${C.PRIMARY}12` }]}>
                <Text style={[s.schedBadgeText, { color: C.PRIMARY }]}>{schedLabel}</Text>
              </View>
            ) : null}
            <View style={s.infoList}>
              {days      ? <InfoRow icon="📆" text={days} />      : null}
              {dateRange ? <InfoRow icon="🗓" text={dateRange} /> : null}
              {timeRange ? <InfoRow icon="🕐" text={timeRange} /> : null}
              {dur       ? <InfoRow icon="⏱" text={dur} />       : null}
            </View>
          </View>
        ) : null}

        {/* 3 ── Location & Map ────────────────────────────────────────────── */}
        {(hasMap || address) ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>LOCATION</Text>
            {address ? <InfoRow icon="📍" text={address} iconColor="#EF4444" /> : null}

            {distKm !== null ? (
              <View style={s.distBadge}>
                <Text style={s.distText}>📏 {fmtDist(distKm)} from your current location</Text>
              </View>
            ) : null}

            {hasMap ? (
              <View style={s.mapBox}>
                <WebView
                  ref={webRef}
                  source={{ html: buildMapHtml(project.latitude!, project.longitude!) }}
                  style={{ flex: 1 }}
                  scrollEnabled={false}
                  javaScriptEnabled
                  originWhitelist={['*']}
                  onLoadEnd={() => setMapReady(true)}
                />
              </View>
            ) : null}

            <TouchableOpacity style={s.dirBtn} onPress={openDirections}>
              <Text style={s.dirBtnText}>🗺  Get Directions</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 4 ── Capacity ──────────────────────────────────────────────────── */}
        {max > 0 ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>CAPACITY</Text>
            <View style={s.capacityRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.capacityText}>
                  <Text style={{ fontWeight: '800', color: C.TEXT }}>{curr}</Text>
                  <Text style={{ color: C.TEXT2 }}> / {max} volunteers filled</Text>
                </Text>
                <View style={s.capTrack}>
                  <View style={[s.capFill, { width: `${pct}%` as any, backgroundColor: spotColor }]} />
                </View>
              </View>
              <View style={[s.spotBadge, { backgroundColor: `${spotColor}18` }]}>
                <Text style={[s.spotBadgeText, { color: spotColor }]}>
                  {isFull ? 'Full' : `${spots} left`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* 5 ── Description ───────────────────────────────────────────────── */}
        {project.description ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>ABOUT THIS PROJECT</Text>
            <Text style={s.description}>{project.description}</Text>
          </View>
        ) : null}

        {/* 6 ── Skills ────────────────────────────────────────────────────── */}
        {project.skills?.length ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>SKILLS NEEDED</Text>
            <View style={s.tagRow}>
              {project.skills.map((sk, i) => (
                <View key={i} style={[s.skillTag, sk.isRequired && { borderColor: C.PRIMARY, borderWidth: 1 }]}>
                  <Text style={s.skillTagText}>
                    {sk.skillName}{sk.isRequired ? ' *' : ''}
                  </Text>
                </View>
              ))}
            </View>
            {project.skills.some(sk => sk.isRequired) && (
              <Text style={s.skillNote}>* Required skill</Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Sticky footer — paddingBottom clears Android nav buttons ──────── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {isApproved ? (
          <View style={[s.footerBtn, { backgroundColor: C.TEAL }]}>
            <Text style={s.footerBtnText}>✓ Already Approved</Text>
          </View>
        ) : isPending ? (
          <View style={[s.footerBtn, { backgroundColor: '#F59E0B' }]}>
            <Text style={s.footerBtnText}>⏳ Application Pending</Text>
          </View>
        ) : isWithdrawn ? (
          <View style={[s.footerBtn, { backgroundColor: C.BORDER }]}>
            <Text style={[s.footerBtnText, { color: C.TEXT2 }]}>Removed from Project</Text>
          </View>
        ) : applied ? (
          <View style={[s.footerBtn, { backgroundColor: C.TEAL }]}>
            <Text style={s.footerBtnText}>✓ Application Submitted</Text>
          </View>
        ) : isClosed ? (
          <View style={[s.footerBtn, { backgroundColor: C.BORDER }]}>
            <Text style={[s.footerBtnText, { color: C.TEXT2 }]}>Applications Closed</Text>
          </View>
        ) : isFull ? (
          <View style={[s.footerBtn, { backgroundColor: C.BORDER }]}>
            <Text style={[s.footerBtnText, { color: C.TEXT2 }]}>No Spots Available</Text>
          </View>
        ) : (
          <TouchableOpacity style={s.footerBtn} onPress={handleApply} disabled={applying}>
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

// ── Sub-components ────────────────────────────────────────────────────────────

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

function InfoRow({ icon, text, iconColor }: { icon: string; text: string; iconColor?: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={[s.infoIcon, iconColor ? { color: iconColor } : null]}>{icon}</Text>
      <Text style={s.infoText}>{text}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: C.BG },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:      { color: C.PRIMARY, fontSize: 16, fontWeight: '600' },
  topBarTitle:   { fontSize: 16, fontWeight: '700', color: C.TEXT },
  errText:       { fontSize: 15, color: C.TEXT2, fontWeight: '600', marginBottom: 12 },
  retryBtn:      { backgroundColor: C.PRIMARY, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText:     { color: '#fff', fontWeight: '700' },

  // Cards
  card:          { marginHorizontal: 12, marginBottom: 12, backgroundColor: C.CARD, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: C.TEXT3, letterSpacing: 0.8, marginBottom: 10 },

  // Hero
  heroTop:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText:      { fontSize: 11, fontWeight: '700' },
  title:         { fontSize: 20, fontWeight: '800', color: C.TEXT, lineHeight: 27, marginBottom: 5 },
  orgName:       { fontSize: 13, color: C.PRIMARY, fontWeight: '600', marginBottom: 5 },
  approvalBadge: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 4 },
  approvalText:  { fontSize: 12, color: '#92400E', fontWeight: '600' },

  // Schedule
  schedBadge:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 10 },
  schedBadgeText:{ fontSize: 12, fontWeight: '700' },

  // Info rows
  infoList:      { gap: 9 },
  infoRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoIcon:      { fontSize: 14, width: 22, color: C.PRIMARY },
  infoText:      { flex: 1, fontSize: 13, color: C.TEXT, lineHeight: 18 },

  // Location
  distBadge:     { backgroundColor: `${C.PRIMARY}10`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginVertical: 8 },
  distText:      { fontSize: 12, fontWeight: '600', color: C.PRIMARY },
  mapBox:        { height: 220, borderRadius: 12, overflow: 'hidden', marginTop: 4, marginBottom: 10 },
  dirBtn:        { backgroundColor: `${C.PRIMARY}12`, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 2 },
  dirBtnText:    { fontSize: 13, fontWeight: '700', color: C.PRIMARY },

  // Capacity
  capacityRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  capacityText:  { fontSize: 13, marginBottom: 7 },
  capTrack:      { height: 6, backgroundColor: C.BG, borderRadius: 3, overflow: 'hidden' },
  capFill:       { height: '100%' as any, borderRadius: 3 },
  spotBadge:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignItems: 'center' },
  spotBadgeText: { fontSize: 13, fontWeight: '800' },

  // Description
  description:   { fontSize: 14, color: C.TEXT, lineHeight: 21 },

  // Skills
  tagRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 6 },
  skillTag:      { backgroundColor: `${C.PRIMARY}12`, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  skillTagText:  { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },
  skillNote:     { fontSize: 11, color: C.TEXT3 },

  // Footer — position absolute + insets.bottom clears Android nav bar
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER },
  footerBtn:     { backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  footerBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
