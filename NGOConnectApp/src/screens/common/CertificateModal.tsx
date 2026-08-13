/**
 * CertificateModal.tsx
 *
 * Renders the volunteer certificate via an API-generated HTML string:
 *  1. Fetch cert list (GET /certificates) → match certCode by projectId
 *  2. Fetch rendered HTML (GET /certificates/{certCode}/html)
 *  3. Render in WebView — API is the single source of truth for the template
 *
 * The API also returns verifyUrl (AES-256-GCM encrypted token) inside the
 * cert-list response. Share button uses that URL — never builds one client-side
 * from certCode (CERT-2026-000001 is a plain incrementing counter; a client-built
 * link would let anyone enumerate every certificate on the platform).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNBlobUtil from 'react-native-blob-util';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import AppConfig from '../../config/AppConfig';
import { userApi } from '../../api/user.api';

const C = AppConfig.COLORS;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible:     boolean;
  projectId:   number | null;
  projectName: string;
  onClose:     () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CertificateModal({ visible, projectId, projectName, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [certCode,    setCertCode]    = useState<string | null>(null);
  const [verifyUrl,   setVerifyUrl]   = useState<string | null>(null);
  const [certHtml,    setCertHtml]    = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [webLoading,  setWebLoading]  = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (visible && projectId) {
      fetchCertificate(projectId);
    } else {
      setCertCode(null);
      setVerifyUrl(null);
      setCertHtml(null);
      setError(null);
      setWebLoading(true);
    }
  }, [visible, projectId]);

  const fetchCertificate = useCallback(async (pid: number) => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: get cert list → find certCode + verifyUrl for this project
      const listRes = await userApi.getMyCertificates();
      if (!listRes.data?.isSuccess || !listRes.data.data?.length) {
        setError('Certificate not issued yet for this project.');
        setLoading(false);
        return;
      }
      const match = listRes.data.data.find((c: any) => c.projectId === pid);
      if (!match) {
        setError('No certificate found for this project.');
        setLoading(false);
        return;
      }

      // Step 2: fetch rendered HTML from the API — single source of truth
      const htmlRes = await userApi.getCertificateHtml(match.certCode);
      if (!htmlRes.data?.isSuccess || !htmlRes.data.data) {
        setError(htmlRes.data?.message ?? 'Could not load certificate.');
        setLoading(false);
        return;
      }

      setCertCode(match.certCode);
      setVerifyUrl(match.verifyUrl ?? null);
      setCertHtml(htmlRes.data.data);
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }, []);

  const handleShare = useCallback(async () => {
    const shareText = verifyUrl
      ? `My volunteer certificate for "${projectName}" is verified on RippleHub:\n${verifyUrl}`
      : `I earned a volunteer certificate for "${projectName}" on RippleHub!`;
    try {
      await Share.share(
        Platform.OS === 'ios' && verifyUrl
          ? { url: verifyUrl, message: shareText }
          : { message: shareText },
      );
    } catch { /* ignore cancel */ }
  }, [verifyUrl, projectName]);

  /**
   * Download — converts the certificate HTML to a PDF using the OS print engine
   * and saves it with a proper filename.
   * iOS  → saves to Documents, opens with Quick Look (Share › Save to Files)
   * Android → saves to Downloads, opens with the default PDF viewer
   */
  const handleDownload = useCallback(async () => {
    if (!certHtml || downloading) return;
    setDownloading(true);
    try {
      const fileName = `RippleHub_Certificate_${certCode ?? 'cert'}`;

      // Verify the native module is linked — requires a full native rebuild after npm install.
      // If this throws "RNHTMLtoPDF is null / could not be found", run:
      //   Android → cd android && ./gradlew clean && cd .. && npx react-native run-android
      //   iOS     → cd ios && pod install && cd .. && npx react-native run-ios
      const result = await RNHTMLtoPDF.convert({
        html: certHtml,
        fileName,
        width: 595,   // A4 width in points
        height: 842,  // A4 height in points
        bgColor: '#eef2f7',
        base64: false,
      });

      const pdfPath = result.filePath;
      if (!pdfPath) throw new Error('PDF path not returned by library');

      if (Platform.OS === 'ios') {
        // Copy to Documents so it persists, then open with Quick Look
        const destPath = `${RNBlobUtil.fs.dirs.DocumentDir}/${fileName}.pdf`;
        await RNBlobUtil.fs.cp(pdfPath, destPath);
        await RNBlobUtil.ios.openDocument(destPath);
      } else {
        // Open directly from the temp path — avoids needing WRITE_EXTERNAL_STORAGE
        // on Android < 10. The system PDF viewer allows the user to save it.
        await RNBlobUtil.android.actionViewIntent(pdfPath, 'application/pdf');
      }
    } catch (e: any) {
      const reason: string = e?.message ?? String(e);
      console.error('[CertificateModal] PDF download error:', reason);
      Alert.alert(
        'Download Failed',
        __DEV__
          ? `${reason}\n\nIf this says "null" or "could not be found", rebuild the native app.`
          : 'Could not generate the PDF. Please try again.',
      );
    } finally {
      setDownloading(false);
    }
  }, [certHtml, certCode, downloading]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Certificate</Text>
          <View style={{ width: 64 }} />
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={C.PRIMARY} />
            <Text style={styles.loadingText}>Loading certificate…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorIcon}>📄</Text>
            <Text style={styles.errorTitle}>Not Available</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => projectId && fetchCertificate(projectId)}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : certHtml ? (
          <View style={{ flex: 1 }}>
            <WebView
              source={{ html: certHtml, baseUrl: '' }}
              style={styles.webview}
              onLoadStart={() => setWebLoading(true)}
              onLoadEnd={()   => setWebLoading(false)}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled
              showsVerticalScrollIndicator={false}
              originWhitelist={['*']}
            />
            {webLoading && (
              <View style={styles.webLoadOverlay}>
                <ActivityIndicator size="large" color={C.PRIMARY} />
                <Text style={styles.loadingText}>Rendering certificate…</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* ── Bottom action bar — Share + Download ── */}
        {certHtml ? (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.actionRow}>

              {/* Share pill */}
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.82}>
                <Text style={styles.pillBtnText}>SHARE</Text>
                <View style={styles.pillIconCircle}>
                  <Text style={styles.pillIcon}>↗</Text>
                </View>
              </TouchableOpacity>

              {/* Download pill */}
              <TouchableOpacity
                style={[styles.downloadBtn, downloading && styles.pillBtnDisabled]}
                onPress={handleDownload}
                activeOpacity={0.82}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#fff" style={{ flex: 1 }} />
                ) : (
                  <>
                    <Text style={styles.pillBtnText}>DOWNLOAD</Text>
                    <View style={styles.pillIconCircle}>
                      <Text style={styles.pillIcon}>↓</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>

            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.BG },

  header:           {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
    backgroundColor: C.CARD,
  },
  closeBtn:         { width: 32, height: 32, borderRadius: 16, backgroundColor: C.INPUT_BG, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:     { color: C.TEXT2, fontSize: 13, fontWeight: '700' },
  headerTitle:      { flex: 1, fontSize: 16, fontWeight: '700', color: C.TEXT, textAlign: 'center', marginHorizontal: 8 },

  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  errorIcon:        { fontSize: 48 },
  errorTitle:       { fontSize: 18, fontWeight: '700', color: C.TEXT },
  errorText:        { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 22 },
  loadingText:      { fontSize: 14, color: C.TEXT2, marginTop: 12 },
  retryBtn:         { marginTop: 8, paddingHorizontal: 28, paddingVertical: 10, borderRadius: 10, backgroundColor: C.PRIMARY },
  retryBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },

  webview:          { flex: 1 },
  webLoadOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },

  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.BORDER,
    backgroundColor: C.CARD,
  },
  actionRow: { flexDirection: 'row', gap: 12 },

  // ── Shared pill base ──
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2ECC71',       // TEAL — share
    borderRadius: 50,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 6,
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 6,
  },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.PRIMARY,       // purple — download
    borderRadius: 50,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 6,
    shadowColor: C.PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 6,
  },
  pillBtnText: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pillIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  pillIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  pillBtnDisabled: { opacity: 0.6 },
});
