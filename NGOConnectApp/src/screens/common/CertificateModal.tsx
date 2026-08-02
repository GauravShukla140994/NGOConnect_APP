/**
 * CertificateModal.tsx
 *
 * Renders the volunteer certificate entirely locally:
 *  1. Fetch cert list (GET /certificates) → match certCode by projectId
 *  2. Fetch full cert data (GET /certificates/{certCode})
 *  3. Build the certificate HTML from the embedded template + real data
 *  4. Render in a local WebView — no external URL dependency
 *
 * Share button shares the public verify URL returned by the backend as `verifyUrl`
 * (an AES-256-GCM encrypted token, e.g. ripplehub.app/verify/kR9x...), NOT a URL
 * built from certCode. certCode is CERT-2026-000001-style — a plain incrementing
 * counter — so a client-built `ripplehub.app/verify/${certCode}` link would let
 * anyone enumerate every certificate on the platform by walking the number. The
 * modal never depends on that URL loading either way — it renders locally.
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

interface CertData {
  certCode:       string;
  volunteerName:  string;
  projectName:    string;
  orgName:        string;
  issuedAt:       string;
  totalHours?:    number;
  impactScore?:   number;
  skillRatings?:  string;  // pipe-separated: "Communication:4.0|Leadership:3.5"
  isDeleted?:     number;
  verifyUrl:      string;  // encrypted public verify link, from the API — never build this client-side
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtMonthYear(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ─── Certificate HTML builder ─────────────────────────────────────────────────
// Embeds the RippleHub certificate template and injects real data.
// Renders locally — no external URL required.

const RIPPLEHUB_LOGO_B64 =
  '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';

function buildCertHtml(d: CertData): string {
  const certCode       = d.certCode;
  const volunteerName  = d.volunteerName  ?? 'Volunteer';
  const orgName        = d.orgName        ?? 'NGO';
  const projectName    = d.projectName    ?? 'Project';
  const issuedAt       = fmtDate(d.issuedAt);
  const completedMY    = fmtMonthYear(d.issuedAt);
  const hasHours       = Number(d.totalHours) > 0;
  const hours          = hasHours ? `${d.totalHours} hrs` : '';
  const coordinator    = 'Org Coordinator';
  // Encrypted token URL from the API — never a client-built ripplehub.app/verify/{certCode}.
  const verifyUrl      = d.verifyUrl || 'https://ripplehub.app';

  // Build skill chips HTML from pipe-separated skillRatings string
  let skillChipsHtml = '';
  if (d.skillRatings) {
    const chips = d.skillRatings.split('|').map(pair => {
      const [name, rating] = pair.split(':');
      return `<span class="cert-skill-chip">${name.trim()}&nbsp;&nbsp;${parseFloat(rating).toFixed(1)} ★</span>`;
    }).join('\n');
    skillChipsHtml = chips;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
  <title>RippleHub — Volunteer Certificate</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #F1F5F9;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 1.5rem 1rem 2rem;
    }
    .certificate {
      width: 100%;
      max-width: 720px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,.18);
      background: #fff;
    }
    .cert-header {
      background: #1E2761;
      padding: 1.5rem 1.5rem 1.25rem;
    }
    .cert-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .cert-brand { display: flex; align-items: center; gap: 10px; }
    .cert-logo-icon {
      width: 44px; height: 44px;
      object-fit: contain; border-radius: 10px;
    }
    .cert-brand-name { font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -.3px; }
    .cert-id-block { text-align: right; }
    .cert-id-label { font-size: 8px; color: rgba(255,255,255,.45); letter-spacing: .12em; text-transform: uppercase; margin-bottom: 3px; }
    .cert-id-value { font-size: 12px; color: rgba(255,255,255,.8); font-weight: 600; letter-spacing: .02em; }
    .cert-id-date  { font-size: 10px; color: rgba(255,255,255,.45); margin-top: 3px; }
    .cert-header-center { text-align: center; }
    .cert-eyebrow { font-size: 9px; color: rgba(255,255,255,.5); letter-spacing: .14em; text-transform: uppercase; margin-bottom: .4rem; }
    .cert-ngo-name { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: .25rem; letter-spacing: -.2px; }
    .cert-powered-by { font-size: 11px; color: rgba(255,255,255,.55); }
    .cert-powered-by strong { color: rgba(255,255,255,.9); font-weight: 600; }
    .cert-body { background: #fff; padding: 1.5rem; }
    .cert-name-block { text-align: center; margin-bottom: 1.25rem; }
    .cert-awarded-label { font-size: 9px; color: #94A3B8; letter-spacing: .1em; text-transform: uppercase; margin-bottom: .4rem; }
    .cert-vol-name { font-size: 28px; font-weight: 700; color: #1E2761; letter-spacing: -.5px; }
    .cert-description { font-size: 13px; color: #475569; line-height: 1.8; text-align: center; max-width: 460px; margin: 0 auto 1.25rem; }
    .cert-description strong { color: #1E293B; font-weight: 600; }
    .cert-skills { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; margin-bottom: 1.25rem; }
    .cert-skill-chip { font-size: 11px; background: #EEF2FF; color: #3730A3; border: 1px solid #C7D2FE; border-radius: 20px; padding: 4px 12px; font-weight: 500; }
    .cert-meta { display: grid; grid-template-columns: repeat(var(--meta-cols,2),1fr); gap: 10px; margin-bottom: 1.5rem; }
    .cert-meta-card { background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 10px; padding: .8rem; text-align: center; }
    .cert-meta-val { font-size: 16px; font-weight: 700; color: #1E2761; }
    .cert-meta-label { font-size: 9px; color: #4338CA; margin-top: 4px; letter-spacing: .04em; }
    .cert-divider { border: none; border-top: 1px solid #E2E8F0; margin-bottom: 1.25rem; }
    .cert-sigs { display: grid; grid-template-columns: 1fr 60px 1fr; align-items: center; gap: 1rem; }
    .cert-sig-col { display: flex; flex-direction: column; gap: 5px; }
    .cert-sig-col.right { align-items: flex-end; text-align: right; }
    .cert-sig-line { border-bottom: 1px solid #CBD5E1; height: 24px; width: 100%; }
    .cert-sig-name { font-size: 12px; font-weight: 600; color: #1E293B; }
    .cert-sig-role { font-size: 10px; color: #94A3B8; }
    .cert-seal { width: 56px; height: 56px; border-radius: 50%; background: #1E2761; display: flex; align-items: center; justify-content: center; flex-direction: column; flex-shrink: 0; }
    .cert-seal-text { color: #fff; font-size: 7.5px; font-weight: 700; text-align: center; line-height: 1.5; letter-spacing: .06em; }
    .cert-verify { display: flex; align-items: center; gap: 14px; margin-top: 1.1rem; padding-top: 1.1rem; border-top: 1px solid #F1F5F9; }
    .cert-verify-qr { flex-shrink: 0; width: 72px; height: 72px; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0; }
    .cert-verify-qr img { display: block; width: 72px; height: 72px; }
    .cert-verify-text { flex: 1; font-size: 10.5px; color: #94A3B8; word-break: break-all; }
    .cert-verify-text strong { display: block; font-size: 11px; color: #475569; font-weight: 600; margin-bottom: 4px; }
    .cert-verify-text a { color: #4338CA; text-decoration: none; font-weight: 500; }
    @media (max-width: 400px) {
      .cert-vol-name { font-size: 22px; }
      .cert-meta { gap: 6px; }
      .cert-meta-val { font-size: 14px; }
      .cert-sigs { grid-template-columns: 1fr 48px 1fr; gap: .6rem; }
    }
  </style>
</head>
<body>
<div class="certificate">
  <div class="cert-header">
    <div class="cert-header-top">
      <div class="cert-brand">
        <img class="cert-logo-icon" src="data:image/png;base64,${RIPPLEHUB_LOGO_B64}" alt="RippleHub" />
        <div class="cert-brand-name">RippleHub</div>
      </div>
      <div class="cert-id-block">
        <div class="cert-id-label">Certificate ID</div>
        <div class="cert-id-value">${certCode}</div>
        <div class="cert-id-date">${issuedAt}</div>
      </div>
    </div>
    <div class="cert-header-center">
      <div class="cert-eyebrow">Certificate of Volunteer Service</div>
      <div class="cert-ngo-name">${orgName}</div>
      <div class="cert-powered-by">Powered by <strong>RippleHub</strong> &middot; Official digital record</div>
    </div>
  </div>

  <div class="cert-body">
    <div class="cert-name-block">
      <div class="cert-awarded-label">Awarded to</div>
      <div class="cert-vol-name">${volunteerName}</div>
    </div>

    <p class="cert-description">
      has successfully completed volunteer service for
      <strong>"${projectName}"</strong>,
      contributing meaningful time, skills, and effort to create
      lasting community impact under the banner of
      <strong>${orgName}</strong>.
    </p>

    <div class="cert-skills" id="skillChips" style="${d.skillRatings ? '' : 'display:none'}">
      ${skillChipsHtml}
    </div>

    <div class="cert-meta" style="--meta-cols:${hasHours ? 2 : 1}">
      ${hasHours ? `<div class="cert-meta-card">
        <div class="cert-meta-val">${hours}</div>
        <div class="cert-meta-label">Hours contributed</div>
      </div>` : ''}
      <div class="cert-meta-card">
        <div class="cert-meta-val">${completedMY}</div>
        <div class="cert-meta-label">Completed</div>
      </div>
    </div>

    <hr class="cert-divider"/>

    <div class="cert-sigs">
      <div class="cert-sig-col">
        <div class="cert-sig-line"></div>
        <div class="cert-sig-name">${coordinator}</div>
        <div class="cert-sig-role">Coordinator &middot; ${orgName}</div>
      </div>
      <div class="cert-seal" aria-hidden="true">
        <span class="cert-seal-text">VERIFIED<br>RIPPLE<br>HUB</span>
      </div>
      <div class="cert-sig-col right">
        <div class="cert-sig-line"></div>
        <div class="cert-sig-name">RippleHub Platform</div>
        <div class="cert-sig-role">Authorised digital signature</div>
      </div>
    </div>

    <div class="cert-verify">
      <div class="cert-verify-qr">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=144x144&data=${encodeURIComponent(verifyUrl)}&bgcolor=FFFFFF&color=1E2761&format=png" alt="Scan to verify" />
      </div>
      <div class="cert-verify-text">
        <strong>🔗 Scan to verify certificate</strong>
        <a href="${verifyUrl}">${verifyUrl}</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
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
      fetchAndBuild(projectId);
    } else {
      setCertCode(null);
      setVerifyUrl(null);
      setCertHtml(null);
      setError(null);
      setWebLoading(true);
    }
  }, [visible, projectId]);

  const fetchAndBuild = useCallback(async (pid: number) => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: get cert list → find certCode for this project
      const listRes = await userApi.getMyCertificates();
      if (!listRes.data?.isSuccess || !listRes.data.data?.length) {
        setError('Certificate not issued yet for this project.');
        setLoading(false);
        return;
      }
      const match = listRes.data.data.find(c => c.projectId === pid);
      if (!match) {
        setError('No certificate found for this project.');
        setLoading(false);
        return;
      }

      // Step 2: fetch full cert data
      const dataRes = await userApi.getCertificate(match.certCode);
      if (!dataRes.data?.isSuccess || !dataRes.data.data) {
        setError(dataRes.data?.message ?? 'Could not load certificate data.');
        setLoading(false);
        return;
      }

      const raw = dataRes.data.data as any;

      // Step 3: build HTML from template + real data
      const certData: CertData = {
        certCode:      match.certCode,
        volunteerName: raw.volunteerName  ?? '',
        projectName:   raw.projectName    ?? projectName,
        orgName:       raw.orgName        ?? '',
        issuedAt:      raw.issuedAt       ?? match.issuedAt ?? '',
        totalHours:    raw.totalHours,
        impactScore:   raw.impactScore,
        skillRatings:  raw.skillRatings,
        isDeleted:     raw.isDeleted,
        verifyUrl:     raw.verifyUrl      ?? '',
      };

      if (certData.isDeleted === 1) {
        setError('This certificate has been revoked.');
        setLoading(false);
        return;
      }

      setCertCode(match.certCode);
      setVerifyUrl(certData.verifyUrl || null);
      setCertHtml(buildCertHtml(certData));
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }, [projectName]);

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
   * Download — writes the certificate HTML to a local file and opens it.
   * iOS  → opens in Quick Look (Share › Save to Files to keep it)
   * Android → opens in the device's default browser / file viewer
   */
  const handleDownload = useCallback(async () => {
    if (!certHtml || downloading) return;
    setDownloading(true);
    try {
      const fileName = `RippleHub_Certificate_${certCode ?? 'cert'}.html`;
      const dirs = RNBlobUtil.fs.dirs;
      const filePath = `${Platform.OS === 'ios' ? dirs.DocumentDir : dirs.CacheDir}/${fileName}`;

      await RNBlobUtil.fs.writeFile(filePath, certHtml, 'utf8');

      if (Platform.OS === 'ios') {
        await RNBlobUtil.ios.openDocument(filePath);
      } else {
        await RNBlobUtil.android.actionViewIntent(filePath, 'text/html');
      }
    } catch {
      Alert.alert('Download Failed', 'Could not save the certificate. Please try again.');
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
              onPress={() => projectId && fetchAndBuild(projectId)}
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
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOutline]} onPress={handleShare} activeOpacity={0.85}>
                <Text style={styles.actionBtnOutlineText}>⬆  Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary, downloading && styles.actionBtnDisabled]}
                onPress={handleDownload}
                activeOpacity={0.85}
                disabled={downloading}
              >
                {downloading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.actionBtnPrimaryText}>⬇  Download PDF</Text>}
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
  shareBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.PRIMARY_LIGHT },
  shareBtnText:     { color: C.PRIMARY, fontSize: 13, fontWeight: '700' },

  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  errorIcon:        { fontSize: 48 },
  errorTitle:       { fontSize: 18, fontWeight: '700', color: C.TEXT },
  errorText:        { fontSize: 14, color: C.TEXT2, textAlign: 'center', lineHeight: 22 },
  loadingText:      { fontSize: 14, color: C.TEXT2, marginTop: 12 },
  retryBtn:         { marginTop: 8, paddingHorizontal: 28, paddingVertical: 10, borderRadius: 10, backgroundColor: C.PRIMARY },
  retryBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },

  webview:          { flex: 1 },
  webLoadOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },

  bottomBar:            { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.BORDER, backgroundColor: C.CARD },
  actionRow:            { flexDirection: 'row', gap: 10 },
  actionBtn:            { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  actionBtnOutline:     { borderWidth: 1.5, borderColor: C.PRIMARY },
  actionBtnOutlineText: { color: C.PRIMARY, fontSize: 14, fontWeight: '700' },
  actionBtnPrimary:     { backgroundColor: C.PRIMARY, ...AppConfig.SHADOW.BTN },
  actionBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionBtnDisabled:    { opacity: 0.6 },
});
