import React, { useCallback, useEffect, useState } from 'react';
import { fmtDate as _fmtDate, fmtTime as _fmtTime } from '../../utils/dateUtils';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { projectApi } from '../../api/project.api';
import { UserAvatar } from '../../components/ui';

const C = AppConfig.COLORS;

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(code?: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    ACTIVE:    { label: 'Active',    bg: '#ECFDF5', color: '#16A34A' },
    UPCOMING:  { label: 'Upcoming',  bg: '#EFF6FF', color: '#2563EB' },
    COMPLETED: { label: 'Completed', bg: '#F3F4F6', color: '#6B7280' },
    CANCELLED: { label: 'Cancelled', bg: '#FEF2F2', color: '#EF4444' },
  };
  return map[(code ?? '').toUpperCase()] ?? { label: code ?? '', bg: '#F3F4F6', color: '#6B7280' };
}

function fmtSchedule(p: any): string {
  const type = (p.scheduleType ?? p.projectTypeCode ?? '').toUpperCase();
  if (type === 'RECURRING' && p.recurDays) {
    const days = String(p.recurDays).split(',').map((d: string) => d.trim().slice(0, 3)).join(' & ');
    const range = p.recurStart ? ` · ${p.recurStart}${p.recurEnd ? ` – ${p.recurEnd}` : ''}` : '';
    return `Recurring · ${days}${range}`;
  }
  if (type === 'ONE_TIME' && p.oneTimeDate) return `One-time · ${p.oneTimeDate}`;
  if (type === 'FLEXIBLE') return `Flexible${p.flexFromDate ? ` · ${p.flexFromDate}${p.flexToDate ? ` – ${p.flexToDate}` : ''}` : ''}`;
  return p.scheduleType ?? '';
}

function buildTimeRange(p: any): string | null {
  const st = p.sessionStartTime ?? p.startTime;
  const et = p.sessionEndTime   ?? p.endTime;
  if (!st) return null;
  return et ? `${_fmtTime(st)} – ${_fmtTime(et)}` : _fmtTime(st);
}

function locationTypeIcon(code?: string): string {
  if (!code) return '📍';
  const c = code.toUpperCase();
  if (c === 'REMOTE') return '💻';
  if (c === 'HYBRID') return '🔀';
  return '🏢';
}

function joinTypeText(code?: string): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'OPEN_SIGNUP') return 'Open signup — anyone can join';
  if (c === 'APPROVE_REQ') return 'Requires approval';
  return null;
}

// ── QR time-window helper ─────────────────────────────────────────────────────

const QR_BUFFER_MINUTES = 15; // must match Settings.QR_BUFFER_MINUTES

type QrWindowState = 'active' | 'too_early' | 'future' | 'ended' | 'no_session';

function getQrWindowState(session: any | null, todayStr: string): {
  state: QrWindowState;
  startStr?: string;      // formatted session start time
  endStr?: string;        // formatted session end time  (for ended)
  openStr?: string;       // formatted QR window open   (for too_early / future)
  sessionDateStr?: string; // formatted session date     (for future)
} {
  if (!session) return { state: 'no_session' };

  const startRaw    = (session.startTime ?? session.sessionStartTime ?? '').slice(0, 5);
  const endRaw      = (session.endTime   ?? session.sessionEndTime   ?? '').slice(0, 5);
  const sessionDate = (session.sessionDate ?? '').slice(0, 10); // 'YYYY-MM-DD'

  // No time data → treat as active (safe fallback)
  if (!startRaw || !endRaw) return { state: 'active' };

  // Use the session's own date (not today) to build the real wall-clock window
  const winStart = new Date(`${sessionDate}T${startRaw}`);
  const winEnd   = new Date(`${sessionDate}T${endRaw}`);
  const buffered = new Date(winStart.getTime() - QR_BUFFER_MINUTES * 60_000);
  const now      = new Date();

  const toTimeStr = (d: Date) =>
    _fmtTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
  const toDateStr = (d: Date) => _fmtDate(d);

  // Session date is in the future (not today, not past)
  if (sessionDate > todayStr) {
    return {
      state:          'future',
      startStr:       toTimeStr(winStart),
      openStr:        toTimeStr(buffered),
      sessionDateStr: toDateStr(winStart),
    };
  }

  // Session date is today — check time window
  if (now < buffered) return {
    state:    'too_early',
    startStr: toTimeStr(winStart),
    openStr:  toTimeStr(buffered),
  };
  if (now > winEnd) return { state: 'ended', endStr: toTimeStr(winEnd) };
  return { state: 'active' };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.kpiBox}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, text, onPress }: { icon: string; text: string; onPress?: () => void }) {
  const content = (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <Text style={[styles.infoText, onPress && { color: C.PRIMARY }]} numberOfLines={2}>{text}</Text>
    </View>
  );
  return onPress
    ? <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>
    : content;
}

function ActionBtn({ icon, label, onPress, outlined = true }: { icon: string; label: string; onPress: () => void; outlined?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, outlined && styles.actionBtnOutlined]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.actionBtnIcon}>{icon}</Text>
      <Text style={[styles.actionBtnText, outlined && { color: C.PRIMARY }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// fmtTime12 replaced by _fmtTime from dateUtils

function ParticipantRow({ app }: { app: any }) {
  const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
    APPROVED: { label: 'Approved', bg: '#D1FAE5', color: '#059669' },
    ATTENDED: { label: 'Attended', bg: '#D1FAE5', color: '#059669' },
    PENDING:  { label: 'Pending',  bg: '#FEF3C7', color: '#D97706' },
    REJECTED: { label: 'Rejected', bg: '#FEE2E2', color: '#EF4444' },
    NO_SHOW:  { label: 'No show',  bg: '#FEE2E2', color: '#EF4444' },
  };
  const cfg  = STATUS_CFG[app.statusCode] ?? { label: app.statusCode, bg: '#F3F4F6', color: '#6B7280' };
  const aName = app.applicantName ?? app.fullName ?? 'Volunteer';

  // Build subtitle: "QR 9:02 AM · 4 hrs" for attended, "Did not check in" for no-show
  let subtitle = app.city ?? '';
  if (app.statusCode === 'ATTENDED') {
    const parts = [
      app.checkedInAt ? `QR ${_fmtTime(app.checkedInAt)}` : null,
      app.hoursLogged  ? `${app.hoursLogged} hrs` : null,
    ].filter(Boolean);
    subtitle = parts.join(' · ') || subtitle;
  } else if (app.statusCode === 'NO_SHOW') {
    subtitle = 'Did not check in';
  }

  return (
    <View style={styles.participantRow}>
      <UserAvatar name={aName} photoUrl={app.profilePhoto} size={38} style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.participantName}>{aName}</Text>
        {!!subtitle && <Text style={styles.participantSub}>{subtitle}</Text>}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminProjectDetailScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();

  const { projectId, orgId } = route.params ?? {};

  const [project,      setProject]      = useState<any>(null);
  const [apps,         setApps]         = useState<any[]>([]);
  const [counts,       setCounts]       = useState({ approved: 0, attended: 0, noShow: 0, pending: 0 });
  const [loading,      setLoading]      = useState(true);
  const [qrToken,      setQrToken]      = useState<string | null>(null);
  const [qrLoading,    setQrLoading]    = useState(false);
  const [sessions,     setSessions]     = useState<any[]>([]);
  const [actioning,    setActioning]    = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      // ── Project data is critical — fail fast if it errors ──
      const projRes = await projectApi.get(projectId);
      if (!projRes.data?.isSuccess) {
        Alert.alert('Error', projRes.data?.message ?? 'Could not load project.');
        return;
      }
      setProject(projRes.data.data);

      // ── Applications + sessions are non-critical — load in parallel, never crash ──
      const [appsSettled, sessSettled] = await Promise.allSettled([
        projectApi.getApplications(projectId, { pageNumber: 1, pageSize: 50 }),
        projectApi.getSessions(projectId),
      ]);

      if (appsSettled.status === 'fulfilled' && appsSettled.value.data?.isSuccess) {
        const all = appsSettled.value.data.data?.items ?? [];
        setApps(all);
        setCounts({
          approved: all.filter((a: any) => a.statusCode === 'APPROVED').length,
          attended: all.filter((a: any) => a.statusCode === 'ATTENDED').length,
          noShow:   all.filter((a: any) => a.statusCode === 'NO_SHOW').length,
          pending:  all.filter((a: any) => a.statusCode === 'PENDING').length,
        });
      }

      if (sessSettled.status === 'fulfilled' && sessSettled.value.data?.isSuccess) {
        setSessions(sessSettled.value.data.data ?? []);
      }
    } catch {
      Alert.alert('Error', 'Could not load project details.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Create a session for today using the project's times, then auto-generate QR
  const handleCreateSessionForToday = async () => {
    setQrLoading(true);
    try {
      // MySQL TIME columns return "HH:MM:SS" — slice to "HH:MM" to satisfy the backend regex
      const startTime = (project?.startTime ?? project?.sessionStartTime ?? '09:00').slice(0, 5);
      const endTime   = (project?.endTime   ?? project?.sessionEndTime   ?? '17:00').slice(0, 5);
      // Build local date (not UTC) so IST midnight doesn't shift to yesterday
      const d = new Date();
      const sessionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await projectApi.createSession(projectId, {
        sessionDate,
        startTime,
        endTime,
        maxVolunteers: project?.maxVolunteers ?? undefined,
      } as any);
      // Always reload sessions — even if session already existed (duplicate guard)
      // so the UI reflects the real DB state.
      const sessRes = await projectApi.getSessions(projectId);
      if (sessRes.data?.isSuccess) setSessions((sessRes.data.data as any) ?? []);

      if (res.data?.isSuccess) {
        // AddSessionAsync returns QR token if in-window; null if too early
        const token = (res.data as any).data?.qrToken ?? null;
        if (token) setQrToken(token);
      } else {
        // SP returned failure — could be duplicate session for today
        const msg = res.data?.message ?? 'Could not create session.';
        // If it's a duplicate, the session already exists — show it silently
        const isDuplicate = msg.toLowerCase().includes('already exists');
        if (!isDuplicate) Alert.alert('Error', msg);
      }
    } catch {
      Alert.alert('Error', 'An error occurred.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleGenerateQr = async () => {
    // Button is disabled outside the window, but guard here too for safety
    if (!todaySession) return;
    const { state: windowState, startStr, openStr } = getQrWindowState(todaySession);
    if (windowState === 'too_early') {
      Alert.alert('Too Early', `QR opens at ${openStr} (${QR_BUFFER_MINUTES} min before ${startStr}).`);
      return;
    }
    if (windowState === 'ended') {
      Alert.alert('Session Ended', 'Use manual attendance in the Participants screen to record missed check-ins.');
      return;
    }

    setQrLoading(true);
    try {
      const res = await projectApi.getSessionQr(projectId, todaySession.sessionId);
      if (res.data?.isSuccess) {
        const token = (res.data as any).data?.qrToken ?? null;
        if (token) {
          setQrToken(token);
        } else {
          // SP-level error (time window rejected server-side)
          const spMsg = (res.data as any).data?.message;
          Alert.alert('Cannot Generate QR', spMsg ?? 'Could not generate QR code.');
        }
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not generate QR.');
      }
    } catch {
      Alert.alert('Error', 'Could not generate QR code.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleComplete = () => {
    Alert.alert('Mark as Completed', 'Are you sure you want to mark this project as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Completed', style: 'default',
        onPress: async () => {
          setActioning(true);
          try {
            const res = await projectApi.complete(projectId);
            if (res.data?.isSuccess) {
              Alert.alert('Done', 'Project marked as completed.', [{ text: 'OK', onPress: () => nav.goBack() }]);
            } else {
              Alert.alert('Error', res.data?.message ?? 'Could not complete project.');
            }
          } catch { Alert.alert('Error', 'An error occurred.'); }
          finally { setActioning(false); }
        },
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Cancel Project', 'This will cancel the project and notify enrolled volunteers.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Project', style: 'destructive',
        onPress: async () => {
          setActioning(true);
          try {
            const res = await projectApi.cancel(projectId, 'Cancelled by admin');
            if (res.data?.isSuccess) {
              Alert.alert('Cancelled', 'Project has been cancelled.', [{ text: 'OK', onPress: () => nav.goBack() }]);
            } else {
              Alert.alert('Error', res.data?.message ?? 'Could not cancel project.');
            }
          } catch { Alert.alert('Error', 'An error occurred.'); }
          finally { setActioning(false); }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  const badge        = statusBadge(project?.statusCode);
  const schedule     = project ? fmtSchedule(project) : '';
  const timeStr      = project ? fmtTime(project) : null;
  const skills: string[] = project?.skills?.map((s: any) => s.skillName ?? s) ?? [];
  const recentApps   = apps.slice(0, 3);
  // Use local date (not UTC) — toISOString() is UTC and shifts the date
  // in IST before 5:30 AM, making today's session invisible until morning.
  const _d              = new Date();
  const today           = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;
  // sessionDate from API is 'YYYY-MM-DD' string (DATE_FORMAT in SP) — safe slice(0,10)
  const todaySession    = sessions.find((s: any) => (s.sessionDate ?? '').slice(0, 10) === today) ?? null;
  const hasTodaySess    = todaySession !== null;
  // If no session today, find the next upcoming one (sorted ascending by date from API)
  const upcomingSession = !hasTodaySess
    ? sessions.find((s: any) => (s.sessionDate ?? '').slice(0, 10) > today) ?? null
    : null;
  // Relevant session: today's first, then upcoming, then null
  const relevantSession = todaySession ?? upcomingSession ?? null;
  const qrWindow        = getQrWindowState(relevantSession, today);
  const canGenerate     = hasTodaySess && qrWindow.state === 'active';

  // Derived display values from SP fields
  const locType     = locationTypeIcon(project?.locationTypeCode);
  const locTypeName = project?.locationType ?? project?.locationTypeCode ?? '';
  const locText     = [project?.landmark, project?.addressLine, project?.city, project?.state]
                        .filter(Boolean).join(', ');
  const joinText    = joinTypeText(project?.joinTypeCode);
  const maxVols     = project?.maxVolunteers ?? 0;
  const spotsText   = maxVols > 0 ? `${counts.approved} approved · ${maxVols} spots total` : null;
  const ageText     = project?.ageRestriction > 0 ? `${project.ageRestriction}+ years minimum` : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Project Details</Text>
        <TouchableOpacity onPress={() => nav.navigate('CreateProject', { projectId, orgId })} style={styles.editBtn}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

        {/* ── Project Info Card ── */}
        <View style={styles.card}>

          {/* Title + Status */}
          <View style={styles.cardTitleRow}>
            <Text style={styles.projectName} numberOfLines={2}>{project?.projectName ?? 'Project'}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>

          {/* Org + Category row */}
          <View style={styles.metaRow}>
            {!!project?.orgName && (
              <Text style={styles.orgName}>{project.orgName}</Text>
            )}
            {!!project?.category && (
              <View style={styles.categoryTag}>
                <Text style={styles.categoryTagText}>{project.category}</Text>
              </View>
            )}
            {project?.isPublic === false && (
              <View style={[styles.categoryTag, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]}>
                <Text style={[styles.categoryTagText, { color: '#64748b' }]}>🔒 Private</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {!!project?.description && (
            <Text style={styles.description}>{project.description}</Text>
          )}

          {/* Info rows */}
          <View style={styles.infoRows}>
            {!!schedule   && <InfoRow icon="🔄" text={schedule} />}
            {!!timeStr    && <InfoRow icon="🕐" text={timeStr} />}
            {!!locTypeName && (
              <InfoRow icon={locType} text={locTypeName} />
            )}
            {!!locText    && <InfoRow icon="📍" text={locText} />}
            {!!project?.googleMapsUrl && (
              <InfoRow icon="🗺️" text="Open in Google Maps →" onPress={() => {}} />
            )}
            {!!spotsText  && <InfoRow icon="👥" text={spotsText} />}
            {!!joinText   && (
              <InfoRow
                icon={project?.joinTypeCode?.toUpperCase() === 'OPEN_SIGNUP' ? '🔓' : '✅'}
                text={joinText}
              />
            )}
            {!!ageText    && <InfoRow icon="🔞" text={ageText} />}
            {!!project?.idVerRequired && (
              <InfoRow icon="🪪" text="ID verification required" />
            )}
          </View>

          {/* Skills */}
          {skills.length > 0 && (
            <View style={styles.skillRow}>
              {skills.slice(0, 5).map((sk, i) => (
                <View key={i} style={styles.skillTag}>
                  <Text style={styles.skillTagText}>{sk}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── KPI Row ── */}
        <View style={styles.kpiRow}>
          <KpiBox value={counts.approved} label="Approved"  color={C.PRIMARY} />
          <KpiBox value={counts.attended} label="Attended"  color="#16A34A"   />
          <KpiBox value={counts.noShow}   label="No show"   color="#EF4444"   />
          <KpiBox value={counts.pending}  label="Pending"   color="#D97706"   />
        </View>

        {/* ── QR Attendance ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>QR Attendance</Text>
          <Text style={styles.sectionSub}>QR is only active during the session window</Text>

          {/* Session status line */}
          {sessions.length > 0 && (
            <Text style={styles.sessionCount}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {
                qrWindow.state === 'future'
                  ? `next session on ${qrWindow.sessionDateStr}`
                  : !hasTodaySess
                    ? 'no session for today'
                    : qrWindow.state === 'active'
                      ? '✓ session in progress'
                      : qrWindow.state === 'too_early'
                        ? `opens at ${qrWindow.openStr}`
                        : `ended at ${qrWindow.endStr}`
              }
            </Text>
          )}

          {/* Time-window banners */}
          {qrWindow.state === 'future' && (
            <View style={[styles.qrWindowBanner, styles.qrWindowBannerFuture]}>
              <Text style={styles.qrWindowIcon}>📅</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.qrWindowTitle, { color: '#1D4ED8' }]}>Session not yet available</Text>
                <Text style={[styles.qrWindowSub, { color: '#1E40AF' }]}>
                  Session is scheduled for {qrWindow.sessionDateStr} at {qrWindow.startStr}.{'\n'}
                  QR will open at {qrWindow.openStr} on that day.
                </Text>
              </View>
            </View>
          )}
          {hasTodaySess && qrWindow.state === 'too_early' && (
            <View style={styles.qrWindowBanner}>
              <Text style={styles.qrWindowIcon}>🕐</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.qrWindowTitle}>QR not yet available</Text>
                <Text style={styles.qrWindowSub}>
                  Session starts at {qrWindow.startStr}. QR opens {QR_BUFFER_MINUTES} min before start ({qrWindow.openStr}).
                </Text>
              </View>
            </View>
          )}
          {hasTodaySess && qrWindow.state === 'ended' && (
            <View style={[styles.qrWindowBanner, styles.qrWindowBannerEnded]}>
              <Text style={styles.qrWindowIcon}>⏹</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.qrWindowTitle, { color: '#EF4444' }]}>Session ended</Text>
                <Text style={styles.qrWindowSub}>
                  Session ended at {qrWindow.endStr}. Use manual attendance for missed check-ins.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.qrBox}>
            {qrToken ? (
              <View style={styles.qrPlaceholder}>
                <Text style={styles.qrEmoji}>⬛⬜⬛{'\n'}⬜⬛⬜{'\n'}⬛⬜⬛</Text>
                <Text style={styles.qrTokenText} numberOfLines={1}>{qrToken.slice(0, 16)}…</Text>
              </View>
            ) : (
              <View style={styles.qrPlaceholder}>
                <Text style={{ fontSize: 48 }}>⬜</Text>
                <Text style={styles.qrHint}>
                  {qrWindow.state === 'future'
                    ? `Session on ${qrWindow.sessionDateStr}`
                    : !hasTodaySess
                      ? sessions.length === 0 ? 'No sessions yet — create one below' : 'No session for today'
                      : canGenerate ? 'Tap button to generate' : 'Outside session window'}
                </Text>
              </View>
            )}
          </View>

          {/* No session at all → Create */}
          {sessions.length === 0 ? (
            <TouchableOpacity
              style={[styles.primaryBtn, qrLoading && { opacity: 0.6 }]}
              onPress={handleCreateSessionForToday}
              disabled={qrLoading}
            >
              {qrLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>📅  Create Session for Today</Text>}
            </TouchableOpacity>
          ) : !hasTodaySess ? (
            /* Sessions exist but none for today */
            qrWindow.state === 'future' ? (
              /* Next session is in the future — don't offer to create a session for today */
              <TouchableOpacity
                style={[styles.primaryBtn, { opacity: 0.45 }]}
                disabled
              >
                <Text style={styles.primaryBtnText}>📅  Available on {qrWindow.sessionDateStr}</Text>
              </TouchableOpacity>
            ) : (
              /* No upcoming session — offer to create one for today */
              <TouchableOpacity
                style={[styles.primaryBtn, qrLoading && { opacity: 0.6 }]}
                onPress={handleCreateSessionForToday}
                disabled={qrLoading}
              >
                {qrLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>📅  Create Today's Session</Text>}
              </TouchableOpacity>
            )
          ) : (
            /* Today's session exists → Generate (disabled outside window) */
            <TouchableOpacity
              style={[styles.primaryBtn, (!canGenerate || qrLoading) && { opacity: 0.45 }]}
              onPress={handleGenerateQr}
              disabled={!canGenerate || qrLoading}
            >
              {qrLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>
                    {canGenerate ? '🔳  Generate QR' : qrWindow.state === 'too_early' ? '🕐  Too Early' : '⏹  Session Ended'}
                  </Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Participants Preview ── */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Participants</Text>
            <TouchableOpacity onPress={() => nav.navigate('Participants', { projectId, orgId })}>
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          </View>

          {recentApps.length === 0 ? (
            <Text style={styles.emptyText}>No applications yet.</Text>
          ) : (
            recentApps.map((app, i) => <ParticipantRow key={app.applicationId ?? i} app={app} />)
          )}
        </View>

        {/* ── Project Actions ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Project Actions</Text>
          <ActionBtn icon="👥" label="Manage Participants"
            onPress={() => nav.navigate('Participants', { projectId, orgId })} />
          <ActionBtn icon="📢" label="Post Project Update"
            onPress={() => Alert.alert('Coming soon', 'Post Update will be available in the next sprint.')} />
          <ActionBtn icon="📊" label="View Impact Report"
            onPress={() => Alert.alert('Coming soon', 'Impact Report will be available in the next sprint.')} />
        </View>

        {/* ── Complete / Cancel ── */}
        <View style={styles.dangerSection}>
          <TouchableOpacity
            style={[styles.dangerBtn, styles.completeBtn, actioning && { opacity: 0.6 }]}
            onPress={handleComplete}
            disabled={actioning}
          >
            <Text style={styles.completeBtnText}>☑ Mark as Completed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dangerBtn, styles.cancelBtn, actioning && { opacity: 0.6 }]}
            onPress={handleCancel}
            disabled={actioning}
          >
            <Text style={styles.cancelBtnText}>✕ Cancel Project</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.BG },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:          { padding: 14, gap: 12 },

  // Header
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:         { padding: 4, minWidth: 36 },
  backText:        { fontSize: 20, color: C.PRIMARY },
  headerTitle:     { fontSize: 16, fontWeight: '700', color: C.TEXT },
  editBtn:         { padding: 4, minWidth: 36, alignItems: 'flex-end' },
  editText:        { fontSize: 14, color: C.PRIMARY, fontWeight: '600' },

  // Card
  card:            { backgroundColor: C.CARD, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTitleRow:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  projectName:     { flex: 1, fontSize: 17, fontWeight: '700', color: C.TEXT },
  badge:           { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  badgeText:       { fontSize: 11, fontWeight: '700' },

  // Org + category row
  metaRow:         { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  orgName:         { fontSize: 12, color: C.TEXT2, fontWeight: '500' },
  categoryTag:     { backgroundColor: `${C.PRIMARY}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: `${C.PRIMARY}30` },
  categoryTagText: { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },

  // Description
  description:     { fontSize: 13, color: C.TEXT2, lineHeight: 20, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: `${C.PRIMARY}40`, paddingLeft: 10 },

  // Info rows
  infoRows:        { gap: 6, marginBottom: 10 },
  infoRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoIcon:        { fontSize: 14, width: 20, textAlign: 'center' },
  infoText:        { fontSize: 12, color: C.TEXT2, flex: 1 },

  // Skills
  skillRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  skillTag:        { backgroundColor: `${C.PRIMARY}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  skillTagText:    { fontSize: 11, color: C.PRIMARY, fontWeight: '500' },

  // KPI
  kpiRow:          { flexDirection: 'row', backgroundColor: C.CARD, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  kpiBox:          { flex: 1, alignItems: 'center', paddingVertical: 14, borderRightWidth: 1, borderRightColor: C.BORDER },
  kpiValue:        { fontSize: 20, fontWeight: '700' },
  kpiLabel:        { fontSize: 10, color: C.TEXT2, marginTop: 2, textAlign: 'center' },

  // QR
  sectionTitle:        { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  sectionSub:          { fontSize: 12, color: C.TEXT2, marginBottom: 12, textAlign: 'center' },
  qrBox:               { alignItems: 'center', marginBottom: 14 },
  qrPlaceholder:       { width: 140, height: 140, borderRadius: 12, borderWidth: 2, borderColor: C.PRIMARY, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F3FF' },
  qrEmoji:             { fontSize: 28, textAlign: 'center', color: C.PRIMARY, lineHeight: 34 },
  qrTokenText:         { fontSize: 10, color: C.TEXT2, marginTop: 6, maxWidth: 120 },
  qrHint:              { fontSize: 11, color: C.TEXT3, marginTop: 6, textAlign: 'center' },
  sessionCount:        { fontSize: 11, color: C.TEXT3, marginBottom: 6 },
  primaryBtn:          { backgroundColor: C.PRIMARY, borderRadius: 10, padding: 13, alignItems: 'center' },
  primaryBtnText:      { color: '#fff', fontSize: 14, fontWeight: '700' },
  // QR window banners
  qrWindowBanner:        { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  qrWindowBannerEnded:   { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  qrWindowBannerFuture: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  qrWindowIcon:        { fontSize: 18, marginTop: 1 },
  qrWindowTitle:       { fontSize: 13, fontWeight: '700', color: '#D97706', marginBottom: 2 },
  qrWindowSub:         { fontSize: 11, color: '#92400E', lineHeight: 16 },

  // Participants
  rowBetween:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  viewAll:         { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
  emptyText:       { fontSize: 13, color: C.TEXT3, textAlign: 'center', paddingVertical: 12 },
  participantRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.BORDER },
  avatar:          { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  participantName: { fontSize: 13, fontWeight: '600', color: C.TEXT },
  participantSub:  { fontSize: 11, color: C.TEXT2 },
  statusBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:      { fontSize: 11, fontWeight: '600' },

  // Action buttons
  actionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 10, marginBottom: 8, backgroundColor: C.BG },
  actionBtnOutlined: { borderWidth: 1, borderColor: C.PRIMARY },
  actionBtnIcon:   { fontSize: 16 },
  actionBtnText:   { fontSize: 14, fontWeight: '600', color: C.TEXT },

  // Danger
  dangerSection:   { gap: 8 },
  dangerBtn:       { borderRadius: 10, padding: 14, alignItems: 'center' },
  completeBtn:     { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  completeBtnText: { color: '#D97706', fontSize: 14, fontWeight: '700' },
  cancelBtn:       { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  cancelBtnText:   { color: '#EF4444', fontSize: 14, fontWeight: '700' },
});
