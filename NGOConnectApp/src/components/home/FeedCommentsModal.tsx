/**
 * FeedCommentsModal — bottom-sheet comments for feed posts.
 *
 * Mirrors CommunityCommentsModal layout/keyboard behaviour exactly.
 * Uses feed.api (Post_GetComments / Post_AddComment) instead of community.api.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getComments, addComment } from '../../api/feed.api';
import type { Post } from '../../types/api.types';
import { UserAvatar } from '../ui';
import { fmtDate } from '../../utils/dateUtils';

// ── helpers ────────────────────────────────────────────────────────────────────

// Server returns UTC datetimes without 'Z'. Without this, JS treats them as local
// time causing wrong "time ago" on every timezone. Appending 'Z' forces UTC parse.
function asUtc(iso: string): Date {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
}

function timeAgoFromDate(iso: string | undefined | null): string {
  if (!iso) { return ''; }
  const diff = Math.floor((Date.now() - asUtc(iso).getTime()) / 1000);
  if (diff < 60)        { return 'Just now'; }
  if (diff < 3600)      { return `${Math.floor(diff / 60)}m ago`; }
  if (diff < 86400)     { return `${Math.floor(diff / 3600)}h ago`; }
  if (diff < 7 * 86400) { return `${Math.floor(diff / 86400)}d ago`; }
  return fmtDate(iso);
}

// ── CommentRow ────────────────────────────────────────────────────────────────

interface FeedComment {
  commentId?:    number;
  authorName?:   string;
  fullName?:     string;
  profilePhoto?: string;   // returned by Post_GetComments SP
  content?:      string;
  createdAt?:    string;
  timeAgo?:      string;
}

const CommentRow = React.memo(({ item }: { item: FeedComment }) => {
  const author = item.authorName ?? item.fullName ?? 'User';
  const when   = item.timeAgo || timeAgoFromDate(item.createdAt);

  return (
    <View style={s.commentRow}>
      <UserAvatar name={author} photoUrl={item.profilePhoto} size={34} style={s.avatar} />
      <View style={s.commentBubble}>
        <View style={s.commentHeader}>
          <Text style={s.commentAuthor}>{author}</Text>
          <Text style={s.commentTime}>{when}</Text>
        </View>
        <Text style={s.commentContent}>{item.content}</Text>
      </View>
    </View>
  );
});

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  visible:  boolean;
  post:     Post | null;
  onClose:  () => void;
  /** Called with +1 so HomeScreen can bump the comment badge on the card */
  onCommentAdded?: (postId: number) => void;
}

export default function FeedCommentsModal({ visible, post, onClose, onCommentAdded }: Props) {
  const insets              = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const [comments,   setComments]   = useState<FeedComment[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text,       setText]       = useState('');

  const flatListRef = useRef<FlatList>(null);
  const inputRef    = useRef<TextInput>(null);

  // ── load ──────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!post) { return; }
    setLoading(true);
    try {
      const res = await getComments(post.postId, { pageNumber: 1, pageSize: 50 });
      const data = res.data?.data;
      const items: FeedComment[] = Array.isArray(data)
        ? data
        : data?.items ?? [];
      setComments(items);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [post]);

  useEffect(() => {
    if (visible && post) {
      setComments([]);
      setText('');
      load();
    }
  }, [visible, post, load]);

  // Scroll to end once list populates
  useEffect(() => {
    if (comments.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [comments.length]);

  // ── submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || !post || submitting) { return; }
    setSubmitting(true);
    Keyboard.dismiss();
    try {
      await addComment(post.postId, trimmed);
      setText('');
      onCommentAdded?.(post.postId);
      await load(); // refresh to get server-side author name & timestamp
    } catch { /* silently fail */ }
    finally { setSubmitting(false); }
  };

  // ── render ────────────────────────────────────────────────────────────────────

  const sheetHeight = Math.round(screenH * 0.62);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.overlay}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Tapping the backdrop closes the sheet */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <View style={[s.sheet, { height: sheetHeight }]}>

          {/* Drag handle */}
          <View style={s.dragHandle} />

          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>
              Comments{comments.length > 0 ? `  (${comments.length})` : ''}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close comments">
              <Text style={s.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Comment list */}
          {loading ? (
            <ActivityIndicator style={s.loader} color="#4F46E5" />
          ) : (
            <FlatList
              ref={flatListRef}
              data={comments}
              keyExtractor={(item, i) => String(item.commentId ?? i)}
              renderItem={({ item }) => <CommentRow item={item} />}
              style={s.list}
              contentContainerStyle={
                comments.length === 0 ? s.emptyContainer : s.listContent
              }
              ListEmptyComponent={
                <Text style={s.emptyText}>No comments yet. Be the first!</Text>
              }
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Input row */}
          <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TextInput
              ref={inputRef}
              style={s.input}
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
              style={[s.sendBtn, (!text.trim() || submitting) && s.sendBtnDisabled]}
              onPress={handleSubmit}
              disabled={!text.trim() || submitting}
              accessibilityLabel="Send comment"
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.sendBtnText}>Send</Text>
              }
            </Pressable>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  list:          { flex: 1 },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#111827' },
  closeBtn:     { fontSize: 18, color: '#6B7280' },
  loader:       { marginTop: 32 },
  listContent:  { paddingHorizontal: 16, paddingVertical: 8 },
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40,
  },
  emptyText:    { color: '#9CA3AF', fontSize: 14, textAlign: 'center' },

  commentRow:   { flexDirection: 'row', paddingVertical: 10, gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText:   { color: '#fff', fontSize: 13, fontWeight: '700' },
  commentBubble: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10,
  },
  commentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4,
  },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: '#111827' },
  commentTime:   { fontSize: 11, color: '#9CA3AF' },
  commentContent:{ fontSize: 14, color: '#374151', lineHeight: 20 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB',
  },
  sendBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#9CA3AF' },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sendIcon: { color: '#fff', fontSize: 18 },
});