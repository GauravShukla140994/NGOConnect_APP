import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { sosApi, SosIncidentDetail, SosResponderItem } from '../../api/sos.api';
import { UserAvatar } from '../../components/ui';

const C = AppConfig.COLORS;

const TYPE_META: Record<string, { emoji: string; color: string }> = {
  SOS_ALERT:         { emoji: '🚨', color: '#EF4444' },
  HELP_REQUEST:      { emoji: '🆘', color: '#F59E0B' },
  MISSING_VOLUNTEER: { emoji: '🔍', color: '#6B4EFF' },
  SAFE_ARRIVAL:      { emoji: '✅', color: '#10B981' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// MySQL returns datetimes as "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" — both
// without timezone info. new Date() treats these as LOCAL time in Hermes (React Native),
// but the server stores UTC. Fix: normalise space→T then append Z so JS always parses as UTC.
function asUtc(iso: string): Date {
  if (!iso) { return new Date(NaN); }
  const s = iso.replace(' ', 'T');    // "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
  return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Format a server UTC ISO datetime as local "dd-MMM-yyyy hh:mm AM/PM"
 * e.g. "2026-08-07T12:00:00" (UTC) on an IST device → "07-Aug-2026 05:30 PM"
 */
function formatLocalDateTime(iso: string | undefined): string {
  if (!iso) { return ''; }
  const d    = asUtc(iso);                                // parse as UTC, getters return local
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = MONTHS_SHORT[d.getMonth()];
  const yr   = d.getFullYear();
  const h    = d.getHours();
  const m    = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${day}-${mon}-${yr} ${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function useTimer(createdAt: string | undefined, endAt?: string | null) {
  // When endAt is set (resolved/cancelled), compute a fixed duration — no interval needed.
  const fixedElapsed = (createdAt && endAt)
    ? Math.max(0, Math.floor((asUtc(endAt).getTime() - asUtc(createdAt).getTime()) / 1000))
    : null;

  const [elapsed, setElapsed] = useState(fixedElapsed ?? 0);

  useEffect(() => {
    // If end time is already known, freeze immediately — no tick needed.
    if (fixedElapsed !== null) { setElapsed(fixedElapsed); return; }
    if (!createdAt) { return; }
    const start = asUtc(createdAt).getTime();
    const id = setInterval(() => { setElapsed(Math.floor((Date.now() - start) / 1000)); }, 1000);
    return () => clearInterval(id);
  }, [createdAt, fixedElapsed]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function respondedAgo(iso: string | undefined): string {
  if (!iso) { return ''; }
  const diff = Math.floor((Date.now() - asUtc(iso).getTime()) / 1000);
  if (diff < 60)    { return 'Just now'; }
  if (diff < 3600)  { return `${Math.floor(diff / 60)}m ago`; }
  if (diff < 86400) { return `${Math.floor(diff / 3600)}h ago`; }
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Responder row ─────────────────────────────────────────────────────────────

function ResponderRow({ item, isVictim, onApprove, onDecline }: {
  item:      SosResponderItem;
  isVictim:  boolean;
  onApprove: (r: SosResponderItem) => void;
  onDecline: (r: SosResponderItem) => void;
}) {
  const isPending  = item.approvalStatus === 'PENDING';
  const isApproved = item.approvalStatus === 'APPROVED';
  const isRejected = item.approvalStatus === 'REJECTED';
  const ago        = respondedAgo(item.respondedAt);

  return (
    <View style={rStyles.row}>
      <UserAvatar name={item.responderName ?? 'U'} photoUrl={item.profilePhoto} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={rStyles.name}>{item.responderName}</Text>
        <Text style={rStyles.meta}>
          {isApproved
            ? '✅ Approved · Can see your location'
            : isRejected
            ? '❌ Declined'
            : `${ago}  · Wants to help`}
        </Text>
      </View>
      {/* Victim sees Approve + Decline buttons for pending responders */}
      {isVictim && isPending && (
        <View style={rStyles.actionPair}>
          <TouchableOpacity
            style={rStyles.approveBtn}
            onPress={() => onApprove(item)}
            accessibilityLabel={`Approve ${item.responderName}`}
          >
            <Text style={rStyles.approveTxt}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={rStyles.declineBtn}
            onPress={() => onDecline(item)}
            accessibilityLabel={`Decline ${item.responderName}`}
          >
            <Text style={rStyles.declineTxt}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      {isApproved && (
        <View style={rStyles.approvedChip}>
          <Text style={rStyles.approvedChipTxt}>✓</Text>
        </View>
      )}
    </View>
  );
}

const rStyles = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 },
  name:         { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 2 },
  meta:         { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  actionPair:   { flexDirection: 'row', gap: 6 },
  approveBtn:   { backgroundColor: '#3B82F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  approveTxt:   { fontSize: 12, fontWeight: '700', color: '#fff' },
  declineBtn:   { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  declineTxt:   { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  approvedChip: { backgroundColor: 'rgba(16,185,129,0.2)', borderRadius: 20, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  approvedChipTxt: { color: '#10B981', fontWeight: '800', fontSize: 14 },
});

// ── Cancel sheet ─────────────────────────────────────────────────────────────

const CANCEL_REASONS = [
  'I am safe now',
  'Alert sent by mistake',
  'Situation resolved on its own',
  'Other',
] as const;

function CancelSheet({ visible, onCancel, onDismiss }: {
  visible:   boolean;
  onCancel:  (reason: string) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected,     setSelected]     = useState(CANCEL_REASONS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Reset state each time sheet opens
  React.useEffect(() => {
    if (visible) {
      setSelected(CANCEL_REASONS[0]);
      setDropdownOpen(false);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity style={csStyles.overlay} activeOpacity={1} onPress={() => { setDropdownOpen(false); onDismiss(); }} />
      <View style={[csStyles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>

        {/* Title */}
        <Text style={csStyles.title}>Cancel SOS Alert</Text>
        <Text style={csStyles.sub}>
          Are you sure you want to cancel? All responders will be notified.
        </Text>

        {/* Warning box */}
        <View style={csStyles.warningBox}>
          <Text style={csStyles.warningHeader}>⚠️  Cancelling will:</Text>
          <Text style={csStyles.warningBullet}>• Stop all responders from seeing your location</Text>
          <Text style={csStyles.warningBullet}>• Notify admin that SOS was cancelled</Text>
          <Text style={csStyles.warningBullet}>• Log this incident in your profile</Text>
        </View>

        {/* Reason picker */}
        <Text style={csStyles.reasonLabel}>Reason for cancellation (optional)</Text>

        <TouchableOpacity
          style={csStyles.dropdown}
          activeOpacity={0.7}
          onPress={() => setDropdownOpen((o) => !o)}
          accessibilityLabel="Select cancellation reason"
        >
          <Text style={csStyles.dropdownText}>{selected}</Text>
          <Text style={csStyles.dropdownArrow}>{dropdownOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {dropdownOpen && (
          <View style={csStyles.dropdownList}>
            {CANCEL_REASONS.map((r, i) => (
              <TouchableOpacity
                key={r}
                style={[
                  csStyles.dropdownItem,
                  selected === r && csStyles.dropdownItemActive,
                  i === CANCEL_REASONS.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => { setSelected(r); setDropdownOpen(false); }}
              >
                <Text style={[csStyles.dropdownItemTxt, selected === r && csStyles.dropdownItemTxtActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={csStyles.btnRow}>
          <TouchableOpacity
            style={csStyles.keepBtn}
            onPress={onDismiss}
            accessibilityLabel="Keep SOS active"
          >
            <Text style={csStyles.keepBtnTxt}>Keep SOS Active</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={csStyles.cancelConfirm}
            onPress={() => onCancel(selected)}
            accessibilityLabel="Confirm cancel SOS"
          >
            <Text style={csStyles.cancelConfirmTxt}>Cancel SOS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const csStyles = StyleSheet.create({
  overlay:              { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:                { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 24, paddingHorizontal: 20 },

  title:                { fontSize: 20, fontWeight: '800', color: '#DC2626', textAlign: 'center', marginBottom: 6 },
  sub:                  { fontSize: 14, color: '#374151', textAlign: 'center', lineHeight: 20, marginBottom: 16 },

  // Warning box
  warningBox:           { backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', padding: 13, marginBottom: 18 },
  warningHeader:        { fontSize: 13, fontWeight: '700', color: '#B91C1C', marginBottom: 7 },
  warningBullet:        { fontSize: 13, color: '#374151', lineHeight: 21 },

  // Reason picker
  reasonLabel:          { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  dropdown:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 13, backgroundColor: '#F9FAFB' },
  dropdownText:         { fontSize: 14, color: '#111827', flex: 1 },
  dropdownArrow:        { fontSize: 10, color: '#6B7280', marginLeft: 8 },

  dropdownList:         { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, marginTop: 4, overflow: 'hidden', backgroundColor: '#fff' },
  dropdownItem:         { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemActive:   { backgroundColor: '#2563EB' },
  dropdownItemTxt:      { fontSize: 14, color: '#374151' },
  dropdownItemTxtActive:{ color: '#fff', fontWeight: '600' },

  // Buttons
  btnRow:               { flexDirection: 'row', gap: 10, marginTop: 22 },
  keepBtn:              { flex: 1, borderWidth: 1.5, borderColor: '#4F46E5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  keepBtnTxt:           { fontSize: 14, fontWeight: '700', color: '#4F46E5' },
  cancelConfirm:        { flex: 1, backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelConfirmTxt:     { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SosActiveScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const { sosIncidentId, isVictim: isVictimParam } = route.params ?? {};

  const [incident,   setIncident]   = useState<SosIncidentDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [resolving,  setResolving]  = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const locInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const insets   = useSafeAreaInsets();
  const isVictim = isVictimParam ?? false;

  const fetchIncident = useCallback(async () => {
    try {
      const res = sosIncidentId
        ? await sosApi.getById(sosIncidentId)
        : await sosApi.getMyActive();
      if (res.data?.isSuccess && res.data.data) {
        setIncident(res.data.data as SosIncidentDetail);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [sosIncidentId]);

  // Poll responder list every 8 s
  useEffect(() => {
    fetchIncident();
    const id = setInterval(fetchIncident, 8000);
    return () => clearInterval(id);
  }, [fetchIncident]);

  // Push victim GPS every 10 s
  useEffect(() => {
    if (!isVictim || !sosIncidentId) { return; }
    const push = () => {
      Geolocation.getCurrentPosition(
        (pos) => {
          sosApi.updateLocation(sosIncidentId, {
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy:  pos.coords.accuracy ?? undefined,
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 10000 },
      );
    };
    push();
    locInterval.current = setInterval(push, AppConfig.SOS_LOCATION_INTERVAL_MS);
    return () => { if (locInterval.current) { clearInterval(locInterval.current); } };
  }, [isVictim, sosIncidentId]);

  // Freeze timer at resolve/cancel time so it doesn't keep counting after the SOS ends.
  const sosEndAt = incident?.resolvedAt ?? incident?.cancelledAt ?? null;
  const timer    = useTimer(incident?.createdAt, incident?.status !== 'ACTIVE' ? sosEndAt : null);
  const meta     = incident ? (TYPE_META[incident.alertType] ?? { emoji: '⚠️', color: '#EF4444' }) : { emoji: '⚠️', color: '#EF4444' };
  const headerBg = meta.color;

  const responders    = incident?.responders ?? [];
  const approvedCount = responders.filter((r) => r.approvalStatus === 'APPROVED').length;
  const pendingCount  = responders.filter((r) => r.approvalStatus === 'PENDING').length;
  const respondedCount = responders.length;   // total who responded (including approved + pending)

  // ── Approve ──────────────────────────────────────────────────────────────────

  const handleApprove = useCallback((responder: SosResponderItem) => {
    Alert.alert(
      'Approve Responder',
      `Allow ${responder.responderName} to see your live location?`,
      [
        { text: 'Approve — Share Location', onPress: () => doApprove(responder, true) },
        { text: 'Approve — Keep Private',   onPress: () => doApprove(responder, false) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident]);

  const doApprove = async (responder: SosResponderItem, canViewLocation: boolean) => {
    const incId = incident?.sosIncidentId ?? sosIncidentId;
    if (!incId) { return; }
    try {
      await sosApi.approveResponder(incId, { sosResponderId: responder.sosResponderId, canViewLocation });
      fetchIncident();
    } catch { /* silent */ }
  };

  // ── Decline ──────────────────────────────────────────────────────────────────

  const handleDecline = useCallback((responder: SosResponderItem) => {
    Alert.alert(
      'Decline Responder',
      `Decline help from ${responder.responderName}?`,
      [
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            const incId = incident?.sosIncidentId ?? sosIncidentId;
            if (!incId) { return; }
            try {
              await sosApi.declineResponder(incId, responder.sosResponderId);
              fetchIncident();
            } catch { /* silent */ }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident, sosIncidentId, fetchIncident]);

  // ── Resolve ───────────────────────────────────────────────────────────────────

  const handleResolve = () => {
    Alert.alert('Mark as Resolved', 'Are you safe now? This will close the alert.', [
      {
        text: "Yes, I'm Safe",
        onPress: async () => {
          const incId = incident?.sosIncidentId ?? sosIncidentId;
          if (!incId) { return; }
          setResolving(true);
          try {
            const res = await sosApi.resolve(incId);
            // Guard: only navigate if backend confirmed the resolve succeeded
            if (!res.data?.isSuccess) {
              Alert.alert('Error', res.data?.message ?? 'Could not resolve the alert. Please try again.');
              return;
            }
            nav.navigate('SosResolved', {
              sosIncidentId: incId,
              alertTypeName: incident?.alertTypeName ?? 'SOS Alert',
              resolvedAt:    new Date().toISOString(),
              timer,
            });
          } catch {
            Alert.alert('Error', 'Could not resolve the alert. Please try again.');
          } finally { setResolving(false); }
        },
      },
      { text: 'Not Yet', style: 'cancel' },
    ]);
  };

  // ── Cancel ────────────────────────────────────────────────────────────────────

  const handleCancel = async (reason: string) => {
    const incId = incident?.sosIncidentId ?? sosIncidentId;
    if (!incId) { return; }
    setShowCancel(false);
    setCancelling(true);
    try {
      await sosApi.cancel(incId, reason || undefined);
      nav.navigate('SosResolved', {
        sosIncidentId: incId,
        alertTypeName: incident?.alertTypeName ?? 'SOS Alert',
        resolvedAt:    new Date().toISOString(),
        cancelled:     true,
        timer,
      });
    } catch {
      Alert.alert('Error', 'Could not cancel the alert. Please try again.');
    } finally { setCancelling(false); }
  };

  // ── Loading / empty states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={C.RED} />
        <Text style={{ marginTop: 12, color: C.TEXT2 }}>Loading incident...</Text>
      </SafeAreaView>
    );
  }

  if (!incident) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} edges={['top']}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.TEXT, marginBottom: 6 }}>No Active SOS</Text>
        <Text style={{ fontSize: 14, color: C.TEXT2, textAlign: 'center', marginBottom: 20 }}>
          There is no active SOS incident at this time.
        </Text>
        <TouchableOpacity style={styles.resolveBtn} onPress={() => nav.goBack()}>
          <Text style={styles.resolveBtnTxt}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Colored header ──────────────────────────────────────────────────── */}
      <View style={[styles.redHeader, { backgroundColor: headerBg }]}>

        {/* Top row: SOS badge + label + timer */}
        <View style={styles.headerTopRow}>
          <View style={styles.sosBadgeRow}>
            <View style={styles.sosBadge}>
              <Text style={styles.sosBadgeTxt}>SOS</Text>
            </View>
            <Text style={styles.activeLabel}>
              {isVictim ? 'SOS ACTIVE' : (incident.alertTypeName ?? 'SOS ACTIVE')}
            </Text>
          </View>
          <Text style={styles.timerCompact}>{timer}</Text>
        </View>

        {/* Sub-text */}
        <Text style={styles.headerSub}>
          {isVictim
            ? 'Your alert has been sent. Stay calm — help is on the way.'
            : `Active SOS — ${incident.approxLocation ?? 'Location unknown'}`}
        </Text>

        {/* 3 stat chips */}
        <View style={styles.statChipRow}>
          <View style={styles.statChip}>
            <Text style={styles.statChipNum}>{respondedCount}</Text>
            <Text style={styles.statChipLbl}>Responded</Text>
          </View>
          <View style={styles.statChipDivider} />
          <View style={styles.statChip}>
            <Text style={styles.statChipNum}>{approvedCount}</Text>
            <Text style={styles.statChipLbl}>Approved</Text>
          </View>
          <View style={styles.statChipDivider} />
          <View style={styles.statChip}>
            <Text style={styles.statChipNum}>{pendingCount}</Text>
            <Text style={styles.statChipLbl}>Pending</Text>
          </View>
        </View>
      </View>

      {/* Scrollable body */}
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }}>

        {/* ── SOS Alert card ──────────────────────────────────────────────────── */}
        <View style={styles.alertCard}>
          <View style={styles.alertCardTop}>
            <View style={[styles.alertEmojiBox, { backgroundColor: headerBg + '22' }]}>
              <Text style={styles.alertEmoji}>{meta.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTypeName}>{incident.alertTypeName ?? 'SOS Alert'}</Text>
              <Text style={styles.alertMeta} numberOfLines={1}>
                {[
                  'Sent at ' + formatLocalDateTime(incident.createdAt),
                  incident.approxLocation,
                ].filter(Boolean).join('  ·  ')}
              </Text>
            </View>
          </View>
          {incident.description ? (
            <Text style={styles.alertDesc}>"{incident.description}"</Text>
          ) : null}
        </View>

        {/* ── People Responding ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People Responding</Text>

          {responders.length > 0 ? (
            responders.map((item) => (
              <ResponderRow
                key={String(item.sosResponderId)}
                item={item}
                isVictim={isVictim}
                onApprove={handleApprove}
                onDecline={handleDecline}
              />
            ))
          ) : (
            <View style={styles.noResponders}>
              <Text style={styles.noRespEmoji}>⏳</Text>
              <Text style={styles.noRespText}>
                {isVictim
                  ? 'Waiting for nearby members to respond...\nYour organization has been notified.'
                  : 'No responders yet.'}
              </Text>
            </View>
          )}
        </View>

      </ScrollView>

      {/* ── Victim action bar ───────────────────────────────────────────────────── */}
      {isVictim && (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.resolveBtn, (resolving || cancelling) && { opacity: 0.6 }]}
            onPress={handleResolve}
            disabled={resolving || cancelling}
            accessibilityLabel="Mark as resolved"
          >
            {resolving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.resolveBtnTxt}>✓  Mark as Resolved — I am Safe</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cancelBtn, (resolving || cancelling) && { opacity: 0.6 }]}
            onPress={() => setShowCancel(true)}
            disabled={resolving || cancelling}
            accessibilityLabel="Cancel SOS"
          >
            <Text style={styles.cancelBtnTxt}>
              {cancelling ? 'Cancelling...' : 'Cancel SOS Alert'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Responder back button ─────────────────────────────────────────────── */}
      {!isVictim && (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.resolveBtn} onPress={() => nav.goBack()} accessibilityLabel="Go back">
            <Text style={styles.resolveBtnTxt}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      <CancelSheet
        visible={showCancel}
        onCancel={handleCancel}
        onDismiss={() => setShowCancel(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: '#0F172A' },
  body:             { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  redHeader:        { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 },

  headerTopRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sosBadgeRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sosBadge:         { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sosBadgeTxt:      { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  activeLabel:      { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  timerCompact:     { color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: 1.5, fontVariant: ['tabular-nums'] },

  headerSub:        { color: 'rgba(255,255,255,0.78)', fontSize: 12, lineHeight: 17, marginBottom: 14 },

  statChipRow:      { flexDirection: 'row', alignItems: 'center' },
  statChip:         { flex: 1, alignItems: 'center' },
  statChipNum:      { fontSize: 22, fontWeight: '900', color: '#fff' },
  statChipLbl:      { fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },
  statChipDivider:  { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.25)' },

  // ── SOS Alert card ──────────────────────────────────────────────────────────
  alertCard:        { backgroundColor: '#1E293B', margin: 14, marginBottom: 4, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  alertCardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  alertEmojiBox:    { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alertEmoji:       { fontSize: 20 },
  alertTypeName:    { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  alertMeta:        { fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 16 },
  alertDesc:        { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic', lineHeight: 19, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10 },

  // ── People Responding section ────────────────────────────────────────────────
  section:          { backgroundColor: '#1E293B', marginHorizontal: 14, marginTop: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  sectionTitle:     { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', paddingHorizontal: 16, paddingVertical: 10, textTransform: 'uppercase', letterSpacing: 0.8 },

  noResponders:     { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  noRespEmoji:      { fontSize: 30, marginBottom: 10 },
  noRespText:       { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 20 },

  // ── Action bar ───────────────────────────────────────────────────────────────
  actionBar:        { backgroundColor: '#0F172A', paddingHorizontal: 16, paddingTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  resolveBtn:       { backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  resolveBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelBtn:        { paddingVertical: 12, alignItems: 'center' },
  cancelBtnTxt:     { color: 'rgba(255,255,255,0.5)', fontWeight: '500', fontSize: 14 },
});
