/**
 * NewPostModal — shared bottom-sheet for creating community posts.
 * Supports all 8 post types from prototype s-community / sh-create-comm:
 *   DISCUSSION | QUESTION | POLL | ANNOUNCEMENT | EVENT_UPDATE |
 *   VOLUNTEER_REQUEST | TASK | RESOURCE
 *
 * Used by both CommunityScreen (user) and AdminCommunityScreen (admin).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppConfig from '../../config/AppConfig';
import { lookupApi } from '../../api/lookup.api';
import { createCommunityPost, createCommunityPoll } from '../../api/community.api';
import { uploadFile } from '../../api/upload.api';
import { launchImageLibrary } from 'react-native-image-picker';
import type { LookupValue } from '../../types/api.types';
import { UserAvatar } from '../ui';

interface ResourceFileItem {
  uri: string;
  name: string;
  mimeType: string;
}

const C = AppConfig.COLORS;

// ── Post type metadata (matches prototype chip order) ────────────────────────
interface PostTypeMeta {
  code: string;
  label: string;
  color: string;
  bg: string;
}

const POST_TYPES: PostTypeMeta[] = [
  { code: 'DISCUSSION',        label: 'Discussion',        color: '#374151', bg: '#F3F4F6' },
  { code: 'QUESTION',          label: 'Question',          color: '#0369A1', bg: '#EFF6FF' },
  { code: 'POLL',              label: 'Poll',              color: '#0D9488', bg: '#F0FDFA' },
  { code: 'ANNOUNCEMENT',      label: 'Announcement',      color: '#7C3AED', bg: '#F5F3FF' },
  { code: 'EVENT_UPDATE',      label: 'Event Update',      color: '#047857', bg: '#ECFDF5' },
  { code: 'VOL_REQUEST',       label: 'Volunteer Request', color: C.PRIMARY, bg: `${C.PRIMARY}15` },
  { code: 'TASK',              label: 'Task',              color: '#92400E', bg: '#FFFBEB' },
  { code: 'RESOURCE',          label: 'Resource',          color: '#6B7280', bg: '#F9FAFB' },
];

const POLL_DURATIONS = [
  { label: '1 day',      hours: 24 },
  { label: '2 days',     hours: 48 },
  { label: '3 days',     hours: 72 },
  { label: '1 week',     hours: 168 },
  { label: 'No end',     hours: 0 },
];

const EVENT_CHANGES = [
  'Venue changed', 'Time changed', 'Date changed', 'New information', 'Event cancelled',
];

// ── Props ─────────────────────────────────────────────────────────────────────
export interface NewPostModalProps {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
  orgId: number;
  orgName: string;
  userName: string;
  userPhotoUrl?: string;
  userRole?: string;
  isAdmin?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NewPostModal({
  visible, onClose, onPosted, orgId, orgName, userName, userPhotoUrl, userRole, isAdmin,
}: NewPostModalProps) {
  const insets = useSafeAreaInsets();

  // ── lookup state ──────────────────────────────────────────────────────────
  const [postTypeLookups, setPostTypeLookups] = useState<LookupValue[]>([]);
  const [audienceLookups, setAudienceLookups] = useState<LookupValue[]>([]);

  // ── form state ────────────────────────────────────────────────────────────
  const [selectedType, setSelectedType]     = useState('DISCUSSION');
  const [title, setTitle]                   = useState('');
  const [content, setContent]               = useState('');
  const [isPinned, setIsPinned]             = useState(false);
  const [notifyAll, setNotifyAll]           = useState(true);
  const [allowBestAnswer, setAllowBestAnswer] = useState(true);
  const [audience, setAudience]             = useState<'ALL_MEMBERS' | 'ADMINS_ONLY'>('ALL_MEMBERS');

  // Poll
  const [pollQuestion, setPollQuestion]     = useState('');
  const [pollOptions, setPollOptions]       = useState(['', '']);
  const [pollType, setPollType]             = useState<'single' | 'multi'>('single');
  const [pollDurationIdx, setPollDurationIdx] = useState(2); // 3 days default

  // Event Update
  const [eventReference, setEventReference] = useState('');
  const [whatChanged, setWhatChanged]       = useState(EVENT_CHANGES[0]);
  const [updateDetails, setUpdateDetails]   = useState('');

  // Volunteer Request
  const [helpNeeded, setHelpNeeded]         = useState('');
  const [volunteersCount, setVolunteersCount] = useState('');
  const [eventDateTime, setEventDateTime]   = useState('');
  const [skills, setSkills]                 = useState('');

  // Task
  const [taskTitle, setTaskTitle]           = useState('');
  const [taskDesc, setTaskDesc]             = useState('');
  const [assignedTo, setAssignedTo]         = useState('');
  const [dueDate, setDueDate]               = useState('');

  // Resource
  const [resourceTitle, setResourceTitle]   = useState('');
  const [resourceDesc, setResourceDesc]     = useState('');
  const [resourceFile, setResourceFile]     = useState<ResourceFileItem | null>(null);

  const [submitting, setSubmitting]         = useState(false);

  // ── load lookups on first open ────────────────────────────────────────────
  const lookupsLoaded = useRef(false);
  useEffect(() => {
    if (!visible || lookupsLoaded.current) { return; }
    lookupsLoaded.current = true;
    Promise.all([
      lookupApi.getValuesByTypeCode('POST_TYPE_COMMUNITY').catch(() => ({ data: { data: [] } })),
      lookupApi.getValuesByTypeCode('AUDIENCE_TYPE').catch(() => ({ data: { data: [] } })),
    ]).then(([ptRes, audRes]) => {
      if (ptRes.data?.data)  { setPostTypeLookups(ptRes.data.data as LookupValue[]); }
      if (audRes.data?.data) { setAudienceLookups(audRes.data.data as LookupValue[]); }
    });
  }, [visible]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const getLkpId = useCallback((list: LookupValue[], code: string): number | undefined => {
    return list.find((v) => v.valueCode === code)?.lookupValueId;
  }, []);

  const resetForm = () => {
    setSelectedType('DISCUSSION');
    setTitle(''); setContent(''); setIsPinned(false); setNotifyAll(true);
    setAllowBestAnswer(true); setAudience('ALL_MEMBERS');
    setPollQuestion(''); setPollOptions(['', '']); setPollType('single'); setPollDurationIdx(2);
    setEventReference(''); setWhatChanged(EVENT_CHANGES[0]); setUpdateDetails('');
    setHelpNeeded(''); setVolunteersCount(''); setEventDateTime(''); setSkills('');
    setTaskTitle(''); setTaskDesc(''); setAssignedTo(''); setDueDate('');
    setResourceTitle(''); setResourceDesc(''); setResourceFile(null);
  };

  const handleClose = () => { resetForm(); onClose(); };

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const postTypeLkpId = getLkpId(postTypeLookups, selectedType);
    const audienceLkpId = getLkpId(
      audienceLookups,
      audience === 'ALL_MEMBERS' ? 'ALL_MEMBERS' : 'ADMINS_ONLY',
    );

    setSubmitting(true);
    try {
      if (selectedType === 'POLL') {
        const opts = pollOptions.filter((o) => o.trim().length > 0);
        if (!pollQuestion.trim() || opts.length < 2) {
          Alert.alert('Validation', 'Poll question and at least 2 options are required.');
          setSubmitting(false);
          return;
        }
        const res = await createCommunityPoll({
          orgId,
          question: pollQuestion.trim(),
          options: opts,
          expiresInHours: POLL_DURATIONS[pollDurationIdx].hours,
          isMultiChoice: pollType === 'multi',
          audienceLkpId,
        });
        if (res.data?.isSuccess !== 1) {
          Alert.alert('Error', res.data?.message || 'Could not create poll.');
          setSubmitting(false);
          return;
        }
      } else {
        let postTitle = title.trim();
        let postContent = content.trim();

        if (selectedType === 'EVENT_UPDATE') {
          postTitle   = eventReference.trim();
          postContent = updateDetails.trim();
        } else if (selectedType === 'VOL_REQUEST') {
          postTitle   = helpNeeded.trim();
          postContent = skills.trim();
        } else if (selectedType === 'TASK') {
          postTitle   = taskTitle.trim();
          postContent = taskDesc.trim();
        } else if (selectedType === 'RESOURCE') {
          postTitle   = resourceTitle.trim();
          postContent = resourceDesc.trim();
        }

        if (!postTitle) {
          Alert.alert('Validation', 'Title / question is required.');
          setSubmitting(false);
          return;
        }

        // Upload resource file first (RESOURCE type only)
        let uploadedResourceUrl: string | undefined;
        if (selectedType === 'RESOURCE' && resourceFile) {
          uploadedResourceUrl = await uploadFile(
            resourceFile.uri,
            resourceFile.name,
            resourceFile.mimeType,
            AppConfig.UPLOAD_MODULES.POST_MEDIA,
          );
        }

        // p_EventRef: multipurpose — whatChanged for EVENT_UPDATE,
        //             date/time text for VOL_REQUEST, assignee name for TASK
        const eventRefValue =
          selectedType === 'EVENT_UPDATE' ? (whatChanged || undefined)
          : selectedType === 'VOL_REQUEST' ? (eventDateTime.trim() || undefined)
          : selectedType === 'TASK'        ? (assignedTo.trim()   || undefined)
          : undefined;

        const res = await createCommunityPost({
          orgId,
          title: postTitle,
          content: postContent,
          postTypeLkpId,
          audienceLkpId,
          isPinned:         selectedType === 'ANNOUNCEMENT' ? isPinned : false,
          volunteersNeeded: selectedType === 'VOL_REQUEST'  ? (Number(volunteersCount) || undefined) : undefined,
          eventRef:         eventRefValue,
          resourceFileUrl:  uploadedResourceUrl,
        });
        if (res.data?.isSuccess !== 1) {
          Alert.alert('Error', res.data?.message || 'Could not create post.');
          setSubmitting(false);
          return;
        }
      }
      resetForm();
      onPosted();
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── resource file picker ─────────────────────────────────────────────────
  const handlePickResourceFile = async () => {
    const result = await launchImageLibrary({ mediaType: 'mixed', quality: 0.9, selectionLimit: 1 });
    const asset = result.assets?.[0];
    if (!asset?.uri) { return; }
    setResourceFile({
      uri:      asset.uri,
      name:     asset.fileName ?? `resource_${Date.now()}`,
      mimeType: asset.type ?? 'application/octet-stream',
    });
  };

  // ── poll option helpers ───────────────────────────────────────────────────
  const updatePollOption = (idx: number, val: string) => {
    setPollOptions((prev) => { const n = [...prev]; n[idx] = val; return n; });
  };
  const addPollOption = () => {
    if (pollOptions.length < 6) { setPollOptions((p) => [...p, '']); }
  };

  // ── post type label for submit button ─────────────────────────────────────
  const submitLabel = (() => {
    if (submitting) { return 'Posting...'; }
    const map: Record<string, string> = {
      ANNOUNCEMENT:      'Post Announcement',
      POLL:              'Create Poll',
      QUESTION:          'Post Question',
      VOL_REQUEST: 'Post Request',
      TASK:              'Assign Task',
      RESOURCE:          'Share Resource',
      EVENT_UPDATE:      'Post Update',
    };
    return map[selectedType] || 'Post to Community';
  })();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kavWrapper}
        >
          <Pressable style={styles.sheet}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.lockIcon}>🔒</Text>
                <Text style={styles.headerTitle}>New Community Post</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close">
                <Text style={styles.closeText}>X</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subTitle}>
              {'Private - ' + orgName + ' members only - Never shown on Feed'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* POST TYPE chips */}
              <Text style={styles.sectionLabel}>POST TYPE</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.typeRow}
              >
                {POST_TYPES.map((pt) => {
                  const active = selectedType === pt.code;
                  return (
                    <TouchableOpacity
                      key={pt.code}
                      style={[
                        styles.typeChip,
                        active
                          ? { backgroundColor: pt.color, borderColor: pt.color }
                          : { backgroundColor: C.BG, borderColor: C.BORDER },
                      ]}
                      onPress={() => setSelectedType(pt.code)}
                      accessibilityLabel={pt.label}
                    >
                      <Text style={[styles.typeChipText, { color: active ? '#fff' : C.TEXT2 }]}>
                        {pt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Author row */}
              <View style={styles.authorRow}>
                <UserAvatar name={userName} photoUrl={userPhotoUrl} size={32} />
                <View>
                  <Text style={styles.authorName}>{userName}</Text>
                  <Text style={styles.authorSub}>
                    {(userRole || 'Member') + ' - ' + orgName}
                  </Text>
                </View>
              </View>

              {/* ── DISCUSSION ────────────────────────────────────── */}
              {selectedType === 'DISCUSSION' && (
                <View>
                  <FormLabel required>Topic / Title</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Suggestions to improve volunteer retention?"
                    placeholderTextColor={C.TEXT3}
                    value={title}
                    onChangeText={setTitle}
                  />
                  <FormLabel>Details</FormLabel>
                  <TextInput
                    style={styles.textarea}
                    placeholder="Add more context to spark a conversation..."
                    placeholderTextColor={C.TEXT3}
                    multiline
                    numberOfLines={4}
                    value={content}
                    onChangeText={setContent}
                  />
                </View>
              )}

              {/* ── QUESTION ──────────────────────────────────────── */}
              {selectedType === 'QUESTION' && (
                <View>
                  <FormLabel required>Your Question</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Who is available on Saturday?"
                    placeholderTextColor={C.TEXT3}
                    value={title}
                    onChangeText={setTitle}
                  />
                  <FormLabel>Additional context</FormLabel>
                  <TextInput
                    style={styles.textarea}
                    placeholder="Add details that help members answer..."
                    placeholderTextColor={C.TEXT3}
                    multiline
                    numberOfLines={3}
                    value={content}
                    onChangeText={setContent}
                  />
                  <ToggleRow
                    label="Allow Best Answer marking"
                    value={allowBestAnswer}
                    onToggle={setAllowBestAnswer}
                  />
                </View>
              )}

              {/* ── POLL ──────────────────────────────────────────── */}
              {selectedType === 'POLL' && (
                <View>
                  <FormLabel required>Poll Question</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Which day works for our meeting?"
                    placeholderTextColor={C.TEXT3}
                    value={pollQuestion}
                    onChangeText={setPollQuestion}
                  />
                  <FormLabel>Poll Type</FormLabel>
                  <View style={styles.pollTypeRow}>
                    <TouchableOpacity
                      style={[styles.pollTypeBtn, pollType === 'single' && styles.pollTypeBtnActive]}
                      onPress={() => setPollType('single')}
                    >
                      <Text style={[styles.pollTypeTxt, pollType === 'single' && { color: '#fff' }]}>
                        Single choice
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pollTypeBtn, pollType === 'multi' && styles.pollTypeBtnActive]}
                      onPress={() => setPollType('multi')}
                    >
                      <Text style={[styles.pollTypeTxt, pollType === 'multi' && { color: '#fff' }]}>
                        Multiple choice
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <FormLabel required>Options</FormLabel>
                  {pollOptions.map((opt, idx) => (
                    <View key={idx} style={styles.pollOptionRow}>
                      <View style={[styles.pollDot, pollType === 'multi' ? { borderRadius: 3 } : { borderRadius: 9 }]} />
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder={'Option ' + (idx + 1) + (idx >= 2 ? ' (optional)' : '')}
                        placeholderTextColor={C.TEXT3}
                        value={opt}
                        onChangeText={(v) => updatePollOption(idx, v)}
                      />
                    </View>
                  ))}
                  {pollOptions.length < 6 && (
                    <TouchableOpacity onPress={addPollOption} style={styles.addOptionBtn}>
                      <Text style={styles.addOptionText}>+ Add another option</Text>
                    </TouchableOpacity>
                  )}
                  <FormLabel>Poll ends after</FormLabel>
                  <View style={styles.durationRow}>
                    {POLL_DURATIONS.map((d, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.durationChip, pollDurationIdx === i && styles.durationChipActive]}
                        onPress={() => setPollDurationIdx(i)}
                      >
                        <Text style={[styles.durationTxt, pollDurationIdx === i && { color: C.PRIMARY, fontWeight: '700' }]}>
                          {d.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* ── ANNOUNCEMENT ──────────────────────────────────── */}
              {selectedType === 'ANNOUNCEMENT' && (
                <View>
                  <FormLabel required>Announcement Title</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Session tomorrow at 9 AM"
                    placeholderTextColor={C.TEXT3}
                    value={title}
                    onChangeText={setTitle}
                  />
                  <FormLabel required>Message</FormLabel>
                  <TextInput
                    style={styles.textarea}
                    placeholder="Write your announcement message..."
                    placeholderTextColor={C.TEXT3}
                    multiline
                    numberOfLines={4}
                    value={content}
                    onChangeText={setContent}
                  />
                  <ToggleRow label="Pin to top"          value={isPinned}   onToggle={setIsPinned} />
                  <ToggleRow label="Notify all members"  value={notifyAll}  onToggle={setNotifyAll} />
                </View>
              )}

              {/* ── EVENT UPDATE ──────────────────────────────────── */}
              {selectedType === 'EVENT_UPDATE' && (
                <View>
                  <FormLabel required>Event Reference</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Food Distribution Drive - Jun 3"
                    placeholderTextColor={C.TEXT3}
                    value={eventReference}
                    onChangeText={setEventReference}
                  />
                  <FormLabel required>What changed?</FormLabel>
                  <View style={styles.pickerWrap}>
                    {EVENT_CHANGES.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.pickerOption, whatChanged === opt && styles.pickerOptionActive]}
                        onPress={() => setWhatChanged(opt)}
                      >
                        <Text style={[styles.pickerOptionText, whatChanged === opt && { color: C.PRIMARY }]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <FormLabel required>Update details</FormLabel>
                  <TextInput
                    style={styles.textarea}
                    placeholder="Describe the update clearly..."
                    placeholderTextColor={C.TEXT3}
                    multiline
                    numberOfLines={4}
                    value={updateDetails}
                    onChangeText={setUpdateDetails}
                  />
                </View>
              )}

              {/* ── VOLUNTEER REQUEST ─────────────────────────────── */}
              {selectedType === 'VOL_REQUEST' && (
                <View>
                  <FormLabel required>What help do you need?</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Need 5 volunteers for registration desk"
                    placeholderTextColor={C.TEXT3}
                    value={helpNeeded}
                    onChangeText={setHelpNeeded}
                  />
                  <View style={styles.twoCol}>
                    <View style={{ flex: 1 }}>
                      <FormLabel>Volunteers needed</FormLabel>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 5"
                        placeholderTextColor={C.TEXT3}
                        keyboardType="numeric"
                        value={volunteersCount}
                        onChangeText={setVolunteersCount}
                      />
                    </View>
                    <View style={{ width: 10 }} />
                    <View style={{ flex: 1 }}>
                      <FormLabel>Date / Time</FormLabel>
                      <TextInput
                        style={styles.input}
                        placeholder="Jun 14, 6:30 AM"
                        placeholderTextColor={C.TEXT3}
                        value={eventDateTime}
                        onChangeText={setEventDateTime}
                      />
                    </View>
                  </View>
                  <FormLabel>Skills required</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Communication, Organisation"
                    placeholderTextColor={C.TEXT3}
                    value={skills}
                    onChangeText={setSkills}
                  />
                </View>
              )}

              {/* ── TASK ──────────────────────────────────────────── */}
              {selectedType === 'TASK' && (
                <View>
                  <FormLabel required>Task Title</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Arrange transportation for materials"
                    placeholderTextColor={C.TEXT3}
                    value={taskTitle}
                    onChangeText={setTaskTitle}
                  />
                  <FormLabel>Task Description</FormLabel>
                  <TextInput
                    style={styles.textarea}
                    placeholder="Describe what needs to be done..."
                    placeholderTextColor={C.TEXT3}
                    multiline
                    numberOfLines={3}
                    value={taskDesc}
                    onChangeText={setTaskDesc}
                  />
                  <View style={styles.twoCol}>
                    <View style={{ flex: 1 }}>
                      <FormLabel>Assign to</FormLabel>
                      <TextInput
                        style={styles.input}
                        placeholder="Member name"
                        placeholderTextColor={C.TEXT3}
                        value={assignedTo}
                        onChangeText={setAssignedTo}
                      />
                    </View>
                    <View style={{ width: 10 }} />
                    <View style={{ flex: 1 }}>
                      <FormLabel>Due date / time</FormLabel>
                      <TextInput
                        style={styles.input}
                        placeholder="Jun 14, 6:30 AM"
                        placeholderTextColor={C.TEXT3}
                        value={dueDate}
                        onChangeText={setDueDate}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* ── RESOURCE ──────────────────────────────────────── */}
              {selectedType === 'RESOURCE' && (
                <View>
                  <FormLabel required>Resource Title</FormLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Event Guidelines - Coastal Cleanup"
                    placeholderTextColor={C.TEXT3}
                    value={resourceTitle}
                    onChangeText={setResourceTitle}
                  />
                  <FormLabel>Description</FormLabel>
                  <TextInput
                    style={styles.textarea}
                    placeholder="What does this resource cover?"
                    placeholderTextColor={C.TEXT3}
                    multiline
                    numberOfLines={3}
                    value={resourceDesc}
                    onChangeText={setResourceDesc}
                  />
                  {resourceFile ? (
                    <View style={styles.uploadedFileRow}>
                      <Text style={styles.uploadedFileIcon}>📎</Text>
                      <Text style={styles.uploadedFileName} numberOfLines={1}>{resourceFile.name}</Text>
                      <TouchableOpacity
                        onPress={() => setResourceFile(null)}
                        style={styles.uploadedFileRemove}
                        accessibilityLabel="Remove file"
                      >
                        <Text style={styles.uploadedFileRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.uploadBox} onPress={handlePickResourceFile} activeOpacity={0.7}>
                      <Text style={styles.uploadIcon}>{'📁'}</Text>
                      <Text style={styles.uploadTitle}>Tap to upload a file</Text>
                      <Text style={styles.uploadSub}>PDF, Image, Video or Document</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* ── AUDIENCE ──────────────────────────────────────── */}
              <FormLabel>Visible to</FormLabel>
              <TouchableOpacity
                style={[styles.audienceOption, audience === 'ALL_MEMBERS' && styles.audienceOptionActive]}
                onPress={() => setAudience('ALL_MEMBERS')}
                accessibilityLabel="All Members"
              >
                <View style={styles.audienceCheck}>
                  {audience === 'ALL_MEMBERS' && <View style={styles.audienceCheckFill} />}
                </View>
                <View>
                  <Text style={[styles.audienceTitle, audience === 'ALL_MEMBERS' && { color: C.PRIMARY }]}>
                    All Members
                  </Text>
                  <Text style={styles.audienceSub}>{'All ' + orgName + ' members'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.audienceOption, audience === 'ADMINS_ONLY' && styles.audienceOptionActive]}
                onPress={() => setAudience('ADMINS_ONLY')}
                accessibilityLabel="Admins only"
              >
                <View style={styles.audienceCheck}>
                  {audience === 'ADMINS_ONLY' && <View style={styles.audienceCheckFill} />}
                </View>
                <View>
                  <Text style={[styles.audienceTitle, audience === 'ADMINS_ONLY' && { color: C.PRIMARY }]}>
                    Only Admins
                  </Text>
                  <Text style={styles.audienceSub}>Internal moderation only</Text>
                </View>
              </TouchableOpacity>

            </ScrollView>

            {/* Submit — outside ScrollView so it never hides behind the keyboard */}
            <View style={[styles.submitFooter, { paddingBottom: insets.bottom + 8 }]}>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitting}
                accessibilityLabel={submitLabel}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.submitBtnText}>{submitLabel}</Text>
                }
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function FormLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
      {required ? <Text style={{ color: '#EF4444' }}> *</Text> : null}
    </Text>
  );
}

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: AppConfig.COLORS.BORDER, true: AppConfig.COLORS.PRIMARY + '80' }}
        thumbColor={value ? AppConfig.COLORS.PRIMARY : '#f4f3f4'}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const C2 = AppConfig.COLORS;
const styles = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  kavWrapper:   { justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C2.CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, maxHeight: '92%' },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: C2.BORDER, alignSelf: 'center', marginBottom: 14 },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockIcon:     { fontSize: 15 },
  headerTitle:  { fontSize: 15, fontWeight: '700', color: C2.TEXT },
  closeBtn:     { width: 28, height: 28, borderRadius: 14, backgroundColor: C2.BG, alignItems: 'center', justifyContent: 'center' },
  closeText:    { fontSize: 13, color: C2.TEXT2, fontWeight: '700' },
  subTitle:     { fontSize: 11, color: C2.PRIMARY, marginBottom: 12 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: C2.TEXT2, letterSpacing: 0.5, marginBottom: 8 },
  typeRow:      { gap: 6, paddingBottom: 4, marginBottom: 12 },
  typeChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  typeChipText: { fontSize: 12, fontWeight: '600' },

  authorRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C2.BG, borderRadius: 10, padding: 10, marginBottom: 14 },
  authorName:   { fontSize: 12, fontWeight: '700', color: C2.TEXT },
  authorSub:    { fontSize: 10, color: C2.TEXT2, marginTop: 1 },

  fieldLabel:   { fontSize: 12, fontWeight: '600', color: C2.TEXT, marginBottom: 5 },
  input:        { borderWidth: 1, borderColor: C2.BORDER, borderRadius: 10, padding: 11, fontSize: 13, color: C2.TEXT, backgroundColor: C2.BG, marginBottom: 12 },
  textarea:     { borderWidth: 1, borderColor: C2.BORDER, borderRadius: 10, padding: 11, fontSize: 13, color: C2.TEXT, backgroundColor: C2.BG, marginBottom: 12, minHeight: 90, textAlignVertical: 'top' },

  pollTypeRow:  { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pollTypeBtn:  { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: C2.BORDER, alignItems: 'center' },
  pollTypeBtnActive: { backgroundColor: C2.PRIMARY, borderColor: C2.PRIMARY },
  pollTypeTxt:  { fontSize: 12, fontWeight: '600', color: C2.TEXT2 },

  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pollDot:      { width: 20, height: 20, borderWidth: 2, borderColor: C2.BORDER, flexShrink: 0 },
  addOptionBtn: { marginBottom: 12 },
  addOptionText: { fontSize: 12, color: C2.PRIMARY, fontWeight: '600' },

  durationRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  durationChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C2.BORDER, backgroundColor: C2.BG },
  durationChipActive: { borderColor: C2.PRIMARY, backgroundColor: `${C2.PRIMARY}12` },
  durationTxt:  { fontSize: 11, color: C2.TEXT2 },

  pickerWrap:   { marginBottom: 12 },
  pickerOption: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C2.BORDER },
  pickerOptionActive: { backgroundColor: `${C2.PRIMARY}10` },
  pickerOptionText: { fontSize: 13, color: C2.TEXT },

  twoCol:       { flexDirection: 'row', marginBottom: 0 },

  uploadBox:    { borderWidth: 1.5, borderColor: C2.BORDER, borderRadius: 10, borderStyle: 'dashed', padding: 20, alignItems: 'center', marginBottom: 12, backgroundColor: C2.BG },
  uploadIcon:   { fontSize: 20, color: C2.TEXT2, marginBottom: 6 },
  uploadTitle:  { fontSize: 13, fontWeight: '600', color: C2.TEXT2, marginBottom: 2 },
  uploadSub:    { fontSize: 11, color: C2.TEXT3 },

  uploadedFileRow:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C2.PRIMARY + '60', borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: C2.PRIMARY + '08' },
  uploadedFileIcon:       { fontSize: 16, marginRight: 8 },
  uploadedFileName:       { flex: 1, fontSize: 13, color: C2.TEXT, fontWeight: '500' },
  uploadedFileRemove:     { padding: 4 },
  uploadedFileRemoveText: { fontSize: 13, color: C2.TEXT2, fontWeight: '700' },

  audienceOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C2.BORDER, borderRadius: 12, padding: 13, marginBottom: 8 },
  audienceOptionActive: { borderColor: C2.PRIMARY, backgroundColor: `${C2.PRIMARY}08` },
  audienceCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C2.BORDER, alignItems: 'center', justifyContent: 'center' },
  audienceCheckFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: C2.PRIMARY },
  audienceTitle: { fontSize: 13, fontWeight: '600', color: C2.TEXT },
  audienceSub:   { fontSize: 11, color: C2.TEXT2, marginTop: 1 },

  toggleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  toggleLabel:  { fontSize: 13, color: C2.TEXT },

  submitFooter: { paddingTop: 8, paddingHorizontal: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C2.BORDER },
  submitBtn:    { backgroundColor: C2.PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
