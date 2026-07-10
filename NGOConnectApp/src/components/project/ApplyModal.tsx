import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Project } from '../../types/api.types';
import * as projectApi from '../../api/project.api';

/* ─── helpers ───────────────────────────────────────────────────────────────── */

const DAY_FULL: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
  THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};

const DAY_SHORT: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed',
  THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

const DAY_JS: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

function firstOccurrence(dayCode: string, fromDateStr: string): Date {
  const target = DAY_JS[dayCode.toUpperCase()] ?? 0;
  const d = new Date(fromDateStr);
  const diff = (target - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function lastOccurrence(dayCode: string, toDateStr: string): Date {
  const target = DAY_JS[dayCode.toUpperCase()] ?? 0;
  const d = new Date(toDateStr);
  const diff = (d.getDay() - target + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function scheduleTypeBadge(scheduleType?: string): { label: string; color: string; bg: string } {
  switch ((scheduleType ?? '').toUpperCase()) {
    case 'RECURRING': return { label: 'Recurring',  color: '#C2410C', bg: '#FFF7ED' };
    case 'FLEXIBLE':  return { label: 'Flexible',   color: '#0369A1', bg: '#EFF6FF' };
    default:          return { label: 'One-time',   color: '#15803D', bg: '#F0FDF4' };
  }
}

/* ─── session option type ───────────────────────────────────────────────────── */
interface SessionOption {
  value: string;       // e.g. "TUE" | "FRI" | "TUE,FRI"
  label: string;       // e.g. "Every Tuesday · 9:00 AM–1:00 PM"
  sub: string;         // e.g. "Recurring from Jun 3 to Dec 30"
}

function buildSessionOptions(p: Project): SessionOption[] {
  const days = (p.recurDays ?? p.recurrenceDays ?? '')
    .split(',').map(d => d.trim().toUpperCase()).filter(Boolean);
  if (!days.length) return [];

  const startStr = p.recurStart ?? p.startDate ?? '';
  const endStr   = p.recurEnd   ?? p.endDate   ?? '';
  const timeStr  = p.sessionStartTime && p.sessionEndTime
    ? ` · ${fmtTime(p.sessionStartTime)}–${fmtTime(p.sessionEndTime)}`
    : (p.startTime && p.endTime ? ` · ${fmtTime(p.startTime)}–${fmtTime(p.endTime)}` : '');

  const options: SessionOption[] = days.map(day => {
    const first = startStr ? fmtDate(firstOccurrence(day, startStr)) : '';
    const last  = endStr   ? fmtDate(lastOccurrence(day, endStr))    : '';
    return {
      value: day,
      label: `Every ${DAY_FULL[day] ?? day}${timeStr}`,
      sub:   first && last ? `Recurring from ${first} to ${last}` : '',
    };
  });

  // Add "Both" / "All days" option when there are 2+ days
  if (days.length >= 2) {
    const shortNames = days.slice(0, 3).map(d => DAY_SHORT[d] ?? d).join(' + ');
    const label = days.length === 2
      ? `Both (${shortNames})`
      : `All days (${shortNames}${days.length > 3 ? '…' : ''})`;
    options.push({
      value: days.join(','),
      label,
      sub: 'Maximum commitment',
    });
  }

  return options;
}

/* ─── props ─────────────────────────────────────────────────────────────────── */
interface Props {
  visible: boolean;
  project: Project | null;
  onClose: () => void;
  onSuccess?: (applicationId: number) => void;
}

/* ─── component ─────────────────────────────────────────────────────────────── */
export default function ApplyModal({ visible, project, onClose, onSuccess }: Props) {
  const [selectedDays, setSelectedDays] = useState<string>('');
  const [motivation, setMotivation]     = useState('');
  const [loading, setLoading]           = useState(false);

  // Reset state when project changes
  React.useEffect(() => {
    setSelectedDays('');
    setMotivation('');
    setLoading(false);
  }, [project?.projectId]);

  if (!project) return null;

  const isRecurring = (project.scheduleType ?? '').toUpperCase() === 'RECURRING';
  const sessionOptions = isRecurring ? buildSessionOptions(project) : [];

  const max       = project.maxVolunteers ?? project.maxParticipants ?? 0;
  const approved  = project.approvedCount ?? project.currentParticipants ?? 0;
  const spotsLeft = max > 0 ? Math.max(0, max - approved) : null;
  const pct       = max > 0 ? Math.min(Math.round((approved / max) * 100), 100) : 0;
  const badge     = scheduleTypeBadge(project.scheduleType);

  // Spot bar color
  const barColor = spotsLeft !== null && spotsLeft <= 3
    ? '#F97316' : spotsLeft !== null && spotsLeft <= 10
    ? '#F59E0B' : '#10B981';

  /* Schedule subtitle line */
  const scheduleLine = (() => {
    const p = project as any;
    if (isRecurring) {
      const days = (p.recurDays ?? p.recurrenceDays ?? '')
        .split(',').map((d: string) => DAY_SHORT[d.trim().toUpperCase()] ?? d.trim()).join(' & ');
      const range = p.recurStart && p.recurEnd
        ? ` · ${fmtDate(new Date(p.recurStart))}–${fmtDate(new Date(p.recurEnd))}`
        : p.startDate && p.endDate
        ? ` · ${fmtDate(new Date(p.startDate))}–${fmtDate(new Date(p.endDate))}`
        : '';
      return `${days}${range}`;
    }
    if (p.oneTimeDate ?? p.startDate) {
      const d = new Date(p.oneTimeDate ?? p.startDate);
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = p.sessionStartTime
        ? ` · ${fmtTime(p.sessionStartTime)}${p.sessionEndTime ? `–${fmtTime(p.sessionEndTime)}` : ''}`
        : p.startTime
        ? ` · ${fmtTime(p.startTime)}${p.endTime ? `–${fmtTime(p.endTime)}` : ''}`
        : '';
      return `${dateStr}${timeStr}`;
    }
    if (p.flexFromDate ?? p.startDate) {
      const from = fmtDate(new Date(p.flexFromDate ?? p.startDate));
      const to   = p.flexToDate ?? p.endDate ? fmtDate(new Date(p.flexToDate ?? p.endDate)) : '';
      return to ? `Flexible · ${from}–${to}` : `From ${from}`;
    }
    return '';
  })();

  const locationLine = [project.locationName, project.city]
    .filter(Boolean).join(', ');

  /* Submit */
  async function handleSubmit() {
    if (isRecurring && sessionOptions.length > 0 && !selectedDays) {
      Alert.alert('Select a session', 'Please choose which session(s) you can attend.');
      return;
    }
    setLoading(true);
    try {
      const res = await projectApi.apply(project.projectId, {
        motivation:        motivation.trim() || undefined,
        requestedSessions: selectedDays || undefined,
      });
      if (res.data?.isSuccess) {
        onSuccess?.(res.data.data?.applicationId ?? 0);
        onClose();
        Alert.alert('Application Submitted!', res.data.message ?? 'Your application has been sent.');
      } else {
        Alert.alert('Could not apply', res.data?.message ?? 'Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={S.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={S.kav}
      >
        <View style={S.sheet}>
          {/* drag handle */}
          <View style={S.handle} />

          {/* header */}
          <View style={S.header}>
            <Text style={S.headerTitle}>Apply for Opportunity</Text>
            <Pressable onPress={onClose} hitSlop={12} style={S.closeBtn}>
              <Text style={S.closeX}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── Project info card ── */}
            <View style={S.infoCard}>
              <View style={S.infoCardTop}>
                <Text style={S.projectTitle} numberOfLines={2}>
                  {project.title ?? project.projectName}
                </Text>
                <View style={[S.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[S.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>

              {/* org · schedule */}
              <Text style={S.infoSub} numberOfLines={1}>
                {[project.orgName, scheduleLine].filter(Boolean).join(' · ')}
              </Text>

              {/* location (one-time / flexible only) */}
              {!isRecurring && locationLine ? (
                <Text style={S.locationRow}>📍 {locationLine}</Text>
              ) : null}

              {/* capacity row */}
              {max > 0 ? (
                <>
                  <View style={S.capRow}>
                    <Text style={S.capLeft}>
                      {isRecurring
                        ? `${approved} of ${max} volunteers approved`
                        : `${approved} of ${max} filled`}
                    </Text>
                    {spotsLeft !== null ? (
                      <Text style={[S.capRight, { color: barColor }]}>
                        {spotsLeft <= 0
                          ? 'Full'
                          : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left!`}
                      </Text>
                    ) : null}
                  </View>
                  <View style={S.barOuter}>
                    <View style={[S.barFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                  </View>
                  {spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 ? (
                    <Text style={S.pauseNote}>
                      New requests paused automatically when capacity is reached.
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>

            {/* ── Session selector (RECURRING only) ── */}
            {isRecurring && sessionOptions.length > 0 ? (
              <View style={S.section}>
                <Text style={S.sectionLabel}>Select sessions you can attend</Text>
                {sessionOptions.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[S.sessionRow, selectedDays === opt.value && S.sessionRowSelected]}
                    onPress={() => setSelectedDays(opt.value)}
                  >
                    <View style={S.sessionText}>
                      <Text style={S.sessionMain}>{opt.label}</Text>
                      {opt.sub ? <Text style={S.sessionSub}>{opt.sub}</Text> : null}
                    </View>
                    <View style={[S.radio, selectedDays === opt.value && S.radioSelected]}>
                      {selectedDays === opt.value ? <View style={S.radioDot} /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* ── Motivation textarea ── */}
            <View style={S.section}>
              <Text style={S.sectionLabel}>
                {isRecurring
                  ? 'Why do you want to volunteer? (Optional)'
                  : 'Why do you want to join? (Optional)'}
              </Text>
              <TextInput
                style={S.textarea}
                placeholder={isRecurring
                  ? 'Share your motivation, skills or experience...'
                  : 'Share your motivation...'}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={motivation}
                onChangeText={setMotivation}
                maxLength={500}
              />
            </View>

            {/* ── QR info (RECURRING only) ── */}
            {isRecurring ? (
              <View style={S.qrInfo}>
                <Text style={S.qrInfoText}>
                  🔲 A QR code will be generated for each session you attend for attendance logging.
                </Text>
              </View>
            ) : null}

            {/* ── Submit button ── */}
            <Pressable
              style={({ pressed }) => [S.submitBtn, pressed && { opacity: 0.85 }, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.submitBtnText}>
                    {isRecurring ? 'Submit Application' : 'Confirm Application'}
                  </Text>}
            </Pressable>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────────── */
const C = {
  purple: '#6C3FD6',
  green:  '#10B981',
  bg:     '#FFFFFF',
  card:   '#F9FAFB',
  border: '#E5E7EB',
  text:   '#111827',
  sub:    '#6B7280',
  light:  '#9CA3AF',
};

const S = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    maxHeight: '92%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontSize: 16,
    color: C.sub,
    fontWeight: '500',
  },

  /* info card */
  infoCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  infoCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  projectTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  infoSub: {
    fontSize: 12,
    color: C.sub,
    marginBottom: 4,
  },
  locationRow: {
    fontSize: 12,
    color: C.sub,
    marginBottom: 4,
  },
  capRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  capLeft: {
    fontSize: 12,
    color: C.sub,
  },
  capRight: {
    fontSize: 12,
    fontWeight: '600',
  },
  barOuter: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 4,
  },
  pauseNote: {
    fontSize: 11,
    color: C.sub,
    marginTop: 5,
    fontStyle: 'italic',
  },

  /* sections */
  section: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    marginBottom: 10,
  },

  /* session rows */
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
    marginBottom: 8,
  },
  sessionRowSelected: {
    borderColor: C.purple,
    backgroundColor: '#F5F3FF',
  },
  sessionText: {
    flex: 1,
    marginRight: 12,
  },
  sessionMain: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    marginBottom: 2,
  },
  sessionSub: {
    fontSize: 11,
    color: C.sub,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: C.purple,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.purple,
  },

  /* textarea */
  textarea: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: C.text,
    minHeight: 90,
    backgroundColor: C.bg,
  },

  /* QR info */
  qrInfo: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  qrInfoText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 18,
  },

  /* submit */
  submitBtn: {
    marginTop: 20,
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    // gradient approximation via shadow
    shadowColor: C.purple,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
