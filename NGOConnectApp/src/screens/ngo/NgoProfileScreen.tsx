import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  PanResponder,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Video from 'react-native-video';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import apiClient from '../../api/apiClient';
import { getProfile, orgApi } from '../../api/org.api';
import { useAuthStore } from '../../store/authStore';
import { list as listProjects, projectApi, apply } from '../../api/project.api';
import { shareApi } from '../../api/share.api';
import type { ApiResponse, Organisation, Post, Project, PagedResult } from '../../types/api.types';

const C = AppConfig.COLORS;

const TABS = ['About', 'Projects', 'Volunteer', 'Gallery'] as const;
type Tab = (typeof TABS)[number];

const CATEGORY_COLOR: Record<string, string> = {
  Community:       '#0D9488',
  Environment:     '#0D9488',
  Education:       C.PRIMARY,
  Healthcare:      '#F59E0B',
  'Animal Welfare':'#8B5CF6',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#6B4EFF', '#2ECC71', '#FF8C42', '#2563EB', '#D97706', '#16A34A', '#7C3AED'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}
function initials(name: string) {
  return (name || 'NG').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

const fmtTime = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
};

const abbrevDays = (days?: string) => {
  if (!days) return '';
  const MAP: Record<string, string> = {
    Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
    Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
  };
  return days.split(',').map(d => MAP[d.trim()] ?? d.trim().slice(0, 3)).join(' & ');
};

const durationHours = (start?: string, end?: string) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m/session` : `${h}h/session`) : `${m}m/session`;
};

function fmtSchedule(p: Project): string {
  if (p.scheduleSummary) return p.scheduleSummary;
  const type = (p.scheduleType ?? '').toUpperCase().replace('-', '_');
  const days  = abbrevDays(p.recurDays ?? p.recurrenceDays);
  if (type === 'ONE_TIME')  return 'One-time';
  if (type === 'RECURRING') return days ? `Recurring · ${days}` : 'Recurring';
  if (type === 'FLEXIBLE')  return 'Flexible';
  return p.scheduleType ?? '';
}

// ── Project Detail Modal (full-screen, slides in like prototype) ──────────────

function ProjectDetailModal({
  visible,
  projectId,
  onClose,
}: {
  visible:   boolean;
  projectId: number | null;
  onClose:   () => void;
}) {
  const insets   = useSafeAreaInsets();
  const { user: authUser } = useAuthStore();
  const userInitials = [authUser?.firstName?.[0], authUser?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  const [detail,   setDetail]   = useState<any>(null);
  const [loading,  setLoading]  = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied,  setApplied]  = useState(false);

  useEffect(() => {
    if (visible && projectId) {
      setApplied(false);
      loadDetail(projectId);
    } else {
      setDetail(null);
    }
  }, [visible, projectId]);

  const loadDetail = async (id: number) => {
    setLoading(true);
    try {
      const res = await projectApi.get(id);
      if (res.data?.isSuccess) setDetail(res.data.data ?? null);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  const handleApply = async () => {
    if (!projectId || applying || applied) return;
    setApplying(true);
    try {
      const res = await apply(projectId);
      if (res.data?.isSuccess) {
        setApplied(true);
        Alert.alert('Applied!', 'Your application has been submitted for review.');
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not apply.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const p = detail;
  const catColor  = CATEGORY_COLOR[p?.categoryName ?? ''] ?? C.PRIMARY;
  const max       = p?.maxParticipants ?? p?.maxVolunteers ?? 0;
  const curr      = p?.currentParticipants ?? p?.approvedCount ?? 0;
  const spotsLeft = p?.spotsLeft ?? (max > 0 ? max - curr : null);
  const isFull    = max > 0 && (spotsLeft ?? 1) <= 0;

  const scheduleLabel = (() => {
    const type = (p?.scheduleType ?? '').toUpperCase().replace('-', '_');
    const days = abbrevDays(p?.recurrenceDays ?? p?.recurDays);
    if (type === 'ONE_TIME')  return 'One-time';
    if (type === 'RECURRING') return ['Recurring', days].filter(Boolean).join(' · ');
    if (type === 'FLEXIBLE')  return 'Flexible';
    return p?.scheduleType ?? '';
  })();

  const dateRange = (() => {
    const type = (p?.scheduleType ?? '').toUpperCase();
    if (type === 'ONE_TIME')   return fmtDate(p?.startDate ?? p?.oneTimeDate);
    if (type === 'RECURRING')  {
      const s = fmtDate(p?.recurStart ?? p?.startDate);
      const e = fmtDate(p?.recurEnd   ?? p?.endDate);
      return [s, e].filter(Boolean).join(' – ');
    }
    return [fmtDate(p?.startDate), fmtDate(p?.endDate)].filter(Boolean).join(' – ');
  })();

  const timeLine    = [fmtTime(p?.startTime ?? p?.sessionStartTime), fmtTime(p?.endTime ?? p?.sessionEndTime)].filter(Boolean).join(' – ');
  const durLabel    = durationHours(p?.startTime ?? p?.sessionStartTime, p?.endTime ?? p?.sessionEndTime);
  const locationStr = [p?.locationName, p?.city].filter(Boolean).join(', ');

  const mapsUrl = p?.googleMapsUrl
    ?? (p?.latitude && p?.longitude
      ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}`
      : null);

  const alreadyApproved = p?.applicationStatusCode === 'APPROVED';
  const alreadyPending  = p?.applicationStatusCode === 'PENDING';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* SafeAreaProvider is required inside Modal — without it, react-native-safe-area-context
          cannot read the correct window insets in the Modal's own native window on Android,
          causing useSafeAreaInsets() and SafeAreaView to both return insets.bottom = 0. */}
      <SafeAreaProvider>
      <SafeAreaView style={mdStyles.container} edges={['top']}>
        {/* Header */}
        <View style={mdStyles.topBar}>
          <TouchableOpacity onPress={onClose} style={mdStyles.backBtn} accessibilityLabel="Close">
            <Text style={mdStyles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={mdStyles.topTitle}>Project Details</Text>
          {authUser?.profilePhoto
            ? <Image source={{ uri: authUser.profilePhoto }} style={mdStyles.topAvatar} />
            : (
              <View style={[mdStyles.topAvatar, { backgroundColor: C.PRIMARY }]}>
                <Text style={mdStyles.topAvatarText}>{userInitials}</Text>
              </View>
            )
          }
        </View>

        {loading ? (
          <View style={mdStyles.centered}>
            <ActivityIndicator size="large" color={C.PRIMARY} />
          </View>
        ) : !p ? (
          <View style={mdStyles.centered}>
            <Text style={mdStyles.errorText}>Could not load project details.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Main card */}
            <View style={mdStyles.card}>
              {/* Title + category */}
              <View style={mdStyles.titleRow}>
                <Text style={mdStyles.projTitle} numberOfLines={3}>{p.title}</Text>
                {p.categoryName ? (
                  <View style={[mdStyles.catPill, { backgroundColor: `${catColor}20` }]}>
                    <Text style={[mdStyles.catPillText, { color: catColor }]}>{p.categoryName}</Text>
                  </View>
                ) : null}
              </View>
              {p.orgName ? <Text style={mdStyles.orgName}>by {p.orgName}</Text> : null}
              {p.description ? (
                <Text style={mdStyles.description}>{p.description}</Text>
              ) : null}

              {/* Info rows */}
              <View style={mdStyles.infoList}>
                {scheduleLabel ? (
                  <InfoRow icon="🔄" text={[scheduleLabel, dateRange].filter(Boolean).join(' · ')} />
                ) : null}
                {timeLine ? (
                  <InfoRow icon="🕐" text={[timeLine, durLabel].filter(Boolean).join(' ')} />
                ) : null}
                {locationStr ? (
                  <InfoRow icon="📍" text={locationStr} color="#EF4444" />
                ) : null}
                {max > 0 ? (
                  <InfoRow icon="👥"
                    text={`${curr} of ${max} spots filled per session${isFull ? ' · FULL' : spotsLeft ? ` · ${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left` : ''}`}
                  />
                ) : null}
              </View>

              {/* Google Maps tile */}
              {mapsUrl ? (
                <TouchableOpacity
                  style={mdStyles.mapTile}
                  onPress={() => Linking.openURL(mapsUrl).catch(() => {})}
                  activeOpacity={0.8}
                  accessibilityLabel="Open in Google Maps"
                >
                  <Text style={{ fontSize: 15 }}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={mdStyles.mapTitle}>Open in Google Maps</Text>
                    {locationStr ? <Text style={mdStyles.mapSub} numberOfLines={1}>{p.address ?? locationStr}</Text> : null}
                  </View>
                  <Text style={{ color: C.PRIMARY, fontSize: 18 }}>›</Text>
                </TouchableOpacity>
              ) : null}

              {/* Skills */}
              {p.skills?.length ? (
                <View style={mdStyles.skillsBox}>
                  <Text style={mdStyles.skillsLabel}>Skills needed</Text>
                  <View style={mdStyles.tagRow}>
                    {p.skills.map((s: any, i: number) => (
                      <View key={i} style={mdStyles.skillTag}>
                        <Text style={mdStyles.skillTagText}>{s.skillName}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Session picker for recurring */}
            {(p.scheduleType ?? '').toUpperCase() === 'RECURRING' && timeLine ? (
              <View style={mdStyles.sessionCard}>
                <Text style={mdStyles.sessionTitle}>Choose your sessions</Text>
                <Text style={mdStyles.sessionSub}>Select which sessions you can attend</Text>
                <View style={mdStyles.sessionItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={[mdStyles.sessionDay, { color: C.PRIMARY }]}>
                      {abbrevDays(p.recurrenceDays ?? p.recurDays) || 'Recurring'} · {timeLine}
                    </Text>
                    <Text style={mdStyles.sessionMeta}>
                      {[fmtDate(p.recurStart ?? p.startDate), fmtDate(p.recurEnd ?? p.endDate)].filter(Boolean).join(' to ')}
                      {max > 0 ? ` · ${curr}/${max} filled` : ''}
                    </Text>
                  </View>
                  <Text style={{ color: C.PRIMARY, fontSize: 18 }}>✓</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* Apply footer */}
        {p && !loading ? (
          <View style={mdStyles.applyFooter}>
            {alreadyApproved ? (
              <View style={[mdStyles.applyBtn, { backgroundColor: '#10B981' }]}>
                <Text style={mdStyles.applyBtnText}>✓ Already Approved</Text>
              </View>
            ) : alreadyPending ? (
              <View style={[mdStyles.applyBtn, { backgroundColor: '#F59E0B' }]}>
                <Text style={mdStyles.applyBtnText}>⏳ Application Pending</Text>
              </View>
            ) : applied ? (
              <View style={[mdStyles.applyBtn, { backgroundColor: '#10B981' }]}>
                <Text style={mdStyles.applyBtnText}>✓ Application Submitted</Text>
              </View>
            ) : isFull ? (
              <View style={[mdStyles.applyBtn, { backgroundColor: C.BORDER }]}>
                <Text style={[mdStyles.applyBtnText, { color: C.TEXT2 }]}>No Spots Available</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={mdStyles.applyBtn}
                onPress={handleApply}
                disabled={applying}
                accessibilityLabel="Apply for project"
              >
                {applying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={mdStyles.applyBtnText}>Apply for Selected Sessions</Text>
                }
              </TouchableOpacity>
            )}
            {/* Safe-area spacer — useSafeAreaInsets() returns 0 inside Modal on Android;
                native SafeAreaView reads the real inset at the native layer. */}
            <SafeAreaView edges={['bottom']} style={{ minHeight: 12 }} />
          </View>
        ) : null}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function InfoRow({ icon, text, color }: { icon: string; text: string; color?: string }) {
  return (
    <View style={mdStyles.infoItem}>
      <Text style={[mdStyles.infoIcon, color ? { color } : {}]}>{icon}</Text>
      <Text style={mdStyles.infoText}>{text}</Text>
    </View>
  );
}

// ── Gallery post card ─────────────────────────────────────────────────────────

function GalleryPostCard({ post }: { post: Post }) {
  const color = avatarColor(post.fullName ?? 'U');

  // SP returns mediaUrls as GROUP_CONCAT CSV string — normalise to string[]
  const rawMedia = post.mediaUrls as unknown;
  const mediaUrls: string[] = Array.isArray(rawMedia)
    ? (rawMedia as string[])
    : typeof rawMedia === 'string' && rawMedia
      ? (rawMedia as string).split(',').map((u: string) => u.trim()).filter(Boolean)
      : [];

  // Parallel media types ('IMAGE' | 'VIDEO') — defaults to 'IMAGE' if missing
  const rawTypes = post.mediaTypes as unknown;
  const mediaTypes: string[] = typeof rawTypes === 'string' && rawTypes
    ? rawTypes.split(',').map((t: string) => t.trim())
    : [];
  const firstIsVideo = (mediaTypes[0] ?? 'IMAGE') === 'VIDEO';

  // Play / mute state for the first media item when it is a video
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted,     setMuted]     = useState(true);

  return (
    <View style={styles.galleryPostCard}>
      <View style={styles.galleryPostHeader}>
        {post.profilePhoto
          ? <Image source={{ uri: post.profilePhoto }} style={styles.galleryAvatar} />
          : (
            <View style={[styles.galleryAvatar, { backgroundColor: color }]}>
              <Text style={styles.galleryAvatarText}>{initials(post.fullName ?? 'U')}</Text>
            </View>
          )
        }
        <View style={{ flex: 1 }}>
          <Text style={styles.galleryPostAuthor}>{post.authorName ?? post.fullName}</Text>
          {post.authorRole ? <Text style={styles.galleryPostRole}>{post.authorRole}</Text> : null}
        </View>
        <Text style={styles.galleryPostTime}>{post.timeAgo ?? ''}</Text>
      </View>
      <Text style={styles.galleryPostContent} numberOfLines={5}>{post.content}</Text>

      {mediaUrls.length > 0 && (
        firstIsVideo ? (
          /* ── Video: tap to play/pause, mute toggle while playing ── */
          <TouchableOpacity
            style={styles.galleryVideoWrap}
            onPress={() => setIsPlaying(p => !p)}
            activeOpacity={1}
            accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
          >
            <Video
              source={{ uri: mediaUrls[0] }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              paused={!isPlaying}
              muted={muted}
              repeat={true}
              controls={false}
            />
            {/* Play button — centered by galleryVideoWrap flex (Video is absoluteFill → out of flow) */}
            {!isPlaying && (
              <View style={styles.galleryVideoCircle}>
                <Text style={styles.galleryVideoIcon}>▶</Text>
              </View>
            )}
            {isPlaying && (
              <TouchableOpacity
                style={styles.galleryMuteBtn}
                onPress={e => { e.stopPropagation(); setMuted(m => !m); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
              >
                <Text style={styles.galleryMuteBtnText}>{muted ? '🔇' : '🔊'}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ) : (
          /* ── Image ─────────────────────────────────────────────── */
          <Image source={{ uri: mediaUrls[0] }} style={styles.galleryPostImage} resizeMode="cover" />
        )
      )}

      <View style={styles.galleryPostFooter}>
        <Text style={styles.galleryPostMeta}>❤️ {post.likeCount ?? 0}  · 💬 {post.commentCount ?? 0}</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NgoProfileScreen() {
  const nav      = useNavigation<any>();
  const insets   = useSafeAreaInsets();
  const route    = useRoute<any>();
  const orgId: number = route.params?.orgId ?? 1;
  const { user: authUser } = useAuthStore();
  const topInitials = [authUser?.firstName?.[0], authUser?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  const [org,               setOrg]              = useState<Organisation | null>(null);
  const [activeProjects,    setActiveProjects]    = useState<Project[]>([]);
  const [completedProjects, setCompletedProjects] = useState<Project[]>([]);
  const [openProjects,      setOpenProjects]      = useState<Project[]>([]);
  const [feedPosts,         setFeedPosts]         = useState<Post[]>([]);
  const [feedLoading,       setFeedLoading]       = useState(false);
  const [galleryLoaded,     setGalleryLoaded]     = useState(false);
  const [tab,               setTab]               = useState<Tab>('About');
  const [loading,           setLoading]           = useState(true);
  const [modalProjectId,    setModalProjectId]    = useState<number | null>(null);
  const [isFollowing,       setIsFollowing]       = useState(false);
  const [followLoading,     setFollowLoading]     = useState(false);
  const [sharing,           setSharing]           = useState(false);

  // ── Swipe gesture refs ──────────────────────────────────────────────────────
  const tabBarRef   = useRef<ScrollView>(null);
  // Always holds the latest tab + handler so the PanResponder closure never goes stale
  const swipeState  = useRef({ tab: 'About' as Tab, handleTabChange: (_t: Tab) => {} });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => false,
      // Claim the gesture only when clearly horizontal (dx > dy * 1.5)
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        const { tab: curTab, handleTabChange: change } = swipeState.current;
        const idx = TABS.indexOf(curTab);
        // Swipe left (negative dx) → advance to next tab
        if ((dx < -40 || vx < -0.4) && idx < TABS.length - 1) {
          change(TABS[idx + 1]);
        // Swipe right (positive dx) → back to previous tab
        } else if ((dx > 40 || vx > 0.4) && idx > 0) {
          change(TABS[idx - 1]);
        }
      },
    })
  ).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, activeRes, completedRes] = await Promise.all([
        getProfile(orgId),
        listProjects({ orgId, statusCode: 'ACTIVE',    pageNumber: 1, pageSize: 20 }),
        listProjects({ orgId, statusCode: 'COMPLETED', pageNumber: 1, pageSize: 3  }),
      ]);
      if (orgRes.data?.isSuccess) {
        const orgData = orgRes.data.data ?? null;
        setOrg(orgData);
        setIsFollowing(!!orgData?.isFollowing);
      }
      if (activeRes.data?.isSuccess) {
        const items = activeRes.data.data?.items ?? [];
        setActiveProjects(items);
        // Volunteer tab = active projects that still have spots
        setOpenProjects(items.filter(p => (p.spotsLeft ?? 1) > 0));
      }
      if (completedRes.data?.isSuccess) setCompletedProjects(completedRes.data.data?.items ?? []);
    } catch {
      Alert.alert('Error', 'Could not load NGO profile.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // Lazy-load gallery — only when Gallery tab first opened
  const loadGallery = useCallback(async () => {
    if (galleryLoaded) return;
    setFeedLoading(true);
    try {
      const res = await apiClient.get<ApiResponse<PagedResult<Post>>>('/feed', {
        params: { orgId, pageNumber: 1, pageSize: 30 },
      });
      if (res.data?.isSuccess) {
        // Filter to only this org's posts (backend may not filter, so we ensure it)
        const items = (res.data.data?.items ?? []).filter(
          p => !p.orgId || p.orgId === orgId,
        );
        setFeedPosts(items);
      }
    } catch { /* show empty state */ }
    finally {
      setFeedLoading(false);
      setGalleryLoaded(true);
    }
  }, [orgId, galleryLoaded]);

  useEffect(() => { load(); }, [load]);

  // Re-sync follow state when returning from any sub-screen (e.g. JoinForm).
  // Org_RequestMembership auto-follows on submit, so isFollowing will be 1
  // after the user completes a join request — this picks it up without a full reload.
  useFocusEffect(useCallback(() => {
    getProfile(orgId).then(res => {
      if (res.data?.isSuccess) {
        const d = res.data.data;
        setIsFollowing(!!d?.isFollowing);
        if (d?.followerCount !== undefined) {
          setOrg(prev => prev ? { ...prev, followerCount: d.followerCount } : prev);
        }
      }
    }).catch(() => {});
  }, [orgId]));

  const handleTabChange = useCallback((t: Tab) => {
    setTab(t);
    if (t === 'Gallery') loadGallery();
    // Scroll the tab bar so the newly-active tab is always visible
    const idx = TABS.indexOf(t);
    tabBarRef.current?.scrollTo({ x: Math.max(0, idx * 90 - 20), animated: true });
  }, [loadGallery]);

  // Keep swipeState ref current on every render so the PanResponder closure is never stale
  swipeState.current = { tab, handleTabChange };

  const handleRequestJoin = useCallback(() => {
    nav.navigate('JoinForm', { orgId, orgName: org?.orgName ?? org?.name ?? 'NGO' });
  }, [nav, orgId, org]);

  const handleDonate = useCallback(() => {
    nav.navigate('Donate', { orgId });
  }, [nav, orgId]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await shareApi.getToken('ORG', orgId);
      const url = res.data?.data?.url;
      const title = org ? `${org.orgName ?? org.name ?? 'NGO'} on RippleHub` : 'RippleHub';
      await Share.share({ message: url ?? `https://ripplehub.app/ngo/${orgId}`, title });
    } catch {
      const title = org ? `${org.orgName ?? org.name ?? 'NGO'} on RippleHub` : 'RippleHub';
      Share.share({ message: `https://ripplehub.app/ngo/${orgId}`, title }).catch(() => {});
    } finally {
      setSharing(false);
    }
  }, [sharing, orgId, org]);

  const handleWebsite = useCallback(() => {
    if (!org?.website) return;
    const url = org.website.startsWith('http') ? org.website : `https://${org.website}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open website.'));
  }, [org?.website]);

  const handleFollowToggle = useCallback(async () => {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        const res = await orgApi.unfollowOrg(orgId);
        if (res.data?.isSuccess) {
          setIsFollowing(false);
          setOrg(prev => prev ? { ...prev, followerCount: Math.max((prev.followerCount ?? 1) - 1, 0) } : prev);
        }
      } else {
        const res = await orgApi.followOrg(orgId);
        if (res.data?.isSuccess) {
          setIsFollowing(true);
          setOrg(prev => prev ? { ...prev, followerCount: (prev.followerCount ?? 0) + 1 } : prev);
        }
      }
    } catch { /* silent — no network toast needed */ }
    finally { setFollowLoading(false); }
  }, [orgId, isFollowing, followLoading]);

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  if (!org) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Go back">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load NGO profile.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const name             = org.orgName ?? org.name ?? 'NGO';
  const color            = avatarColor(name);
  const ini              = initials(name);
  const rating           = org.avgRating ?? org.rating ?? 0;
  const memberStatusCode = (org as any).memberStatusCode as string | null | undefined;
  const isMember         = memberStatusCode === 'APPROVED';
  const isPending        = memberStatusCode === 'PENDING';
  const is80G            = org.is80G ?? false;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* Project detail modal */}
      <ProjectDetailModal
        visible={modalProjectId !== null}
        projectId={modalProjectId}
        onClose={() => setModalProjectId(null)}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {authUser?.profilePhoto
          ? <Image source={{ uri: authUser.profilePhoto }} style={[styles.userAvatar, { overflow: 'hidden' }]} />
          : (
            <View style={[styles.userAvatar, { backgroundColor: C.PRIMARY }]}>
              <Text style={styles.userAvatarText}>{topInitials}</Text>
            </View>
          )
        }
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {org.logoUrl || org.orgLogoUrl
            ? <Image source={{ uri: (org.logoUrl ?? org.orgLogoUrl)! }} style={[styles.heroIcon, { overflow: 'hidden' }]} resizeMode="cover" />
            : <View style={[styles.heroIcon, { backgroundColor: color }]}><Text style={styles.heroIconText}>{ini}</Text></View>
          }
          <View style={styles.heroInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.heroName}>{name}</Text>
              {org.verificationStatusCode === 'VERIFIED' && (
                <View style={styles.orgVerifiedBadge}>
                  <Text style={styles.orgVerifiedBadgeText}>✓ Verified</Text>
                </View>
              )}
            </View>
            <View style={styles.heroTagRow}>
              <View style={styles.categoryPill}>
                <Text style={styles.categoryPillText}>{org.categoryName ?? org.category ?? 'NGO'}</Text>
              </View>
              {is80G && (
                <View style={styles.badge80G}>
                  <Text style={styles.badge80GText}>80G</Text>
                </View>
              )}
            </View>
            <Text style={styles.heroMeta}>
              {[org.city, org.state].filter(Boolean).join(', ')}
              {org.memberCount ? ` · ${org.memberCount.toLocaleString('en-IN')} ${org.memberCount === 1 ? 'member' : 'members'}` : ''}
              {org.followerCount ? ` · ${org.followerCount.toLocaleString('en-IN')} followers` : ''}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {isMember ? (
            <View style={[styles.actionBtn, styles.actionBtnMember]}>
              <Text style={styles.actionBtnMemberText}>✓ Member</Text>
            </View>
          ) : isPending ? (
            <View style={[styles.actionBtn, styles.actionBtnPending]}>
              <Text style={styles.actionBtnPendingText}>⏳ Request Pending</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={handleRequestJoin} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>🤝 Request to Join</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.actionBtnFollow,
              isFollowing && styles.actionBtnFollowing,
            ]}
            onPress={handleFollowToggle}
            activeOpacity={0.85}
            disabled={followLoading}
            accessibilityLabel={isFollowing ? 'Unfollow NGO' : 'Follow NGO'}
          >
            <Text style={[
              styles.actionBtnFollowText,
              isFollowing && styles.actionBtnFollowingText,
            ]}>
              {isFollowing ? '✓ Following' : '+ Follow'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={handleDonate} activeOpacity={0.85}>
            <Text style={styles.actionBtnOutlineText}>💛 Donate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnShare, sharing && { opacity: 0.55 }]}
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.85}
            accessibilityLabel="Share NGO profile"
          >
            {sharing
              ? <ActivityIndicator size="small" color={C.PRIMARY} />
              : <Text style={styles.actionBtnShareIcon}>📤</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{org.memberCount ?? 0}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{org.activeProjects ?? activeProjects.length}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{org.totalVolunteerHours ?? 0}h</Text>
            <Text style={styles.statLabel}>Hours</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{rating > 0 ? `⭐ ${rating.toFixed(1)}` : '—'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* Tab bar */}
        <ScrollView ref={tabBarRef} horizontal showsHorizontalScrollIndicator={false}
          style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity key={t}
              style={[styles.tabItem, tab === t && styles.tabItemActive]}
              onPress={() => handleTabChange(t)} accessibilityLabel={t}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Tab content — panHandlers enable swipe-left/right to change tabs ── */}
        <View style={styles.tabContent} {...panResponder.panHandlers}>

          {/* ── About ────────────────────────────────────────────────────── */}
          {tab === 'About' && (
            <>
              {(org.about || org.description) && (
                <>
                  <Text style={styles.sectionLabel}>About Us</Text>
                  <Text style={styles.body}>{org.about ?? org.description}</Text>
                </>
              )}
              {org.mission && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Our Mission</Text>
                  <Text style={styles.body}>{org.mission}</Text>
                </>
              )}
              {org.vision && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Our Vision</Text>
                  <Text style={styles.body}>{org.vision}</Text>
                </>
              )}
              {org.areasOfWork?.length ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Areas of Work</Text>
                  <View style={styles.tagRow}>
                    {org.areasOfWork.map((a: string, i: number) => (
                      <View key={i} style={styles.tag}><Text style={styles.tagText}>{a}</Text></View>
                    ))}
                  </View>
                </>
              ) : null}
              {(org.email || org.contactEmail) && (
                <Text style={styles.contactItem}>✉  {org.email ?? org.contactEmail}</Text>
              )}
              {org.contactPhone && (
                <Text style={styles.contactItem}>📞  {org.contactPhone}</Text>
              )}
              {org.website && (
                <TouchableOpacity onPress={handleWebsite} accessibilityLabel="Open website">
                  <Text style={[styles.contactItem, styles.websiteLink]}>🌐  {org.website}</Text>
                </TouchableOpacity>
              )}
              {!org.about && !org.description && !org.mission && !org.vision
                && !org.areasOfWork?.length && !org.email && !org.contactEmail
                && !org.website && (
                <Text style={styles.emptyText}>No details available yet.</Text>
              )}
            </>
          )}

          {/* ── Projects ─────────────────────────────────────────────────── */}
          {tab === 'Projects' && (
            <>
              <Text style={styles.sectionLabel}>Active Projects</Text>
              {activeProjects.length === 0 ? (
                <Text style={styles.emptyText}>No active projects at this time.</Text>
              ) : (
                activeProjects.map(p => (
                  <ProjectRow
                    key={p.projectId}
                    project={p}
                    onDetails={() => setModalProjectId(p.projectId)}
                  />
                ))
              )}

              {completedProjects.length > 0 && (
                <>
                  <View style={styles.completedDivider}>
                    <View style={styles.completedDividerLine} />
                    <Text style={styles.completedDividerLabel}>PAST PROJECTS</Text>
                    <View style={styles.completedDividerLine} />
                  </View>
                  {completedProjects.map(p => (
                    <ProjectRow
                      key={p.projectId}
                      project={p}
                      completed
                      onDetails={() => setModalProjectId(p.projectId)}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* ── Volunteer ────────────────────────────────────────────────── */}
          {tab === 'Volunteer' && (
            <>
              <Text style={styles.sectionLabel}>Open Opportunities</Text>
              {openProjects.length === 0 ? (
                <Text style={styles.emptyText}>No open volunteer spots at this time.</Text>
              ) : (
                openProjects.map(p => (
                  <ProjectRow
                    key={p.projectId}
                    project={p}
                    onDetails={() => setModalProjectId(p.projectId)}
                  />
                ))
              )}
            </>
          )}

          {/* ── Gallery ──────────────────────────────────────────────────── */}
          {tab === 'Gallery' && (
            feedLoading ? (
              <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 32 }} />
            ) : feedPosts.length === 0 ? (
              <View style={styles.galleryEmpty}>
                <Text style={{ fontSize: 36, marginBottom: 10 }}>📭</Text>
                <Text style={styles.emptyText}>No posts from this NGO yet.</Text>
              </View>
            ) : (
              feedPosts.map(post => (
                <GalleryPostCard key={post.postId} post={post} />
              ))
            )
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Project row card ──────────────────────────────────────────────────────────

function ProjectRow({
  project,
  onDetails,
  completed,
}: {
  project:    Project;
  onDetails:  () => void;
  completed?: boolean;
}) {
  // SP may return field as projectName instead of title
  const title    = project.title ?? (project as any).projectName ?? '';
  const curr     = project.currentParticipants ?? project.approvedCount ?? 0;
  const schedule = fmtSchedule(project);
  const meta     = [
    completed ? 'Completed' : 'Active',
    schedule,
    curr > 0 ? `${curr} participants` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.projectItem}>
      <View style={{ flex: 1 }}>
        {!!title && (
          <Text style={styles.projectTitle} numberOfLines={2}>{title}</Text>
        )}
        {!!project.description && (
          <Text style={styles.projectDesc} numberOfLines={2}>{project.description}</Text>
        )}
        <Text style={styles.projectMeta}>{meta}</Text>
      </View>
      <TouchableOpacity style={styles.detailsBtn} onPress={onDetails} accessibilityLabel={`Details for ${title}`}>
        <Text style={styles.detailsBtnText}>Details</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.BG },
  centered:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:         { color: C.RED, textAlign: 'center', marginBottom: 12 },
  retryBtn:          { backgroundColor: C.PRIMARY, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText:         { color: '#fff', fontWeight: '600' },

  // Top bar
  topBar:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:           { paddingVertical: 4 },
  backText:          { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  userAvatar:        { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userAvatarText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Share button in the action row — fixed width so existing flex buttons are untouched
  actionBtnShare:     { width: 44, alignSelf: 'stretch', borderWidth: 1.5, borderColor: C.PRIMARY + '70', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnShareIcon: { fontSize: 20 },

  // Hero
  hero:              { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, backgroundColor: C.CARD },
  heroIcon:          { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroIconText:      { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroInfo:          { flex: 1 },
  heroName:          { fontSize: 18, fontWeight: '800', color: C.TEXT, marginBottom: 5 },
  heroTagRow:        { flexDirection: 'row', gap: 6, marginBottom: 5, flexWrap: 'wrap' },
  categoryPill:      { backgroundColor: C.PRIMARY_LIGHT, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  categoryPillText:  { fontSize: 11, fontWeight: '600', color: C.PRIMARY },
  badge80G:          { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  orgVerifiedBadge:     { backgroundColor: '#ECFDF5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: '#6EE7B7' },
  orgVerifiedBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  badge80GText:      { fontSize: 11, fontWeight: '700', color: '#16A34A' },
  heroMeta:          { fontSize: 12, color: C.TEXT2 },

  // Action buttons
  actionRow:            { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  actionBtn:            { flex: 1.4, backgroundColor: C.PRIMARY, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  actionBtnMember:      { backgroundColor: C.TEAL ?? '#2ECC71' },
  actionBtnPending:     { backgroundColor: '#F59E0B' },
  actionBtnText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
  actionBtnMemberText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  actionBtnPendingText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  actionBtnFollow:          { flex: 0.8, borderWidth: 1.5, borderColor: C.PRIMARY, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  actionBtnFollowing:       { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  actionBtnFollowText:      { color: C.PRIMARY, fontWeight: '700', fontSize: 13 },
  actionBtnFollowingText:   { color: '#10B981' },
  actionBtnOutline:     { flex: 0.8, borderWidth: 2, borderColor: '#F59E0B', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  actionBtnOutlineText: { color: '#92400E', fontWeight: '700', fontSize: 14 },

  // Stats
  statsRow:          { flexDirection: 'row', backgroundColor: C.CARD, paddingVertical: 14, marginTop: 8 },
  statItem:          { flex: 1, alignItems: 'center' },
  statValue:         { fontSize: 15, fontWeight: '800', color: C.TEXT },
  statLabel:         { fontSize: 11, color: C.TEXT2, marginTop: 2 },
  statDivider:       { width: 1, height: 30, backgroundColor: C.BORDER, alignSelf: 'center' },

  // Tabs
  tabScroll:         { flexGrow: 0, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER, marginTop: 8 },
  tabRow:            { flexDirection: 'row', paddingHorizontal: 12, gap: 4 },
  tabItem:           { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive:     { borderBottomColor: C.PRIMARY },
  tabText:           { fontSize: 13, color: C.TEXT2, fontWeight: '500' },
  tabTextActive:     { color: C.PRIMARY, fontWeight: '700' },
  tabContent:        { padding: 14 },

  // Content
  sectionLabel:      { fontSize: 13, fontWeight: '700', color: C.TEXT, marginBottom: 7 },
  body:              { fontSize: 14, color: C.TEXT2, lineHeight: 20 },
  tagRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag:               { backgroundColor: C.PRIMARY_LIGHT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText:           { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },
  contactItem:       { fontSize: 13, color: C.TEXT2, marginTop: 10 },
  websiteLink:       { color: C.PRIMARY, textDecorationLine: 'underline' },
  emptyText:         { color: C.TEXT2, fontSize: 13, textAlign: 'center', paddingVertical: 24 },

  // Project row
  projectItem:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD, borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  projectTitle:      { fontSize: 14, fontWeight: '600', color: C.TEXT, marginBottom: 2 },
  projectDesc:       { fontSize: 12, color: C.TEXT2, lineHeight: 16, marginBottom: 3 },
  projectMeta:       { fontSize: 11, color: C.TEXT3 },
  detailsBtn:        { borderWidth: 1.5, borderColor: C.PRIMARY, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 12, marginLeft: 10 },
  detailsBtnText:    { color: C.PRIMARY, fontSize: 12, fontWeight: '600' },

  // Completed divider
  completedDivider:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 10 },
  completedDividerLine:  { flex: 1, height: 1, backgroundColor: C.BORDER },
  completedDividerLabel: { fontSize: 10, fontWeight: '700', color: C.TEXT3, letterSpacing: 1.2 },

  // Gallery
  galleryEmpty:         { alignItems: 'center', paddingTop: 32 },
  galleryPostCard:      { backgroundColor: C.CARD, borderRadius: 12, padding: 12, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  galleryPostHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  galleryAvatar:        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  galleryAvatarText:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  galleryPostAuthor:    { fontSize: 13, fontWeight: '700', color: C.TEXT },
  galleryPostRole:      { fontSize: 11, color: C.TEXT3 },
  galleryPostTime:      { fontSize: 11, color: C.TEXT3 },
  galleryPostContent:   { fontSize: 13, color: C.TEXT2, lineHeight: 19, marginBottom: 8 },
  galleryPostImage:     { width: '100%', height: 180, borderRadius: 10, marginBottom: 8 },
  galleryVideoWrap:     { width: '100%', height: 180, borderRadius: 10, marginBottom: 8, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  galleryVideoOverlay:  { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }, // unused — kept for safety
  galleryVideoCircle:   { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  galleryVideoIcon:     { color: '#fff', fontSize: 18, marginLeft: 3 },
  galleryMuteBtn:       { position: 'absolute', bottom: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  galleryMuteBtnText:   { fontSize: 16 },
  galleryPostFooter:    { borderTopWidth: 1, borderTopColor: C.BORDER, paddingTop: 8 },
  galleryPostMeta:      { fontSize: 12, color: C.TEXT3 },
});

// ── Modal styles ──────────────────────────────────────────────────────────────

const mdStyles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.BG },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:    { fontSize: 15, color: C.TEXT2, fontWeight: '600' },

  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backBtn:      { paddingVertical: 4 },
  backText:     { fontSize: 16, color: C.PRIMARY, fontWeight: '600' },
  topTitle:     { fontSize: 16, fontWeight: '700', color: C.TEXT },
  topAvatar:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  topAvatarText:{ color: '#fff', fontSize: 12, fontWeight: '700' },

  card:         { margin: 12, backgroundColor: C.CARD, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  titleRow:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  projTitle:    { flex: 1, fontSize: 18, fontWeight: '800', color: C.TEXT },
  catPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  catPillText:  { fontSize: 11, fontWeight: '700' },
  orgName:      { fontSize: 13, color: C.TEXT2, marginBottom: 10 },
  description:  { fontSize: 14, color: C.TEXT, lineHeight: 20, marginBottom: 12 },

  infoList:     { gap: 8, marginBottom: 12 },
  infoItem:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  infoIcon:     { fontSize: 15, width: 22, color: C.PRIMARY },
  infoText:     { flex: 1, fontSize: 13, color: C.TEXT },

  mapTile:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: `${C.PRIMARY}10`, borderRadius: 10, padding: 10, marginBottom: 12 },
  mapTitle:     { fontSize: 12, fontWeight: '700', color: C.PRIMARY },
  mapSub:       { fontSize: 11, color: C.TEXT2, marginTop: 2 },

  skillsBox:    { backgroundColor: `${C.PRIMARY}08`, borderRadius: 9, padding: 10 },
  skillsLabel:  { fontSize: 12, fontWeight: '700', color: C.PRIMARY, marginBottom: 7 },
  tagRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  skillTag:     { backgroundColor: `${C.PRIMARY}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  skillTagText: { fontSize: 12, color: C.PRIMARY, fontWeight: '500' },

  sessionCard:  { margin: 12, marginTop: 0, backgroundColor: C.CARD, borderRadius: 14, padding: 14 },
  sessionItem:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER, marginBottom: 8, backgroundColor: C.BG },
  sessionDay:   { fontSize: 13, fontWeight: '700', color: C.PRIMARY, minWidth: 30, textAlign: 'center' },
  sessionMeta:  { flex: 1, gap: 2 },
  sessionSub:   { fontSize: 12, color: C.TEXT2 },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 4 },

  applyFooter:  { paddingHorizontal: 12, paddingTop: 8 },
  applyBtn:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: C.PRIMARY },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});