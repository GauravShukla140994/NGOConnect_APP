/**
 * ProjectDetailModal.tsx
 * Bottom-sheet style modal showing full project details for a registered volunteer.
 * Opened by tapping a card in Applied or Upcoming tabs.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AppConfig from '../../config/AppConfig';
import { projectApi } from '../../api/project.api';
import type { UserApplication } from '../../types/api.types';

const C = AppConfig.COLORS;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d?: string) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtTime = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const durationHours = (start?: string, end?: string) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const abbrevDays = (days?: string) => {
  if (!days) return '';
  const MAP: Record<string, string> = {
    Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
    Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
  };
  return days.split(',').map(d => MAP[d.trim()] ?? d.trim().slice(0, 3)).join(' & ');
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible:     boolean;
  application: UserApplication | null;
  onClose:     () => void;
  onScanQR:    () => void; // triggers QR scanner for this project
}

interface ProjectDetail {
  description?: string;
  approvedCount?: number;
  maxVolunteers?: number;
  googleMapsUrl?: string;
  coverImageUrl?: string;
  skills?: { skillName: string; isRequired?: boolean }[];
  landmark?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectDetailModal({ visible, application, onClose, onScanQR }: Props) {
  const [detail,  setDetail]  = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && application) {
      loadDetail(application.projectId);
    } else {
      setDetail(null);
    }
  }, [visible, application?.projectId]);

  const loadDetail = useCallback(async (projectId: number) => {
    setLoading(true);
    try {
      const res = await projectApi.get(projectId);
      if (res.data?.isSuccess && res.data.data) {
        const d = res.data.data;
        setDetail({
          description:   d.description,
          approvedCount: d.approvedCount ?? d.currentParticipants,
          maxVolunteers: d.maxVolunteers ?? d.maxParticipants,
          googleMapsUrl: d.googleMapsUrl,
          coverImageUrl: d.coverImageUrl,
          skills:        d.skills ?? [],
          landmark:      d.locationName ?? d.landmark,
          city:          d.city,
          address:       d.address,
          latitude:      d.latitude,
          longitude:     d.longitude,
        });
      }
    } catch { /* fail silently — show what we have from application */ }
    setLoading(false);
  }, []);

  if (!visible || !application) return null;

  const app         = application;
  const spotsLeft   = detail?.maxVolunteers && detail?.approvedCount != null
    ? detail.maxVolunteers - detail.approvedCount
    : null;
  const timePart    = (app.sessionStartTime && app.sessionEndTime)
    ? `${fmtTime(app.sessionStartTime)} – ${fmtTime(app.sessionEndTime)}`
    : app.sessionStartTime ? fmtTime(app.sessionStartTime) : '';
  const duration    = durationHours(app.sessionStartTime, app.sessionEndTime);
  const dateDisplay = app.scheduleTypeCode === 'ONE_TIME'
    ? [fmtDate(app.recurStart), timePart, duration ? `(${duration})` : ''].filter(Boolean).join(' · ')
    : app.scheduleTypeCode === 'RECURRING'
    ? [abbrevDays(app.recurDays), timePart].filter(Boolean).join(' · ')
    : timePart || 'Flexible schedule';

  const locationDisplay = [detail?.landmark ?? app.landmark, detail?.city ?? app.city]
    .filter(Boolean).join(', ');

  const mapsUrl = detail?.googleMapsUrl
    ?? (detail?.latitude && detail?.longitude
      ? `https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`
      : null);

  const isUpcoming = app.statusCode === 'APPROVED' &&
    ['UPCOMING', 'ACTIVE'].includes(app.projectStatusCode ?? '');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Scrim */}
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose} />

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header row */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Event Details</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Project & org */}
          <Text style={styles.projectName}>{app.projectName}</Text>
          <Text style={styles.orgName}>{app.orgName}</Text>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={C.PRIMARY} />
            </View>
          ) : (
            <>
              {/* Info rows */}
              <View style={styles.infoCard}>
                {/* Date / schedule */}
                {dateDisplay ? (
                  <InfoRow icon="📅" text={dateDisplay} />
                ) : null}

                {/* Date range for recurring */}
                {app.scheduleTypeCode === 'RECURRING' && app.recurStart ? (
                  <InfoRow
                    icon="📆"
                    text={`${fmtDate(app.recurStart)} – ${fmtDate(app.recurEnd)}`}
                  />
                ) : null}

                {/* Location */}
                {locationDisplay ? (
                  <InfoRow icon="📍" text={locationDisplay} />
                ) : null}

                {/* Attendees */}
                {(detail?.approvedCount != null) ? (
                  <InfoRow
                    icon="👥"
                    text={[
                      `${detail.approvedCount} attending`,
                      spotsLeft != null && spotsLeft > 0 ? `· ${spotsLeft} spots left` : '',
                    ].filter(Boolean).join(' ')}
                  />
                ) : null}
              </View>

              {/* Description */}
              {detail?.description ? (
                <Text style={styles.description}>{detail.description}</Text>
              ) : null}

              {/* Google Maps */}
              {mapsUrl ? (
                <TouchableOpacity
                  style={styles.mapsRow}
                  onPress={() => Linking.openURL(mapsUrl)}
                  activeOpacity={0.75}
                >
                  <View style={styles.mapsIcon}>
                    <Text style={{ fontSize: 18 }}>📍</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mapsLabel}>Open in Google Maps</Text>
                    {locationDisplay ? (
                      <Text style={styles.mapsSubtitle} numberOfLines={1}>{locationDisplay}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.mapsChevron}>›</Text>
                </TouchableOpacity>
              ) : null}

              {/* Skills */}
              {(detail?.skills?.length ?? 0) > 0 ? (
                <View style={styles.skillsWrap}>
                  {detail!.skills!.map((s, i) => (
                    <View key={i} style={styles.skillChip}>
                      <Text style={styles.skillChipText}>{s.skillName}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* CTA Buttons */}
        <View style={styles.ctaWrap}>
          {isUpcoming ? (
            <>
              <View style={[styles.registeredChip]}>
                <Text style={styles.registeredChipText}>✓ Already Registered</Text>
              </View>
              <TouchableOpacity style={styles.scanBtn} onPress={() => { onClose(); onScanQR(); }} activeOpacity={0.85}>
                <Text style={styles.scanBtnText}>📱  Scan QR to Mark Attendance</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.registeredBtnFull}>
              <Text style={styles.registeredBtnText}>
                {app.statusCode === 'PENDING' ? '🕒  Awaiting Approval' : '✓  Already Registered'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim:            { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:            {
    backgroundColor: C.CARD,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle:           {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.BORDER, alignSelf: 'center', marginBottom: 12,
  },

  sheetHeader:      { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetTitle:       { flex: 1, fontSize: 17, fontWeight: '700', color: C.TEXT },
  closeBtn:         {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.INPUT_BG, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText:     { color: C.TEXT2, fontSize: 13, fontWeight: '700' },

  projectName:      { fontSize: 18, fontWeight: '700', color: C.TEXT, marginBottom: 4 },
  orgName:          { fontSize: 13, color: C.TEXT2, marginBottom: 16 },

  infoCard:         {
    backgroundColor: C.INPUT_BG, borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 4, marginBottom: 16, gap: 2,
  },
  infoRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, paddingHorizontal: 12 },
  infoIcon:         { fontSize: 16, width: 22 },
  infoText:         { flex: 1, fontSize: 13, color: C.TEXT, lineHeight: 20 },

  description:      { fontSize: 13, color: C.TEXT2, lineHeight: 21, marginBottom: 16 },

  mapsRow:          {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.INPUT_BG, borderRadius: 12,
    padding: 14, marginBottom: 14,
  },
  mapsIcon:         {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center',
  },
  mapsLabel:        { fontSize: 13, fontWeight: '600', color: C.TEXT },
  mapsSubtitle:     { fontSize: 11, color: C.TEXT2, marginTop: 2 },
  mapsChevron:      { fontSize: 20, color: C.TEXT3 },

  skillsWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  skillChip:        {
    backgroundColor: C.PRIMARY_LIGHT, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  skillChipText:    { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },

  ctaWrap:          { paddingTop: 12, paddingBottom: 24, gap: 10 },
  registeredChip:   {
    alignSelf: 'center',
    backgroundColor: '#D1FAE5', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 6,
  },
  registeredChipText: { color: '#059669', fontSize: 13, fontWeight: '700' },
  scanBtn:          {
    backgroundColor: C.PRIMARY, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    ...AppConfig.SHADOW.BTN,
  },
  scanBtnText:      { color: '#fff', fontSize: 15, fontWeight: '700' },
  registeredBtnFull: {
    backgroundColor: C.PRIMARY_LIGHT, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  registeredBtnText: { color: C.PRIMARY, fontSize: 15, fontWeight: '700' },
});
