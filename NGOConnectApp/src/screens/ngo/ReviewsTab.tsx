/**
 * ReviewsTab.tsx
 * Reviews tab content for NgoProfileScreen.
 * Shows: aggregate rating histogram + sort + paginated review list.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AppConfig from '../../config/AppConfig';
import { reviewApi, ReviewAggregate, ReviewItem, ReviewSort } from '../../api/review.api';
import { useAuthStore } from '../../store/authStore';
import ReviewCard from './ReviewCard';
import WriteReviewSheet from './WriteReviewSheet';

const C = AppConfig.COLORS;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  orgId:   number;
  orgName: string;
}

const SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: 'RECENT',  label: 'Most Recent'    },
  { value: 'HELPFUL', label: 'Most Helpful'   },
  { value: 'HIGHEST', label: 'Highest Rating' },
  { value: 'LOWEST',  label: 'Lowest Rating'  },
];

// ── Histogram bar ─────────────────────────────────────────────────────────────

function HistogramBar({ pct }: { pct: number }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%` }]} />
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewsTab({ orgId, orgName }: Props) {
  const { user }               = useAuthStore();
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [reviews,   setReviews]   = useState<ReviewItem[]>([]);
  const [sort,      setSort]      = useState<ReviewSort>('RECENT');
  const [sortOpen,  setSortOpen]  = useState(false);
  const [page,      setPage]      = useState(1);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const sortBtnRef = useRef<any>(null);

  const PAGE_SIZE = 10;

  // ── Fetch aggregate ────────────────────────────────────────────
  async function loadAggregate() {
    try {
      const res = await reviewApi.getAggregate(orgId);
      if (res.data?.isSuccess) setAggregate(res.data.data as ReviewAggregate);
    } catch {}
  }

  // ── Fetch reviews (page 1 = fresh load) ───────────────────────
  const loadReviews = useCallback(async (newSort: ReviewSort, resetPage = true) => {
    setLoading(resetPage);
    const targetPage = resetPage ? 1 : page + 1;
    try {
      const res = await reviewApi.getList(orgId, newSort, targetPage, PAGE_SIZE);
      if (res.data?.isSuccess && res.data.data) {
        const { items, totalCount } = res.data.data as any;
        setReviews(resetPage ? items : prev => [...prev, ...items]);
        setTotal(totalCount);
        setPage(targetPage);
      }
    } catch {
      Alert.alert('Error', 'Could not load reviews.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [orgId, page]);

  useEffect(() => {
    loadAggregate();
    loadReviews('RECENT', true);
  }, [orgId]);

  function openSortDropdown() {
    sortBtnRef.current?.measureInWindow((x, y, w, h) => {
      setDropdownPos({ top: y + h + 4, right: 14 });
      setSortOpen(true);
    });
  }

  function changeSort(s: ReviewSort) {
    setSort(s);
    setSortOpen(false);
    loadReviews(s, true);
  }

  function loadMore() {
    if (loadingMore || reviews.length >= total) return;
    setLoadingMore(true);
    loadReviews(sort, false);
  }

  // ── Vote handler ───────────────────────────────────────────────
  async function handleHelpful(reviewId: number, isHelpful: boolean) {
    if (!user) { Alert.alert('Login required', 'Please log in to vote.'); return; }
    try {
      await reviewApi.markHelpful(orgId, reviewId, isHelpful);
      // Optimistic update of counts + currentUserVote
      setReviews(prev => prev.map(r => {
        if (r.reviewId !== reviewId) return r;
        const wasVote = r.currentUserVote;
        const toggling = wasVote === (isHelpful ? 1 : 0);
        return {
          ...r,
          currentUserVote:  toggling ? null : (isHelpful ? 1 : 0),
          helpfulCount:     isHelpful
            ? r.helpfulCount + (toggling ? -1 : wasVote === 0 ? 0 : 1)
            : r.helpfulCount + (wasVote === 1 ? -1 : 0),
          notHelpfulCount: !isHelpful
            ? r.notHelpfulCount + (toggling ? -1 : wasVote === 1 ? 0 : 1)
            : r.notHelpfulCount + (wasVote === 0 ? -1 : 0),
        };
      }));
    } catch {}
  }

  // ── Delete handler ─────────────────────────────────────────────
  async function handleDelete(reviewId: number) {
    try {
      const res = await reviewApi.deleteReview(orgId, reviewId);
      if (res.data?.isSuccess) {
        setReviews(prev => prev.filter(r => r.reviewId !== reviewId));
        setTotal(t => t - 1);
        loadAggregate();
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not delete review.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong.');
    }
  }

  // ── Report handler ─────────────────────────────────────────────
  async function handleReport(reviewId: number) {
    try {
      await reviewApi.reportReview(orgId, reviewId);
      Alert.alert('Reported', 'Our team will review it shortly. Thank you.');
    } catch {}
  }

  // ── After successful review submission ─────────────────────────
  function onReviewSuccess() {
    setSheetOpen(false);
    loadAggregate();
    loadReviews(sort, true);
  }

  // ── Render ─────────────────────────────────────────────────────

  const ListHeader = (
    <View>
      {/* Aggregate block */}
      {aggregate && (
        <View style={styles.aggregateCard}>
          <View style={styles.aggregateRow}>
            {/* Big number or empty state */}
            <View style={styles.bigRatingBlock}>
              {aggregate.totalReviews === 0 ? (
                <>
                  <Text style={styles.noRatingIcon}>☆</Text>
                  <Text style={styles.noRatingLabel}>No ratings</Text>
                  <Text style={styles.noRatingSubLabel}>yet</Text>
                </>
              ) : (
                <>
                  <Text style={styles.bigRating}>{aggregate.avgRating?.toFixed(1)}</Text>
                  <Text style={styles.bigStars}>
                    {'★'.repeat(Math.round(aggregate.avgRating ?? 0))}
                    {'☆'.repeat(5 - Math.round(aggregate.avgRating ?? 0))}
                  </Text>
                  <Text style={styles.totalReviews}>{aggregate.totalReviews} reviews</Text>
                </>
              )}
            </View>
            {/* Histogram */}
            <View style={styles.histogram}>
              {[5, 4, 3, 2, 1].map(star => {
                const pct = (aggregate as any)[`star${star}Pct`] ?? 0;
                return (
                  <View key={star} style={styles.histogramRow}>
                    <Text style={styles.histogramLabel}>{star}</Text>
                    <HistogramBar pct={pct} />
                    <Text style={styles.histogramPct}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Write a Review button */}
      {user && (
        <TouchableOpacity style={styles.writeBtn} onPress={() => setSheetOpen(true)}>
          <Text style={styles.writeBtnText}>✏️  Write a Review</Text>
        </TouchableOpacity>
      )}

      {/* Sort bar */}
      <View style={styles.sortBar}>
        <Text style={styles.countText}>{total} Review{total !== 1 ? 's' : ''}</Text>
        <View ref={sortBtnRef} collapsable={false}>
          <TouchableOpacity style={styles.sortBtn} onPress={openSortDropdown}>
            <Text style={styles.sortBtnText}>
              {SORT_OPTIONS.find(o => o.value === sort)?.label ?? 'Sort'} ▾
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <ActivityIndicator color={C.PRIMARY} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={r => String(r.reviewId)}
          renderItem={({ item }) => (
            <ReviewCard
              review={item}
              orgId={orgId}
              orgName={orgName}
              onHelpful={handleHelpful}
              onDelete={handleDelete}
              onReport={handleReport}
            />
          )}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No reviews yet. Be the first!</Text>
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color={C.PRIMARY} style={{ marginVertical: 16 }} />
              : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Sort dropdown — rendered in Modal so it overlays FlatList cells */}
      <Modal
        visible={sortOpen}
        transparent
        animationType="none"
        onRequestClose={() => setSortOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSortOpen(false)}
        />
        {dropdownPos && (
          <View style={[styles.sortDropdown, { top: dropdownPos.top, right: dropdownPos.right }]}>
            {SORT_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.value}
                style={[styles.sortOption, sort === o.value && styles.sortOptionActive]}
                onPress={() => changeSort(o.value)}
              >
                <Text style={[styles.sortOptionText, sort === o.value && { color: C.PRIMARY }]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Modal>

      {/* Write Review bottom sheet */}
      <WriteReviewSheet
        visible={sheetOpen}
        orgId={orgId}
        orgName={orgName}
        onClose={() => setSheetOpen(false)}
        onSuccess={onReviewSuccess}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: {
    padding: 14,
    paddingBottom: 32,
  },
  aggregateCard: {
    backgroundColor: C.CARD,
    borderRadius:    12,
    padding:         14,
    marginBottom:    12,
    shadowColor:     '#000',
    shadowOpacity:   0.05,
    shadowRadius:    4,
    elevation:       2,
  },
  aggregateRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           16,
  },
  bigRatingBlock: {
    alignItems:  'center',
    minWidth:    72,
  },
  bigRating: {
    fontSize:   46,
    fontWeight: '800',
    color:      C.TEXT_PRIMARY,
    lineHeight: 52,
  },
  bigStars: {
    fontSize:      16,
    color:         '#F59E0B',
    letterSpacing: 2,
    marginVertical: 3,
  },
  totalReviews: {
    fontSize: 11,
    color:    C.TEXT_SECONDARY,
  },
  histogram: {
    flex: 1,
    gap:  5,
  },
  histogramRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  histogramLabel: {
    width:    12,
    fontSize: 11,
    color:    C.TEXT_SECONDARY,
    textAlign: 'right',
  },
  barTrack: {
    flex:            1,
    height:          7,
    backgroundColor: C.BACKGROUND,
    borderRadius:    4,
    overflow:        'hidden',
  },
  barFill: {
    height:          '100%',
    backgroundColor: '#F59E0B',
    borderRadius:    4,
  },
  histogramPct: {
    width:    28,
    fontSize: 10,
    color:    C.TEXT_SECONDARY,
  },
  writeBtn: {
    backgroundColor: C.PRIMARY,
    borderRadius:    12,
    paddingVertical: 12,
    alignItems:      'center',
    marginBottom:    12,
  },
  writeBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   14,
  },
  sortBar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   10,
  },
  countText: {
    fontWeight: '700',
    fontSize:   14,
    color:      C.TEXT_PRIMARY,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderWidth:       1.5,
    borderColor:       C.BORDER ?? '#E5E7EB',
    borderRadius:      8,
  },
  sortBtnText: {
    fontSize: 12,
    color:    C.TEXT_PRIMARY,
  },
  modalBackdrop: {
    position: 'absolute',
    top:      0,
    left:     0,
    right:    0,
    bottom:   0,
  },
  sortDropdown: {
    position:        'absolute',
    backgroundColor: C.CARD,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     C.BORDER ?? '#E5E7EB',
    minWidth:        160,
    shadowColor:     '#000',
    shadowOpacity:   0.12,
    shadowRadius:    8,
    elevation:       10,
  },
  noRatingIcon: {
    fontSize:   40,
    color:      '#D1D5DB',
    lineHeight: 48,
  },
  noRatingLabel: {
    fontSize:   12,
    color:      C.TEXT_SECONDARY,
    fontWeight: '600',
    marginTop:  2,
  },
  noRatingSubLabel: {
    fontSize: 11,
    color:    C.TEXT_SECONDARY,
  },
  sortOption: {
    paddingHorizontal: 14,
    paddingVertical:   10,
  },
  sortOptionActive: {
    backgroundColor: C.PRIMARY_LIGHT ?? '#EFF6FF',
  },
  sortOptionText: {
    fontSize: 13,
    color:    C.TEXT_PRIMARY,
  },
  emptyText: {
    textAlign:  'center',
    color:      C.TEXT_SECONDARY,
    marginTop:  32,
    fontSize:   14,
  },
});
