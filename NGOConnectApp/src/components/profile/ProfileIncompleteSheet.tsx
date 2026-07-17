/**
 * ProfileIncompleteSheet
 * Bottom sheet shown when user taps "Apply" or "Create Organisation" but
 * their profile is missing required information.
 *
 * Props:
 *   visible       — controls Modal visibility
 *   onClose       — dismiss without navigating
 *   missingItems  — human-readable list of what's missing
 *   targetStep    — which EditProfileScreen step to open (4 = Documents)
 */
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;

interface Props {
  visible:      boolean;
  onClose:      () => void;
  missingItems: string[];
  /** Which step index to open in EditProfileScreen. Defaults to 0 (Basic). Pass 4 for Documents. */
  targetStep?:  number;
}

export default function ProfileIncompleteSheet({
  visible, onClose, missingItems, targetStep = 0,
}: Props) {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const handleGoToProfile = () => {
    onClose();
    // Small delay so modal animates out before navigating
    setTimeout(() => {
      nav.navigate('EditProfile', { initialStep: targetStep });
    }, 200);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Complete Your Profile</Text>
              <Text style={styles.subtitle}>
                A complete profile is required before you can continue.
              </Text>
            </View>
          </View>

          {/* Missing items list */}
          <View style={styles.missingCard}>
            <Text style={styles.missingTitle}>Missing information:</Text>
            {missingItems.map((item, i) => (
              <View key={i} style={styles.missingRow}>
                <Text style={styles.missingDot}>✕</Text>
                <Text style={styles.missingText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleGoToProfile}
            accessibilityLabel="Go to profile to complete missing information"
          >
            <Text style={styles.primaryBtnText}>Update Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onClose}
            accessibilityLabel="Dismiss"
          >
            <Text style={styles.secondaryBtnText}>Later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.CARD,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingTop:           10,
    paddingHorizontal:    20,
  },
  handle: {
    width:           36,
    height:          4,
    borderRadius:    2,
    backgroundColor: C.BORDER,
    alignSelf:       'center',
    marginBottom:    16,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
    marginBottom:  16,
  },
  icon: {
    fontSize: 28,
    marginTop: 2,
  },
  title: {
    fontSize:   17,
    fontWeight: '800',
    color:      C.TEXT,
    marginBottom: 4,
  },
  subtitle: {
    fontSize:   13,
    color:      C.TEXT2,
    lineHeight: 18,
  },
  missingCard: {
    backgroundColor: '#FEF2F2',
    borderRadius:    12,
    padding:         14,
    marginBottom:    16,
    borderWidth:     1,
    borderColor:     '#FECACA',
  },
  missingTitle: {
    fontSize:     11,
    fontWeight:   '700',
    color:        '#DC2626',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  4,
  },
  missingDot: {
    fontSize:   12,
    color:      '#DC2626',
    fontWeight: '700',
    width:      14,
    textAlign:  'center',
  },
  missingText: {
    fontSize:   13,
    color:      '#991B1B',
    fontWeight: '500',
    flex:       1,
  },
  primaryBtn: {
    backgroundColor: C.PRIMARY,
    paddingVertical: 14,
    borderRadius:    14,
    alignItems:      'center',
    marginBottom:    10,
  },
  primaryBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   15,
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems:      'center',
  },
  secondaryBtnText: {
    color:      C.TEXT2,
    fontWeight: '600',
    fontSize:   14,
  },
});
