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
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AppConfig from '../../config/AppConfig';
import type { CommunityPost } from '../../types/api.types';
import { UserAvatar } from '../ui';

const C = AppConfig.COLORS;

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

function AuthorRow({ item, rightSlot }: { item: CommunityPost; rightSlot?: React.ReactNode }) {
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
        <Text style={css.timeAgo}>{item.timeAgo ?? item.createdAt?.slice(0, 10)}</Text>
      </View>
      {rightSlot}
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
function AnnouncementCard({ item, onLike, onAck, onComment }: {
  item: CommunityPost;
  onLike: (id: number) => void;
  onAck:  (id: number) => void;
  onComment: (id: number) => void;
}) {
  const acked = item.isAcknowledgedByMe ?? item.isAcknowledged ?? false;
  return (
    <View style={css.card}>
      <TypeChip typeCode="ANNOUNCEMENT" />
      <View style={css.body}>
        <AuthorRow item={item} />
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
function QuestionCard({ item, onLike, onComment }: {
  item: CommunityPost;
  onLike:    (id: number) => void;
  onComment: (id: number) => void;
}) {
  const [replyText, setReplyText] = useState('');
  return (
    <View style={css.card}>
      <TypeChip typeCode="QUESTION" />
      <View style={css.body}>
        <AuthorRow item={item} />
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

        {/* Reply input */}
        <View style={css.replyInputRow}>
          <TextInput
            style={css.replyInput}
            placeholder="Reply... @mention members"
            placeholderTextColor={C.TEXT3}
            value={replyText}
            onChangeText={setReplyText}
          />
          <TouchableOpacity
            style={css.replyBtn}
            onPress={() => {
              if (replyText.trim()) {
                onComment(item.communityPostId);
                setReplyText('');
              }
            }}
            accessibilityLabel="Send reply"
          >
            <Text style={css.replyBtnTxt}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
      <CardFooter
        item={item}
        onLike={onLike}
        onComment={onComment}
        rightSlot={null}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. POLL
// ══════════════════════════════════════════════════════════════════════════════
function PollCard({ item, onLike, onVote, onComment }: {
  item: CommunityPost;
  onLike:    (id: number) => void;
  onVote:    (pid: number, oid: number) => void;
  onComment: (id: number) => void;
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
function EventUpdateCard({ item, onLike, onComment }: {
  item: CommunityPost;
  onLike:    (id: number) => void;
  onComment: (id: number) => void;
}) {
  const [rsvped, setRsvped] = useState(item.isRsvped ?? false);

  const openMaps = () => {
    if (item.mapsUrl) {
      Linking.openURL(item.mapsUrl).catch(() =>
        Alert.alert('Cannot open Maps', 'Please check your Maps app.')
      );
    }
  };

  return (
    <View style={css.card}>
      <TypeChip typeCode="EVENT_UPDATE" />
      <View style={css.body}>
        <AuthorRow item={item} />

        {/* Change badge */}
        {item.changeType ? (
          <View style={css.changeBox}>
            <Text style={css.changeBadge}>{item.changeType}</Text>
            <Text style={css.changeDetail}>{item.changeDetail ?? item.projectTitle}</Text>
          </View>
        ) : null}

        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* Maps link */}
        {item.mapsUrl ? (
          <TouchableOpacity style={css.mapsRow} onPress={openMaps} accessibilityLabel="Open in Google Maps">
            <Text style={css.mapsIcon}>📍</Text>
            <Text style={css.mapsTxt}>Open updated location in Google Maps</Text>
          </TouchableOpacity>
        ) : null}
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
function VolRequestCard({ item, onLike, onComment }: {
  item: CommunityPost;
  onLike:    (id: number) => void;
  onComment: (id: number) => void;
}) {
  const [volunteered, setVolunteered] = useState(item.isVolunteered ?? false);
  const filled = item.filledCount ?? 0;
  const total  = item.totalNeeded ?? 0;

  return (
    <View style={css.card}>
      <TypeChip typeCode="VOL_REQUEST" />
      <View style={css.body}>
        <AuthorRow item={item} />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* Stats row */}
        {(filled > 0 || total > 0 || item.startTime) ? (
          <View style={css.statsRow}>
            {(filled > 0 || total > 0) ? (
              <View style={[css.statBox, { backgroundColor: `${C.PRIMARY}12` }]}>
                <Text style={[css.statVal, { color: C.PRIMARY }]}>{filled}/{total}</Text>
                <Text style={css.statLbl}>Filled</Text>
              </View>
            ) : null}
            {item.startTime ? (
              <View style={[css.statBox, { backgroundColor: C.BG }]}>
                <Text style={css.statVal}>{item.startTime}</Text>
                <Text style={css.statLbl}>Start time</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Skill chips */}
        {item.requiredSkills && item.requiredSkills.length > 0 ? (
          <View style={css.skillsRow}>
            {item.requiredSkills.map((s) => (
              <View key={s} style={css.skillChip}>
                <Text style={css.skillChipTxt}>{s}</Text>
              </View>
            ))}
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

function TaskCard({ item, onComment }: {
  item: CommunityPost;
  onComment: (id: number) => void;
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
          rightSlot={
            <View style={[css.statusPill, { backgroundColor: active.bg }]}>
              <Text style={[css.statusPillTxt, { color: active.color }]}>{status}</Text>
            </View>
          }
        />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* Assignee / Due date row */}
        {(item.assignedToName || item.dueBy) ? (
          <View style={css.statsRow}>
            {item.assignedToName ? (
              <View style={[css.statBox, { backgroundColor: C.BG }]}>
                <Text style={css.statSubLabel}>Assigned to</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <UserAvatar name={item.assignedToName} size={22} />
                  <Text style={css.assignedName}>{item.assignedToName}</Text>
                </View>
              </View>
            ) : null}
            {item.dueBy ? (
              <View style={[css.statBox, { backgroundColor: C.BG }]}>
                <Text style={css.statSubLabel}>Due by</Text>
                <Text style={[css.dueByTxt]}>{item.dueBy}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

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

function ResourceCard({ item, onLike, onComment }: {
  item: CommunityPost;
  onLike:    (id: number) => void;
  onComment: (id: number) => void;
}) {
  const urls   = item.mediaUrls ?? [];
  const names  = item.fileNames ?? urls.map((_, i) => `File ${i + 1}`);
  const sizes  = item.fileSizes ?? [];
  const types  = item.fileTypes ?? [];

  const openFile = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(() => Alert.alert('Cannot open file'));
    } else {
      Alert.alert('File not available');
    }
  };

  return (
    <View style={css.card}>
      <TypeChip typeCode="RESOURCE" />
      <View style={css.body}>
        <AuthorRow item={item} />
        {item.title   ? <Text style={css.title}>{item.title}</Text>   : null}
        {item.content ? <Text style={css.content}>{item.content}</Text> : null}

        {/* File list */}
        {names.length > 0 ? (
          <View style={css.fileList}>
            {names.map((name, i) => (
              <TouchableOpacity
                key={i}
                style={css.fileRow}
                onPress={() => openFile(urls[i] ?? '')}
                accessibilityLabel={`Download ${name}`}
              >
                <Text style={css.fileIcon}>{fileIcon(types[i])}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={css.fileName} numberOfLines={1}>{name}</Text>
                  {sizes[i] ? <Text style={css.fileSize}>{sizes[i]}</Text> : null}
                </View>
                <Text style={css.downloadIcon}>⬇</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
      <CardFooter
        item={item}
        onLike={onLike}
        onComment={onComment}
        rightSlot={
          urls.length > 1 ? (
            <TouchableOpacity
              style={css.footerBtn}
              onPress={() => Alert.alert('Download all', 'Downloading all files…')}
              accessibilityLabel="Download all"
            >
              <Text style={css.footerTxt}>⬇ Download all</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. DISCUSSION
// ══════════════════════════════════════════════════════════════════════════════
function DiscussionCard({ item, onLike, onComment }: {
  item: CommunityPost;
  onLike:    (id: number) => void;
  onComment: (id: number) => void;
}) {
  return (
    <View style={css.card}>
      <TypeChip typeCode="DISCUSSION" />
      <View style={css.body}>
        <AuthorRow item={item} />
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
  item:      CommunityPost;
  onLike:    (id: number) => void;
  onAck:     (id: number) => void;
  onVote:    (pid: number, oid: number) => void;
  onComment: (id: number) => void;
}

export default function CommunityPostCard({ item, onLike, onAck, onVote, onComment }: CommunityPostCardProps) {
  const typeCode = (item.postTypeLkpCode ?? item.postType ?? 'DISCUSSION').toUpperCase();

  switch (typeCode) {
    case 'ANNOUNCEMENT':
      return <AnnouncementCard item={item} onLike={onLike} onAck={onAck} onComment={onComment} />;
    case 'QUESTION':
      return <QuestionCard item={item} onLike={onLike} onComment={onComment} />;
    case 'POLL':
      return <PollCard item={item} onLike={onLike} onVote={onVote} onComment={onComment} />;
    case 'EVENT_UPDATE':
      return <EventUpdateCard item={item} onLike={onLike} onComment={onComment} />;
    case 'VOL_REQUEST':
      return <VolRequestCard item={item} onLike={onLike} onComment={onComment} />;
    case 'TASK':
      return <TaskCard item={item} onComment={onComment} />;
    case 'RESOURCE':
      return <ResourceCard item={item} onLike={onLike} onComment={onComment} />;
    case 'DISCUSSION':
    default:
      return <DiscussionCard item={item} onLike={onLike} onComment={onComment} />;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const css = StyleSheet.create({
  // Card shell
  card:           { backgroundColor: C.CARD, borderRadius: 14, marginBottom: 10, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 },
  body:           { padding: 12, paddingTop: 8 },

  // Type chip
  typeChip:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  typeEmoji:      { fontSize: 13 },
  typeLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Author row
  avatar:         { alignItems: 'center', justifyContent: 'center' },
  avatarTxt:      { fontWeight: '800', color: '#fff' },
  authorRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  authorNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  authorName:     { fontSize: 12, fontWeight: '700', color: C.TEXT },
  rolePill:       { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  rolePillTxt:    { fontSize: 9, fontWeight: '700' },
  timeAgo:        { fontSize: 10, color: C.TEXT3, marginTop: 1 },
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
  downloadIcon:   { fontSize: 18, color: C.PRIMARY },

  // Discussion
  viewAllReplies: { fontSize: 12, color: C.PRIMARY, fontWeight: '600', marginTop: 5 },
});
