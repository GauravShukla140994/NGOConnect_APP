import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';
import { get, apply } from '../../api/project.api';
import type { Project } from '../../types/api.types';

const C = AppConfig.COLORS;

const CATEGORY_COLOR: Record<string, string> = {
  Community:       C.TEAL,
  Environment:     C.TEAL,
  Education:       C.PRIMARY,
  Healthcare:      '#F59E0B',
  'Animal Welfare':'#8B5CF6',
};

export default function ProjectDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const projectId: number = route.params?.projectId ?? 1;

  const [project, setProject]   = useState<Project | null>(null);
  const [loading, setLoading]   = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get(projectId);
      if (res.data?.isSuccess) { setProject(res.data.data); }
    } catch {
      Alert.alert('Error', 'Could not load project details.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleApply = useCallback(async () => {
    if (applied) { return; }
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
  }, [projectId, applied]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={C.PRIMARY} /></View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Go back">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Project Details</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load project.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load} accessibilityLabel="Retry">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const catColor  = CATEGORY_COLOR[project.categoryName ?? ''] ?? C.PRIMARY;
  const max       = project.maxParticipants ?? project.maxVolunteers ?? 0;
  const curr      = project.currentParticipants ?? project.approvedCount ?? 0;
  const spots     = project.spotsLeft ?? (max - curr);
  const isFull    = spots <= 0 && max > 0;
  const isApproved = project.applicationStatusCode === 'APPROVED';
  const isPending  = project.applicationStatusCode === 'PENDING';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Project Details</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[{   paddingBottom: 80  }, { paddingBottom: insets.bottom + 24 }]}>
        {/* Main card */}
        <View style={styles.mainCard}>
          <View style={styles.titleRow}>
            <Text style={styles.projTitle}>{project.title}</Text>
            <View style={[styles.catPill, { backgroundColor: `${catColor}20` }]}>
              <Text style={[styles.catPillText, { color: catColor }]}>{project.categoryName ?? 'Project'}</Text>
            </View>
          </View>
          {project.orgName && <Text style={styles.orgName}>by {project.orgName}</Text>}
          {project.description && (
            <Text style={styles.description}>{project.description}</Text>
          )}

          {/* Info rows */}
          <View style={styles.infoList}>
            {project.scheduleType && (
              <View style={styles.infoItem}>
                <Text style={styles.infoIcon}>🔄</Text>
                <Text style={styles.infoText}>
                  {project.scheduleType}
                  {project.recurrenceDays ? ` · ${project.recurrenceDays}` : ''}
                  {project.startDate ? ` · ${project.startDate}` : ''}
                  {project.endDate ? ` – ${project.endDate}` : ''}
                </Text>
              </View>
            )}
            {project.startTime && (
              <View style={styles.infoItem}>
                <Text style={styles.infoIcon}>🕐</Text>
                <Text style={styles.infoText}>
                  {project.startTime}{project.endTime ? ` – ${project.endTime}` : ''}
                  {project.durationMinutes ? ` (${project.durationMinutes} min/session)` : ''}
                </Text>
              </View>
            )}
            {project.locationName && (
              <View style={styles.infoItem}>
                <Text style={[styles.infoIcon, { color: '#EF4444' }]}>📍</Text>
                <Text style={styles.infoText}>{project.locationName}</Text>
              </View>
            )}
            {max > 0 && (
              <View style={styles.infoItem}>
                <Text style={styles.infoIcon}>👥</Text>
                <Text style={styles.infoText}>
                  {curr} of {max} spots filled per session
                  {!isFull ? ` · ${spots} spots left` : ' · FULL'}
                </Text>
              </View>
            )}
          </View>

          {/* Maps tile */}
          {(project.address ?? project.locationName) && (
            <TouchableOpacity style={styles.mapTile} accessibilityLabel="Open in Google Maps">
              <Text style={{ fontSize: 15 }}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.mapTitle}>Open in Google Maps</Text>
                <Text style={styles.mapSub}>{project.address ?? project.locationName}</Text>
              </View>
              <Text style={{ color: C.PRIMARY }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Skills */}
          {project.skills?.length ? (
            <View style={styles.skillsBox}>
              <Text style={styles.skillsLabel}>Skills needed</Text>
              <View style={styles.tagRow}>
                {project.skills.map((s, i) => (
                  <View key={i} style={styles.skillTag}>
                    <Text style={styles.skillTagText}>{s.skillName}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* Session picker for recurring */}
        {project.scheduleType === 'RECURRING' && (
          <View style={styles.sessionCard}>
            <Text style={styles.sectionTitle}>Choose your sessions</Text>
            <Text style={styles.sectionSub}>Select which sessions you can attend</Text>
            <View style={[styles.sessionItem, styles.sessionItemActive]}>
              <View>
                <Text style={[styles.sessionDay, { color: C.PRIMARY }]}>
                  {project.recurrenceDays ?? 'Recurring Session'} · {project.startTime}
                </Text>
                <Text style={styles.sessionMeta}>
                  {project.startDate} to {project.endDate} · {curr}/{max} filled
                </Text>
              </View>
              <Text style={{ color: C.PRIMARY, fontSize: 18 }}>✓</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Apply footer */}
      <View style={styles.applyFooter}>
        {isApproved ? (
          <View style={[styles.applyBtn, { backgroundColor: C.TEAL }]}>
            <Text style={styles.applyBtnText}>✓ Already Approved</Text>
          </View>
        ) : isPending ? (
          <View style={[styles.applyBtn, { backgroundColor: C.YELLOW }]}>
            <Text style={styles.applyBtnText}>⏳ Application Pending</Text>
          </View>
        ) : applied ? (
          <View style={[styles.applyBtn, { backgroundColor: C.TEAL }]}>
            <Text style={styles.applyBtnText}>✓ Application Submitted</Text>
          </View>
        ) : isFull ? (
          <View style={[styles.applyBtn, { backgroundColor: '#E5E7EB' }]}>
            <Text style={[styles.applyBtnText, { color: C.TEXT2 }]}>No Spots Available</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.applyBtn} onPress={handleApply} disabled={applying} accessibilityLabel="Apply for project">
            {applying
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.applyBtnText}>Apply for Selected Sessions</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.BG },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  backText:         { color: C.PRIMARY, fontSize: 15 },
  topBarTitle:      { fontSize: 16, fontWeight: '700', color: C.TEXT },
  errorText:        { fontSize: 16, color: C.TEXT2, fontWeight: '600', marginBottom: 12 },
  retryBtn:         { backgroundColor: C.PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText:        { color: '#fff', fontWeight: '700' },
  mainCard:         { margin: 12, backgroundColor: C.CARD, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  titleRow:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  projTitle:        { flex: 1, fontSize: 18, fontWeight: '800', color: C.TEXT, marginRight: 8 },
  catPill:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  catPillText:      { fontSize: 11, fontWeight: '700' },
  orgName:          { fontSize: 13, color: C.TEXT2, marginBottom: 10 },
  description:      { fontSize: 14, color: C.TEXT, lineHeight: 20, marginBottom: 12 },
  infoList:         { gap: 8, marginBottom: 12 },
  infoItem:         { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  infoIcon:         { fontSize: 15, width: 20, color: C.PRIMARY },
  infoText:         { flex: 1, fontSize: 13, color: C.TEXT },
  mapTile:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${C.PRIMARY}10`, borderRadius: 10, padding: 10, marginBottom: 12 },
  mapTitle:         { fontSize: 12, fontWeight: '700', color: C.PRIMARY },
  mapSub:           { fontSize: 11, color: C.TEXT2 },
  skillsBox:        { backgroundColor: `${C.PRIMARY}08`, borderRadius: 9, padding: 10 },
  skillsLabel:      { fontSize: 12, fontWeight: '700', color: C.PRIMARY, marginBottom: 7 },
  tagRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  skillTag:         { backgroundColor: `${C.PRIMARY}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  skillTagText:     { fontSize: 12, color: C.PRIMARY, fontWeight: '500' },
  sessionCard:      { margin: 12, marginTop: 0, backgroundColor: C.CARD, borderRadius: 14, padding: 14 },
  sectionTitle:     { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 3 },
  sectionSub:       { fontSize: 13, color: C.TEXT2, marginBottom: 10 },
  sessionItem:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 9, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.BG, marginBottom: 7 },
  sessionItemActive:{ borderColor: C.PRIMARY, backgroundColor: `${C.PRIMARY}08` },
  sessionDay:       { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  sessionMeta:      { fontSize: 11, color: C.TEXT2 },
  applyFooter:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: C.CARD, borderTopWidth: 1, borderTopColor: C.BORDER },
  applyBtn:         { backgroundColor: C.PRIMARY, borderRadius: 12, padding: 14, alignItems: 'center' },
  applyBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },
});