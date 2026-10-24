/**
 * DonateScreen
 *
 * Entry points:
 *   A) From NgoProfileScreen  → { orgId }  (no campaign pre-selected)
 *   B) From campaign detail   → { orgId, orgName, campaignId, campaignName, is80GEligible?, regNo?, regValidity? }
 *
 * Flow:
 *  1. Fetch org info + active campaigns if not already supplied
 *  2. User picks campaign (if multiple), amount, One-time / Monthly
 *  3. Optionally enters PAN for 80G
 *  4. Selects payment method
 *  5. Taps "Pay ₹X securely"
 *     → POST /donation/initiate → navigate to DonationPayment with transactionId + donationId
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { donationApi } from '../../api/donation.api';
import { lookupApi   } from '../../api/lookup.api';
import { getProfile  } from '../../api/org.api';
import apiClient from '../../api/apiClient';
import type { ApiResponse } from '../../types/api.types';

const C = AppConfig.COLORS;
const PRESETS = [500, 1000, 2000, 5000];

// Static fallback — shown when the DB lookup call fails or returns empty.
// These ValueCodes match exactly what the SP expects.
const STATIC_PAY_METHODS: LkpItem[] = [
  { lookupValueId: -1, valueCode: 'UPI',        valueName: 'UPI'               },
  { lookupValueId: -2, valueCode: 'CARD',        valueName: 'Credit / Debit Card' },
  { lookupValueId: -3, valueCode: 'NET_BANKING', valueName: 'Net Banking'       },
  // WALLET excluded — no wallet gateway integrated yet
];
const STATIC_DON_TYPES: LkpItem[] = [
  { lookupValueId: -10, valueCode: 'ONE_TIME', valueName: 'One-time' },
  { lookupValueId: -11, valueCode: 'MONTHLY',  valueName: 'Monthly'  },
];
const STATIC_VISIBILITY: LkpItem[] = [
  { lookupValueId: -20, valueCode: 'PUBLIC',    valueName: 'Public'    },
  { lookupValueId: -21, valueCode: 'ANONYMOUS', valueName: 'Anonymous' },
];

const PM_ICONS: Record<string, string> = {
  UPI: '📲', CARD: '💳', NET_BANKING: '🏦',
};

const AVATAR_COLORS = ['#6B4EFF','#2ECC71','#FF8C42','#2563EB','#D97706','#16A34A','#7C3AED'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}
function initials(name: string) {
  return (name || 'NG').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

type DonType = 'ONE_TIME' | 'MONTHLY';
type LkpItem = { lookupValueId: number; valueCode: string; valueName: string };

interface Campaign {
  campaignId:   number;
  campaignName: string;
  is80G?:       boolean;
  reg80GNo?:    string;
  reg80GValid?: string;
  raisedAmount?: number;
  targetAmount?: number;
  bannerUrl?:    string;
}

interface RouteParams {
  orgId:          number;
  orgName?:       string;
  campaignId?:    number;
  campaignName?:  string;
  is80GEligible?: boolean;
  regNo?:         string;
  regValidity?:   string;
}

const DonateScreen = () => {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const {
    orgId,
    orgName:       paramOrgName,
    campaignId:    paramCampaignId,
    campaignName:  paramCampaignName,
    is80GEligible: paramIs80G = false,
    regNo:         paramRegNo,
    regValidity:   paramRegValidity,
  } = (route.params ?? {}) as RouteParams;

  // ── Org & campaign state ─────────────────────────────────────────────────────
  const [orgName,     setOrgName]     = useState<string>(paramOrgName ?? '');
  const [orgLogoUrl,  setOrgLogoUrl]  = useState<string | null>(null);
  const [lastGiftMsg, setLastGiftMsg] = useState<string | null>(null);
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([]);
  const [selCampaign, setSelCampaign] = useState<Campaign | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // ── Donation state ───────────────────────────────────────────────────────────
  const [donType,       setDonType]       = useState<DonType>('ONE_TIME');
  const [amount,        setAmount]        = useState<number>(1000);
  const [customAmount,  setCustomAmount]  = useState<string>('');
  const [isCustom,      setIsCustom]      = useState(false);
  const [pan,           setPan]           = useState('');
  const [panName,       setPanName]       = useState('');
  const [isAnonymous,   setIsAnonymous]   = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  // ── Lookup state ─────────────────────────────────────────────────────────────
  const [payMethods,     setPayMethods]     = useState<LkpItem[]>(STATIC_PAY_METHODS);
  const [donTypes,       setDonTypes]       = useState<LkpItem[]>(STATIC_DON_TYPES);
  const [visibilityLkps, setVisibilityLkps] = useState<LkpItem[]>(STATIC_VISIBILITY);
  const [selPayMethod,   setSelPayMethod]   = useState<LkpItem>(STATIC_PAY_METHODS[0]);

  // ── Boot: fetch org, campaigns, lookups in parallel ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const tasks: Promise<any>[] = [
          // Always fetch org profile for logo + name
          getProfile(orgId),
          // Campaigns list for this org
          apiClient.get<ApiResponse<any>>('/donation/campaigns', { params: { orgId, pageNumber: 1, pageSize: 20 } }),
          // Lookups
          lookupApi.getValuesByTypeCode('PAY_METHOD'),
          lookupApi.getValuesByTypeCode('DONATION_TYPE'),
          lookupApi.getValuesByTypeCode('DON_VISIBILITY'),
        ];

        const [orgRes, campRes, pmRes, dtRes, visRes] = await Promise.allSettled(tasks);

        // Org info
        if (orgRes.status === 'fulfilled' && orgRes.value?.data?.isSuccess) {
          const d = orgRes.value.data.data;
          if (!paramOrgName && d?.orgName) setOrgName(d.orgName);
          setOrgLogoUrl(d?.logoUrl ?? d?.orgLogoUrl ?? null);
          // "Last time you gave" — the org profile SP doesn't return this today;
          // we leave it null and will add it when the SP returns it.
        }

        // Campaigns
        if (campRes.status === 'fulfilled' && campRes.value?.data?.isSuccess) {
          const items: Campaign[] = (campRes.value.data.data?.items ?? []).map((c: any) => ({
            campaignId:   c.campaignId,
            campaignName: c.campaignName ?? c.title ?? '',
            is80G:        !!(c.is80G ?? c.orgIs80G),
            reg80GNo:     c.reg80GNo ?? undefined,
            reg80GValid:  c.reg80GValid ?? undefined,
            raisedAmount: c.raisedAmount,
            targetAmount: c.targetAmount,
            bannerUrl:    c.bannerUrl ?? undefined,
          }));
          setCampaigns(items);

          // Pre-select: use route param campaignId, else first campaign
          if (paramCampaignId) {
            const presel = items.find(c => c.campaignId === paramCampaignId);
            setSelCampaign(presel ?? items[0] ?? null);
          } else if (items.length > 0) {
            setSelCampaign(items[0]);
          }
        } else if (paramCampaignId && paramCampaignName) {
          // Fallback to what was passed via route params
          setSelCampaign({
            campaignId:   paramCampaignId,
            campaignName: paramCampaignName,
            is80G:        paramIs80G,
            reg80GNo:     paramRegNo,
            reg80GValid:  paramRegValidity,
          });
        }

        // Lookups — replace static fallbacks only if DB returned real rows
        if (pmRes.status === 'fulfilled') {
          const pm = pmRes.value?.data?.data ?? [];
          if (pm.length > 0) { setPayMethods(pm); setSelPayMethod(pm[0]); }
        }
        if (dtRes.status === 'fulfilled') {
          const dt = dtRes.value?.data?.data ?? [];
          if (dt.length > 0) setDonTypes(dt);
        }
        if (visRes.status === 'fulfilled') {
          const vis = visRes.value?.data?.data ?? [];
          if (vis.length > 0) setVisibilityLkps(vis);
        }
      } catch {
        // All errors are soft — screen remains functional with static fallbacks
      } finally {
        setPageLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const finalAmount  = isCustom ? (parseFloat(customAmount) || 0) : amount;
  const is80G        = selCampaign?.is80G ?? paramIs80G ?? false;
  const regNo        = selCampaign?.reg80GNo ?? paramRegNo;
  const regValidity  = selCampaign?.reg80GValid ?? paramRegValidity;

  // Resolve lookup IDs — for static fallbacks (id < 0), the SP needs a real ID.
  // We pass 0 and let the SP use its default / skip validation. The DB patch
  // (009_DonationLookupSeeds.sql) seeds real rows so this is only a transition guard.
  const donTypeLkpId = (() => {
    const found = donTypes.find(d => d.valueCode === donType);
    return (found && found.lookupValueId > 0) ? found.lookupValueId : 0;
  })();
  const visLkpId = (() => {
    const code = isAnonymous ? 'ANONYMOUS' : 'PUBLIC';
    const found = visibilityLkps.find(v => v.valueCode === code);
    return (found && found.lookupValueId > 0) ? found.lookupValueId : 0;
  })();
  const payMethodLkpId = selPayMethod.lookupValueId > 0 ? selPayMethod.lookupValueId : 0;

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    if (finalAmount < 1) {
      Alert.alert('Invalid amount', 'Please enter a valid donation amount.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await donationApi.initiateDonation({
        orgId,
        campaignId:      selCampaign?.campaignId ?? undefined,
        amount:          finalAmount,
        donTypeLkpId,
        payMethodLkpId,
        visibilityLkpId: visLkpId,
        donorPan:        pan.trim() || undefined,
      });

      if (res.data?.isSuccess === 1) {
        const { transactionId, donationId } = res.data.data!;
        console.log('[DonateScreen] initiate OK — transactionId:', transactionId, '| donationId:', donationId);
        nav.navigate('DonationPayment', {
          transactionId,
          donationId,
          amount:       finalAmount,
          orgName,
          campaignName: selCampaign?.campaignName ?? 'General Donation',
          payMethod:    selPayMethod.valueName,
        });
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not initiate donation.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [finalAmount, selCampaign, donTypeLkpId, payMethodLkpId, visLkpId, pan, orgName, selPayMethod, nav]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} accessibilityLabel="Back">
            <Text style={s.backArrow}>←</Text>
            <Text style={s.backLabel}>Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Donate</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const color = avatarColor(orgName);
  const ini   = initials(orgName);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} accessibilityLabel="Back">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Donate</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* ── Org header card (prototype: logo + name + last gift) ── */}
          <View style={s.orgCard}>
            {orgLogoUrl
              ? <Image source={{ uri: orgLogoUrl }} style={s.orgAvatar} resizeMode="cover" />
              : (
                <View style={[s.orgAvatar, { backgroundColor: color }]}>
                  <Text style={s.orgAvatarText}>{ini}</Text>
                </View>
              )
            }
            <View style={{ flex: 1 }}>
              <Text style={s.orgCardName} numberOfLines={1}>{orgName}</Text>
              {lastGiftMsg ? (
                <Text style={s.orgCardSub} numberOfLines={1}>{lastGiftMsg}</Text>
              ) : (
                <Text style={s.orgCardSub} numberOfLines={1}>100% of your donation reaches the Organisation</Text>
              )}
            </View>
          </View>

          {/* ── Campaign picker (shown when multiple campaigns available) ── */}
          {campaigns.length > 1 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Select campaign</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {campaigns.map(c => (
                  <TouchableOpacity
                    key={c.campaignId}
                    style={[s.campaignChip, selCampaign?.campaignId === c.campaignId && s.campaignChipActive]}
                    onPress={() => setSelCampaign(c)}>
                    <Text
                      style={[s.campaignChipText, selCampaign?.campaignId === c.campaignId && s.campaignChipTextActive]}
                      numberOfLines={1}>
                      {c.campaignName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Show selected campaign name when only one */}
          {campaigns.length === 1 && selCampaign && (
            <Text style={s.singleCampaign}>
              Campaign: <Text style={{ fontWeight: '700', color: C.TEXT }}>{selCampaign.campaignName}</Text>
            </Text>
          )}

          {/* No campaigns at all */}
          {campaigns.length === 0 && (
            <View style={s.noCampaignCard}>
              <Text style={s.noCampaignText}>
                No specific campaigns right now — your donation will go directly to the organisation.
              </Text>
            </View>
          )}

          {/* ── One-time / Monthly toggle ── */}
          <View style={s.toggleRow}>
            {(['ONE_TIME', 'MONTHLY'] as DonType[]).map(type => (
              <TouchableOpacity
                key={type}
                style={[s.toggleBtn, donType === type && s.toggleActive]}
                onPress={() => setDonType(type)}>
                <Text style={[s.toggleText, donType === type && s.toggleTextActive]}>
                  {type === 'ONE_TIME' ? 'One-time' : 'Monthly'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Amount presets ── */}
          <Text style={s.sectionLabel}>Amount</Text>
          <View style={s.presetRow}>
            {PRESETS.map(p => (
              <TouchableOpacity
                key={p}
                style={[s.preset, !isCustom && amount === p && s.presetActive]}
                onPress={() => { setAmount(p); setIsCustom(false); setCustomAmount(''); }}>
                <Text style={[s.presetText, !isCustom && amount === p && s.presetTextActive]}>
                  ₹{p.toLocaleString('en-IN')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom amount */}
          <View style={[s.customRow, isCustom && s.customActive]}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              style={s.customInput}
              placeholder="Enter custom amount"
              placeholderTextColor={C.TEXT2}
              keyboardType="numeric"
              value={customAmount}
              onFocus={() => setIsCustom(true)}
              onChangeText={v => { setCustomAmount(v.replace(/[^0-9]/g, '')); setIsCustom(true); }}
            />
          </View>

          {/* ── Impact message ── */}
          {finalAmount > 0 && orgName ? (
            <View style={s.impactCard}>
              <Text style={s.impactIcon}>🤍</Text>
              <Text style={s.impactText}>
                Your ₹{finalAmount.toLocaleString('en-IN')} will create a ripple of change for{' '}
                <Text style={{ fontWeight: '700' }}>{orgName}</Text>.
              </Text>
            </View>
          ) : null}

          {/* ── 80G info ── */}
          {is80G && (
            <View style={s.card80G}>
              <View style={s.card80GHeader}>
                <View style={s.badge80GWrap}><Text style={s.badge80G}>80G</Text></View>
                <Text style={s.card80GTitle}>
                  <Text style={{ fontWeight: '700' }}>{orgName || 'This NGO'}</Text> can issue an 80G tax certificate.
                </Text>
              </View>
              <Text style={s.card80GInfo}>
                This donation qualifies for a 50% deduction under Section 80G.
              </Text>
              {regNo ? (
                <Text style={s.card80GSub}>80G reg. no. [{regNo}] · valid till [{regValidity ?? 'VALID UNTIL'}]</Text>
              ) : null}
            </View>
          )}

          {/* ── PAN for 80G ── */}
          {is80G && (
            <View style={s.panSection}>
              <Text style={s.fieldLabel}>Name as per PAN</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Alex Thompson"
                placeholderTextColor={C.TEXT2}
                value={panName}
                onChangeText={setPanName}
                autoCapitalize="words"
              />
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>PAN (for 80G certificate)</Text>
              <TextInput
                style={[s.input, { marginTop: 6 }]}
                placeholder="e.g. ABCDE1234F"
                placeholderTextColor={C.TEXT2}
                value={pan}
                onChangeText={v => setPan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                autoCapitalize="characters"
                maxLength={10}
              />
            </View>
          )}

          {/* ── Anonymous toggle ── */}
          <TouchableOpacity style={s.anonRow} onPress={() => setIsAnonymous(a => !a)}>
            <View style={[s.checkbox, isAnonymous && s.checkboxChecked]}>
              {isAnonymous && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.anonText}>Donate anonymously</Text>
          </TouchableOpacity>

          {/* ── Pay with ── */}
          <Text style={s.sectionLabel}>Pay with</Text>
          <View style={s.pmChipRow}>
            {payMethods.map(pm => {
              const active = selPayMethod?.lookupValueId === pm.lookupValueId;
              return (
                <TouchableOpacity
                  key={pm.lookupValueId}
                  style={[s.pmChip, active && s.pmChipActive]}
                  onPress={() => setSelPayMethod(pm)}>
                  <Text style={[s.pmChipText, active && s.pmChipTextActive]}>
                    {pm.valueName.replace('Credit / Debit ', '')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Spacer so last item clears the sticky footer */}
          <View style={{ height: insets.bottom + 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Pay button ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[s.payBtn, (finalAmount < 1 || submitting) && s.payBtnDisabled]}
          onPress={handlePay}
          disabled={finalAmount < 1 || submitting}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.payBtnText}>
                {finalAmount > 0
                  ? `Pay ₹${finalAmount.toLocaleString('en-IN')} securely`
                  : 'Enter an amount'}
              </Text>}
        </TouchableOpacity>
        <Text style={s.secureNote}>🔒 Secure & encrypted payment · 100% reaches the Organisation</Text>
      </View>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.BG },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Top bar
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: C.BORDER, backgroundColor: C.CARD },
  backBtn:      { minWidth: 70, height: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow:    { fontSize: 20, color: C.PRIMARY, fontWeight: '600' },
  backLabel:    { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: C.TEXT },

  scroll:       { padding: 16 },
  section:      { marginBottom: 14 },

  // Org header card
  orgCard:      { flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: C.CARD, borderRadius: 14, padding: 14,
                  marginBottom: 16,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  orgAvatar:    { width: 44, height: 44, borderRadius: 14, alignItems: 'center',
                  justifyContent: 'center', overflow: 'hidden' },
  orgAvatarText:{ fontSize: 15, fontWeight: '800', color: '#fff' },
  orgCardName:  { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 3 },
  orgCardSub:   { fontSize: 12, color: C.TEXT2 },

  // Campaign picker
  singleCampaign: { fontSize: 13, color: C.TEXT2, marginBottom: 14 },
  campaignChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    borderWidth: 1.5, borderColor: C.BORDER, backgroundColor: C.CARD,
                    marginRight: 8, marginVertical: 2 },
  campaignChipActive:     { borderColor: C.PRIMARY, backgroundColor: '#EFF6FF' },
  campaignChipText:       { fontSize: 13, color: C.TEXT2 },
  campaignChipTextActive: { color: C.PRIMARY, fontWeight: '600' },

  noCampaignCard: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, marginBottom: 14,
                    borderWidth: 1, borderColor: '#FDE68A' },
  noCampaignText: { fontSize: 13, color: '#92400E', lineHeight: 20 },

  // Toggle
  toggleRow:    { flexDirection: 'row', backgroundColor: C.BORDER, borderRadius: 10,
                  padding: 3, marginBottom: 18 },
  toggleBtn:    { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  toggleActive: { backgroundColor: C.PRIMARY, shadowColor: C.PRIMARY,
                  shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  toggleText:   { fontSize: 14, fontWeight: '600', color: C.TEXT2 },
  toggleTextActive: { color: '#fff' },

  // Amount
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.TEXT2, marginBottom: 10 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: C.TEXT },
  presetRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  preset:       { flex: 1, minWidth: '22%', paddingVertical: 10, borderRadius: 8, borderWidth: 1.5,
                  borderColor: C.BORDER, alignItems: 'center', backgroundColor: C.CARD },
  presetActive: { borderColor: C.PRIMARY, backgroundColor: '#EFF6FF' },
  presetText:   { fontSize: 14, fontWeight: '600', color: C.TEXT2 },
  presetTextActive: { color: C.PRIMARY },
  customRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.BORDER,
                  borderRadius: 10, paddingHorizontal: 12, backgroundColor: C.CARD, marginBottom: 16 },
  customActive: { borderColor: C.PRIMARY },
  rupee:        { fontSize: 18, color: C.TEXT, marginRight: 4 },
  customInput:  { flex: 1, height: 46, fontSize: 16, color: C.TEXT },

  // Impact message
  impactCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14,
                  marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' },
  impactIcon:   { fontSize: 18, marginTop: 1 },
  impactText:   { flex: 1, fontSize: 13, color: '#15803D', lineHeight: 20 },

  // 80G card
  card80G:       { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginBottom: 14,
                   borderWidth: 1, borderColor: '#BBF7D0' },
  card80GHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  badge80GWrap:  { backgroundColor: '#16A34A', paddingHorizontal: 7, paddingVertical: 2,
                   borderRadius: 6, alignSelf: 'flex-start', marginTop: 1 },
  badge80G:      { color: '#fff', fontSize: 11, fontWeight: '700' },
  card80GTitle:  { flex: 1, fontSize: 13, color: '#15803D', lineHeight: 18 },
  card80GInfo:   { fontSize: 12, color: '#15803D', marginBottom: 4 },
  card80GSub:    { fontSize: 11, color: '#166534' },

  // PAN
  panSection:   { marginBottom: 16 },
  input:        { borderWidth: 1.5, borderColor: C.BORDER, borderRadius: 10, paddingHorizontal: 14,
                  height: 46, fontSize: 14, color: C.TEXT, backgroundColor: C.CARD, marginTop: 6 },

  // Anonymous
  anonRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  checkbox:     { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: C.BORDER,
                  alignItems: 'center', justifyContent: 'center', backgroundColor: C.CARD },
  checkboxChecked:  { borderColor: C.PRIMARY, backgroundColor: C.PRIMARY },
  checkmark:    { fontSize: 12, color: '#fff', fontWeight: '700' },
  anonText:     { fontSize: 14, color: C.TEXT },

  // Pay method — horizontal chips
  pmChipRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pmChip:        { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                   borderWidth: 1.5, borderColor: C.BORDER, backgroundColor: C.CARD },
  pmChipActive:  { borderColor: C.PRIMARY, backgroundColor: '#EFF6FF' },
  pmChipText:    { fontSize: 14, fontWeight: '600', color: C.TEXT2 },
  pmChipTextActive: { color: C.PRIMARY },

  // Footer
  footer:       { paddingHorizontal: 16, paddingTop: 10,
                  borderTopWidth: 1, borderTopColor: C.BORDER, backgroundColor: C.CARD },
  payBtn:       { backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 15,
                  alignItems: 'center' },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  secureNote:   { textAlign: 'center', fontSize: 11, color: C.TEXT2, marginTop: 8 },
});

export default DonateScreen;
