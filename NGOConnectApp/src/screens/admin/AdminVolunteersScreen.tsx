import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { fmtDate } from '../../utils/dateUtils';
import { orgApi } from '../../api/org.api';
import { getMyOrgs } from '../../api/user.api';
import { useAdminStore } from '../../store/adminStore';
import type { OrgMember, AdminPost } from '../../types/api.types';
import { UserAvatar } from '../../components/ui';

const C = AppConfig.COLORS;

// ── Role options ───────────────────────────────────────────────────────────────
const ROLES = ['MEMBER', 'MODERATOR', 'ADMIN'];
const ROLE_LABEL: Record<string, string> = { MEMBER: 'Member', MODERATOR: 'Moderator', ADMIN: 'Admin', FOUNDER: 'Founder' };
const ROLE_COLOR: Record<string, string> = {
  FOUNDER:   '#7C3AED',
  ADMIN:     '#DC2626',
  MODERATOR: '#D97706',
  MEMBER:    '#16A34A',
};

type MainTab  = 'pending' | 'members' | 'posts';
type PostsTab = 'all' | 'pending' | 'reported';
const MAIN_TABS:  MainTab[]  = ['pending', 'members', 'posts'];
const POSTS_TABS: PostsTab[] = ['all', 'pending', 'reported'];

// ── Pending member card ───────────────────────────────────────────────────────
function PendingCard({
  member, onApprove, onReject, onViewProfile,
}: { member: OrgMember; onApprove: () => void; onReject: () => void; onViewProfile: () => void }) {
  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.memberRow}>
        <UserAvatar name={member.fullName} photoUrl={member.profilePhoto} size={44} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.memberName}>{member.fullName}</Text>
            {member.profileVerificationStatusCode === 'VERIFIED' && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
              </View>
            )}
          </View>
          <Text style={styles.memberMeta} numberOfLines={1}>
            {[member.email, member.occupation, fmtDate(member.joinedAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
        <TouchableOpacity
          onPress={onViewProfile}
          style={styles.eyeBtn}
          accessibilityLabel={`View ${member.fullName}'s profile`}
        >
          <Text style={{ fontSize: 18, color: C.TEXT2 }}>👁</Text>
        </TouchableOpacity>
      </View>

      {/* Motivation */}
      {member.motivation ? (
        <>
          <Text style={styles.sectionLabel}>Motivation</Text>
          <Text style={styles.motivationText}>{member.motivation}</Text>
        </>
      ) : null}

      {/* Documents */}
      {member.documents && member.documents.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Documents</Text>
          {member.documents.map((doc, i) => (
            <View key={i} style={styles.docRow}>
              <Text style={styles.docName}>{doc.name}</Text>
              <TouchableOpacity accessibilityLabel={`Download ${doc.name}`}>
                <Text style={{ fontSize: 18, color: C.PRIMARY }}>⬇</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.approveBtn} onPress={onApprove} accessibilityLabel="Approve">
          <Text style={styles.approveBtnText}>✓ Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rejectBtn} onPress={onReject} accessibilityLabel="Reject">
          <Text style={styles.rejectBtnText}>✕ Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Member row card ───────────────────────────────────────────────────────────
function MemberRow({ member, onView }: { member: OrgMember; onView: () => void }) {
  const roleColor = ROLE_COLOR[member.roleCode?.toUpperCase() ?? 'MEMBER'] ?? '#16A34A';
  return (
    <View style={styles.memberListRow}>
      <UserAvatar name={member.fullName} photoUrl={member.profilePhoto} size={40} style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={styles.memberName}>{member.fullName}</Text>
          {member.profileVerificationStatusCode === 'VERIFIED' && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
            </View>
          )}
          <View style={[styles.rolePill, { backgroundColor: roleColor + '20', borderColor: roleColor + '40' }]}>
            <Text style={[styles.rolePillText, { color: roleColor }]}>
              {ROLE_LABEL[member.roleCode?.toUpperCase() ?? 'MEMBER'] ?? member.roleName}
            </Text>
          </View>
        </View>
        <Text style={styles.memberMeta} numberOfLines={1}>
          {[member.occupation, member.joinedAt ? `Joined ${fmtDate(member.joinedAt)}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <TouchableOpacity onPress={onView} accessibilityLabel={`View ${member.fullName}`} style={styles.eyeBtn}>
        <Text style={{ fontSize: 18, color: C.TEXT2 }}>👁</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({
  post, onPin, onDelete, onKeep, onRemove,
}: {
  post: AdminPost;
  onPin: () => void;
  onDelete: () => void;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const roleColor = ROLE_COLOR[post.roleCode?.toUpperCase() ?? 'MEMBER'] ?? '#16A34A';
  const isReported = (post.reportCount ?? 0) > 0;

  return (
    <View style={[styles.card, isReported && { borderLeftWidth: 3, borderLeftColor: '#DC2626' }]}>
      {/* Author row */}
      <View style={[styles.memberRow, { marginBottom: 6 }]}>
        <UserAvatar name={post.fullName} size={36} style={[styles.avatar, { borderRadius: 10 }]} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.memberName}>{post.fullName}</Text>
            {post.roleCode && (
              <View style={[styles.rolePill, { backgroundColor: roleColor + '20', borderColor: roleColor + '40' }]}>
                <Text style={[styles.rolePillText, { color: roleColor }]}>
                  {ROLE_LABEL[post.roleCode.toUpperCase()] ?? post.roleName}
                </Text>
              </View>
            )}
            {isReported && (
              <View style={styles.reportBadge}>
                <Text style={styles.reportBadgeText}>🚩 {post.reportCount} reports</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Content */}
      <Text style={styles.postContent} numberOfLines={3}>{post.content}</Text>

      {/* Stats row */}
      <Text style={styles.postStats}>
        {post.likesCount} likes · {post.commentsCount} comments
        {post.statusCode === 'PUBLISHED' ? ' · Published' : post.statusCode === 'PENDING' ? ' · Pending review' : ''}
      </Text>

      {/* Reported warning */}
      {isReported && (
        <View style={styles.reportWarning}>
          <Text style={styles.reportWarningText}>
            ⚠ Reported {post.reportCount} time{post.reportCount !== 1 ? 's' : ''} for violating guidelines.
          </Text>
        </View>
      )}

      {/* Action buttons */}
      {isReported ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.keepBtn} onPress={onKeep} accessibilityLabel="Keep post">
            <Text style={styles.keepBtnText}>✓ Keep</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.removeBtn} onPress={onRemove} accessibilityLabel="Remove post">
            <Text style={styles.removeBtnText}>⊘ Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.deletePostBtn, { flex: 1 }]} onPress={onDelete} accessibilityLabel="Delete post">
            <Text style={styles.deleteBtnText}>⊘ Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Member details bottom sheet ───────────────────────────────────────────────
function MemberDetailsSheet({
  member, orgId, visible, onClose, onDeactivate,
}: {
  member: OrgMember | null;
  orgId: number;
  visible: boolean;
  onClose: () => void;
  onDeactivate: (userId: number) => void;
}) {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [canPost,        setCanPost]        = useState(member?.canPost        ?? true);
  const [canComment,     setCanComment]     = useState(member?.canComment     ?? true);
  const [canCommunity,   setCanCommunity]   = useState(member?.canCommunityPost ?? true);
  const [locSharing,     setLocSharing]     = useState(member?.locationSharing ?? false);
  const [maxPosts,       setMaxPosts]       = useState(member?.maxPostsPerDay  ?? 10);
  const [roleCode,       setRoleCode]       = useState(member?.roleCode?.toUpperCase() ?? 'MEMBER');
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showMaxPicker,  setShowMaxPicker]  = useState(false);
  const [saving,         setSaving]         = useState(false);

  // Sync when member changes
  useEffect(() => {
    if (member) {
      setCanPost(member.canPost        ?? true);
      setCanComment(member.canComment  ?? true);
      setCanCommunity(member.canCommunityPost ?? true);
      setLocSharing(member.locationSharing    ?? false);
      setMaxPosts(member.maxPostsPerDay       ?? 10);
      setRoleCode(member.roleCode?.toUpperCase() ?? 'MEMBER');
    }
  }, [member]);

  const savePermissions = useCallback(async () => {
    if (!member?.memberId || !orgId) { return; }
    setSaving(true);
    try {
      const res = await orgApi.updateMemberPermissions(orgId, member.memberId, {
        canPost, canComment, canCommunityPost: canCommunity, maxPostsPerDay: maxPosts,
      });
      if (res.data?.isSuccess) {
        Alert.alert('Saved', 'Member permissions updated successfully.');
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not save permissions. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [member, orgId, canPost, canComment, canCommunity, maxPosts]);

  const saveRole = useCallback(async () => {
    if (!member?.memberId || !orgId) { return; }
    // FOUNDER role cannot be reassigned via this screen
    if (member.roleCode?.toUpperCase() === 'FOUNDER') {
      Alert.alert('Cannot Change', 'Founder role cannot be changed here.');
      return;
    }
    setSaving(true);
    try {
      const res = await orgApi.updateMemberRole(orgId, { memberId: member.memberId, roleCode });
      if (res.data?.isSuccess) {
        Alert.alert('Saved', `Role updated to ${ROLE_LABEL[roleCode] ?? roleCode}.`);
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not update role. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [member, orgId, roleCode]);

  const handleDeactivate = () => {
    if (!member) { return; }
    Alert.alert(
      'Deactivate Member',
      `Remove ${member.fullName} from this organisation?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: () => { onDeactivate(member.userId); onClose(); } },
      ],
    );
  };

  if (!member) { return null; }
  const roleColor = ROLE_COLOR[member.roleCode?.toUpperCase() ?? 'MEMBER'] ?? '#16A34A';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHandle} />

          {/* Sheet header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Member Details</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close"><Text style={styles.sheetClose}>✕</Text></TouchableOpacity>
          </View>
          <Text style={styles.sheetSubtitle}>Manage member permissions and controls.</Text>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Identity card */}
            <View style={styles.identityCard}>
              <UserAvatar name={member.fullName} photoUrl={member.profilePhoto} size={42} style={[styles.avatar, { borderRadius: 12 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{member.fullName}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                  <View style={[styles.rolePill, { backgroundColor: roleColor + '20', borderColor: roleColor + '40' }]}>
                    <Text style={[styles.rolePillText, { color: roleColor }]}>
                      {ROLE_LABEL[roleCode] ?? member.roleName}
                    </Text>
                  </View>
                  <View style={[styles.rolePill, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}>
                    <Text style={[styles.rolePillText, { color: '#16A34A' }]}>
                      {member.isActive !== false ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Contact info */}
            <View style={styles.contactCard}>
              {member.email && (
                <View style={styles.contactRow}>
                  <Text style={styles.contactIcon}>✉</Text>
                  <Text style={styles.contactText}>{member.email}</Text>
                </View>
              )}
              {member.phone && (
                <View style={styles.contactRow}>
                  <Text style={styles.contactIcon}>📞</Text>
                  <Text style={styles.contactText}>{member.phone}</Text>
                </View>
              )}
              <View style={styles.contactRow}>
                <Text style={styles.contactIcon}>📅</Text>
                <Text style={styles.contactText}>
                  Joined {fmtDate(member.joinedAt)}{member.lastActiveAt ? ` · Active ${fmtDate(member.lastActiveAt)}` : ''}
                </Text>
              </View>
            </View>

            {/* Admin Controls */}
            <Text style={[styles.sectionLabel, { marginTop: 14, marginBottom: 6 }]}>Admin Controls</Text>
            <View style={styles.controlsCard}>
              {([
                { label: 'Can Post',           value: canPost,      set: setCanPost      },
                { label: 'Can Comment',         value: canComment,   set: setCanComment   },
                { label: 'Can Community Post',  value: canCommunity, set: setCanCommunity },
                { label: 'Location Sharing',    value: locSharing,   set: setLocSharing   },
              ] as { label: string; value: boolean; set: (v: boolean) => void }[]).map((ctrl, i, arr) => (
                <View key={ctrl.label} style={[styles.controlRow, i < arr.length - 1 && styles.controlBorder]}>
                  <Text style={styles.controlLabel}>{ctrl.label}</Text>
                  <Switch
                    value={ctrl.value}
                    onValueChange={ctrl.set}
                    trackColor={{ false: C.BORDER, true: C.PRIMARY }}
                    thumbColor="#fff"
                    accessibilityLabel={ctrl.label}
                  />
                </View>
              ))}
              {/* Max Posts Per Day */}
              <View style={styles.controlRow}>
                <Text style={styles.controlLabel}>Max Posts Per Day</Text>
                <TouchableOpacity
                  style={styles.dropdownChip}
                  onPress={() => setShowMaxPicker(true)}
                  accessibilityLabel="Change max posts per day"
                >
                  <Text style={styles.dropdownChipText}>{maxPosts} posts ▾</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Save permissions */}
            <TouchableOpacity style={styles.savePermBtn} onPress={savePermissions} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.savePermBtnText}>Save Permissions</Text>}
            </TouchableOpacity>

            {/* Change Role */}
            <Text style={[styles.sectionLabel, { marginTop: 14, marginBottom: 6 }]}>Change Role</Text>
            <TouchableOpacity
              style={styles.roleDropdown}
              onPress={() => setShowRolePicker(true)}
              accessibilityLabel="Change member role"
            >
              <Text style={styles.roleDropdownText}>{ROLE_LABEL[roleCode] ?? roleCode}</Text>
              <Text style={{ color: C.TEXT2 }}>▾</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.savePermBtn} onPress={saveRole} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.savePermBtnText}>Save Role</Text>}
            </TouchableOpacity>

            {/* View Full Profile */}
            <TouchableOpacity
              style={styles.viewProfileBtn}
              onPress={() => { onClose(); nav.navigate('VolunteerProfile', { orgId, userId: member.userId }); }}
              accessibilityLabel="View full profile and impact"
            >
              <Text style={styles.viewProfileBtnText}>👁 View Full Profile & Impact</Text>
            </TouchableOpacity>

            {/* Deactivate */}
            <TouchableOpacity style={styles.deactivateBtn} onPress={handleDeactivate} accessibilityLabel="Deactivate member">
              <Text style={styles.deactivateBtnText}>Deactivate Member</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>

      {/* Max Posts picker */}
      {showMaxPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowMaxPicker(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowMaxPicker(false)}>
            <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 8 }]}>
              <Text style={styles.pickerTitle}>Max Posts Per Day</Text>
              {[5, 10, 20, 50, 100].map(n => (
                <TouchableOpacity key={n} style={styles.pickerRow} onPress={() => { setMaxPosts(n); setShowMaxPicker(false); }}>
                  <Text style={[styles.pickerRowText, maxPosts === n && { color: C.PRIMARY, fontWeight: '700' }]}>{n} posts</Text>
                  {maxPosts === n && <Text style={{ color: C.PRIMARY }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Role picker */}
      {showRolePicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowRolePicker(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowRolePicker(false)}>
            <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 8 }]}>
              <Text style={styles.pickerTitle}>Change Role</Text>
              {ROLES.map(r => (
                <TouchableOpacity key={r} style={styles.pickerRow} onPress={() => { setRoleCode(r); setShowRolePicker(false); }}>
                  <Text style={[styles.pickerRowText, roleCode === r && { color: C.PRIMARY, fontWeight: '700' }]}>{ROLE_LABEL[r]}</Text>
                  {roleCode === r && <Text style={{ color: C.PRIMARY }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function AdminVolunteersScreen() {
  const nav              = useNavigation<any>();
  const insets           = useSafeAreaInsets();
  const { selectedOrg, setAdminOrgs, setSelectedOrg } = useAdminStore();
  const orgId = selectedOrg?.orgId ?? 0;

  const [mainTab,      setMainTab]      = useState<MainTab>('pending');
  const [postsTab,     setPostsTab]     = useState<PostsTab>('all');
  const [search,       setSearch]       = useState('');

  const [pendingList,  setPendingList]  = useState<OrgMember[]>([]);
  const [memberList,   setMemberList]   = useState<OrgMember[]>([]);
  const [postList,     setPostList]     = useState<AdminPost[]>([]);

  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  // ── Swipe to change tab ──────────────────────────────────────────────────────
  // When mainTab === 'posts', swipe switches the posts sub-tab.
  // Otherwise, swipe switches the main tab.
  const swipeState = useRef({
    mainTab: 'pending' as MainTab,
    postsTab: 'all' as PostsTab,
    setMainTab: (_t: MainTab) => {},
    setPostsTab: (_t: PostsTab) => {},
  });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        const { mainTab: curMain, postsTab: curPosts, setMainTab, setPostsTab } = swipeState.current;
        if (curMain === 'posts') {
          const idx = POSTS_TABS.indexOf(curPosts);
          if ((dx < -40 || vx < -0.4) && idx < POSTS_TABS.length - 1) setPostsTab(POSTS_TABS[idx + 1]);
          else if ((dx > 40 || vx > 0.4) && idx > 0) setPostsTab(POSTS_TABS[idx - 1]);
        } else {
          const idx = MAIN_TABS.indexOf(curMain);
          if ((dx < -40 || vx < -0.4) && idx < MAIN_TABS.length - 1) setMainTab(MAIN_TABS[idx + 1]);
          else if ((dx > 40 || vx > 0.4) && idx > 0) setMainTab(MAIN_TABS[idx - 1]);
        }
      },
    })
  ).current;
  swipeState.current = { mainTab, postsTab, setMainTab, setPostsTab };

  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);

  // ── Ensure selectedOrg is loaded (handles direct tab navigation) ──────────
  const ensureOrg = useCallback(async (): Promise<number> => {
    if (orgId) { return orgId; }
    try {
      const res = await getMyOrgs();
      if (res.data?.isSuccess) {
        const all = res.data.data ?? [];
        if (all.length > 0) {
          setAdminOrgs(all);
          setSelectedOrg(all[0]);
          return all[0].orgId;
        }
      }
    } catch { /* silent */ }
    return 0;
  }, [orgId, setAdminOrgs, setSelectedOrg]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    const oid = await ensureOrg();
    if (!oid) { setLoading(false); return; }
    try {
      const [pendRes, memRes, postRes] = await Promise.allSettled([
        orgApi.getPendingMembers(oid),
        orgApi.getMembers(oid),
        orgApi.getAdminPosts(oid),
      ]);
      if (pendRes.status === 'fulfilled' && pendRes.value.data?.isSuccess) {
        setPendingList(pendRes.value.data.data ?? []);
      }
      if (memRes.status === 'fulfilled' && memRes.value.data?.isSuccess) {
        setMemberList(memRes.value.data.data ?? []);
      }
      if (postRes.status === 'fulfilled' && postRes.value.data?.isSuccess) {
        setPostList(postRes.value.data.data ?? []);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [orgId]);

  // Re-run when selectedOrg changes (e.g. user switches org from Dashboard)
  useEffect(() => { loadAll(); }, [orgId]); // eslint-disable-line

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const memberCount  = memberList.length;
  const pendingCount = pendingList.length;
  const postsCount   = postList.length;

  // ── Search filter ─────────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredPending = useMemo(() =>
    q ? pendingList.filter(m =>
      m.fullName.toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q) ||
      (m.occupation ?? '').toLowerCase().includes(q))
    : pendingList,
  [pendingList, q]);

  const filteredMembers = useMemo(() =>
    q ? memberList.filter(m =>
      m.fullName.toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q) ||
      (m.occupation ?? '').toLowerCase().includes(q) ||
      (m.roleName ?? '').toLowerCase().includes(q))
    : memberList,
  [memberList, q]);

  const filteredPosts = useMemo(() => {
    const byTab = postsTab === 'all'
      ? postList
      : postsTab === 'pending'
        ? postList.filter(p => p.statusCode === 'PENDING')
        : postList.filter(p => (p.reportCount ?? 0) > 0);
    return q
      ? byTab.filter(p => p.fullName.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
      : byTab;
  }, [postList, postsTab, q]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const approveMember = useCallback(async (member: OrgMember) => {
    const reqId = member.membershipRequestId ?? (member as any).requestId;
    if (!reqId) {
      Alert.alert('Error', 'Could not identify membership request. Please refresh and try again.');
      return;
    }
    try {
      const res = await orgApi.reviewMembershipRequest(orgId, {
        membershipRequestId: reqId,
        statusCode: 'APPROVED',
      });
      if (res.data?.isSuccess) {
        setPendingList(prev => prev.filter(m => m.userId !== member.userId));
        // Reload members list so the newly approved member appears there
        orgApi.getMembers(orgId).then(r => {
          if (r.data?.isSuccess) setMemberList(r.data.data ?? []);
        }).catch(() => {/* silent */});
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not approve member. Please try again.');
      }
    } catch { Alert.alert('Error', 'Could not approve member. Please try again.'); }
  }, [orgId]);

  const rejectMember = useCallback((member: OrgMember) => {
    Alert.alert(
      'Reject Application',
      `Reject ${member.fullName}'s membership request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive', onPress: async () => {
            const reqId = member.membershipRequestId ?? (member as any).requestId;
            if (!reqId) {
              Alert.alert('Error', 'Could not identify membership request. Please refresh and try again.');
              return;
            }
            try {
              const res = await orgApi.reviewMembershipRequest(orgId, {
                membershipRequestId: reqId,
                statusCode: 'REJECTED',
              });
              if (res.data?.isSuccess) {
                setPendingList(prev => prev.filter(m => m.userId !== member.userId));
              } else {
                Alert.alert('Error', res.data?.message ?? 'Could not reject application.');
              }
            } catch { Alert.alert('Error', 'Could not reject application.'); }
          },
        },
      ],
    );
  }, [orgId]);

  const deactivateMember = useCallback(async (userId: number) => {
    try {
      await orgApi.removeMember(orgId, userId);
      setMemberList(prev => prev.filter(m => m.userId !== userId));
    } catch { Alert.alert('Error', 'Could not deactivate member.'); }
  }, [orgId]);

  const pinPost = useCallback(async (postId: number) => {
    try {
      await orgApi.pinPost(orgId, postId);
      setPostList(prev => prev.map(p => p.postId === postId ? { ...p, isPinned: !p.isPinned } : p));
    } catch { Alert.alert('Error', 'Could not update post.'); }
  }, [orgId]);

  const deletePost = useCallback((postId: number) => {
    Alert.alert('Delete Post', 'This post will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const res = await orgApi.deletePost(orgId, postId);
            if (res.data?.isSuccess === 1) {
              setPostList(prev => prev.filter(p => p.postId !== postId));
            } else {
              Alert.alert('Error', res.data?.message ?? 'Could not delete post.');
            }
          } catch { Alert.alert('Error', 'Could not delete post.'); }
        },
      },
    ]);
  }, [orgId]);

  const moderatePost = useCallback(async (postId: number, action: 'KEEP' | 'REMOVE') => {
    try {
      const res = await orgApi.moderatePost(orgId, postId, action);
      if (res.data?.isSuccess === 1) {
        if (action === 'REMOVE') {
          setPostList(prev => prev.filter(p => p.postId !== postId));
        } else {
          // KEEP — clear the report flag so the card moves out of reported state
          setPostList(prev => prev.map(p => p.postId === postId ? { ...p, reportCount: 0 } : p));
        }
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not moderate post.');
      }
    } catch { Alert.alert('Error', 'Could not moderate post.'); }
  }, [orgId]);

  // ── Posts sub-tab counts ──────────────────────────────────────────────────
  const pendingPostsCount  = postList.filter(p => p.statusCode === 'PENDING').length;
  const reportedPostsCount = postList.filter(p => (p.reportCount ?? 0) > 0).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Back" style={styles.backBtn}>
            <Text style={styles.backIcon}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Volunteers</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Back" style={styles.backBtn}>
          <Text style={styles.backIcon}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Volunteers</Text>
        {/* Invite button — navigates to the invite members screen */}
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => nav.navigate('InviteMembers', {
            orgId:   orgId,
            orgName: selectedOrg?.orgName ?? '',
          })}
          accessibilityLabel="Invite members">
          <Text style={styles.inviteBtnText}>+ Invite</Text>
        </TouchableOpacity>
      </View>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statCell} onPress={() => setMainTab('members')} accessibilityLabel="Members">
          <Text style={[styles.statValue, { color: '#2563EB' }]}>{memberCount}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.statCell} onPress={() => setMainTab('pending')} accessibilityLabel="Pending">
          <Text style={[styles.statValue, { color: '#D97706' }]}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.statCell} onPress={() => setMainTab('posts')} accessibilityLabel="Posts">
          <Text style={[styles.statValue, { color: '#16A34A' }]}>{postsCount}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={
            mainTab === 'pending' ? 'Search pending applications…'
            : mainTab === 'members' ? 'Search members by name, role…'
            : 'Search posts by member or content…'
          }
          placeholderTextColor={C.TEXT3}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          accessibilityLabel="Search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Swipe area — wraps main tabs + all tab content */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {/* ── Main tabs ──────────────────────────────────────────────────────── */}
      <View style={styles.tabs}>
        {([
          { key: 'pending' as MainTab, label: `Pending (${pendingCount})` },
          { key: 'members' as MainTab, label: `Members (${memberCount})` },
          { key: 'posts'   as MainTab, label: `Posts (${postsCount})` },
        ]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, mainTab === t.key && styles.tabOn]}
            onPress={() => setMainTab(t.key)}
            accessibilityLabel={t.label}
          >
            <Text style={[styles.tabTxt, mainTab === t.key && styles.tabTxtOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── PENDING tab ────────────────────────────────────────────────────── */}
      {mainTab === 'pending' && (
        <FlatList
          data={filteredPending}
          keyExtractor={item => String(item.userId)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
          renderItem={({ item }) => (
            <PendingCard
              member={item}
              onApprove={() => approveMember(item)}
              onReject={() => rejectMember(item)}
              onViewProfile={() => nav.navigate('VolunteerProfile', {
                orgId,
                userId: item.userId,
                app: {
                  userId:             item.userId,
                  fullName:           item.fullName,
                  profilePhoto:       item.profilePhoto,
                  city:               item.city,
                  state:              item.state,
                  prevNgoExperience:  item.prevNgoExperience,
                  volunteerSkills:    item.volunteerSkills,
                  areasOfInterest:    item.areasOfInterest,
                  whyJoin:            item.whyJoin,
                  requestedAt:        item.requestedAt,
                },
              })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 32 }}>✅</Text>
              <Text style={styles.emptyTxt}>
                {q ? 'No results match your search.' : 'No pending applications.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        />
      )}

      {/* ── MEMBERS tab ────────────────────────────────────────────────────── */}
      {mainTab === 'members' && (
        <FlatList
          data={filteredMembers}
          keyExtractor={item => String(item.userId)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
          ListHeaderComponent={
            <Text style={styles.membersHeader}>
              Member Management · {memberCount} total
            </Text>
          }
          renderItem={({ item }) => (
            <MemberRow member={item} onView={() => setSelectedMember(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTxt}>{q ? 'No members match your search.' : 'No members yet.'}</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        />
      )}

      {/* ── POSTS tab ──────────────────────────────────────────────────────── */}
      {mainTab === 'posts' && (
        <>
          {/* Posts sub-tabs */}
          <View style={styles.subTabs}>
            {([
              { key: 'all'      as PostsTab, label: `All (${postList.length})`             },
              { key: 'pending'  as PostsTab, label: `Pending (${pendingPostsCount})`        },
              { key: 'reported' as PostsTab, label: `Reported (${reportedPostsCount})`     },
            ]).map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.subTabItem, postsTab === t.key && styles.subTabOn]}
                onPress={() => setPostsTab(t.key)}
                accessibilityLabel={t.label}
              >
                <Text style={[styles.subTabTxt, postsTab === t.key && styles.subTabTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={filteredPosts}
            keyExtractor={item => String(item.postId)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.PRIMARY]} />}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                onPin={() => pinPost(item.postId)}
                onDelete={() => deletePost(item.postId)}
                onKeep={() => moderatePost(item.postId, 'KEEP')}
                onRemove={() => moderatePost(item.postId, 'REMOVE')}
              />
            )}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyTxt}>
                  {q ? 'No posts match your search.' : 'No posts in this category.'}
                </Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          />
        </>
      )}

      </View>{/* end swipe area */}

      {/* ── Member Details Sheet ────────────────────────────────────────────── */}
      <MemberDetailsSheet
        member={selectedMember}
        orgId={orgId}
        visible={selectedMember !== null}
        onClose={() => setSelectedMember(null)}
        onDeactivate={deactivateMember}
      />

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.BG },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTxt:     { color: C.TEXT2, textAlign: 'center', fontSize: 14, lineHeight: 22, marginTop: 10 },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:      { minWidth: 70, height: 36, justifyContent: 'center' },
  backIcon:     { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: C.TEXT },
  inviteBtn:     { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.PRIMARY, borderRadius: 8 },
  inviteBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

  // Stats
  statsRow:     { flexDirection: 'row', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  statCell:     { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statValue:    { fontSize: 20, fontWeight: '800' },
  statLabel:    { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  statDivider:  { width: 1, backgroundColor: C.BORDER, marginVertical: 10 },

  // Search
  searchBox:    { flexDirection: 'row', alignItems: 'center', margin: 10, paddingHorizontal: 12, backgroundColor: C.INPUT_BG, borderRadius: 12, borderWidth: 1.5, borderColor: C.BORDER, gap: 8 },
  searchIcon:   { fontSize: 14 },
  searchInput:  { flex: 1, paddingVertical: 9, fontSize: 14, color: C.TEXT },
  clearBtn:     { fontSize: 13, color: C.TEXT3, padding: 4 },

  // Main tabs
  tabs:         { flexDirection: 'row', backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  tabItem:      { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn:        { borderBottomColor: C.PRIMARY },
  tabTxt:       { fontSize: 12, fontWeight: '500', color: C.TEXT2 },
  tabTxtOn:     { color: C.PRIMARY, fontWeight: '700' },

  // Sub-tabs (Posts)
  subTabs:      { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  subTabItem:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.CARD, borderWidth: 1.5, borderColor: C.BORDER },
  subTabOn:     { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY },
  subTabTxt:    { fontSize: 12, fontWeight: '500', color: C.TEXT2 },
  subTabTxtOn:  { color: '#fff', fontWeight: '700' },

  // Card shared
  card:         { backgroundColor: C.CARD, marginHorizontal: 12, marginTop: 10, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  memberRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar:       { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { color: '#fff', fontSize: 14, fontWeight: '800' },
  memberName:   { fontSize: 14, fontWeight: '700', color: C.TEXT },
  memberMeta:   { fontSize: 11, color: C.TEXT2, marginTop: 1 },
  rolePill:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  rolePillText: { fontSize: 10, fontWeight: '600' },
  pendingBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  verifiedBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#6EE7B7' },
  verifiedBadgeText: { fontSize: 10, fontWeight: '700', color: '#059669' },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400E' },

  // Pending card details
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.TEXT2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  motivationText:{ fontSize: 13, color: C.TEXT, lineHeight: 19, marginBottom: 10, fontStyle: 'italic' },
  docRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.INPUT_BG, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  docName:      { fontSize: 13, color: C.TEXT2 },
  actionRow:    { flexDirection: 'row', gap: 10, marginTop: 12 },
  approveBtn:   { flex: 1, backgroundColor: C.PRIMARY, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  approveBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn:    { flex: 1, backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: '#FECACA', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  rejectBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },

  // Members tab
  membersHeader: { fontSize: 12, fontWeight: '600', color: C.TEXT2, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  memberListRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.CARD, marginHorizontal: 12, marginTop: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  eyeBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Post card
  reportBadge:  { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  reportBadgeText:{ fontSize: 10, fontWeight: '700', color: '#DC2626' },
  postContent:  { fontSize: 13, color: C.TEXT, lineHeight: 19, marginBottom: 6 },
  postStats:    { fontSize: 11, color: C.TEXT2, marginBottom: 6 },
  reportWarning:{ backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#DC2626' },
  reportWarningText:{ fontSize: 12, color: '#DC2626' },
  pinBtn:       { flex: 1, backgroundColor: C.CARD, borderWidth: 1.5, borderColor: C.BORDER, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  pinBtnText:   { color: C.TEXT, fontWeight: '600', fontSize: 12 },
  deletePostBtn:{ flex: 1, backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: '#FECACA', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  deleteBtnText:{ color: '#DC2626', fontWeight: '600', fontSize: 12 },
  keepBtn:      { flex: 1, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#BBF7D0', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  keepBtnText:  { color: '#16A34A', fontWeight: '600', fontSize: 12 },
  removeBtn:    { flex: 1, backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: '#FECACA', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  removeBtnText:{ color: '#DC2626', fontWeight: '600', fontSize: 12 },

  // Member details bottom sheet
  sheetBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingHorizontal: 16, maxHeight: '90%' },
  sheetHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginBottom: 10 },
  sheetHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sheetTitle:     { fontSize: 16, fontWeight: '800', color: C.TEXT },
  sheetClose:     { fontSize: 18, color: C.TEXT2, padding: 4 },
  sheetSubtitle:  { fontSize: 12, color: C.TEXT2, marginBottom: 14 },

  identityCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.INPUT_BG, borderRadius: 12, padding: 12, marginBottom: 10 },
  contactCard:    { backgroundColor: C.INPUT_BG, borderRadius: 12, padding: 12, gap: 8 },
  contactRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactIcon:    { fontSize: 14, width: 20, textAlign: 'center' },
  contactText:    { fontSize: 13, color: C.TEXT, flex: 1 },

  // Controls card (permissions panel)
  controlsCard:   { backgroundColor: C.CARD, borderRadius: 14, padding: 14, marginTop: 12, ...AppConfig.SHADOW.CARD },
  controlLabel:   { fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 8 },
  controlRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  controlBorder:  { borderTopWidth: 1, borderTopColor: C.BORDER },
  savePermBtn:    { backgroundColor: C.PRIMARY, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  savePermBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  // Role dropdown
  roleDropdown:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.INPUT_BG, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  roleDropdownText: { fontSize: 13, color: C.TEXT, fontWeight: '600' },
  dropdownChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: C.BORDER },
  dropdownChipText: { fontSize: 12, color: C.TEXT2 },

  // Picker
  pickerSheet:    { backgroundColor: C.CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20, maxHeight: '60%' },
  pickerTitle:    { fontSize: 16, fontWeight: '700', color: C.TEXT, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  pickerRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.BORDER, gap: 10 },
  pickerRowText:  { fontSize: 14, color: C.TEXT, flex: 1 },

  // Deactivate / View Profile buttons
  deactivateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 10, paddingVertical: 10, marginTop: 8 },
  deactivateBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '600' },
  viewProfileBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.PRIMARY + '15', borderRadius: 10, paddingVertical: 10, marginTop: 8 },
  viewProfileBtnText:{ color: C.PRIMARY, fontSize: 14, fontWeight: '600' },
});