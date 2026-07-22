/**
 * QRScannerModal.tsx
 * Full-screen QR scanner for volunteer session check-in.
 * Uses react-native-vision-camera v5.
 *
 * SETUP (one-time after install):
 *   Android: camera permission already in AndroidManifest.xml
 *   iOS: NSCameraUsageDescription added to Info.plist
 *        Run: cd ios && pod install
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';
import AppConfig from '../../config/AppConfig';
import { projectApi } from '../../api/project.api';

const C = AppConfig.COLORS;

interface Props {
  visible:     boolean;
  projectId:   number;
  projectName: string;
  onClose:     () => void;
  onSuccess:   () => void;
}

type ScanState = 'idle' | 'checking' | 'success' | 'error';

export default function QRScannerModal({
  visible, projectId, projectName, onClose, onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const device                                         = useCameraDevice('back');
  const [permission, setPermission]                   = useState<'granted' | 'denied' | 'not-determined'>('not-determined');
  const [scanState,  setScanState]                    = useState<ScanState>('idle');
  const [errorMsg,   setErrorMsg]                     = useState('');
  const hasScanned                                     = useRef(false);

  // Reset state every time modal opens
  useEffect(() => {
    if (visible) {
      hasScanned.current = false;
      setScanState('idle');
      setErrorMsg('');
      requestPerm();
    }
  }, [visible]);

  const requestPerm = useCallback(async () => {
    const status = await Camera.requestCameraPermission();
    setPermission(status === 'granted' ? 'granted' : 'denied');
  }, []);

  const handleCode = useCallback(async (token: string) => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    setScanState('checking');
    try {
      const res = await projectApi.qrCheckIn(projectId, token);
      if (res.data?.isSuccess) {
        setScanState('success');
        setTimeout(() => { onSuccess(); onClose(); }, 1800);
      } else {
        setScanState('error');
        setErrorMsg(res.data?.message ?? 'Invalid QR. Please try again.');
        setTimeout(() => { hasScanned.current = false; setScanState('idle'); }, 2500);
      }
    } catch {
      setScanState('error');
      setErrorMsg('Network error. Please try again.');
      setTimeout(() => { hasScanned.current = false; setScanState('idle'); }, 2500);
    }
  }, [projectId, onSuccess, onClose]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      const val = codes[0]?.value;
      if (val && scanState === 'idle') handleCode(val);
    },
  });

  // ─── Not visible — render nothing ───
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header — paddingTop accounts for status bar / notch */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Scan QR to Check In</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{projectName}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        {permission !== 'granted' ? (
          /* Permission gate */
          <View style={styles.centered}>
            <Text style={styles.bigIcon}>📷</Text>
            <Text style={styles.stateTitle}>Camera Permission Needed</Text>
            <Text style={styles.stateMsg}>
              Allow camera access so RippleHub can scan the session QR code.
            </Text>
            <TouchableOpacity style={styles.actionBtn} onPress={requestPerm}>
              <Text style={styles.actionBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>

        ) : !device ? (
          /* No device */
          <View style={styles.centered}>
            <ActivityIndicator color={C.PRIMARY} size="large" />
            <Text style={styles.stateMsg}>Initialising camera…</Text>
          </View>

        ) : scanState === 'success' ? (
          /* Success */
          <View style={styles.centered}>
            <View style={[styles.resultCircle, { backgroundColor: '#D1FAE5' }]}>
              <Text style={{ fontSize: 56 }}>✅</Text>
            </View>
            <Text style={[styles.stateTitle, { color: C.TEAL }]}>Attendance Marked!</Text>
            <Text style={styles.stateMsg}>Your attendance has been recorded successfully.</Text>
          </View>

        ) : scanState === 'error' ? (
          /* Error */
          <View style={styles.centered}>
            <View style={[styles.resultCircle, { backgroundColor: '#FEE2E2' }]}>
              <Text style={{ fontSize: 56 }}>❌</Text>
            </View>
            <Text style={[styles.stateTitle, { color: C.RED }]}>Check-in Failed</Text>
            <Text style={styles.stateMsg}>{errorMsg}</Text>
          </View>

        ) : (
          /* Camera view */
          <>
            <View style={styles.cameraWrap}>
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={visible && scanState === 'idle'}
                codeScanner={codeScanner}
              />

              {/* Dark overlay with scan-frame cutout */}
              <View style={styles.overlayTop} />
              <View style={styles.overlayRow}>
                <View style={styles.overlaySide} />
                <View style={styles.scanFrame}>
                  {/* Corner accents */}
                  <View style={[styles.corner, styles.cTL]} />
                  <View style={[styles.corner, styles.cTR]} />
                  <View style={[styles.corner, styles.cBL]} />
                  <View style={[styles.corner, styles.cBR]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom} />

              {scanState === 'checking' && (
                <View style={styles.checkingOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={styles.checkingText}>Verifying…</Text>
                </View>
              )}
            </View>

            <View style={[styles.hintWrap, { paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
              <Text style={styles.hint}>
                Point your camera at the QR code shown by the project admin
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const FRAME  = 220;
const CORNER = 28;
const THICK  = 4;

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#000' },

  // Header — paddingTop set dynamically in JSX via Math.max(insets.top, 16)
  header:         {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111', paddingBottom: 16, paddingHorizontal: 20,
  },
  title:          { color: '#fff', fontSize: 17, fontWeight: '700' },
  subtitle:       { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  closeBtn:       {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Centered states
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  bigIcon:        { fontSize: 64, marginBottom: 16 },
  resultCircle:   { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  stateTitle:     { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  stateMsg:       { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  actionBtn:      {
    marginTop: 24, backgroundColor: C.PRIMARY,
    paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12,
  },
  actionBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Camera overlay
  cameraWrap:     { flex: 1, position: 'relative' },
  overlayTop:     { position: 'absolute', top: 0, left: 0, right: 0, height: '20%', backgroundColor: 'rgba(0,0,0,0.65)' },
  overlayRow:     { position: 'absolute', top: '20%', left: 0, right: 0, height: FRAME, flexDirection: 'row' },
  overlaySide:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  overlayBottom:  { position: 'absolute', bottom: 0, left: 0, right: 0, top: `calc(20% + ${FRAME}px)` as any, backgroundColor: 'rgba(0,0,0,0.65)' },

  scanFrame:      { width: FRAME, height: FRAME },
  corner:         { position: 'absolute', width: CORNER, height: CORNER },
  cTL:            { top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK, borderColor: C.PRIMARY, borderTopLeftRadius: 6 },
  cTR:            { top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK, borderColor: C.PRIMARY, borderTopRightRadius: 6 },
  cBL:            { bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK, borderColor: C.PRIMARY, borderBottomLeftRadius: 6 },
  cBR:            { bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK, borderColor: C.PRIMARY, borderBottomRightRadius: 6 },

  checkingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  checkingText:   { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Hint — paddingBottom set dynamically in JSX via Math.max(insets.bottom + 12, 20)
  hintWrap:       { backgroundColor: '#111', paddingTop: 20, paddingHorizontal: 24, alignItems: 'center' },
  hint:           { color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
