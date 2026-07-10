/**
 * Native UI Component Library — NGO Connect
 *
 * Every component here mirrors the prototype's CSS classes exactly:
 *   NCard      → .card    (borderRadius:16, elevation:3, no border)
 *   NCardSm    → .csm     (borderRadius:12, elevation:2)
 *   NBtn       → .btn-p   (primary, full-width, Pressable with ripple)
 *   NBtnOutline→ .btn-o   (outline primary)
 *   NBtnRed    → .btn-r
 *   NBtnGreen  → .btn-tl
 *   NBtnSm     → .btn-sm  (smaller, auto-width)
 *   NInput     → .fi      (form input with label)
 *   NTextArea  → .fta
 *   NTopbar    → .topbar  (screen header with optional back button)
 *   NAvatar    → .av      (circular avatar with initials)
 *   NPill      → .pill    (status badge)
 *   NSlab      → .slab    (section uppercase label)
 *   NDivider   → .divider
 *   NEmpty     → empty state with icon + message
 *
 * Usage in screens:
 *   import { NCard, NBtn, NTopbar, NAvatar, NPill } from '../../components/ui';
 */

import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import AppConfig from '../../config/AppConfig';

const C = AppConfig.COLORS;
const S = AppConfig.SHADOW;
const R = AppConfig.RADIUS;
const F = AppConfig.FONTS;

// ─────────────────────────────────────────────────────────────────────────────
// NCard — .card  (elevation shadow, borderRadius 16, no border line)
// ─────────────────────────────────────────────────────────────────────────────
interface NCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  small?: boolean;       // true → .csm (borderRadius 12, smaller shadow)
  noPad?: boolean;       // skip default padding
}
export function NCard({ children, style, small, noPad }: NCardProps) {
  const base = small ? ui.cardSm : ui.card;
  const pad  = noPad ? null : (small ? ui.cardSmPad : ui.cardPad);
  return <View style={[base, pad, style]}>{children}</View>;
}

// ─────────────────────────────────────────────────────────────────────────────
// NBtn — .btn-p  (full-width primary, Pressable with Android ripple)
// ─────────────────────────────────────────────────────────────────────────────
interface NBtnProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  color?: string;        // override background
}
export function NBtn({ label, onPress, loading, disabled, style, textStyle, color }: NBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
      style={({ pressed }) => [
        ui.btn,
        color ? { backgroundColor: color } : null,
        (disabled || loading) && ui.btnDisabled,
        pressed && ui.btnPressed,
        style,
      ]}>
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={[ui.btnText, textStyle]}>{label}</Text>}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NBtnOutline — .btn-o  (outline primary button)
// ─────────────────────────────────────────────────────────────────────────────
interface NBtnOutlineProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
}
export function NBtnOutline({ label, onPress, disabled, style, color }: NBtnOutlineProps) {
  const col = color ?? C.PRIMARY;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: col + '22', borderless: false }}
      style={({ pressed }) => [
        ui.btnOutline,
        { borderColor: col },
        pressed && { backgroundColor: col + '11' },
        style,
      ]}>
      <Text style={[ui.btnOutlineText, { color: col }]}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NBtnSm — .btn-sm  (small auto-width button)
// ─────────────────────────────────────────────────────────────────────────────
interface NBtnSmProps {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  outline?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}
export function NBtnSm({ label, onPress, color, textColor, outline, disabled, style }: NBtnSmProps) {
  const bg  = color ?? C.PRIMARY;
  const txt = textColor ?? '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: false }}
      style={({ pressed }) => [
        ui.btnSm,
        outline
          ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: bg }
          : { backgroundColor: bg },
        pressed && { opacity: 0.85 },
        style,
      ]}>
      <Text style={[ui.btnSmText, { color: outline ? bg : txt }]}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NInput — .fl + .fi  (labeled form input)
// ─────────────────────────────────────────────────────────────────────────────
interface NInputProps extends TextInputProps {
  label?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}
export function NInput({ label, required, containerStyle, style, ...rest }: NInputProps) {
  return (
    <View style={[ui.field, containerStyle]}>
      {label ? (
        <Text style={ui.fieldLabel}>
          {label}
          {required ? <Text style={{ color: C.RED }}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        style={[ui.input, style]}
        placeholderTextColor={C.TEXT3}
        {...rest}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NTextArea — .fta
// ─────────────────────────────────────────────────────────────────────────────
interface NTextAreaProps extends TextInputProps {
  label?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}
export function NTextArea({ label, required, containerStyle, style, ...rest }: NTextAreaProps) {
  return (
    <View style={[ui.field, containerStyle]}>
      {label ? (
        <Text style={ui.fieldLabel}>
          {label}
          {required ? <Text style={{ color: C.RED }}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        style={[ui.textarea, style]}
        placeholderTextColor={C.TEXT3}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        {...rest}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NTopbar — .topbar  (standard screen header)
// ─────────────────────────────────────────────────────────────────────────────
interface NTopbarProps {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}
export function NTopbar({ title, onBack, right, style }: NTopbarProps) {
  return (
    <View style={[ui.topbar, style]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          android_ripple={{ color: C.BORDER, borderless: true, radius: 20 }}
          style={ui.backBtn}
          hitSlop={10}>
          <Text style={ui.backArrow}>←</Text>
          <Text style={ui.backText}>Back</Text>
        </Pressable>
      ) : (
        <View style={{ width: 60 }} />
      )}
      <Text style={ui.topbarTitle} numberOfLines={1}>{title}</Text>
      <View style={[ui.topbarRight, !right && { width: 60 }]}>
        {right ?? null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAvatar — .av  (circular avatar with initials or color)
// size: 28 | 32 | 36 | 40 | 48 | 56
// ─────────────────────────────────────────────────────────────────────────────
interface NAvatarProps {
  initials: string;
  size?: 28 | 32 | 36 | 40 | 48 | 56;
  color?: string;        // background color
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}
export function NAvatar({ initials, size = 36, color, textColor, style }: NAvatarProps) {
  const s = size;
  const fontSize = s <= 28 ? 10 : s <= 36 ? 12 : s <= 40 ? 13 : s <= 48 ? 15 : 18;
  return (
    <View style={[
      ui.avatar,
      { width: s, height: s, borderRadius: s / 2, backgroundColor: color ?? C.PRIMARY },
      style,
    ]}>
      <Text style={[ui.avatarText, { fontSize, color: textColor ?? '#fff' }]}>
        {(initials ?? '?').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UserAvatar — photo-first avatar. Shows profile image when available,
// otherwise falls back to a coloured circle with generated initials.
//
// Usage:
//   <UserAvatar name={member.fullName} photoUrl={member.profilePhoto} size={40} />
// ─────────────────────────────────────────────────────────────────────────────

const UA_COLORS = ['#7C3AED', '#0891B2', '#16A34A', '#EA580C', '#DB2777', '#D97706', '#2563EB', '#059669'];

function _uaColor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) { h = (h * 31 + (name.charCodeAt(i))) % UA_COLORS.length; }
  return UA_COLORS[Math.abs(h)];
}

function _uaInitials(name: string): string {
  return (name || '?').trim().split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

interface UserAvatarProps {
  name:      string;
  photoUrl?: string | null;
  size?:     number;
  style?:    StyleProp<ViewStyle>;
}

export function UserAvatar({ name, photoUrl, size = 40, style }: UserAvatarProps) {
  const r = size / 2;
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[{ width: size, height: size, borderRadius: r }, style]}
        resizeMode="cover"
      />
    );
  }
  const fontSize = size <= 28 ? 10 : size <= 36 ? 12 : size <= 44 ? 14 : size <= 56 ? 17 : 20;
  return (
    <View style={[
      { width: size, height: size, borderRadius: r, backgroundColor: _uaColor(name), alignItems: 'center', justifyContent: 'center' },
      style,
    ]}>
      <Text style={{ fontSize, fontWeight: '700', color: '#fff' }}>{_uaInitials(name)}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NPill — .pill  (status badge / tag)
// variant controls color — matches prototype .pp .pg .po .py .pr .pb
// ─────────────────────────────────────────────────────────────────────────────
const PILL_VARIANTS: Record<string, { bg: string; text: string }> = {
  primary:  { bg: C.PRIMARY_LIGHT, text: C.PRIMARY },
  green:    { bg: '#E8F8F0',       text: '#16A34A'  },
  orange:   { bg: '#FFF4EE',       text: C.ORANGE   },
  yellow:   { bg: '#FFFBEB',       text: C.YELLOW   },
  red:      { bg: '#FFF0F0',       text: C.RED      },
  blue:     { bg: '#EFF6FF',       text: '#2563EB'  },
  teal:     { bg: '#E8F8F0',       text: '#0F766E'  },
  gray:     { bg: '#F1EFE8',       text: '#5F5E5A'  },
};
interface NPillProps {
  label: string;
  variant?: keyof typeof PILL_VARIANTS;
  bg?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}
export function NPill({ label, variant = 'primary', bg, textColor, style }: NPillProps) {
  const v = PILL_VARIANTS[variant] ?? PILL_VARIANTS.primary;
  return (
    <View style={[ui.pill, { backgroundColor: bg ?? v.bg }, style]}>
      <Text style={[ui.pillText, { color: textColor ?? v.text }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NSlab — .slab  (section uppercase label e.g. "NEARBY OPPORTUNITIES")
// ─────────────────────────────────────────────────────────────────────────────
export function NSlab({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[ui.slab, style]}>{label.toUpperCase()}</Text>;
}

// ─────────────────────────────────────────────────────────────────────────────
// NDivider — .divider
// ─────────────────────────────────────────────────────────────────────────────
export function NDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.divider, style]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEmpty — empty state placeholder
// ─────────────────────────────────────────────────────────────────────────────
interface NEmptyProps {
  icon?: string;
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
}
export function NEmpty({ icon, title, message, action }: NEmptyProps) {
  return (
    <View style={ui.empty}>
      {icon ? <Text style={ui.emptyIcon}>{icon}</Text> : null}
      {title ? <Text style={ui.emptyTitle}>{title}</Text> : null}
      <Text style={ui.emptyMsg}>{message}</Text>
      {action ? (
        <NBtnSm label={action.label} onPress={action.onPress} style={{ marginTop: 14 }} />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NProgress — .prog .pf  (progress bar)
// ─────────────────────────────────────────────────────────────────────────────
interface NProgressProps {
  pct: number;           // 0-100
  color?: string;        // bar fill color
  height?: number;
  style?: StyleProp<ViewStyle>;
}
export function NProgress({ pct, color = C.PRIMARY, height = 6, style }: NProgressProps) {
  return (
    <View style={[ui.progTrack, { height }, style]}>
      <View style={[ui.progFill, { width: `${Math.min(Math.max(pct, 0), 100)}%`, backgroundColor: color, height }]} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NStepBar — .step-bar  (wizard progress stepper)
// ─────────────────────────────────────────────────────────────────────────────
interface NStepBarProps {
  steps: string[];
  current: number;  // 0-based
}
export function NStepBar({ steps, current }: NStepBarProps) {
  return (
    <View style={ui.stepBar}>
      {steps.map((_, i) => (
        <React.Fragment key={i}>
          <View style={[
            ui.stepDot,
            i < current  ? ui.stepDone :
            i === current ? ui.stepActive :
                            ui.stepTodo,
          ]}>
            <Text style={[
              ui.stepNum,
              i <= current ? { color: '#fff' } : { color: C.TEXT2 },
            ]}>
              {i < current ? '✓' : String(i + 1)}
            </Text>
          </View>
          {i < steps.length - 1 && (
            <View style={[ui.stepLine, i < current && ui.stepLineDone]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared stylesheet
// ─────────────────────────────────────────────────────────────────────────────
const ui = StyleSheet.create({
  // ── Card ──
  card:       { backgroundColor: C.CARD, borderRadius: R.CARD, ...S.CARD },
  cardPad:    { padding: 15 },
  cardSm:     { backgroundColor: C.CARD, borderRadius: R.CARD_SM, ...S.CARD_SM },
  cardSmPad:  { padding: 12 },

  // ── Button ──
  btn:          { backgroundColor: C.PRIMARY, borderRadius: R.BTN, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', ...S.BTN },
  btnText:      { color: '#fff', fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  btnDisabled:  { backgroundColor: C.BG, ...{ elevation: 0, shadowOpacity: 0 } },
  btnPressed:   { opacity: 0.92 },
  btnOutline:   { backgroundColor: 'transparent', borderRadius: R.BTN, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.PRIMARY },
  btnOutlineText:{ fontSize: 13, fontWeight: '600', color: C.PRIMARY },
  btnSm:        { borderRadius: R.BTN_SM, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.PRIMARY },
  btnSmText:    { fontSize: 12, fontWeight: '600', color: '#fff' },

  // ── Input ──
  field:      { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: C.TEXT2, marginBottom: 5 },
  input:      { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: R.INPUT, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13, color: C.TEXT, fontFamily: undefined },
  textarea:   { backgroundColor: C.INPUT_BG, borderWidth: 1.5, borderColor: C.BORDER, borderRadius: R.INPUT, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13, color: C.TEXT, minHeight: 80, lineHeight: 20 },

  // ── Topbar ──
  topbar:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.CARD, paddingHorizontal: 12, paddingVertical: 12, ...S.TOPBAR },
  topbarTitle:  { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: C.TEXT },
  topbarRight:  { alignItems: 'flex-end' },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backArrow:    { fontSize: 18, color: C.TEXT2, lineHeight: 22 },
  backText:     { fontSize: 12, color: C.TEXT2, fontWeight: '500' },

  // ── Avatar ──
  avatar:     { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', color: '#fff' },

  // ── Pill ──
  pill:       { paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.PILL, alignSelf: 'flex-start' },
  pillText:   { fontSize: 10, fontWeight: '600' },

  // ── Slab ──
  slab:       { fontSize: 10, fontWeight: '600', color: C.TEXT2, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 },

  // ── Divider ──
  divider:    { height: 1, backgroundColor: C.BORDER, marginVertical: 10 },

  // ── Empty ──
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon:  { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.TEXT, marginBottom: 6, textAlign: 'center' },
  emptyMsg:   { fontSize: 13, color: C.TEXT2, textAlign: 'center', lineHeight: 20 },

  // ── Progress ──
  progTrack:  { backgroundColor: C.BORDER, borderRadius: 3, overflow: 'hidden' },
  progFill:   { borderRadius: 3 },

  // ── Step Bar ──
  stepBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, backgroundColor: C.CARD, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  stepDot:    { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepDone:   { backgroundColor: C.PRIMARY },
  stepActive: { backgroundColor: C.PRIMARY, shadowColor: C.PRIMARY, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  stepTodo:   { backgroundColor: C.BORDER },
  stepNum:    { fontSize: 11, fontWeight: '700' },
  stepLine:   { flex: 1, height: 2, backgroundColor: C.BORDER, marginHorizontal: 3 },
  stepLineDone:{ backgroundColor: C.PRIMARY },
});
