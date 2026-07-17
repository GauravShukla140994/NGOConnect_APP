/**
 * FCMTestScreen — QA/Dev tool to fire any notification type in isolation.
 *
 * Usage:
 *  1. Enter your FCM device token (auto-fills from Firebase if available)
 *  2. Pick a notifType from the list
 *  3. Tap "Send Test Push" — the API fires FCM directly
 *
 * Add to AppNavigator temporarily for testing, remove before production release.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { notificationApi } from '../../api/notification.api';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

// ── All notification types the backend can fire ───────────────────────────────
const NOTIF_TYPES = [
  // Applications
  { type: 'NEW_APPLICATION',      label: '📋 New Application (→ admin)',      refType: 'PROJECT' },
  { type: 'APPLICATION_APPROVED', label: '✅ Application Approved (→ user)',  refType: 'PROJECT' },
  { type: 'APPLICATION_REJECTED', label: '❌ Application Rejected (→ user)',  refType: 'PROJECT' },
  // Membership
  { type: 'MEMBERSHIP_REQUEST',   label: '🙋 Membership Request (→ admin)',   refType: 'ORG' },
  { type: 'MEMBERSHIP_APPROVED',  label: '✅ Membership Approved (→ user)',   refType: 'ORG' },
  { type: 'MEMBERSHIP_REJECTED',  label: '❌ Membership Rejected (→ user)',   refType: 'ORG' },
  { type: 'MEMBER_REMOVED',       label: '🚪 Member Removed (→ user)',        refType: 'ORG' },
  // SOS
  { type: 'SOS_TRIGGERED',           label: '🆘 SOS Triggered (→ org)',          refType: 'SOS' },
  { type: 'SOS_RESPONDER_APPROVED',  label: '✅ SOS Responder Approved (→ user)',refType: 'SOS' },
  { type: 'SOS_RESOLVED',            label: '🏁 SOS Resolved (→ responders)',    refType: 'SOS' },
  // Donations
  { type: 'DONATION_CONFIRMED',       label: '💰 Donation Confirmed (→ donor)',  refType: 'CAMPAIGN' },
  { type: 'DONATION_RECEIVED_ADMIN',  label: '💰 Donation Received (→ admin)',   refType: 'CAMPAIGN' },
  // Community
  { type: 'COMMUNITY_POST', label: '📢 Community Post (→ members)', refType: 'COMMUNITY_POST' },
  { type: 'NEW_POLL',        label: '📊 New Poll (→ members)',       refType: 'POLL' },
  // Achievements
  { type: 'BADGE_AWARDED',  label: '🏅 Badge Awarded (→ user)',  refType: 'USER' },
  { type: 'SKILL_RATING',   label: '⭐ Skill Rating (→ user)',   refType: 'PROJECT' },
  // Super Admin
  { type: 'ORG_APPROVED',    label: '🎉 Org Approved (→ org admin)',    refType: 'ORG' },
  { type: 'ORG_REJECTED',    label: '⚠️  Org Rejected (→ org admin)',    refType: 'ORG' },
  { type: 'ORG_SUSPENDED',   label: '⛔ Org Suspended (→ org admin)',   refType: 'ORG' },
  { type: 'PROFILE_VERIFIED',label: '✅ Profile Verified (→ user)',     refType: 'USER' },
  { type: 'ACCOUNT_SUSPENDED',label: '⛔ Account Suspended (→ user)',  refType: 'USER' },
  // Dev
  { type: 'TEST', label: '🧪 Generic Test', refType: undefined },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function FCMTestScreen() {
  const [token,     setToken]     = useState('');
  const [selected,  setSelected]  = useState(NOTIF_TYPES[0]);
  const [refId,     setRefId]     = useState('1');
  const [loading,   setLoading]   = useState(false);
  const [lastResult,setLastResult]= useState<string | null>(null);

  // Auto-fill device token
  useEffect(() => {
    messaging().getToken().then(t => { if (t) { setToken(t); } }).catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!token.trim()) {
      Alert.alert('Token required', 'Enter a valid FCM device token.');
      return;
    }
    setLoading(true);
    setLastResult(null);
    try {
      const res = await notificationApi.sendTest({
        token:     token.trim(),
        title:     selected.label.replace(/^[^\s]+\s/, '').split('(')[0].trim(),
        body:      `Test: ${selected.type} — sent from FCMTestScreen`,
        notifType: selected.type,
        refId:     refId ? parseInt(refId, 10) : undefined,
        refType:   selected.refType,
      });
      setLastResult(res.data?.isSuccess === 1 ? '✅ Sent!' : `❌ ${res.data?.message}`);
    } catch (e: any) {
      setLastResult(`❌ Error: ${e?.message ?? 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>🔔 FCM Notification Tester</Text>
      <Text style={s.subtitle}>Fire any notification type in isolation</Text>

      {/* Token */}
      <Text style={s.label}>FCM Device Token</Text>
      <TextInput
        style={[s.input, s.tokenInput]}
        value={token}
        onChangeText={setToken}
        placeholder="Paste FCM token or auto-filled above"
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={3}
      />

      {/* Ref ID */}
      <Text style={s.label}>Ref ID (optional)</Text>
      <TextInput
        style={s.input}
        value={refId}
        onChangeText={setRefId}
        placeholder="e.g. 1 (projectId / orgId / sosId)"
        placeholderTextColor="#aaa"
        keyboardType="number-pad"
      />

      {/* Notif type picker */}
      <Text style={s.label}>Notification Type</Text>
      <ScrollView style={s.picker} showsVerticalScrollIndicator={false}>
        {NOTIF_TYPES.map(item => (
          <TouchableOpacity
            key={item.type}
            style={[s.typeRow, selected.type === item.type && s.typeRowSelected]}
            onPress={() => setSelected(item)}>
            <Text style={[s.typeLabel, selected.type === item.type && s.typeLabelSelected]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Selected summary */}
      <View style={s.summary}>
        <Text style={s.summaryText}>
          Type: <Text style={s.bold}>{selected.type}</Text>
          {selected.refType ? `  ·  RefType: ${selected.refType}` : ''}
        </Text>
      </View>

      {/* Send */}
      <TouchableOpacity style={s.btn} onPress={handleSend} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Send Test Push →</Text>
        }
      </TouchableOpacity>

      {/* Result */}
      {lastResult && (
        <View style={[s.result, lastResult.startsWith('✅') ? s.resultOk : s.resultErr]}>
          <Text style={s.resultText}>{lastResult}</Text>
        </View>
      )}

      <Text style={s.hint}>
        ⚠️ DEV ONLY — remove this screen before Play Store release
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8f8ff', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 24 },
  title:           { fontSize: 20, fontWeight: '700', color: C.PRIMARY, marginBottom: 2 },
  subtitle:        { fontSize: 13, color: '#666', marginBottom: 16 },
  label:           { fontSize: 12, fontWeight: '600', color: '#444', marginBottom: 4 },
  input:           { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#222', marginBottom: 12 },
  tokenInput:      { minHeight: 70, textAlignVertical: 'top' },
  picker:          { maxHeight: 200, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fff', marginBottom: 10 },
  typeRow:         { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  typeRowSelected: { backgroundColor: C.PRIMARY_LIGHT },
  typeLabel:       { fontSize: 13, color: '#333' },
  typeLabelSelected:{ color: C.PRIMARY, fontWeight: '600' },
  summary:         { backgroundColor: '#eee', borderRadius: 6, padding: 8, marginBottom: 12 },
  summaryText:     { fontSize: 12, color: '#555' },
  bold:            { fontWeight: '700', color: '#222' },
  btn:             { backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnText:         { color: '#fff', fontWeight: '700', fontSize: 15 },
  result:          { borderRadius: 8, padding: 10, marginBottom: 10 },
  resultOk:        { backgroundColor: '#e6f9ee' },
  resultErr:       { backgroundColor: '#ffe9e9' },
  resultText:      { fontSize: 13, fontWeight: '600' },
  hint:            { fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 8 },
});
