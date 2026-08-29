/**
 * TransferFounderScreen
 *
 * Shown when the user tries to delete their account but is the sole Founder of
 * an org that still has other members. The user picks a successor, confirms the
 * transfer, and then account deletion is retried automatically.
 *
 * Flow:
 *   ProfileScreen (delete account → SOLE_FOUNDER)
 *     → navigate('TransferFounder', params)
 *     → user picks a member → confirm alert
 *     → POST /org/{orgId}/transfer-founder
 *     → DELETE /user/account
 *     → logout()
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { orgApi } from '../../api/org.api';
import { deleteAccount } from '../../api/user.api';
import { useAuthStore } from '../../store/authStore';
import { OrgMember } from '../../types/api.types';

const C = AppConfig.COLORS;

// ── Navigation types ──────────────────────────────────────────────────────────

type TransferFounderParams = {
  TransferFounder: {
    orgId:               number;
    orgName:             string;
    orgLogoUrl?:         string;
    totalMembers:        number;
    availableAdminCount: number;
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

const TransferFounderScreen: React.FC = () => {
  const navigation  = useNavigation<any>();
  const route       = useRoute<RouteProp<TransferFounderParams, 'TransferFounder'>>();
  const { orgId, orgName, orgLogoUrl, totalMembers, availableAdminCount } = route.params;
  const { user, logout } = useAuthStore();

  const [members,      setMembers]      = useState<OrgMember[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedId,   setSelectedId]   = useState<number | null>(null);
  const [confirming,   setConfirming]   = useState(false);

  // ── Load members ─────────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await orgApi.getMembers(orgId);
      if (res.data?.isSuccess && Array.isArray(res.data.data)) {
        // Exclude the current user (they are the founder we're replacing)
        const others = (res.data.data as OrgMember[]).filter(
          m => m.userId !== user?.userId && m.statusCode === 'APPROVED',
        );
        // Sort: ADMIN / FOUNDER first, then regular members
        others.sort((a, b) => {
          const rank = (rc: string) =>
            rc === 'FOUNDER' ? 0 : rc === 'ADMIN' ? 1 : 2;
          return rank(a.roleCode) - rank(b.roleCode);
        });
        setMembers(others);
      }
    } catch {
      Alert.alert('Error', 'Could not load members. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [orgId, user?.userId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // ── Transfer + delete ────────────────────────────────────────────────────

  const handleConfirm = useCallback(() => {
    if (!selectedId) return;
    const chosen = members.find(m => m.userId === selectedId);
    if (!chosen) return;

    Alert.alert(
      'Transfer Ownership?',
      `${chosen.fullName} will become the new Founder of "${orgName}". You will be set as Admin.\n\nAfter the transfer your account deletion will continue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer & Delete',
          style: 'destructive',
          onPress: async () => {
            setConfirming(true);
            try {
              // Step 1: transfer founder role
              const transferRes = await orgApi.transferFounder(orgId, selectedId);
              if (!transferRes.data?.isSuccess) {
                Alert.alert(
                  'Transfer Failed',
                  transferRes.data?.message ?? 'Could not transfer ownership. Please try again.',
                );
                return;
              }

              // Step 2: retry account deletion (should now succeed)
              const deleteRes = await deleteAccount();
              if (deleteRes.data?.isSuccess) {
                Alert.alert(
                  'Account Scheduled for Deletion',
                  'Ownership transferred successfully. Your account has been scheduled for deletion. You have 30 days to sign back in and change your mind.',
                  [{ text: 'OK', onPress: () => logout() }],
                );
              } else {
                // Unexpected — rare edge case
                Alert.alert(
                  'Ownership Transferred',
                  `Ownership of "${orgName}" has been transferred to ${chosen.fullName}. However, account deletion encountered an issue: ${deleteRes.data?.message ?? 'Unknown error'}. Please try deleting your account again from Profile settings.`,
                  [{ text: 'OK', onPress: () => navigation.goBack() }],
                );
              }
            } catch {
              Alert.alert('Error', 'Something went wrong. Please check your connection and try again.');
            } finally {
              setConfirming(false);
            }
          },
        },
      ],
    );
  }, [selectedId, members, orgId, orgName, logout, navigation]);

  // ── Render member row ────────────────────────────────────────────────────

  const renderMember = useCallback(({ item }: { item: OrgMember }) => {
    const isAdmin    = item.roleCode === 'ADMIN' || item.roleCode === 'FOUNDER';
    const isSelected = item.userId === selectedId;

    return (
      <TouchableOpacity
        style={[styles.memberRow, isSelected && styles.memberRowSelected]}
        onPress={() => setSelectedId(item.userId)}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        {item.profilePhoto ? (
          <Image source={{ uri: item.profilePhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {(item.fullName ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName} numberOfLines={1}>{item.fullName}</Text>
          <View style={styles.memberMeta}>
            <View style={[styles.roleBadge, isAdmin && styles.roleBadgeAdmin]}>
              <Text style={[styles.roleBadgeText, isAdmin && styles.roleBadgeTextAdmin]}>
                {item.roleName}
              </Text>
            </View>
            {item.city ? (
              <Text style={styles.memberCity} numberOfLines={1}>{item.city}</Text>
            ) : null}
          </View>
        </View>

        {/* Selection indicator */}
        <View style={[styles.radio, isSelected && styles.radioSelected]}>
          {isSelected && <View style={styles.radioDot} />}
        </View>
      </TouchableOpacity>
    );
  }, [selectedId]);

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transfer Ownership</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Org banner */}
      <View style={styles.orgBanner}>
        {orgLogoUrl ? (
          <Image source={{ uri: orgLogoUrl }} style={styles.orgLogo} />
        ) : (
          <View style={[styles.orgLogo, styles.orgLogoFallback]}>
            <Text style={styles.orgLogoInitial}>{orgName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.orgInfo}>
          <Text style={styles.orgName} numberOfLines={2}>{orgName}</Text>
          <Text style={styles.orgMeta}>{totalMembers} member{totalMembers !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Instruction */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>
          {availableAdminCount > 0
            ? '👑 Select a new Founder'
            : '👑 Promote a member to Founder'}
        </Text>
        <Text style={styles.infoText}>
          {availableAdminCount > 0
            ? 'Select an Admin or member to take over as Founder. You will become an Admin and can still delete your account after.'
            : 'No Admins exist yet. The person you select will be promoted directly to Founder. You will become an Admin and can then delete your account.'}
        </Text>
      </View>

      {/* Member list */}
      {loading ? (
        <ActivityIndicator size="large" color={C.PRIMARY} style={styles.loader} />
      ) : members.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👤</Text>
          <Text style={styles.emptyText}>No other members found.</Text>
          <Text style={styles.emptySubText}>
            If you are the only member, go back and try deleting your account again — the org will be archived automatically.
          </Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={m => String(m.userId)}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Footer CTA */}
      {!loading && members.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, (!selectedId || confirming) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selectedId || confirming}
          >
            {confirming
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.confirmBtnText}>Transfer & Delete Account</Text>
            }
          </TouchableOpacity>
          <Text style={styles.footerNote}>
            This action cannot be undone. The selected person will receive Founder access immediately.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default TransferFounderScreen;

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: C.BACKGROUND },

  // Header
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:            { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText:           { fontSize: 18, color: C.TEXT2 },
  headerTitle:        { fontSize: 17, fontWeight: '700', color: C.TEXT, flex: 1, textAlign: 'center' },

  // Org banner
  orgBanner:          { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  orgLogo:            { width: 48, height: 48, borderRadius: 10, marginRight: 12 },
  orgLogoFallback:    { backgroundColor: C.PRIMARY, alignItems: 'center', justifyContent: 'center' },
  orgLogoInitial:     { fontSize: 20, fontWeight: '800', color: '#fff' },
  orgInfo:            { flex: 1 },
  orgName:            { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 2 },
  orgMeta:            { fontSize: 12, color: C.TEXT2 },

  // Info box
  infoBox:            { margin: 16, padding: 14, backgroundColor: C.CARD, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: C.PRIMARY },
  infoTitle:          { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 6 },
  infoText:           { fontSize: 13, color: C.TEXT2, lineHeight: 19 },

  // List
  list:               { paddingHorizontal: 16, paddingBottom: 16 },
  loader:             { marginTop: 48 },

  // Member row
  memberRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1.5, borderColor: 'transparent' },
  memberRowSelected:  { borderColor: C.PRIMARY, backgroundColor: C.PRIMARY + '0D' },
  avatar:             { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  avatarFallback:     { backgroundColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:      { fontSize: 18, fontWeight: '700', color: C.TEXT2 },
  memberInfo:         { flex: 1 },
  memberName:         { fontSize: 14, fontWeight: '600', color: C.TEXT, marginBottom: 4 },
  memberMeta:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleBadge:          { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: C.BORDER },
  roleBadgeAdmin:     { backgroundColor: C.PRIMARY + '20' },
  roleBadgeText:      { fontSize: 11, fontWeight: '600', color: C.TEXT2 },
  roleBadgeTextAdmin: { color: C.PRIMARY },
  memberCity:         { fontSize: 12, color: C.TEXT3 },
  radio:              { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  radioSelected:      { borderColor: C.PRIMARY },
  radioDot:           { width: 11, height: 11, borderRadius: 6, backgroundColor: C.PRIMARY },

  // Empty state
  emptyState:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon:          { fontSize: 48, marginBottom: 16 },
  emptyText:          { fontSize: 16, fontWeight: '700', color: C.TEXT, textAlign: 'center', marginBottom: 8 },
  emptySubText:       { fontSize: 13, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },

  // Footer
  footer:             { padding: 16, borderTopWidth: 1, borderTopColor: C.BORDER, backgroundColor: C.BACKGROUND },
  confirmBtn:         { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
  footerNote:         { fontSize: 11, color: C.TEXT3, textAlign: 'center', lineHeight: 16 },
});
