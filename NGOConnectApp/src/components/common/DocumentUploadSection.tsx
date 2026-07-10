/**
 * DocumentUploadSection — reusable document upload UI
 *
 * Used in:
 *   - EditProfileScreen (step 4 — Documents)
 *   - JoinFormScreen (step 3 — Documents)
 *
 * Behaviour:
 *   - Loads user's existing documents from UserDocuments table on mount
 *   - Shows each doc type with its upload status
 *   - Upload: image picker → /media/upload → POST /user/documents (upserts by type)
 *   - Delete: DELETE /user/documents/{id}
 *   - Parent receives `onDocsChange(docs)` so it can track state (e.g. for review step)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import AppConfig from '../../config/AppConfig';
import { userApi } from '../../api/user.api';
import { uploadFile } from '../../api/upload.api';
import type { UserDocument, LookupValue } from '../../types/api.types';

const C = AppConfig.COLORS;

// Doc types the user can upload — universal categories, matches DOCUMENT_TYPE_USER lookup
export const DOC_TYPES: { code: string; label: string; sub: string; required: boolean }[] = [
  {
    code: 'PHOTO_ID',
    label: 'Government Photo ID',
    sub: 'National ID card, passport, or any govt-issued photo ID',
    required: true,
  },
  {
    code: 'ADDR_PROOF',
    label: 'Address Proof',
    sub: 'Utility bill, bank statement, or government letter',
    required: true,
  },
  {
    code: 'PASSPORT',
    label: 'Passport',
    sub: 'International travel document',
    required: false,
  },
  {
    code: 'DRIVING_LIC',
    label: 'Driving License',
    sub: 'Government-issued driving licence',
    required: false,
  },
  {
    code: 'OTHER',
    label: 'Other Document',
    sub: 'Any other supporting document',
    required: false,
  },
];

interface Props {
  /** Called whenever the document list changes (upload or delete). */
  onDocsChange?: (docs: UserDocument[]) => void;
  /** Pre-seeded docs (e.g. from parent load). If omitted, component fetches itself. */
  initialDocs?: UserDocument[];
  /** Show only required docs (for join form summary mode). Default: false */
  compactMode?: boolean;
}

export default function DocumentUploadSection({ onDocsChange, initialDocs, compactMode = false }: Props) {
  const [docs,      setDocs]      = useState<UserDocument[]>(initialDocs ?? []);
  const [loading,   setLoading]   = useState(initialDocs === undefined); // only show spinner in self-fetch mode
  const [uploading, setUploading] = useState<string | null>(null); // valueCode being uploaded

  // Tracks whether we've already synced from a non-empty initialDocs.
  // Prevents overwriting user-made changes if the parent re-renders later.
  const syncedFromProps = useRef(false);

  useEffect(() => {
    // Self-fetch mode: parent didn't provide initialDocs at all
    if (initialDocs === undefined) {
      (async () => {
        try {
          const res = await userApi.getMyDocuments();
          if (res.data?.isSuccess) {
            const fetched = res.data.data ?? [];
            setDocs(fetched);
            onDocsChange?.(fetched);
          }
        } catch { /* silent */ }
        setLoading(false);
      })();
      return;
    }

    // Parent-provided mode: sync once when data first arrives (non-empty).
    // Skips if parent passes [] on first render while its own load is in flight.
    if (!syncedFromProps.current && initialDocs.length > 0) {
      setDocs(initialDocs);
      syncedFromProps.current = true;
    }
  }, [initialDocs]); // re-runs when parent finishes loading and passes real docs

  const docForType = useCallback(
    (typeCode: string) => docs.find(d => d.docTypeCode === typeCode),
    [docs],
  );

  const handleUpload = async (typeCode: string, typeLkpId: number) => {
    const result = await launchImageLibrary({
      mediaType: 'mixed',
      quality: 0.85,
      selectionLimit: 1,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setUploading(typeCode);
    try {
      // 1. Upload to blob storage
      const fileUrl = await uploadFile(
        asset.uri,
        asset.fileName ?? `doc_${Date.now()}`,
        asset.type ?? 'image/jpeg',
        'user-documents',
      );

      // 2. Save metadata to UserDocuments table (SP upserts by type)
      await userApi.uploadDocument({
        documentTypeLkpId: typeLkpId,
        fileUrl,
        fileName:  asset.fileName ?? `doc_${Date.now()}`,
        fileSizeKb: Math.round((asset.fileSize ?? 0) / 1024),
      });

      // 3. Refresh docs list
      const res = await userApi.getMyDocuments();
      if (res.data?.isSuccess) {
        const updated = res.data.data ?? [];
        setDocs(updated);
        onDocsChange?.(updated);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload document.');
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (doc: UserDocument) => {
    Alert.alert(
      'Remove Document',
      `Remove ${doc.docTypeName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await userApi.deleteDocument(doc.userDocumentId);
              const updated = docs.filter(d => d.userDocumentId !== doc.userDocumentId);
              setDocs(updated);
              onDocsChange?.(updated);
            } catch {
              Alert.alert('Error', 'Could not remove document.');
            }
          },
        },
      ],
    );
  };

  // Fetch lookup IDs for doc types (needed for upload call)
  // We derive LkpId from the loaded docs or from a lookup fetch.
  // Simple approach: keep a map of typeCode → lkpId from fetched docs.
  const [typeLkpMap, setTypeLkpMap] = useState<Record<string, number>>({});
  useEffect(() => {
    // Build map from existing docs
    const map: Record<string, number> = {};
    docs.forEach(d => { map[d.docTypeCode] = d.documentTypeLkpId; });
    setTypeLkpMap(prev => ({ ...prev, ...map }));
  }, [docs]);

  // If we don't have a lkpId for a type (no existing doc), fetch from lookup
  const getLkpId = async (typeCode: string): Promise<number> => {
    if (typeLkpMap[typeCode]) return typeLkpMap[typeCode];
    try {
      const { lookupApi } = await import('../../api/lookup.api');
      const res = await lookupApi.getValuesByTypeCode('DOCUMENT_TYPE_USER');
      const values: LookupValue[] = res.data?.data ?? [];
      const map: Record<string, number> = {};
      values.forEach(v => { map[v.valueCode] = v.lookupValueId; });
      setTypeLkpMap(prev => ({ ...prev, ...map }));
      return map[typeCode] ?? 0;
    } catch (err) {
      console.warn('[DocumentUploadSection] getLkpId failed:', err);
      return 0;
    }
  };

  const onPressUpload = async (typeCode: string) => {
    const lkpId = await getLkpId(typeCode);
    if (!lkpId) {
      Alert.alert('Error', 'Could not resolve document type. Please try again.');
      return;
    }
    await handleUpload(typeCode, lkpId);
  };

  const visibleTypes = compactMode
    ? DOC_TYPES.filter(t => t.required)
    : DOC_TYPES;

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={C.PRIMARY} />
        <Text style={styles.loadingText}>Loading documents…</Text>
      </View>
    );
  }

  return (
    <View>
      {visibleTypes.map(type => {
        const existing = docForType(type.code);
        const isUploading = uploading === type.code;
        return (
          <View key={type.code} style={styles.docRow}>
            <View style={styles.docLabelRow}>
              <Text style={styles.docLabel}>
                {type.label}
                {type.required && <Text style={{ color: '#EF4444' }}> *</Text>}
              </Text>
              {existing?.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verified</Text>
                </View>
              )}
            </View>

            {existing ? (
              /* ── Uploaded state ── */
              <View style={styles.uploadedCard}>
                <Text style={styles.uploadedIcon}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadedName} numberOfLines={1}>{existing.fileName}</Text>
                  <Text style={styles.uploadedMeta}>
                    {existing.fileSizeKb ? `${existing.fileSizeKb} KB · ` : ''}
                    Uploaded {new Date(existing.uploadedAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.uploadedActions}>
                  <TouchableOpacity onPress={() => onPressUpload(type.code)} style={styles.replaceBtn}>
                    <Text style={styles.replaceBtnText}>Replace</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(existing)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* ── Upload zone ── */
              <TouchableOpacity
                style={[styles.uploadZone, isUploading && styles.uploadZoneActive]}
                onPress={() => !isUploading && onPressUpload(type.code)}
                disabled={isUploading}
                accessibilityLabel={`Upload ${type.label}`}
              >
                {isUploading ? (
                  <ActivityIndicator color={C.PRIMARY} />
                ) : (
                  <>
                    <Text style={styles.uploadIcon}>📤</Text>
                    <Text style={styles.uploadText}>Tap to upload</Text>
                    <Text style={styles.uploadSub}>{type.sub}</Text>
                    <Text style={styles.uploadFormat}>PNG, JPG, PDF · max 5 MB</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          📌 Documents saved here are reused automatically when you apply to join any NGO.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20 },
  loadingText:   { fontSize: 13, color: C.TEXT2 },

  docRow:        { marginBottom: 14 },
  docLabelRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  docLabel:      { fontSize: 13, fontWeight: '600', color: C.TEXT },
  verifiedBadge: { backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  verifiedText:  { fontSize: 11, color: '#15803D', fontWeight: '700' },

  uploadedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.CARD, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: C.BORDER,
  },
  uploadedIcon:    { fontSize: 24 },
  uploadedName:    { fontSize: 13, fontWeight: '600', color: C.TEXT },
  uploadedMeta:    { fontSize: 11, color: C.TEXT3, marginTop: 2 },
  uploadedActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replaceBtn:      { backgroundColor: `${C.PRIMARY}15`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  replaceBtnText:  { fontSize: 12, color: C.PRIMARY, fontWeight: '600' },
  deleteBtn:       { padding: 4 },
  deleteBtnText:   { fontSize: 14, color: '#EF4444' },

  uploadZone: {
    borderWidth: 2, borderColor: C.BORDER, borderStyle: 'dashed',
    borderRadius: 12, padding: 20, alignItems: 'center',
    backgroundColor: C.BG,
  },
  uploadZoneActive: { borderColor: C.PRIMARY, backgroundColor: `${C.PRIMARY}08` },
  uploadIcon:  { fontSize: 26, marginBottom: 6 },
  uploadText:   { fontSize: 13, color: C.TEXT2, fontWeight: '500' },
  uploadSub:    { fontSize: 11, color: C.TEXT3, marginTop: 3, textAlign: 'center' },
  uploadFormat: { fontSize: 10, color: C.TEXT3, marginTop: 5, opacity: 0.7 },

  infoBox: {
    backgroundColor: '#EFF6FF', borderRadius: 10, padding: 10, marginTop: 4,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoText: { fontSize: 12, color: '#1D4ED8', lineHeight: 17 },
});
