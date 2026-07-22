import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { inviteApi, VerifyTokenData } from '../../api/invite.api';

const C  = AppConfig.COLORS;
const SH = AppConfig.SHADOW;
const R  = AppConfig.RADIUS;

type RouteParams = { token: string };

// ─────────────────────────────────────────────────────────────────────────────
const InviteAcceptScreen = () => {
  const nav   = useNavigation<any>();
  const route = useRoute<RouteProp<{ InviteAccept: RouteParams }, 'InviteAccept'>>();
  const { token } = route.params;

  const [loading,    setLoading]    = useState(true);
  const [accepting,  setAccepting]  = useState(false);
  const [info,       setInfo]       = useState<VerifyTokenData | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  // ── Load invite info ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await inviteApi.verifyToken(token);
        if (res.data?.isSuccess && res.data.data) {
          setInfo(res.data.data as unknown as VerifyTokenData);
        } else {
          setErrorMsg(res.data?.message ?? 'This invitation is no longer valid.');
        }
      } catch {
        setErrorMsg('Unable to load invitation. Please check your connection.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // ── Accept ────────────────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (!info) { return; }
    setAccepting(true);
    try {
      const res = await inviteApi.accept(info.orgInvitationId);
      if (res.data?.isSuccess) {
        Alert.alert(
          'Welcome! 🎉',
          res.data?.message ?? `You have joined ${info.orgName} as a member.`,
          [{
            text: 'View Organisation',
            onPress: () => nav.replace('NgoProfile', { orgId: info.orgId }),
          }],
        );
      } else {
        Alert.alert('Could not accept', res.data?.message ?? 'Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setAccepting(false);
    }
  }, [info, nav]);

  // ── Org initials fallback ────────────────────────────────────────────────
  const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  // ── Expiry label ─────────────────────────────────────────────────────────
  const expiryLabel = (iso: string) => {
    const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    if (diff <= 0)  { return 'Expired'; }
    if (diff === 1) { return 'Expires today'; }
    return `Expires in ${diff} days`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
          <Text style={s.loadingText}>Loading invitation…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error / invalid token
  if (errorMsg || !info) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <Text style={s.errorIcon}>🔗</Text>
          <Text style={s.errorTitle}>Invalid Invitation</Text>
          <Text style={s.errorBody}>{errorMsg}</Text>
          <TouchableOpacity style={s.closeBtn} onPress={() => nav.goBack()}>
            <Text style={s.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isExpired = info.statusCode === 'EXPIRED' ||
                    new Date(info.tokenExpiry).getTime() < Date.now();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Invitation</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* ── Card ────────────────────────────────────────────────────────── */}
      <View style={s.content}>
        <View style={[s.card, SH.CARD]}>

          {/* Org logo */}
          <View style={s.logoWrap}>
            {info.orgLogo ? (
              <Image source={{ uri: info.orgLogo }} style={s.logo} />
            ) : (
              <View style={s.logoFallback}>
                <Text style={s.logoInitials}>{initials(info.orgName)}</Text>
              </View>
            )}
          </View>

          {/* Org name + city */}
          <Text style={s.orgName}>{info.orgName}</Text>
          {!!info.orgCity && <Text style={s.orgCity}>📍 {info.orgCity}</Text>}

          {/* Divider */}
          <View style={s.divider} />

          {/* Inviter */}
          <View style={s.inviterRow}>
            {info.invitedByPhoto ? (
              <Image source={{ uri: info.invitedByPhoto }} style={s.inviterAvatar} />
            ) : (
              <View style={s.inviterAvatarFallback}>
                <Text style={s.inviterInitials}>
                  {initials(info.invitedByName ?? '?')}
                </Text>
              </View>
            )}
            <View style={s.inviterInfo}>
              <Text style={s.inviterLabel}>Invited by</Text>
              <Text style={s.inviterName}>{info.invitedByName}</Text>
            </View>
          </View>

          {/* Expiry */}
          <View style={[s.expiryBadge, isExpired && s.expiryBadgeRed]}>
            <Text style={[s.expiryText, isExpired && s.expiryTextRed]}>
              {isExpired ? '⚠️ Expired' : `⏱ ${expiryLabel(info.tokenExpiry)}`}
            </Text>
          </View>
        </View>

        {/* ── Body copy ─────────────────────────────────────────────────── */}
        {!isExpired && (
          <Text style={s.bodyText}>
            You've been invited to join <Text style={s.bodyBold}>{info.orgName}</Text> on
            RippleHub. Accept the invitation to join instantly as a member.
          </Text>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        {isExpired ? (
          <View style={s.expiredNote}>
            <Text style={s.expiredNoteText}>
              This invitation has expired. Ask the admin to send a new one.
            </Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => nav.goBack()}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[s.acceptBtn, accepting && s.acceptBtnDisabled]}
              onPress={handleAccept}
              disabled={accepting}>
              {accepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.acceptBtnText}>✓  Accept &amp; Join</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.declineBtn} onPress={() => nav.goBack()}>
              <Text style={s.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.BG },

  // header
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                paddingVertical: 12, backgroundColor: C.CARD,
                borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:    { minWidth: 70, height: 36, justifyContent: 'center' },
  backText:   { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:{ flex: 1, fontSize: 18, fontWeight: '700', color: C.TEXT, textAlign: 'center' },

  // content
  content:    { flex: 1, paddingHorizontal: 20, paddingTop: 24, alignItems: 'center' },

  // card
  card:       { width: '100%', backgroundColor: C.CARD, borderRadius: R.CARD,
                padding: 24, alignItems: 'center', marginBottom: 20 },

  // org logo
  logoWrap:   { marginBottom: 14 },
  logo:       { width: 80, height: 80, borderRadius: 20, resizeMode: 'cover' },
  logoFallback: { width: 80, height: 80, borderRadius: 20, backgroundColor: C.PRIMARY,
                  alignItems: 'center', justifyContent: 'center' },
  logoInitials: { fontSize: 28, fontWeight: '700', color: '#fff' },

  // org info
  orgName:    { fontSize: 20, fontWeight: '700', color: C.TEXT, textAlign: 'center', marginBottom: 4 },
  orgCity:    { fontSize: 13, color: C.TEXT2, marginBottom: 4 },

  divider:    { width: '100%', height: 1, backgroundColor: C.BORDER, marginVertical: 16 },

  // inviter
  inviterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, alignSelf: 'stretch' },
  inviterAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, resizeMode: 'cover' },
  inviterAvatarFallback: { width: 44, height: 44, borderRadius: 22, marginRight: 12,
                           backgroundColor: C.PRIMARY + '33', alignItems: 'center', justifyContent: 'center' },
  inviterInitials: { fontSize: 16, fontWeight: '700', color: C.PRIMARY },
  inviterInfo:{ flex: 1 },
  inviterLabel: { fontSize: 11, color: C.TEXT2, marginBottom: 2 },
  inviterName:  { fontSize: 15, fontWeight: '600', color: C.TEXT },

  // expiry badge
  expiryBadge:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                    backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC' },
  expiryBadgeRed: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  expiryText:     { fontSize: 12, color: '#16A34A', fontWeight: '600' },
  expiryTextRed:  { color: C.RED },

  // body
  bodyText:   { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 22,
                marginBottom: 24, paddingHorizontal: 4 },
  bodyBold:   { fontWeight: '700', color: C.TEXT },

  // accept button
  acceptBtn:  { width: '100%', backgroundColor: C.PRIMARY, borderRadius: R.CARD_SM,
                paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  acceptBtnDisabled: { opacity: 0.55 },
  acceptBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // decline button
  declineBtn: { paddingVertical: 10 },
  declineBtnText: { fontSize: 15, color: C.TEXT2, fontWeight: '500' },

  // expired state
  expiredNote: { alignItems: 'center', marginTop: 8 },
  expiredNoteText: { fontSize: 14, color: C.TEXT2, textAlign: 'center',
                     lineHeight: 20, marginBottom: 20 },

  // close button (error / expired)
  closeBtn:   { paddingHorizontal: 32, paddingVertical: 12, backgroundColor: C.PRIMARY,
                borderRadius: R.CARD_SM },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // loading / error states
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText:{ marginTop: 12, fontSize: 14, color: C.TEXT2 },
  errorIcon:  { fontSize: 52, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: C.TEXT, marginBottom: 8 },
  errorBody:  { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
});

export default InviteAcceptScreen;
