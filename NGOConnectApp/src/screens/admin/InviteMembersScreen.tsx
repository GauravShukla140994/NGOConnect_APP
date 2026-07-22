/**
 * InviteMembersScreen.tsx — Admin: invite members to the organisation
 *
 * Two tabs:
 *   INVITE  — send a new invitation via phone or email
 *   HISTORY — paged list of all sent invitations with status + actions
 *
 * Invite tab flow:
 *  1. Toggle PHONE / EMAIL
 *  2. Enter value (phone number or email)
 *  3. POST → /org/{orgId}/invite/send
 *  4a. existingUserFound = true  → show profile preview card
 *  4b. existingUserFound = false → show share sheet with the invite link
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { inviteApi, OrgInvitation, SendInviteData } from '../../api/invite.api';
import { COUNTRIES, DEFAULT_COUNTRY, Country } from '../../constants/countries';
import { NTopbar, NCard, NBtn, NAvatar, NPill, NEmpty } from '../../components/ui';

const C = AppConfig.COLORS;
const S = AppConfig.SHADOW;
const R = AppConfig.RADIUS;

// ── Navigation types ──────────────────────────────────────────────────────────

type RouteParams = { orgId: number; orgName?: string };

// ── Status helpers ────────────────────────────────────────────────────────────

function statusColor(code: string): string {
  switch (code) {
    case 'ACCEPTED':  return '#10B981';
    case 'PENDING':   return '#F59E0B';
    case 'OPENED':    return '#3B82F6';
    case 'CANCELLED': return '#EF4444';
    case 'EXPIRED':   return C.TEXT3;
    default:          return C.TEXT3;
  }
}

function relDate(iso?: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

function formatExpiry(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (d < new Date()) return 'Expired';
  const diff = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  return `Expires in ${diff}d`;
}

// ── Invitation history card ───────────────────────────────────────────────────

function InviteCard({
  item,
  onCancel,
  onResend,
}: {
  item: OrgInvitation;
  onCancel: () => void;
  onResend: () => void;
}) {
  const isActive    = item.statusCode === 'PENDING' || item.statusCode === 'OPENED';
  const displayName = item.inviteeName
    ? `${item.inviteeName} ${item.inviteeLastName ?? ''}`.trim()
    : item.inviteValue;
  const initials = item.inviteeName
    ? `${item.inviteeName[0]}${item.inviteeLastName?.[0] ?? ''}`.toUpperCase()
    : item.inviteType === 'EMAIL' ? '✉' : '📞';

  return (
    <NCard style={s.inviteCard} small>
      <View style={s.cardRow}>
        {/* Avatar or icon */}
        <NAvatar initials={initials} size={40} />
        <View style={s.cardInfo}>
          <Text style={s.cardName} numberOfLines={1}>{displayName}</Text>
          <Text style={s.cardSub} numberOfLines={1}>
            {item.inviteType === 'PHONE' ? '📞' : '✉ '} {item.inviteValue}
          </Text>
          <Text style={s.cardMeta}>
            {item.sentAt ? `Sent ${relDate(item.sentAt)}` : ''}
            {item.deliveryStatus === 'FAILED' ? '  ⚠ delivery failed' : ''}
          </Text>
        </View>
        <View style={s.cardRight}>
          <View style={[s.statusDot, { backgroundColor: statusColor(item.statusCode) }]} />
          <Text style={[s.statusLabel, { color: statusColor(item.statusCode) }]}>
            {item.statusName}
          </Text>
          {item.statusCode !== 'ACCEPTED' && (
            <Text style={s.expiryText}>{formatExpiry(item.tokenExpiry)}</Text>
          )}
        </View>
      </View>

      {/* Action buttons — only for active invitations */}
      {isActive && (
        <View style={s.cardActions}>
          <TouchableOpacity style={s.actionBtn} onPress={onResend}>
            <Text style={s.actionBtnText}>↺ Resend</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.actionBtnRed]} onPress={onCancel}>
            <Text style={[s.actionBtnText, { color: '#EF4444' }]}>✕ Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </NCard>
  );
}

// ── Existing user preview card ────────────────────────────────────────────────

function UserPreviewCard({ data, orgId }: { data: SendInviteData; orgId: number }) {
  const nav     = useNavigation<any>();
  const initials = (data.existingUserName ?? '?')
    .split(' ')
    .filter(Boolean)
    .map((w: string) => w[0].toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        nav.navigate('VolunteerProfile', { userId: data.existingUserId, orgId })
      }>
      <NCard style={s.previewCard} small>
        <View style={s.previewRow}>
          <NAvatar initials={initials} size={48} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.previewName}>{data.existingUserName}</Text>
            {data.existingUserCity ? (
              <Text style={s.previewSub}>📍 {data.existingUserCity}</Text>
            ) : null}
            {(data.existingUserOrgCount ?? 0) > 0 ? (
              <Text style={s.previewSub}>
                Member of {data.existingUserOrgCount} org{data.existingUserOrgCount !== 1 ? 's' : ''}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 18, color: C.TEXT3 }}>›</Text>
        </View>
        <Text style={s.previewNote}>
          ✓ Already on RippleHub — notified in-app. Tap to view profile.
        </Text>
      </NCard>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function InviteMembersScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const { orgId, orgName } = route.params;

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'invite' | 'history'>('invite');

  // ── Invite form state ──────────────────────────────────────────────────────
  const [inviteType, setInviteType]       = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [value, setValue]                 = useState('');
  const [country, setCountry]             = useState<Country>(DEFAULT_COUNTRY);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [sending, setSending]             = useState(false);
  const [sentResult, setSentResult]       = useState<SendInviteData | null>(null);
  const [alreadyStatus, setAlreadyStatus] = useState<{ type: 'MEMBER' | 'INVITED'; message: string } | null>(null);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.toLowerCase();
    return q
      ? COUNTRIES.filter(c =>
          c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q)
        )
      : COUNTRIES;
  }, [countrySearch]);

  // ── History state ──────────────────────────────────────────────────────────
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [page, setPage]               = useState(1);
  const [totalCount, setTotalCount]   = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const loadingMore     = useRef(false);
  const flatListRef     = useRef<FlatList<OrgInvitation>>(null);
  // Signals onContentSizeChange to scroll to top after a fresh data load
  const scrollToTopNext = useRef(false);

  const PAGE_SIZE = 20;

  // ── Load history ───────────────────────────────────────────────────────────
  const loadHistory = useCallback(async (pageNum = 1, replace = true) => {
    if (loadingMore.current && !replace) return;
    loadingMore.current = true;
    if (replace) setHistLoading(true);

    try {
      const res = await inviteApi.list(orgId, {
        statusCode: statusFilter,
        pageNumber: pageNum,
        pageSize:   PAGE_SIZE,
      });
      if (res.data?.isSuccess && res.data.data) {
        const { items, totalCount: tc } = res.data.data;
        setInvitations(prev => replace ? items : [...prev, ...items]);
        setTotalCount(tc);
        setPage(pageNum);
      }
    } catch {
      /* silent — show stale list */
    } finally {
      setHistLoading(false);
      setRefreshing(false);
      loadingMore.current = false;
      // Signal FlatList to scroll to top once content has been measured
      if (replace) scrollToTopNext.current = true;
    }
  }, [orgId, statusFilter]);

  useEffect(() => {
    if (tab === 'history') loadHistory(1, true);
  }, [tab, statusFilter, loadHistory]);

  // Scroll to top when navigating back to this screen (prevents stale scroll position)
  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }, []),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory(1, true);
  }, [loadHistory]);

  const onEndReached = useCallback(() => {
    if (invitations.length < totalCount) loadHistory(page + 1, false);
  }, [invitations.length, totalCount, page, loadHistory]);

  // ── Send invitation ────────────────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      Alert.alert('Required', `Please enter a ${inviteType === 'PHONE' ? 'phone number' : 'email address'}.`);
      return;
    }
    if (inviteType === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setSending(true);
    setSentResult(null);
    setAlreadyStatus(null);
    try {
      const res = await inviteApi.send(orgId, {
        inviteTypeCode: inviteType,
        inviteValue:    trimmed,
        countryCode:    inviteType === 'PHONE' ? country.dial : undefined,
      });

      const body = res.data;
      if (!body?.isSuccess) {
        // Check for already-member / already-invited error codes
        const ec = (body?.errorCode ?? '').toUpperCase();
        if (ec === 'ALREADY_MEMBER') {
          setAlreadyStatus({ type: 'MEMBER', message: body?.message ?? 'This person is already a member of your organisation.' });
        } else if (ec === 'ALREADY_INVITED') {
          setAlreadyStatus({ type: 'INVITED', message: body?.message ?? 'An active invitation has already been sent to this contact.' });
        } else {
          Alert.alert('Cannot send', body?.message ?? 'Invitation could not be sent.');
        }
        return;
      }

      const data = body.data!;
      setSentResult(data);

      if (!data.existingUserFound && data.inviteLink) {
        // Non-platform contact — offer share sheet
        try {
          await Share.share({
            title:   `Join ${orgName ?? 'our organisation'} on RippleHub`,
            message: `${orgName ?? 'An NGO'} has invited you to join on RippleHub. Tap to accept: ${data.inviteLink}`,
            url:     data.inviteLink,
          });
        } catch {
          // User dismissed share sheet — that's fine
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setValue('');
    setSentResult(null);
    setAlreadyStatus(null);
  };

  // ── Cancel invitation ──────────────────────────────────────────────────────
  const handleCancel = (invitationId: number) => {
    Alert.alert('Cancel Invitation', 'The invitee will no longer be able to use this link.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Invite', style: 'destructive',
        onPress: async () => {
          try {
            const res = await inviteApi.cancel(invitationId);
            if (res.data?.isSuccess) {
              setInvitations(prev =>
                prev.map(i =>
                  i.orgInvitationId === invitationId
                    ? { ...i, statusCode: 'CANCELLED', statusName: 'Cancelled' }
                    : i,
                ));
            } else {
              Alert.alert('Error', res.data?.message ?? 'Could not cancel.');
            }
          } catch {
            Alert.alert('Error', 'Network error. Please try again.');
          }
        },
      },
    ]);
  };

  // ── Resend invitation ──────────────────────────────────────────────────────
  const handleResend = async (invitationId: number, inviteValue: string, inviteType: 'PHONE' | 'EMAIL') => {
    try {
      const res = await inviteApi.resend(invitationId);
      if (res.data?.isSuccess) {
        Alert.alert('Sent', `Invitation resent to ${inviteValue}.`);
        loadHistory(1, true);
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not resend.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const STATUS_FILTERS = [
    { label: 'All',       code: undefined        },
    { label: 'Pending',   code: 'PENDING'         },
    { label: 'Opened',    code: 'OPENED'          },
    { label: 'Accepted',  code: 'ACCEPTED'        },
    { label: 'Cancelled', code: 'CANCELLED'       },
    { label: 'Expired',   code: 'EXPIRED'         },
  ];

  const FILTER_CODES = STATUS_FILTERS.map(f => f.code);

  // ── Invite tab swipe: left → go to History ──────────────────────────────────
  const inviteSwipeState = useRef({ setTab });
  inviteSwipeState.current = { setTab };
  const invitePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        if (dx < -40 || vx < -0.4) inviteSwipeState.current.setTab('history');
      },
    })
  ).current;

  // ── History tab swipe: left/right cycles status filters ─────────────────────
  const histSwipeState = useRef({ statusFilter, setStatusFilter });
  histSwipeState.current = { statusFilter, setStatusFilter };
  const histPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        const { statusFilter: cur, setStatusFilter: set } = histSwipeState.current;
        const idx = FILTER_CODES.indexOf(cur);
        if ((dx < -40 || vx < -0.4) && idx < FILTER_CODES.length - 1)
          set(FILTER_CODES[idx + 1]);
        else if ((dx > 40 || vx > 0.4) && idx > 0)
          set(FILTER_CODES[idx - 1]);
      },
    })
  ).current;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <NTopbar
        title={orgName ? `Invite — ${orgName}` : 'Invite Members'}
        onBack={() => navigation.goBack()}
      />

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(['invite', 'history'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}>
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
              {t === 'invite' ? '+ Invite' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── INVITE TAB ── */}
      {tab === 'invite' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          {...invitePan.panHandlers}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.inviteContent}
            keyboardShouldPersistTaps="handled">

            {/* Type toggle */}
            <View style={s.typeToggle}>
              {(['PHONE', 'EMAIL'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.typeBtn, inviteType === t && s.typeBtnActive]}
                  onPress={() => { setInviteType(t); setValue(''); setSentResult(null); }}>
                  <Text style={[s.typeBtnLabel, inviteType === t && s.typeBtnLabelActive]}>
                    {t === 'PHONE' ? '📞 Phone' : '✉ Email'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input row */}
            <NCard style={s.inputCard} small>
              {inviteType === 'PHONE' ? (
                <View style={s.phoneRow}>
                  {/* Country code — full modal picker (same as Login screen) */}
                  <TouchableOpacity
                    style={s.codeChip}
                    onPress={() => { setCountrySearch(''); setShowCountryPicker(true); }}>
                    <Text style={s.codeChipFlag}>{country.flag}</Text>
                    <Text style={s.codeChipText}>{country.dial}</Text>
                    <Text style={s.codeChipArrow}>▾</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.input}
                    value={value}
                    onChangeText={v => { setValue(v.replace(/\D/g, '')); setSentResult(null); setAlreadyStatus(null); }}
                    placeholder={country.placeholder ?? 'Mobile number'}
                    placeholderTextColor={C.TEXT3}
                    keyboardType="phone-pad"
                    maxLength={country.maxLen ?? 15}
                  />
                </View>
              ) : (
                <TextInput
                  style={[s.input, { paddingHorizontal: 14 }]}
                  value={value}
                  onChangeText={v => { setValue(v.trim()); setSentResult(null); setAlreadyStatus(null); }}
                  placeholder="Email address"
                  placeholderTextColor={C.TEXT3}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}
            </NCard>

            {/* Already-member / already-invited warning */}
            {alreadyStatus && (
              <NCard style={s.warningCard} small>
                <View style={s.warningRow}>
                  <Text style={s.warningIcon}>
                    {alreadyStatus.type === 'MEMBER' ? '✅' : '⏳'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.warningTitle}>
                      {alreadyStatus.type === 'MEMBER' ? 'Already a Member' : 'Already Invited'}
                    </Text>
                    <Text style={s.warningMsg}>{alreadyStatus.message}</Text>
                    {alreadyStatus.type === 'INVITED' && (
                      <Text style={s.warningHint}>
                        You can resend or cancel the existing invitation from the History tab.
                      </Text>
                    )}
                  </View>
                </View>
              </NCard>
            )}

            {/* Result — existing user preview */}
            {sentResult?.existingUserFound && (
              <UserPreviewCard data={sentResult} orgId={orgId} />
            )}

            {/* Result — link sent to non-platform contact */}
            {sentResult && !sentResult.existingUserFound && (
              <NCard style={s.previewCard} small>
                <Text style={s.previewNote}>
                  ✓ Invitation created. Share the link below with the contact.
                </Text>
                {sentResult.inviteLink ? (
                  <TouchableOpacity
                    onPress={() =>
                      Share.share({
                        title:   `Join ${orgName ?? 'us'} on RippleHub`,
                        message: sentResult.inviteLink!,
                        url:     sentResult.inviteLink!,
                      })
                    }>
                    <Text style={s.linkText} numberOfLines={2}>{sentResult.inviteLink}</Text>
                    <Text style={s.linkTap}>Tap to share ↗</Text>
                  </TouchableOpacity>
                ) : null}
              </NCard>
            )}

            {/* CTA */}
            {sentResult || alreadyStatus ? (
              <NBtn
                label="Send Another Invitation"
                onPress={handleReset}
                style={s.sendBtn}
              />
            ) : (
              <NBtn
                label={sending ? 'Sending…' : 'Send Invitation'}
                onPress={handleSend}
                disabled={sending}
                style={s.sendBtn}
              />
            )}

            <Text style={s.hint}>
              {inviteType === 'PHONE'
                ? 'An SMS with an invite link will be sent to this number.'
                : 'An email with an invite link will be sent to this address.'}
              {'\n'}The link expires in 30 days.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Country Picker Modal (same as LoginScreen) ── */}
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCountryPicker(false)}>
        <SafeAreaView style={s.pickerModal}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>Select Country</Text>
            <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
              <Text style={s.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.pickerSearchWrap}>
            <TextInput
              style={s.pickerSearch}
              placeholder="Search country or code…"
              placeholderTextColor={C.TEXT3}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoFocus
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={c => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: c }) => (
              <Pressable
                style={({ pressed }) => [s.pickerItem, pressed && { backgroundColor: C.BG }]}
                onPress={() => {
                  setCountry(c);
                  setShowCountryPicker(false);
                  setCountrySearch('');
                }}>
                <Text style={s.pickerFlag}>{c.flag}</Text>
                <Text style={s.pickerName} numberOfLines={1}>{c.name}</Text>
                <Text style={s.pickerDial}>{c.dial}</Text>
                {country.code === c.code && <Text style={s.pickerCheck}>✓</Text>}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.BORDER }} />}
          />
        </SafeAreaView>
      </Modal>

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <View style={{ flex: 1 }} {...histPan.panHandlers}>
          {/* Status filter chips — fixed height so it never expands in flex layout */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.filterScroll}
            contentContainerStyle={s.filterRow}>
            {STATUS_FILTERS.map(f => (
              <TouchableOpacity
                key={f.label}
                style={[s.filterChip, statusFilter === f.code && s.filterChipActive]}
                onPress={() => setStatusFilter(f.code)}>
                <Text style={[s.filterChipLabel, statusFilter === f.code && s.filterChipLabelActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* FlatList is absolutely positioned starting right below the chip row.
              This bypasses the Android flex:1 measurement failure that causes a
              large gap between chips and content when the View mounts conditionally. */}
          <FlatList
              ref={flatListRef}
              key={statusFilter ?? 'ALL'}
              style={s.histList}
              onContentSizeChange={() => {
                // Fires after Android layout engine finishes measuring content —
                // the only reliable moment to call scrollToOffset on Android.
                if (scrollToTopNext.current) {
                  scrollToTopNext.current = false;
                  flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                }
              }}
              data={invitations}
              keyExtractor={i => String(i.orgInvitationId)}
              renderItem={({ item }) => (
                <InviteCard
                  item={item}
                  onCancel={() => handleCancel(item.orgInvitationId)}
                  onResend={() => handleResend(item.orgInvitationId, item.inviteValue, item.inviteType)}
                />
              )}
              contentContainerStyle={s.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              ListHeaderComponent={
                histLoading && invitations.length === 0
                  ? <ActivityIndicator style={{ marginTop: 40 }} color={C.PRIMARY} />
                  : null
              }
              ListEmptyComponent={
                !histLoading ? (
                  <View style={s.emptyState}>
                    <Text style={s.emptyIcon}>✉</Text>
                    <Text style={s.emptyTitle}>No invitations yet</Text>
                    <Text style={s.emptyMsg}>
                      {statusFilter
                        ? 'No invitations match this filter.'
                        : 'Send your first invitation using the Invite tab.'}
                    </Text>
                  </View>
                ) : null
              }
              refreshing={refreshing}
              onRefresh={onRefresh}
              onEndReached={onEndReached}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                invitations.length < totalCount
                  ? <ActivityIndicator style={{ paddingVertical: 16 }} color={C.PRIMARY} />
                  : null
              }
            />
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: C.BG },

  // Tabs
  tabBar:        { flexDirection: 'row', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tabBtn:        { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive:  { borderBottomWidth: 2, borderBottomColor: C.PRIMARY },
  tabLabel:      { fontSize: 14, fontWeight: '500', color: C.TEXT2 },
  tabLabelActive:{ color: C.PRIMARY, fontWeight: '700' },

  // Invite tab
  inviteContent: { padding: 16, gap: 14 },
  typeToggle:    { flexDirection: 'row', backgroundColor: C.CARD, borderRadius: R.CARD_SM,
                   padding: 4, ...S.CARD_SM },
  typeBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  typeBtnActive: { backgroundColor: C.PRIMARY },
  typeBtnLabel:  { fontSize: 14, fontWeight: '600', color: C.TEXT2 },
  typeBtnLabelActive: { color: '#fff' },

  inputCard: { padding: 0, overflow: 'hidden' },
  phoneRow:  { flexDirection: 'row', alignItems: 'center' },
  codeChip:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
                   paddingVertical: 14, borderRightWidth: 1, borderRightColor: C.BORDER },
  codeChipFlag:  { fontSize: 18, marginRight: 4 },
  codeChipText:  { fontSize: 14, color: C.TEXT, fontWeight: '600' },
  codeChipArrow: { fontSize: 10, color: C.TEXT3, marginLeft: 3 },
  input:         { flex: 1, fontSize: 15, color: C.TEXT, paddingVertical: 14, paddingHorizontal: 12 },

  previewCard: { padding: 16 },
  previewRow:  { flexDirection: 'row', alignItems: 'center' },
  previewName: { fontSize: 15, fontWeight: '700', color: C.TEXT },
  previewSub:  { fontSize: 13, color: C.TEXT2, marginTop: 2 },
  previewNote: { fontSize: 13, color: '#10B981', marginTop: 10, lineHeight: 18 },
  linkText:    { fontSize: 12, color: C.PRIMARY, marginTop: 8, lineHeight: 18 },
  linkTap:     { fontSize: 12, color: C.PRIMARY, fontWeight: '600', marginTop: 4 },

  sendBtn: { marginTop: 4 },
  hint:    { fontSize: 12, color: C.TEXT3, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },

  // History tab
  filterScroll:       { height: 56, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  histList:           { position: 'absolute', top: 57, left: 0, right: 0, bottom: 0 },
  filterRow:          { paddingHorizontal: 16, gap: 8,
                        alignItems: 'center', flexDirection: 'row',
                        height: 56 },
  filterChip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: '#F0F0F8', borderWidth: 1.5, borderColor: '#C8C8DC' },
  filterChipActive:   { backgroundColor: C.PRIMARY_LIGHT, borderColor: C.PRIMARY },
  filterChipLabel:    { fontSize: 13, color: '#444458', fontWeight: '500' },
  filterChipLabelActive: { color: C.PRIMARY, fontWeight: '700' },
  listContent:        { padding: 16, paddingBottom: 80, flexGrow: 1 },
  emptyState:         { paddingTop: 48, paddingHorizontal: 32, alignItems: 'center' },
  emptyIcon:          { fontSize: 40, marginBottom: 12 },
  emptyTitle:         { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginBottom: 6, textAlign: 'center' },
  emptyMsg:           { fontSize: 13, color: '#666680', textAlign: 'center', lineHeight: 20 },

  // Warning card (already member / already invited)
  warningCard:  { padding: 14, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1 },
  warningRow:   { flexDirection: 'row', gap: 10 },
  warningIcon:  { fontSize: 22 },
  warningTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  warningMsg:   { fontSize: 13, color: '#78350F', lineHeight: 18 },
  warningHint:  { fontSize: 12, color: '#B45309', marginTop: 4, lineHeight: 17 },

  // Country picker modal
  pickerModal:     { flex: 1, backgroundColor: C.BG },
  pickerHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                     paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  pickerTitle:     { fontSize: 17, fontWeight: '700', color: C.TEXT },
  pickerClose:     { fontSize: 18, color: C.TEXT2, padding: 4 },
  pickerSearchWrap:{ paddingHorizontal: 14, paddingBottom: 10 },
  pickerSearch:    { backgroundColor: C.CARD, borderRadius: 10, paddingHorizontal: 14,
                     paddingVertical: 10, fontSize: 14, color: C.TEXT,
                     borderWidth: 1, borderColor: C.BORDER },
  pickerItem:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                     paddingVertical: 12, backgroundColor: C.CARD },
  pickerFlag:      { fontSize: 22, marginRight: 12 },
  pickerName:      { flex: 1, fontSize: 14, color: C.TEXT },
  pickerDial:      { fontSize: 13, color: C.TEXT2, fontWeight: '600', marginLeft: 8 },
  pickerCheck:     { fontSize: 14, color: C.PRIMARY, fontWeight: '700', marginLeft: 8 },

  // Invite card
  inviteCard:   { padding: 14 },
  cardRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardInfo:     { flex: 1 },
  cardName:     { fontSize: 14, fontWeight: '700', color: C.TEXT },
  cardSub:      { fontSize: 13, color: C.TEXT2, marginTop: 2 },
  cardMeta:     { fontSize: 12, color: C.TEXT3, marginTop: 2 },
  cardRight:    { alignItems: 'flex-end', minWidth: 70 },
  statusDot:    { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  statusLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  expiryText:   { fontSize: 11, color: C.TEXT3, marginTop: 4 },
  cardActions:  { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12,
                  borderTopWidth: 1, borderTopColor: C.BORDER },
  actionBtn:    { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                  borderColor: C.BORDER, alignItems: 'center' },
  actionBtnRed: { borderColor: '#FEE2E2' },
  actionBtnText:{ fontSize: 13, fontWeight: '600', color: C.PRIMARY },
});
