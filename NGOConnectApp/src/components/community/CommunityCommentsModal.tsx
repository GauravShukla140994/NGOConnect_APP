import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityComment } from '../../types/api.types';
import { communityApi } from '../../api/community.api';
import { UserAvatar } from '../ui';

/** Compute "Xm ago / Xh ago / Xd ago / date" from a createdAt ISO string */
function timeAgoFromDate(iso: string | undefined | null): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)          return 'Just now';
  if (diff < 3600)        return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)       return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400)   return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── CommentRow ────────────────────────────────────────────────────────────────

interface CommentRowProps {
  item: CommunityComment;
  onLike: (commentId: number) => void;
}

const CommentRow: React.FC<CommentRowProps> = React.memo(({ item, onLike }) => {
  const author = item.authorName ?? 'Member';
  const liked  = item.isLikedByMe ?? item.isLiked;
  // SP returns createdAt but not timeAgo — compute client-side
  const when   = item.timeAgo || timeAgoFromDate(item.createdAt);
  return (
    <View style={styles.commentRow}>
      <UserAvatar name={author} photoUrl={item.profilePhoto} size={34} style={styles.avatar} />
      <View style={styles.commentBubble}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{author}</Text>
          <Text style={styles.commentTime}>{when}</Text>
        </View>
        <Text style={styles.commentContent}>{item.content}</Text>
        <Pressable
          style={styles.commentLikeBtn}
          onPress={() => onLike(item.communityCommentId)}
          hitSlop={8}
        >
          <Text style={styles.commentLikeText}>
            {liked ? '❤️' : '🤍'} {item.likeCount ?? 0}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  communityPostId: number | null;
  onClose: () => void;
  /** Called with +1 or -1 so CommunityScreen can update the comment badge */
  onCommentCountChange?: (postId: number, delta: number) => void;
}

const CommunityCommentsModal: React.FC<Props> = ({
  visible,
  communityPostId,
  onClose,
  onCommentCountChange,
}) => {
  const insets      = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const [comments,   setComments]   = useState<CommunityComment[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text,       setText]       = useState('');
  const flatListRef  = useRef<FlatList>(null);
  const inputRef     = useRef<TextInput>(null);

  // ── load comments ────────────────────────────────────────────────────────────

  const loadComments = useCallback(async () => {
    if (!communityPostId) { return; }
    setLoading(true);
    try {
      const res = await communityApi.getComments(communityPostId);
      if (res.data?.isSuccess && res.data.data) {
        setComments(res.data.data as unknown as CommunityComment[]);
      }
    } catch { /* silently fail — list stays empty */ }
    finally { setLoading(false); }
  }, [communityPostId]);

  useEffect(() => {
    if (visible && communityPostId) {
      setComments([]);
      setText('');
      loadComments();
    }
  }, [visible, communityPostId, loadComments]);

  // Scroll to end after new comments load
  useEffect(() => {
    if (comments.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [comments.length]);

  // ── submit comment ───────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || !communityPostId || submitting) { return; }
    setSubmitting(true);
    Keyboard.dismiss();
    try {
      const res = await communityApi.addComment(communityPostId, trimmed);
      if (res.data?.isSuccess) {
        setText('');
        onCommentCountChange?.(communityPostId, 1);
        await loadComments(); // refresh to get real server data incl. author name
      }
    } catch { /* silently fail */ }
    finally { setSubmitting(false); }
  };

  // ── like comment ─────────────────────────────────────────────────────────────

  const handleLikeComment = async (commentId: number) => {
    // Optimistic update first
    setComments(prev =>
      prev.map(c => {
        if (c.communityCommentId !== commentId) { return c; }
        const nowLiked = !(c.isLikedByMe ?? c.isLiked);
        return { ...c, isLiked: nowLiked, isLikedByMe: nowLiked, likeCount: Math.max(0, (c.likeCount ?? 0) + (nowLiked ? 1 : -1)) };
      }),
    );
    try {
      const res = await communityApi.likeComment(commentId);
      if (res.data?.isSuccess && res.data.data) {
        const { isLiked, likeCount } = res.data.data as { isLiked: boolean; likeCount: number };
        setComments(prev =>
          prev.map(c =>
            c.communityCommentId === commentId
              ? { ...c, isLiked, isLikedByMe: isLiked, likeCount }
              : c,
          ),
        );
      }
    } catch { /* keep optimistic */ }
  };

  // ── render ───────────────────────────────────────────────────────────────────

  // Sheet occupies 62% of screen by default (comfortably past half).
  // KAV pushes it further up when keyboard opens — the flex:1 FlatList
  // shrinks to absorb keyboard height, keeping the input always visible.
  const sheetHeight = Math.round(screenH * 0.62);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/*
        Outer overlay: full-screen dimmed backdrop.
        Tapping on it closes the sheet.
      */}
      {/*
        KAV IS the overlay — flex:1 + justifyContent:'flex-end' pins the sheet
        to the bottom. behavior='padding' adds paddingBottom = keyboardHeight,
        which pushes the sheet up on both iOS and Android inside a Modal.
        maxHeight (not fixed height) on the sheet lets it shrink when the
        keyboard steals vertical space; FlatList with flex:1 absorbs the diff.
      */}
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

          <View style={[styles.sheet, { height: sheetHeight }]}>

            {/* ── Drag handle ───────────────────────────────────────────── */}
            <View style={styles.dragHandle} />

            {/* ── Header ────────────────────────────────────────────────── */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                Comments{comments.length > 0 ? `  (${comments.length})` : ''}
              </Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close comments">
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>

            {/* ── Comment list — flex:1 fills all space between header & input ─ */}
            {loading ? (
              <ActivityIndicator style={styles.loader} color="#4F46E5" />
            ) : (
              <FlatList
                ref={flatListRef}
                data={comments}
                keyExtractor={(c) => String(c.communityCommentId)}
                renderItem={({ item }) => (
                  <CommentRow item={item} onLike={handleLikeComment} />
                )}
                style={styles.list}
                contentContainerStyle={
                  comments.length === 0 ? styles.emptyContainer : styles.listContent
                }
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
                }
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />
            )}

            {/* ── Input row — always above phone nav buttons ─────────────── */}
            <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Write a comment…"
                placeholderTextColor="#9CA3AF"
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
                returnKeyType="default"
                blurOnSubmit={false}
              />
              <Pressable
                style={[styles.sendBtn, (!text.trim() || submitting) && styles.sendBtnDisabled]}
                onPress={handleSubmit}
                disabled={!text.trim() || submitting}
                accessibilityLabel="Send comment"
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.sendBtnText}>Send</Text>
                }
              </Pressable>
            </View>

          </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Full-screen dimmed overlay — flex + justifyContent pushes sheet to bottom
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // Sheet — fixed pixel height set dynamically in JSX (screenH * 0.62)
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    // height is set via inline style — no min/maxHeight here
  },
  // FlatList fills all remaining space between header and inputRow
  list: {
    flex: 1,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    fontSize: 18,
    color: '#6B7280',
  },
  loader: {
    marginTop: 32,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
  commentRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  commentBubble: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 10,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  commentTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  commentContent: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  commentLikeBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  commentLikeText: {
    fontSize: 13,
    color: '#6B7280',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
    // paddingBottom set dynamically via insets.bottom in JSX
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  sendBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
    minHeight: 44,
  },
  sendBtnDisabled: {
    backgroundColor: '#A5B4FC',
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default CommunityCommentsModal;
