/**
 * ReviewCard.tsx
 * Renders a single NGO review card.
 * Shows: author avatar/badge, star rating, date, review text, media thumbnails,
 * NGO response block (Google Maps owner-response style), helpful votes, report.
 */
import React, { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Video from 'react-native-video';
import AppConfig from '../../config/AppConfig';
import { fmtDate } from '../../utils/dateUtils';
import type { ReviewItem } from '../../api/review.api';
import MediaPreviewModal, { MediaItem } from '../../components/MediaPreviewModal';

const C = AppConfig.COLORS;

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

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Text key={i} style={{ fontSize: size, color: i <= rating ? '#F59E0B' : '#D1D5DB' }}>
          ★
        </Text>
      ))}
    </View>
  );
}

const REVIEWER_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  VOLUNTEER: { label: '✅ Volunteer', bg: '#F0FDF4', color: '#16A34A' },
  DONOR:     { label: '💛 Donor',     bg: '#FFFBEB', color: '#D97706' },
  GENERAL:   { label: '👤 General',   bg: '#F3F4F6', color: '#6B7280' },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReviewCardProps {
  review:      ReviewItem;
  orgId:       number;
  orgName:     string;
  onHelpful:   (reviewId: number, isHelpful: boolean) => void;
  onDelete?:   (reviewId: number) => void;
  onReport:    (reviewId: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewCard({
  review,
  orgId,
  orgName,
  onHelpful,
  onDelete,
  onReport,
}: ReviewCardProps) {
  const [expanded,      setExpanded]      = useState(false);
  const [previewOpen,   setPreviewOpen]   = useState(false);
  const [previewIndex,  setPreviewIndex]  = useState(0);
  const [previewItems,  setPreviewItems]  = useState<MediaItem[]>([]);

  const badge = REVIEWER_BADGE[review.reviewerType] ?? REVIEWER_BADGE.GENERAL;
  const ac    = avatarColor(review.authorName);
  const ini   = initials(review.authorName);

  const TEXT_LIMIT = 160;
  const isLong     = review.reviewText.length > TEXT_LIMIT;
  const displayText = isLong && !expanded
    ? review.reviewText.slice(0, TEXT_LIMIT) + '…'
    : review.reviewText;

  function handleReport() {
    Alert.alert('Report Review', 'Are you sure you want to report this review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => onReport(review.reviewId) },
    ]);
  }

  function handleDelete() {
    Alert.alert('Delete Review', 'This will permanently delete your review.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(review.reviewId) },
    ]);
  }

  return (
    <View style={styles.card}>
      {/* ── Author row ─────────────────────────────────────────── */}
      <View style={styles.authorRow}>
        {review.authorAvatar ? (
          <Image source={{ uri: review.authorAvatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: ac }]}>
            <Text style={styles.avatarText}>{ini}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName} numberOfLines={1}>{review.authorName}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Stars rating={review.overallRating} />
            <Text style={styles.dateText}>{fmtDate(review.createdAt)}</Text>
          </View>
        </View>

        {/* Delete — visible on own review, disabled after 30 days */}
        {review.isOwnReview === 1 && (
          <TouchableOpacity
            onPress={review.canDelete === 1 ? handleDelete : undefined}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ opacity: review.canDelete === 1 ? 1 : 0.35 }}
          >
            <Text style={styles.reportIcon}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Review text ────────────────────────────────────────── */}
      <Text style={styles.reviewText}>{displayText}</Text>
      {isLong && (
        <TouchableOpacity onPress={() => setExpanded(e => !e)}>
          <Text style={styles.readMore}>{expanded ? 'Show less' : 'Read more'}</Text>
        </TouchableOpacity>
      )}

      {/* ── Media thumbnails ───────────────────────────────────── */}
      {(() => {
        // JSON_ARRAYAGG returns a JSON string from MySQL — parse it safely
        let media: any[] = [];
        try {
          const raw = review.mediaItems;
          if (raw) {
            media = typeof raw === 'string' ? JSON.parse(raw) : raw;
          }
        } catch {}
        if (!media || media.length === 0) return null;

        // Build MediaItem array once so we can pass it to the modal
        const items: MediaItem[] = media.map((m: any) => ({
          uri:  m.mediaUrl ?? m.url,
          type: (m.mediaType ?? 'IMAGE').toUpperCase() === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        }));

        function openPreview(idx: number) {
          setPreviewItems(items);
          setPreviewIndex(idx);
          setPreviewOpen(true);
        }

        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
            {items.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => openPreview(idx)}
                activeOpacity={0.85}
              >
                <View style={styles.thumbnailWrapper}>
                  {item.type === 'VIDEO' ? (
                    // Video component renders the first frame when paused — proper thumbnail
                    <Video
                      source={{ uri: item.uri }}
                      style={styles.mediaThumbnail}
                      resizeMode="cover"
                      paused
                      muted
                      repeat={false}
                      controls={false}
                    />
                  ) : (
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.mediaThumbnail}
                      resizeMode="cover"
                    />
                  )}
                  {/* Play icon overlay for videos */}
                  {item.type === 'VIDEO' && (
                    <View style={styles.playBadge}>
                      <Text style={styles.playBadgeIcon}>▶</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        );
      })()}

      {/* ── Fullscreen media preview ────────────────────────────── */}
      <MediaPreviewModal
        visible={previewOpen}
        items={previewItems}
        initialIndex={previewIndex}
        onClose={() => setPreviewOpen(false)}
      />

      {/* ── NGO response (Google Maps owner-response style) ────── */}
      {review.responseText ? (
        <View style={styles.responseBlock}>
          <Text style={styles.responseLabel}>Response from {orgName}</Text>
          <Text style={styles.responseText}>{review.responseText}</Text>
          {review.responseCreatedAt && (
            <Text style={styles.responseDate}>{fmtDate(review.responseCreatedAt)}</Text>
          )}
        </View>
      ) : null}

      {/* ── Helpful votes ──────────────────────────────────────── */}
      <View style={styles.helpfulRow}>
        <Text style={styles.helpfulLabel}>Was this helpful?</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[
              styles.voteBtn,
              review.currentUserVote === 1 && styles.voteBtnActive,
            ]}
            onPress={() => onHelpful(review.reviewId, true)}
          >
            <Text style={styles.voteBtnText}>
              👍 {review.helpfulCount > 0 ? review.helpfulCount : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.voteBtn,
              review.currentUserVote === 0 && styles.voteBtnActive,
            ]}
            onPress={() => onHelpful(review.reviewId, false)}
          >
            <Text style={[styles.voteBtnText, { color: C.TEXT_SECONDARY }]}>
              👎 {review.notHelpfulCount > 0 ? review.notHelpfulCount : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.CARD,
    borderRadius:    12,
    padding:         14,
    marginBottom:    10,
    shadowColor:     '#000',
    shadowOpacity:   0.05,
    shadowRadius:    4,
    elevation:       2,
  },
  authorRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            10,
    marginBottom:   10,
  },
  avatar: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  avatarText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   13,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    flexWrap:      'wrap',
    marginBottom:  2,
  },
  authorName: {
    fontWeight: '700',
    fontSize:   14,
    color:      C.TEXT_PRIMARY,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical:   2,
    borderRadius:      6,
  },
  badgeText: {
    fontSize:   10,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  dateText: {
    fontSize: 11,
    color:    C.TEXT_SECONDARY,
  },
  reportIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  reviewText: {
    fontSize:   13,
    color:      C.TEXT_PRIMARY,
    lineHeight: 20,
    marginBottom: 6,
  },
  readMore: {
    fontSize:    12,
    color:       C.PRIMARY,
    fontWeight:  '600',
    marginBottom: 8,
  },
  mediaRow: {
    marginBottom: 10,
  },
  thumbnailWrapper: {
    marginRight: 8,
  },
  mediaThumbnail: {
    width:        80,
    height:       80,
    borderRadius: 8,
    backgroundColor: C.BACKGROUND,
  },
  playBadge: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    bottom:          0,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius:    8,
  },
  playBadgeIcon: {
    fontSize:  18,
    color:     '#fff',
    marginLeft: 2,
  },
  responseBlock: {
    backgroundColor: C.PRIMARY_LIGHT ?? '#EFF6FF',
    borderLeftWidth: 3,
    borderLeftColor: C.PRIMARY,
    borderRadius:    6,
    padding:         10,
    marginBottom:    10,
  },
  responseLabel: {
    fontSize:    11,
    fontWeight:  '700',
    color:       C.PRIMARY,
    marginBottom: 4,
  },
  responseText: {
    fontSize:   12,
    color:      C.TEXT_SECONDARY,
    lineHeight: 18,
  },
  responseDate: {
    fontSize:  10,
    color:     C.TEXT_TERTIARY ?? C.TEXT_SECONDARY,
    marginTop: 3,
  },
  helpfulRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      6,
  },
  helpfulLabel: {
    fontSize: 11,
    color:    C.TEXT_SECONDARY,
  },
  voteBtn: {
    paddingHorizontal: 12,
    paddingVertical:   5,
    backgroundColor:   C.BACKGROUND,
    borderWidth:       1.5,
    borderColor:       C.BORDER ?? '#E5E7EB',
    borderRadius:      8,
  },
  voteBtnActive: {
    borderColor:     C.PRIMARY,
    backgroundColor: C.PRIMARY_LIGHT ?? '#EFF6FF',
  },
  voteBtnText: {
    fontSize:   12,
    color:      C.TEXT_PRIMARY,
    fontWeight: '500',
  },
});
