/**
 * CommunicationPreferencesScreen
 * Lets the user control which types of notifications / messages they receive.
 *
 * GET  /api/v1/communication-preferences  — fetch current preferences
 * PUT  /api/v1/communication-preferences  — save changes
 *
 * Gracefully degrades to all-enabled defaults if the API returns an error
 * (e.g. endpoint not yet deployed on staging).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import {
  communicationApi,
  CommunicationPreferences,
  DEFAULT_PREFS,
} from '../../api/communication.api';

const C = AppConfig.COLORS;

// ─────────────────────────────────────────────────────────────────────────────
// Toggle row definition
// ─────────────────────────────────────────────────────────────────────────────
type ToggleKey = keyof CommunicationPreferences;

interface ToggleDef {
  key:     ToggleKey;
  icon:    string;
  label:   string;
  desc:    string;
  section: string;
}

const TOGGLES: ToggleDef[] = [
  {
    section: 'PUSH NOTIFICATIONS',
    key:     'receivePushNotifications',
    icon:    '🔔',
    label:   'Push Notifications',
    desc:    'Receive real-time alerts for activity, applications, and updates.',
  },
  {
    section: 'EMAILS',
    key:     'receivePromotionalEmails',
    icon:    '📧',
    label:   'Promotional Emails',
    desc:    'Newsletters, special offers, and platform news from RippleHub.',
  },
  {
    section: 'SMS',
    key:     'receivePromotionalSms',
    icon:    '💬',
    label:   'Promotional SMS',
    desc:    'Occasional text messages about campaigns and opportunities.',
  },
  {
    section: 'UPDATES',
    key:     'receiveNgoUpdates',
    icon:    '🏢',
    label:   'NGO Updates',
    desc:    'Announcements from organisations you have joined or follow.',
  },
  {
    section: 'UPDATES',
    key:     'receiveDonationAlerts',
    icon:    '💚',
    label:   'Donation Alerts',
    desc:    'Confirmations, receipts, and recurring donation reminders.',
  },
  {
    section: 'UPDATES',
    key:     'receiveVolunteerOpportunities',
    icon:    '🤝',
    label:   'Volunteer Opportunities',
    desc:    'New projects and opportunities matching your skills and location.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function CommunicationPreferencesScreen() {
  const nav = useNavigation<any>();

  const [prefs,   setPrefs]   = useState<CommunicationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [dirty,   setDirty]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Load from API ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await communicationApi.get();
        if (res.data?.isSuccess && res.data.data) {
          // DynamicRow returns TINYINT(1) as number 1/0, not boolean true/false.
          // !! forces to proper boolean so Switch renders correctly on Android.
          const r = res.data.data as any;
          setPrefs({
            receivePushNotifications:      !!r.receivePushNotifications,
            receivePromotionalEmails:      !!r.receivePromotionalEmails,
            receivePromotionalSms:         !!r.receivePromotionalSms,
            receiveNgoUpdates:             !!r.receiveNgoUpdates,
            receiveDonationAlerts:         !!r.receiveDonationAlerts,
            receiveVolunteerOpportunities: !!r.receiveVolunteerOpportunities,
          });
        }
        // else keep DEFAULT_PREFS (all true) — API not deployed or no data yet
      } catch {
        // Network error — keep DEFAULT_PREFS silently
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Toggle a single preference ────────────────────────────────────────────
  const onToggle = useCallback((key: ToggleKey, value: boolean) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSuccess(false);
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await communicationApi.update(prefs);
      setDirty(false);
      setSuccess(true);
    } catch {
      setError('Could not save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Header nav={nav} saving={false} dirty={false} onSave={onSave} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  // Group toggles by section
  const sections: string[] = [];
  for (const t of TOGGLES) {
    if (!sections.includes(t.section)) sections.push(t.section);
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Header nav={nav} saving={saving} dirty={dirty} onSave={onSave} />

      <ScrollView contentContainerStyle={s.scroll}>

        <Text style={s.intro}>
          Choose which types of messages and alerts you want to receive from RippleHub.
        </Text>

        {sections.map(section => {
          const items = TOGGLES.filter(t => t.section === section);
          return (
            <View key={section} style={s.section}>
              <Text style={s.sectionLabel}>{section}</Text>
              <View style={s.card}>
                {items.map((item, idx) => (
                  <View
                    key={item.key}
                    style={[s.row, idx < items.length - 1 && s.rowBorder]}
                  >
                    <Text style={s.rowIcon}>{item.icon}</Text>
                    <View style={s.rowText}>
                      <Text style={s.rowLabel}>{item.label}</Text>
                      <Text style={s.rowDesc}>{item.desc}</Text>
                    </View>
                    <Switch
                      value={prefs[item.key] as boolean}
                      onValueChange={v => onToggle(item.key, v)}
                      trackColor={{ false: C.BORDER, true: C.PRIMARY + '66' }}
                      thumbColor={prefs[item.key] ? C.PRIMARY : '#ccc'}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Feedback */}
        {error ? (
          <View style={s.feedback}>
            <Text style={s.feedbackErr}>⚠️ {error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={s.feedback}>
            <Text style={s.feedbackOk}>✅ Preferences saved successfully.</Text>
          </View>
        ) : null}

        <Text style={s.note}>
          Transactional notifications (OTP, SOS alerts, donation receipts) are always
          sent regardless of these settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header sub-component
// ─────────────────────────────────────────────────────────────────────────────
function Header({
  nav, saving, dirty, onSave,
}: {
  nav: any; saving: boolean; dirty: boolean; onSave: () => void;
}) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
        <Text style={s.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>Communication</Text>
      {dirty ? (
        <TouchableOpacity style={s.saveBtn} onPress={onSave} disabled={saving}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.headerRight} />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.BG },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                 paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1,
                 borderBottomColor: C.BORDER },
  backBtn:     { minWidth: 70, height: 36, justifyContent: 'center' },
  backText:    { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.TEXT },
  headerRight: { width: 60 },
  saveBtn:     { backgroundColor: C.PRIMARY, borderRadius: 8, paddingHorizontal: 14,
                 paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // body
  scroll:      { padding: 16, paddingBottom: 48 },
  intro:       { fontSize: 14, color: C.TEXT2, lineHeight: 20, marginBottom: 16 },

  // section
  section:     { marginBottom: 20 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: C.TEXT2, letterSpacing: 1.2,
                 marginBottom: 8 },
  card:        { backgroundColor: C.CARD, borderRadius: 12, overflow: 'hidden',
                 shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                 shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },

  // toggle row
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
                 paddingVertical: 13, gap: 10 },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: C.BORDER },
  rowIcon:     { fontSize: 20, width: 28, textAlign: 'center' },
  rowText:     { flex: 1 },
  rowLabel:    { fontSize: 15, fontWeight: '600', color: C.TEXT, marginBottom: 2 },
  rowDesc:     { fontSize: 12, color: C.TEXT2, lineHeight: 16 },

  // feedback
  feedback:    { borderRadius: 8, padding: 12, marginTop: 4, marginBottom: 12,
                 backgroundColor: C.CARD },
  feedbackErr: { fontSize: 14, color: C.RED, fontWeight: '600' },
  feedbackOk:  { fontSize: 14, color: '#16A34A', fontWeight: '600' },

  // note
  note:        { fontSize: 12, color: C.TEXT3, lineHeight: 18, marginTop: 8,
                 fontStyle: 'italic' },
});
