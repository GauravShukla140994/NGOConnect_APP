/**
 * CommunityPostCard
 * Renders the correct card layout for each community post type:
 *   ANNOUNCEMENT | QUESTION | POLL | EVENT_UPDATE | VOL_REQUEST | TASK | RESOURCE | DISCUSSION
 *
 * All type-specific layouts live here so CommunityScreen stays lean.
 */
import React, { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AppConfig from '../../config/AppConfig';
import type { CommunityPost } from '../../types/api.types';
import { UserAvatar } from '../ui';

const C = AppConfig.COLORS;

// ── UTC-safe time helper ──────────────────────────────────────────────────────
// MySQL DATETIME may come as "YYYY-MM-DD HH:mm:ss" (space, no T, no Z).
// Appending 'Z' to a space-separated string gives invalid ISO 8601 — Hermes
// ignores the Z and parses as local, creating a 5.5h offset for IST users.
// Fix: normalise space→T first, THEN append Z. Same pattern as CommunityScreen.
function asUtc(iso: string): Date {
  if (!iso) { return new Date(NaN); }
  const s = iso.replace(' ', 'T');   // "2026-08-07 12:00:00" → "2026-08-07T12:00:00"
  return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
}
function timeAgoStr(iso: string | undefined | null): string {
  if (!iso) { return ''; }
  const diff = Math.floor((Date.now() - asUtc(iso).getTime()) / 1000);
  if (diff < 60)        { return 'Just now'; }
  if (diff < 3600)      { return `${Math.floor(diff / 60)}m ago`; }
  if (diff < 86400)     { return `${Math.floor(diff / 3600)}h ago`; }
  if (diff < 7 * 86400) { return `${Math.floor(diff / 86400)}d ago`; }
  return iso.slice(0, 10); // YYYY-MM-DD fallback
}

// ── Download icon (no icon library needed) ────────────────────────────────────
function DownloadIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size + 4, alignItems: 'center', justifyContent: 'center', gap: 0 }}>
      {/* Vertical shaft */}
      <View style={{ width: 2, height: size * 0.42, backgroundColor: color, borderRadius: 1 }} />
      {/* Arrowhead */}
      <View style={{
        width: 0, height: 0,
        borderLeftWidth:  size * 0.32,
        borderRightWidth: size * 0.32,
        borderTopWidth:   size * 0.32,
        borderLeftColor:  'transparent',
        borderRightColor: 'transparent',
        borderTopColor:   color,
        marginTop: -1,
      }} />
      {/* Base line */}
      <View style={{ width: size * 0.75, height: 2, backgroundColor: color, borderRadius: 1, marginTop: 3 }} />
    </View>
  );
}

// ── Type chip row ─────────────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  ANNOUNCEMENT: { label: 'ANNOUNCEMENT', emoji: '📢', color: '#7C3AED', bg: '#F5F3FF' },
  QUESTION:     { label: 'QUESTION',     emoji: '❓', color: '#0369A1', bg: '#EFF6FF' },
  POLL:         { label: 'POLL',         emoji: '📊', color: '#0D9488', bg: '#F0FDFA' },
  EVENT_UPDATE: { label: 'EVENT UPDATE', emoji: '📅', color: '#047857', bg: '#ECFDF5' },
  VOL_REQUEST:  { label: 'VOLUNTEER REQUEST', emoji: '🙋', color: '#1E3A5F', bg: '#EBF3FB' },
  TASK:         { label: 'TASK ASSIGNMENT',   emoji: '📋', color: '#92400E', bg: '#FFFBEB' },
  RESOURCE:     { label: 'RESOURCE / FILE',   emoji: '📎', color: '#4B5563', bg: '#F3F4F6' },
  DISCUSSION:   { label: 'DISCUSSION',        emoji: '💬', color: '#374151', bg: '#F3F4F6' },
};

function TypeChip({ typeCode }: { typeCode: string }) {
  const m = TYPE_META[typeCode] ?? TYPE_META.DISCUSSION;
  return (
    <View style={[css.typeChip, { backgroundColor: m.bg }]}>
      <Text style={css.typeEmoji}>{m.emoji}</Text>
      <Text style={[css.typeLabel, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

// ── Author row ────────────────────────────────────────────────────────────────
const ROLE_CHIP: Record<string, { bg: string; color: string }> = {
  Admin:     { bg: '#FFF7ED', color: '#C2410C' },
  Moderator: { bg: '#F5F3FF', color: '#7C3AED' },
  Member:    { bg: '#F0FDF4', color: '#15803D' },
};

function AuthorRow({ item, rightSlot, onMorePress }: {
  item: CommunityPost;
  rightSlot?:   React.ReactNode;
  onMorePress?: () => void;       // when provided, shows ••• button (own-post delete)
}) {
  const name = item.authorName ?? item.fullName ?? 'Member';
  const rc = item.roleName ? (ROLE_CHIP[item.roleName] ?? ROLE_CHIP.Member) : null;
  return (
    <View style={css.authorRow}>
      <UserAvatar name={name} photoUrl={item.profilePhoto} size={28} />
      <View style={{ flex: 1 }}>
        <View style={css.authorNameRow}>
          <Text style={css.authorName} numberOfLines={1}>{name}</Text>
          {rc && item.roleName ? (
            <View style={[css.rolePill, { backgroundColor: rc.bg }]}>
              <Text style={[css.rolePillTxt, { color: rc.color }]}>{item.roleName}</Text>
            </View>
          ) : null}
        </View>
        <Text style={css.timeAgo}>{timeAgoStr(item.createdAt)}</Text>
      </View>
      {rightSlot}
      {onMorePress ? (
        <TouchableOpacity
          onPress={onMorePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Delete post"
          style={{ paddingLeft: 8 }}
        >
          <Text style={css.moreBtnTxt}>🗑️</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Shared card footer ────────────────────────────────────────────────────────
function CardFooter({
  item, onLike, onComment, rightSlot,
}: {
  item: CommunityPost;
  onLike:    (id: number) => void;
  onComment: (id: number) => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <View style={css.footer}>
      <TouchableOpacity style={css.footerBtn} onPress={() => onLike(item.communityPostId)} accessibilityLabel="Like">
        <Text style={[css.footerTxt, item.isLiked && { color: '#EF4444' }]}>
          {item.isLiked ? '❤️' : '🤍'} {item.likeCount ?? 0}
        </Text>
      </TouchableOpacity>
      <View style={css.footerDiv} />
      <TouchableOpacity style={css.footerBtn} onPress={() => onComment(item.communityPostId)} accessibilityLabel="Comment">
        <Text style={css.footerTxt}>💬 {item.commentCount ?? 0}</Text>
      </TouchableOpacity>
      {rightSlot ? (
        <>
          <View style={css.footerDiv} />
          {rightSlot}
        </>
      ) : null}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. ANNOUNCEMENT
// ══════════════════════════════════════════════════════════════════════════════
function AnnouncementCard({ item, onLike, onAck, onComment, onMorePress }: {
  item: CommunityPost;
  onLike:      (id: number) => void;
  onAck:       (id: number) => void;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  const acked = item.isAcknowledgedByMe ?? item.isAcknowledged ?? false;
  return (
    <View style={css.card}>
      <View style={css.typeChipRow}>
        <TypeChip typeCode="ANNOUNCEMENT" />
        {item.isPinned ? (
          <View style={css.pinBadge}>
            <Text style={css.pinBadgeTxt}>📌 Pinned</Text>
          </View>
        ) : null}
      </View>
      <View style={css.body}>
        <AuthorRow item={item} onMorePress={onMorePress} />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}
        <View style={css.ackRow}>
          <TouchableOpacity
            style={[css.ackBtn, acked && css.ackBtnDone]}
            onPress={() => onAck(item.communityPostId)}
            accessibilityLabel="Acknowledge"
          >
            <Text style={css.ackBtnTxt}>{acked ? '✓ Acknowledged' : 'Acknowledge'}</Text>
          </TouchableOpacity>
          <Text style={css.ackCount}>{item.acknowledgeCount ?? 0} acknowledged</Text>
        </View>
      </View>
      <CardFooter item={item} onLike={onLike} onComment={onComment} />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. QUESTION
// ══════════════════════════════════════════════════════════════════════════════
function QuestionCard({ item, onLike, onComment, onMorePress }: {
  item: CommunityPost;
  onLike:      (id: number) => void;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  return (
    <View style={css.card}>
      <TypeChip typeCode="QUESTION" />
      <View style={css.body}>
        <AuthorRow item={item} onMorePress={onMorePress} />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* Best answer preview */}
        {item.bestAnswerText ? (
          <View style={css.bestAnswerRow}>
            <UserAvatar name={item.bestAnswerAuthor ?? 'Member'} size={26} />
            <View style={css.bestAnswerBubble}>
              <View style={css.bestAnswerNameRow}>
                <Text style={css.bestAnswerName}>{item.bestAnswerAuthor ?? 'Member'}</Text>
                <View style={css.bestAnswerPill}>
                  <Text style={css.bestAnswerPillTxt}>Best Answer</Text>
                </View>
              </View>
              <Text style={css.bestAnswerTxt}>{item.bestAnswerText}</Text>
              <View style={css.bestAnswerMeta}>
                <Text style={css.bestAnswerMetaTxt}>❤️ {item.bestAnswerLikes ?? 0}</Text>
                <TouchableOpacity onPress={() => onComment(item.communityPostId)}>
                  <Text style={[css.bestAnswerMetaTxt, { color: C.PRIMARY, fontWeight: '600' }]}>Reply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* Tap the comment button in footer to answer */}
        <TouchableOpacity
          style={css.answerPrompt}
          onPress={() => onComment(item.communityPostId)}
          accessibilityLabel="Write an answer"
        >
          <Text style={css.answerPromptTxt}>💬 Write an answer...</Text>
        </TouchableOpacity>
      </View>
      <CardFooter item={item} onLike={onLike} onComment={onComment} rightSlot={null} />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. POLL
// ══════════════════════════════════════════════════════════════════════════════
function PollCard({ item, onLike, onVote, onComment, onMorePress }: {
  item: CommunityPost;
  onLike:      (id: number) => void;
  onVote:      (pid: number, oid: number) => void;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  const opts     = item.pollOptions ?? [];
  const total    = opts.reduce((s, o) => s + o.voteCount, 0);
  const isMulti  = !!(item.pollIsMultiChoice);
  const anyVoted = opts.some((o) => o.isVoted);
  // For single-choice: lock all options once one is voted
  // For multi-choice: always allow toggling (unless poll is closed)
  const pollClosed = item.pollEndsAt ? new Date(item.pollEndsAt) < new Date() : false;
  const canVote  = isMulti ? !pollClosed : !anyVoted;

  // Expiry label
  let expiryLabel = '';
  if (item.pollEndsAt) {
    const diff = new Date(item.pollEndsAt).getTime() - Date.now();
    if (diff > 0) {
      const days = Math.floor(diff / 86400000);
      expiryLabel = days > 0 ? `${days}d left` : 'Closing soon';
    } else {
      expiryLabel = 'Closed';
    }
  }

  const selectedCount = opts.filter((o) => o.isVoted).length;

  return (
    <View style={css.card}>
      <TypeChip typeCode="POLL" />
      <View style={css.body}>
        <AuthorRow
          item={item}
          onMorePress={onMorePress}
          rightSlot={
            expiryLabel ? (
              <View style={[css.expiryPill, pollClosed && { backgroundColor: '#FEE2E2' }]}>
                <Text style={[css.expiryTxt, pollClosed && { color: '#DC2626' }]}>
                  {pollClosed ? '🔒 ' : '⏱ '}{expiryLabel}
                </Text>
              </View>
            ) : undefined
          }
        />
        {item.title ? <Text style={css.title}>{item.title}</Text> : null}
        <Text style={css.pollMeta}>
          {isMulti ? '☑ Multiple choice' : '◉ Single choice'}
          {'  ·  '}
          {total} {total === 1 ? 'vote' : 'votes'}
        </Text>

        {opts.map((opt) => (
          <TouchableOpacity
            key={opt.pollOptionId}
            style={[
              css.pollRow,
              opt.isVoted && css.pollRowVoted,
              !canVote && !opt.isVoted && css.pollRowDisabled,
            ]}
            onPress={() => canVote && onVote(item.communityPostId, opt.pollOptionId)}
            accessibilityLabel={opt.optionText}
            activeOpacity={canVote ? 0.7 : 1}
          >
            <View style={[
              css.pollFill,
              {
                width: `${Math.round(opt.votePct)}%` as any,
                backgroundColor: opt.isVoted ? `${C.PRIMARY}22` : `${C.PRIMARY}08`,
              },
            ]} />
            {/* Checkbox for multi-choice, radio dot for single */}
            <Text style={[css.pollSelectIcon, opt.isVoted && { color: C.PRIMARY }]}>
              {isMulti
                ? (opt.isVoted ? '☑' : '☐')
                : (opt.isVoted ? '◉' : '○')}
            </Text>
            <Text style={[css.pollLabel, opt.isVoted && { color: C.PRIMARY, fontWeight: '700' }]}>
              {opt.optionText}
            </Text>
            <Text style={[css.pollPct, opt.isVoted && { color: C.PRIMARY, fontWeight: '600' }]}>
              {Math.round(opt.votePct)}%
            </Text>
          </TouchableOpacity>
        ))}

        {/* Status line below options */}
        {anyVoted ? (
          <Text style={css.votedStatus}>
            {isMulti
              ? `☑ ${selectedCount} option${selectedCount !== 1 ? 's' : ''} selected${pollClosed ? '' : '  ·  Tap to toggle'}`
              : '✓ You voted · Results shown above'}
          </Text>
        ) : pollClosed ? (
          <Text style={css.pollTapHint}>🔒 Poll closed · No votes cast</Text>
        ) : (
          <Text style={css.pollTapHint}>
            {isMulti ? 'Tap one or more options to select' : 'Tap an option to vote'}
          </Text>
        )}
      </View>
      <CardFooter item={item} onLike={onLike} onComment={onComment} />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. EVENT UPDATE
// ══════════════════════════════════════════════════════════════════════════════
function EventUpdateCard({ item, onLike, onComment, onMorePress }: {
  item: CommunityPost;
  onLike:      (id: number) => void;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  const [rsvped, setRsvped] = useState(item.isRsvped ?? false);

  // eventRef = whatChanged text (e.g. "Venue changed") — saved via p_EventRef
  // title    = event reference name (e.g. "Food Drive - Jun 3")
  // content  = update details / message
  const changeLabel = item.eventRef;
  const eventName   = item.title;

  return (
    <View style={css.card}>
      <TypeChip typeCode="EVENT_UPDATE" />
      <View style={css.body}>
        <AuthorRow item={item} onMorePress={onMorePress} />

        {/* Change badge — what changed + which event */}
        {(changeLabel || eventName) ? (
          <View style={css.changeBox}>
            {changeLabel ? <Text style={css.changeBadge}>{changeLabel.toUpperCase()}</Text> : null}
            {eventName ? <Text style={css.changeDetail}>{eventName}</Text> : null}
          </View>
        ) : null}

        {item.content ? <Text style={css.content}>{item.content}</Text> : null}
      </View>
      <CardFooter
        item={item}
        onLike={onLike}
        onComment={onComment}
        rightSlot={
          <TouchableOpacity
            style={[css.rsvpBtn, rsvped && css.rsvpBtnDone]}
            onPress={() => setRsvped(!rsvped)}
            accessibilityLabel="RSVP"
          >
            <Text style={[css.rsvpTxt, rsvped && { color: '#15803D' }]}>
              {rsvped ? '✓ RSVPed' : '📅 RSVP'}
            </Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. VOLUNTEER REQUEST
// ══════════════════════════════════════════════════════════════════════════════
function VolRequestCard({ item, onLike, onComment, onMorePress }: {
  item: CommunityPost;
  onLike:      (id: number) => void;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  const [volunteered, setVolunteered] = useState(item.isVolunteered ?? false);
  const filled = item.filledCount ?? 0;
  // SP returns VolunteersNeeded → volunteersNeeded; totalNeeded is a legacy alias
  const total  = item.volunteersNeeded ?? item.totalNeeded ?? 0;
  // eventRef holds the date/time text saved by the form (e.g. "Jun 14, 6:30 AM")
  const dateTimeText = item.eventRef;

  return (
    <View style={css.card}>
      <TypeChip typeCode="VOL_REQUEST" />
      <View style={css.body}>
        <AuthorRow item={item} onMorePress={onMorePress} />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {/* content = skills text entered in the form */}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* Stats row */}
        {(total > 0 || dateTimeText) ? (
          <View style={css.statsRow}>
            {total > 0 ? (
              <View style={[css.statBox, { backgroundColor: `${C.PRIMARY}12` }]}>
                <Text style={[css.statVal, { color: C.PRIMARY }]}>{filled}/{total}</Text>
                <Text style={css.statLbl}>Volunteers</Text>
              </View>
            ) : null}
            {dateTimeText ? (
              <View style={[css.statBox, { backgroundColor: C.BG }]}>
                <Text style={css.statVal}>{dateTimeText}</Text>
                <Text style={css.statLbl}>Date / Time</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <CardFooter
        item={item}
        onLike={onLike}
        onComment={onComment}
        rightSlot={
          <TouchableOpacity
            style={[css.volBtn, volunteered && css.volBtnDone]}
            onPress={() => setVolunteered(!volunteered)}
            accessibilityLabel="Volunteer Now"
          >
            <Text style={[css.volBtnTxt, volunteered && { color: '#fff' }]}>
              {volunteered ? '✓ Signed Up' : '🙋 Volunteer Now'}
            </Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. TASK ASSIGNMENT
// ══════════════════════════════════════════════════════════════════════════════
const TASK_STATUSES = ['Open', 'In Progress', 'Completed'] as const;
type TaskStatus = typeof TASK_STATUSES[number];

function TaskCard({ item, onComment, onMorePress }: {
  item: CommunityPost;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  const [status, setStatus] = useState<TaskStatus>((item.taskStatus as TaskStatus) ?? 'Open');

  const statusColor = (s: TaskStatus) => {
    if (s === status) {
      if (s === 'Completed')  { return { bg: '#DCFCE7', color: '#15803D' }; }
      if (s === 'In Progress') { return { bg: `${C.PRIMARY}15`, color: C.PRIMARY }; }
      return { bg: C.BG, color: C.TEXT2 };
    }
    return { bg: C.BG, color: C.TEXT2 };
  };

  const pillStyle = (s: TaskStatus) => {
    if (s === 'In Progress') { return { bg: `${C.PRIMARY}15`, color: C.PRIMARY }; }
    if (s === 'Completed')   { return { bg: '#DCFCE7', color: '#15803D' }; }
    return { bg: C.BG, color: C.TEXT2 };
  };
  const active = pillStyle(status);

  return (
    <View style={css.card}>
      <TypeChip typeCode="TASK" />
      <View style={css.body}>
        <AuthorRow
          item={item}
          onMorePress={onMorePress}
          rightSlot={
            <View style={[css.statusPill, { backgroundColor: active.bg }]}>
              <Text style={[css.statusPillTxt, { color: active.color }]}>{status}</Text>
            </View>
          }
        />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* Assignee / Due date row
            assignedToName → from SP JOIN on AssignedToUserId (null until member-picker added)
            eventRef       → free-text assignee name saved by the form (current fallback)
            dueBy / dueDate → formatted due date */}
        {(() => {
          const assigneeName = item.assignedToName || item.eventRef || null;
          const dueText      = item.dueBy || item.dueDate || null;
          if (!assigneeName && !dueText) { return null; }
          return (
            <View style={css.statsRow}>
              {assigneeName ? (
                <View style={[css.statBox, { backgroundColor: C.BG }]}>
                  <Text style={css.statSubLabel}>Assigned to</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    <UserAvatar name={assigneeName} size={22} />
                    <Text style={css.assignedName}>{assigneeName}</Text>
                  </View>
                </View>
              ) : null}
              {dueText ? (
                <View style={[css.statBox, { backgroundColor: C.BG }]}>
                  <Text style={css.statSubLabel}>Due by</Text>
                  <Text style={css.dueByTxt}>{dueText}</Text>
                </View>
              ) : null}
            </View>
          );
        })()}

        {/* Status toggle buttons */}
        <View style={css.taskBtnsRow}>
          {TASK_STATUSES.map((s) => {
            const sc = statusColor(s);
            return (
              <TouchableOpacity
                key={s}
                style={[css.taskBtn, { backgroundColor: sc.bg }]}
                onPress={() => setStatus(s)}
                accessibilityLabel={`Set status ${s}`}
              >
                <Text style={[css.taskBtnTxt, { color: sc.color }]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {/* Task footer: only comment button */}
      <View style={css.footer}>
        <TouchableOpacity style={[css.footerBtn, { flex: 0, paddingHorizontal: 16 }]} onPress={() => onComment(item.communityPostId)} accessibilityLabel="Comment">
          <Text style={css.footerTxt}>💬 Comment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. RESOURCE / FILE
// ══════════════════════════════════════════════════════════════════════════════
function fileIcon(type?: string) {
  if (!type) { return '📄'; }
  const t = type.toUpperCase();
  if (t === 'PDF')  { return '📕'; }
  if (t === 'IMAGE' || t === 'JPG' || t === 'PNG' || t === 'JPEG') { return '🖼️'; }
  if (t === 'VIDEO') { return '🎬'; }
  if (t === 'AUDIO') { return '🎵'; }
  return '📄';
}

type DlState = 'idle' | 'downloading' | 'done' | 'error';

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf')               { return 'application/pdf'; }
  if (ext === 'jpg' || ext === 'jpeg') { return 'image/jpeg'; }
  if (ext === 'png')               { return 'image/png'; }
  return 'application/octet-stream';
}

function ResourceCard({ item, onLike, onComment, onMorePress }: {
  item: CommunityPost;
  onLike:      (id: number) => void;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  const [dlState, setDlState] = useState<Record<number, DlState>>({});

  // SP returns a single ResourceFileUrl column; mediaUrls is reserved for future multi-file support
  const urls  = item.mediaUrls?.length
    ? item.mediaUrls
    : item.resourceFileUrl ? [item.resourceFileUrl] : [];
  const names = item.fileNames ?? urls.map((u) => u.split('/').pop() ?? 'File');
  const sizes = item.fileSizes ?? [];
  const types = item.fileTypes ?? [];

  const downloadFile = async (url: string, fileName: string, index: number) => {
    if (!url) { Alert.alert('File not available'); return; }
    if (dlState[index] === 'downloading') { return; }

    setDlState((prev) => ({ ...prev, [index]: 'downloading' }));
    try {
      const destPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fileName}`;
      await ReactNativeBlobUtil.config({
        addAndroidDownloads: {
          useDownloadManager: true,   // uses Android DownloadManager — shows progress in notification tray
          notification: true,
          title: fileName,
          description: 'Downloading...',
          path: destPath,
          mime: getMimeType(fileName),
        },
      }).fetch('GET', url);
      setDlState((prev) => ({ ...prev, [index]: 'done' }));
      // Reset icon back to idle after 3 s
      setTimeout(() => setDlState((prev) => ({ ...prev, [index]: 'idle' })), 3000);
    } catch {
      setDlState((prev) => ({ ...prev, [index]: 'error' }));
      Alert.alert('Download failed', 'Please try again.');
      setTimeout(() => setDlState((prev) => ({ ...prev, [index]: 'idle' })), 2000);
    }
  };

  return (
    <View style={css.card}>
      <TypeChip typeCode="RESOURCE" />
      <View style={css.body}>
        <AuthorRow item={item} onMorePress={onMorePress} />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* File list */}
        {names.length > 0 ? (
          <View style={css.fileList}>
            {names.map((name, i) => {
              const state = dlState[i] ?? 'idle';
              return (
                <View key={i} style={css.fileRow}>
                  <Text style={css.fileIcon}>{fileIcon(types[i])}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={css.fileName} numberOfLines={1}>{name}</Text>
                    {sizes[i] ? <Text style={css.fileSize}>{sizes[i]}</Text> : null}
                  </View>
                  {/* Download button — URL never shown to user */}
                  <TouchableOpacity
                    style={[css.dlBtn, state === 'done' && css.dlBtnDone, state === 'error' && css.dlBtnErr]}
                    onPress={() => downloadFile(urls[i] ?? '', name, i)}
                    disabled={state === 'downloading'}
                    accessibilityLabel={`Download ${name}`}
                  >
                    {state === 'downloading' ? (
                      <ActivityIndicator size={14} color={C.PRIMARY} />
                    ) : state === 'done' ? (
                      <Text style={[css.dlBtnTxt, { color: '#15803D' }]}>✓</Text>
                    ) : state === 'error' ? (
                      <Text style={[css.dlBtnTxt, { color: '#DC2626' }]}>✕</Text>
                    ) : (
                      <DownloadIcon color={C.PRIMARY} size={15} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
      <CardFooter item={item} onLike={onLike} onComment={onComment} />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. DISCUSSION
// ══════════════════════════════════════════════════════════════════════════════
function DiscussionCard({ item, onLike, onComment, onMorePress }: {
  item: CommunityPost;
  onLike:      (id: number) => void;
  onComment:   (id: number) => void;
  onMorePress?: () => void;
}) {
  return (
    <View style={css.card}>
      <TypeChip typeCode="DISCUSSION" />
      <View style={css.body}>
        <AuthorRow item={item} onMorePress={onMorePress} />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* Best/top reply preview */}
        {item.bestAnswerText ? (
          <View style={css.bestAnswerRow}>
            <UserAvatar name={item.bestAnswerAuthor ?? 'Member'} size={26} />
            <View style={css.bestAnswerBubble}>
              <Text style={css.bestAnswerName}>{item.bestAnswerAuthor ?? 'Member'}</Text>
              <Text style={css.bestAnswerTxt}>{item.bestAnswerText}</Text>
              <View style={css.bestAnswerMeta}>
                <Text style={css.bestAnswerMetaTxt}>❤️ {item.bestAnswerLikes ?? 0}</Text>
                <TouchableOpacity onPress={() => onComment(item.communityPostId)}>
                  <Text style={[css.bestAnswerMetaTxt, { color: C.PRIMARY, fontWeight: '600' }]}>Reply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* View all replies link */}
        {(item.commentCount ?? 0) > 0 ? (
          <TouchableOpacity onPress={() => onComment(item.communityPostId)}>
            <Text style={css.viewAllReplies}>View all {item.commentCount} replies ›</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <CardFooter
        item={item}
        onLike={onLike}
        onComment={onComment}
        rightSlot={
          <TouchableOpacity
            style={css.footerBtn}
            onPress={() => Alert.alert('Link copied!')}
            accessibilityLabel="Share"
          >
            <Text style={css.footerTxt}>🔗</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — switchboard
// ══════════════════════════════════════════════════════════════════════════════
export interface CommunityPostCardProps {
  item:           CommunityPost;
  onLike:         (id: number) => void;
  onAck:          (id: number) => void;
  onVote:         (pid: number, oid: number) => void;
  onComment:      (id: number) => void;
  /** Pass to enable the ••• delete option — only shown when currentUserId === item.userId */
  onDelete?:      (communityPostId: number) => void;
  currentUserId?: number;
}

export default function CommunityPostCard({
  item, onLike, onAck, onVote, onComment, onDelete, currentUserId,
}: CommunityPostCardProps) {
  const typeCode = (item.postTypeLkpCode ?? item.postType ?? 'DISCUSSION').toUpperCase();

  // 🗑️ button: only the post's own author sees it
  const handleMorePress = (onDelete && !!currentUserId && Number(currentUserId) === Number(item.userId))
    ? () => {
        Alert.alert(
          'Delete Post',
          'Are you sure you want to delete this post? This cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.communityPostId) },
          ],
        );
      }
    : undefined;

  switch (typeCode) {
    case 'ANNOUNCEMENT':
      return <AnnouncementCard item={item} onLike={onLike} onAck={onAck} onComment={onComment} onMorePress={handleMorePress} />;
    case 'QUESTION':
      return <QuestionCard item={item} onLike={onLike} onComment={onComment} onMorePress={handleMorePress} />;
    case 'POLL':
      return <PollCard item={item} onLike={onLike} onVote={onVote} onComment={onComment} onMorePress={handleMorePress} />;
    case 'EVENT_UPDATE':
      return <EventUpdateCard item={item} onLike={onLike} onComment={onComment} onMorePress={handleMorePress} />;
    case 'VOL_REQUEST':
      return <VolRequestCard item={item} onLike={onLike} onComment={onComment} onMorePress={handleMorePress} />;
    case 'TASK':
      return <TaskCard item={item} onComment={onComment} onMorePress={handleMorePress} />;
    case 'RESOURCE':
      return <ResourceCard item={item} onLike={onLike} onComment={onComment} onMorePress={handleMorePress} />;
    case 'DISCUSSION':
    default:
      return <DiscussionCard item={item} onLike={onLike} onComment={onComment} onMorePress={handleMorePress} />;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const css = StyleSheet.create({
  // Card shell
  card:           { backgroundColor: C.CARD, borderRadius: 14, marginBottom: 10, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 },
  body:           { padding: 12, paddingTop: 8 },

  // Type chip
  typeChipRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 10 },
  typeChip:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  typeEmoji:      { fontSize: 13 },
  typeLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  // Pin badge (ANNOUNCEMENT)
  pinBadge:       { backgroundColor: '#FFF7ED', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: '#FED7AA' },
  pinBadgeTxt:    { fontSize: 10, fontWeight: '700', color: '#C2410C' },
  // Answer prompt (QUESTION)
  answerPrompt:   { backgroundColor: C.BG, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, marginTop: 4, borderWidth: 1, borderColor: C.BORDER },
  answerPromptTxt:{ fontSize: 12, color: C.TEXT3 },

  // Author row
  avatar:         { alignItems: 'center', justifyContent: 'center' },
  avatarTxt:      { fontWeight: '800', color: '#fff' },
  authorRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  authorNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  authorName:     { fontSize: 12, fontWeight: '700', color: C.TEXT },
  rolePill:       { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  rolePillTxt:    { fontSize: 9, fontWeight: '700' },
  timeAgo:        { fontSize: 10, color: C.TEXT3, marginTop: 1 },
  moreBtnTxt:     { fontSize: 16 },
  expiryPill:     { backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  expiryTxt:      { fontSize: 10, color: '#0D9488', fontWeight: '600' },

  // Content
  title:          { fontSize: 14, fontWeight: '700', color: C.TEXT, marginBottom: 5, lineHeight: 20 },
  content:        { fontSize: 13, color: C.TEXT, lineHeight: 19, marginBottom: 8 },

  // Footer
  footer:         { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.BORDER, minHeight: 48 },
  footerBtn:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, flexDirection: 'row', gap: 5 },
  footerTxt:      { fontSize: 15, fontWeight: '500', color: C.TEXT2 },
  footerDiv:      { width: 1, backgroundColor: C.BORDER, marginVertical: 8 },

  // Acknowledge
  ackRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  ackBtn:         { backgroundColor: '#F0FDF4', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  ackBtnDone:     { backgroundColor: '#DCFCE7' },
  ackBtnTxt:      { fontSize: 13, fontWeight: '700', color: '#15803D' },
  ackCount:       { fontSize: 11, color: C.TEXT2 },

  // Poll
  pollMeta:       { fontSize: 11, color: C.TEXT3, marginBottom: 8 },
  pollRow:        { position: 'relative', borderWidth: 1, borderColor: C.BORDER, borderRadius: 9, padding: 9, marginBottom: 6, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  pollRowVoted:   { borderColor: C.PRIMARY },
  pollRowDisabled:{ opacity: 0.55 },
  pollFill:       { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 9 },
  pollSelectIcon: { fontSize: 16, color: C.TEXT3, marginRight: 8 },
  pollLabel:      { flex: 1, fontSize: 13, color: C.TEXT, fontWeight: '500' },
  pollPct:        { fontSize: 12, color: C.TEXT2, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  votedStatus:    { fontSize: 11, color: '#0D9488', marginTop: 6, fontWeight: '600' },
  pollTapHint:    { fontSize: 11, color: C.TEXT3, marginTop: 6 },

  // Question / Discussion — best answer preview
  bestAnswerRow:  { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bestAnswerBubble:{ flex: 1, backgroundColor: C.BG, borderRadius: 9, padding: 9 },
  bestAnswerNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  bestAnswerName: { fontSize: 11, fontWeight: '700', color: C.TEXT },
  bestAnswerPill: { backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  bestAnswerPillTxt:{ fontSize: 9, fontWeight: '700', color: '#15803D' },
  bestAnswerTxt:  { fontSize: 12, color: C.TEXT, lineHeight: 17 },
  bestAnswerMeta: { flexDirection: 'row', gap: 10, marginTop: 5 },
  bestAnswerMetaTxt:{ fontSize: 11, color: C.TEXT2 },

  // Reply input
  replyInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4, marginTop: 4 },
  replyInput:     { flex: 1, fontSize: 12, color: C.TEXT, backgroundColor: C.BG, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: C.BORDER },
  replyBtn:       { backgroundColor: C.PRIMARY, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  replyBtnTxt:    { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Event update
  changeBox:      { backgroundColor: '#EDFAF3', borderRadius: 8, padding: 10, marginBottom: 8 },
  changeBadge:    { fontSize: 10, fontWeight: '800', color: '#16A34A', marginBottom: 2 },
  changeDetail:   { fontSize: 12, fontWeight: '600', color: C.TEXT },
  mapsRow:        { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${C.PRIMARY}12`, borderRadius: 9, padding: 10, marginBottom: 4 },
  mapsIcon:       { fontSize: 14 },
  mapsTxt:        { fontSize: 12, color: C.PRIMARY, fontWeight: '500', flex: 1 },
  rsvpBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  rsvpBtnDone:    { backgroundColor: '#DCFCE7' },
  rsvpTxt:        { fontSize: 11, fontWeight: '600', color: '#16A34A' },

  // Stats row (vol request + task)
  statsRow:       { flexDirection: 'row', gap: 7, marginBottom: 9 },
  statBox:        { flex: 1, borderRadius: 9, padding: 9 },
  statVal:        { fontSize: 15, fontWeight: '700', color: C.TEXT, textAlign: 'center' },
  statLbl:        { fontSize: 10, color: C.TEXT3, textAlign: 'center', marginTop: 2 },
  statSubLabel:   { fontSize: 10, color: C.TEXT3, marginBottom: 2 },
  assignedName:   { fontSize: 12, fontWeight: '500', color: C.TEXT },
  dueByTxt:       { fontSize: 12, fontWeight: '600', color: '#C2410C', marginTop: 3 },

  // Skills
  skillsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  skillChip:      { backgroundColor: `${C.PRIMARY}18`, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  skillChipTxt:   { fontSize: 11, color: C.PRIMARY, fontWeight: '600' },

  // Vol button
  volBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.PRIMARY, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  volBtnDone:     { backgroundColor: '#15803D' },
  volBtnTxt:      { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Task
  statusPill:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statusPillTxt:  { fontSize: 10, fontWeight: '700' },
  taskBtnsRow:    { flexDirection: 'row', gap: 5, marginTop: 4 },
  taskBtn:        { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  taskBtnTxt:     { fontSize: 10, fontWeight: '600' },

  // Resource
  fileList:       { gap: 7, marginBottom: 4 },
  fileRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.BG, borderRadius: 9, padding: 10 },
  fileIcon:       { fontSize: 22 },
  fileName:       { fontSize: 12, fontWeight: '600', color: C.TEXT },
  fileSize:       { fontSize: 10, color: C.TEXT3, marginTop: 2 },
  dlBtn:          { width: 34, height: 34, borderRadius: 17, backgroundColor: `${C.PRIMARY}15`, alignItems: 'center', justifyContent: 'center' },
  dlBtnDone:      { backgroundColor: '#DCFCE7' },
  dlBtnErr:       { backgroundColor: '#FEE2E2' },
  dlBtnTxt:       { fontSize: 16, color: C.PRIMARY, fontWeight: '700' },

  // Discussion
  viewAllReplies: { fontSize: 12, color: C.PRIMARY, fontWeight: '600', marginTop: 5 },
});
