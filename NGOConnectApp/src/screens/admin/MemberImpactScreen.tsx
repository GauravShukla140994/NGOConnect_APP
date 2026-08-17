/**
 * MemberImpactScreen — Admin view of a single volunteer's impact on a project.
 *
 * Nav params: { projectId, userId, orgId, volunteerName, projectName, scheduleTypeCode }
 * Called from ParticipantsScreen (per-volunteer "View Impact" link).
 *
 * Shows:
 *   • Eligibility summary card (attendedCount / eligibleSessions, hours, isEligibleForCert)
 *   • Full session history list (date, status chip, hours logged, admin note)
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { projectApi } from '../../api/project.api';
import type { VolunteerEligibilityResult, SessionListItem } from '../../api/project.api';

const C = AppConfig.COLORS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime12(t?: string | null): string {
  if (!t) return '';
  const d = new Date(t);
  if (!isNaN(d.getTime()))
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const parts = t.split(':').map(Number);
  const h = parts[0]; const m = parts[1];
  if (isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const ATT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ATTENDED:   { label: 'Attended',  color: '#059669', bg: '#D1FAE5' },
  NO_SHOW:    { label: 'No show',   color: '#DC2626', bg: '#FEE2E2' },
  OPTED_OUT:  { label: 'Opted out', color: '#D97706', bg: '#FEF3C7' },
  OPT_OUT:    { label: 'Opted out', color: '#D97706', bg: '#FEF3C7' },
  EXCUSED:    { label: 'Excused',   color: '#6B7280', bg: '#F3F4F6' },
  CHECKED_IN: { label: 'Active ✓', color: '#2563EB', bg: '#EFF6FF' },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MemberImpactScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const {
    projectId,
    userId,
    volunteerName,
    projectName,
    scheduleTypeCode,
  } = route.params ?? {};

  const [loading,     setLoading]     = useState(true);
  const [eligibility, setEligibility] = useState<VolunteerEligibilityResult | null>(null);
  const [sessions,    setSessions]    = useState<SessionListItem[]>([]);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !userId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      projectApi.getVolunteerEligibility(projectId, userId),
      projectApi.getMySessionList(projectId, userId),
    ])
      .then(([eligRes, sessRes]) => {
        if (eligRes.data?.isSuccess)  setEligibility(eligRes.data.data ?? null);
        if (sessRes.data?.isSuccess)  setSessions(sessRes.data.data ?? []);
      })
      .catch(() => setError('Failed to load volunteer data.'))
      .finally(() => setLoading(false));
  }, [projectId, userId]);

  const isRecurring = scheduleTypeCode === 'RECURRING';
  const isFlexible  = scheduleTypeCode === 'FLEXIBLE';

  // eligibility progress helpers
  const attendPct = eligibility && eligibility.eligibleSessions > 0
    ? Math.min((eligibility.attendedCount / eligibility.eligibleSessions) * 100, 100)
    : 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{volunteerName ?? 'Volunteer Impact'}</Text>
          {!!projectName && <Text style={s.headerSub} numberOfLines={1}>{projectName}</Text>}
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>

          {/* ── Eligibility card ──────────────────────────────────────────── */}
          {eligibility ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Eligibility Summary</Text>

              {/* Eligible / Not Eligible badge */}
              <View style={[s.eligBadge,
                { backgroundColor: eligibility.isEligibleForCert ? '#D1FAE5' : '#FEE2E2' }]}>
                <Text style={[s.eligBadgeText,
                  { color: eligibility.isEligibleForCert ? '#059669' : '#DC2626' }]}>
                  {eligibility.isEligibleForCert ? '✅  Eligible for Certificate' : '❌  Not Yet Eligible'}
                </Text>
              </View>

              {/* RECURRING stats */}
              {isRecurring && (
                <>
                  <View style={s.statRow}>
                    <Text style={s.statLabel}>Sessions attended</Text>
                    <Text style={s.statValue}>
                      {eligibility.attendedCount} / {eligibility.eligibleSessions}
                    </Text>
                  </View>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, {
                      width: `${attendPct}%` as any,
                      backgroundColor: '#2563EB',
                    }]} />
                  </View>
                  <Text style={s.statHint}>
                    Attendance rate: {eligibility.attendancePct?.toFixed(0) ?? 0}%
                    {eligibility.minAttendPct != null
                      ? `  (min ${eligibility.minAttendPct}% required)` : ''}
                  </Text>
                </>
              )}

              {/* FLEXIBLE stats */}
              {isFlexible && (
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Total hours logged</Text>
                  <Text style={s.statValue}>{(eligibility.totalHoursLogged ?? 0).toFixed(1)} hrs</Text>
                </View>
              )}

              {/* Common */}
              <View style={[s.statRow, { marginTop: 6 }]}>
                <Text style={s.statLabel}>Total sessions recorded</Text>
                <Text style={s.statValue}>{eligibility.totalSessions}</Text>
              </View>
            </View>
          ) : (
            <View style={s.card}>
              <Text style={s.cardTitle}>Eligibility Summary</Text>
              <Text style={s.emptyText}>No eligibility data available.</Text>
            </View>
          )}

          {/* ── Session history ───────────────────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Session History {sessions.length > 0 ? `(${sessions.length})` : ''}</Text>

            {sessions.length === 0 ? (
              <Text style={s.emptyText}>No sessions recorded yet.</Text>
            ) : sessions.map((sess, i) => {
              // Determine display status — attendance > opt-out > session status
              const attCode = sess.attendanceStatus ?? (sess.optOutType ? 'OPTED_OUT' : null);
              const cfg     = attCode ? (ATT_CFG[attCode] ?? {
                label: sess.attendanceStatusName ?? attCode,
                color: '#6B7280',
                bg: '#F3F4F6',
              }) : null;

              return (
                <View key={sess.sessionId} style={[s.sessionRow, i > 0 && s.sessionRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sessDate}>{fmtDate(sess.sessionDate)}</Text>
                    {(sess.startTime || sess.endTime) && (
                      <Text style={s.sessTime}>
                        {fmtTime12(sess.startTime)}
                        {sess.endTime ? ` – ${fmtTime12(sess.endTime)}` : ''}
                      </Text>
                    )}
                    {sess.hoursLogged != null && (
                      <Text style={s.sessHours}>{sess.hoursLogged.toFixed(1)} hrs</Text>
                    )}
                    {!!sess.adminNote && (
                      <Text style={s.sessNote}>📝 {sess.adminNote}</Text>
                    )}
                    {sess.isNoShowExcused && (
                      <Text style={[s.sessNote, { color: '#6B7280' }]}>Excused by admin</Text>
                    )}
                  </View>
                  {cfg && (
                    <View style={[s.statusChip, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.statusChipText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.BG },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:          {},
  backBtnText:      { fontSize: 15, color: C.PRIMARY },
  headerTitle:      { fontSize: 16, fontWeight: '700', color: C.TEXT },
  headerSub:        { fontSize: 12, color: C.TEXT2, marginTop: 1 },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:        { color: '#DC2626', fontSize: 14, textAlign: 'center' },
  scroll:           { padding: 16, gap: 12 },
  card:             { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.BORDER },
  cardTitle:        { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 12 },
  eligBadge:        { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', marginBottom: 14 },
  eligBadgeText:    { fontSize: 13, fontWeight: '700' },
  statRow:          { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  statLabel:        { fontSize: 13, color: C.TEXT2 },
  statValue:        { fontSize: 13, fontWeight: '700', color: C.TEXT },
  statHint:         { fontSize: 11, color: C.TEXT2, marginBottom: 6 },
  progressTrack:    { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressFill:     { height: 8, borderRadius: 4 },
  sessionRow:       { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionRowBorder: { borderTopWidth: 1, borderTopColor: C.BORDER },
  sessDate:         { fontSize: 13, fontWeight: '600', color: C.TEXT },
  sessTime:         { fontSize: 11, color: C.TEXT2, marginTop: 2 },
  sessHours:        { fontSize: 11, color: '#059669', fontWeight: '600', marginTop: 2 },
  sessNote:         { fontSize: 11, color: '#D97706', marginTop: 2 },
  statusChip:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusChipText:   { fontSize: 11, fontWeight: '600' },
  emptyText:        { fontSize: 13, color: C.TEXT2 },
});
