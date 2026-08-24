import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { fmtDate, fmtTime, isProjectExpired } from '../../utils/dateUtils';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, TextInput, Alert, Modal, RefreshControl, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppConfig from '../../config/AppConfig';
import { projectApi } from '../../api/project.api';

// Declared here so CalendarPicker and all StyleSheet.create() calls below can use it
const C_CONST = AppConfig.COLORS;
import { useAdminStore } from '../../store/adminStore';
import { getMyOrgs } from '../../api/user.api';

type Tab = 'UPCOMING' | 'CLOSING' | 'COMPLETED' | 'CANCELLED';
const TABS: Tab[] = ['UPCOMING', 'CLOSING', 'COMPLETED', 'CANCELLED'];
const TAB_LABELS: Record<Tab, string> = {
  UPCOMING: 'Upcoming', CLOSING: 'Closing', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

interface AdminProject {
  projectId: number;
  projectName: string;
  category: string;
  projectTypeCode: string;
  projectType: string;
  statusCode: string;
  city?: string;
  state?: string;
  maxVolunteers?: number;
  approvedCount?: number;
  isPublic?: boolean;
  oneTimeDate?: string;
  recurStart?: string;
  recurEnd?: string;
  recurDays?: string;
  sessionStartTime?: string;
  sessionEndTime?: string;
  flexFromDate?: string;
  flexToDate?: string;
  cancelReason?: string;
  cancelledAt?: string;
  impactSummary?: string;
  beneficiaryCount?: number;
  createdAt?: string;
}

function mapRow(r: any): AdminProject {
  return {
    projectId:      r.projectId,
    projectName:    r.projectName,
    category:       r.category,
    projectTypeCode: r.projectTypeCode,
    projectType:    r.projectType,
    statusCode:     r.statusCode,
    city:           r.city,
    state:          r.state,
    maxVolunteers:  r.maxVolunteers,
    approvedCount:  r.approvedCount ?? 0,
    isPublic:       r.isPublic,
    oneTimeDate:    r.oneTimeDate,
    recurStart:     r.recurStart,
    recurEnd:       r.recurEnd,
    recurDays:      r.recurDays,
    sessionStartTime: r.sessionStartTime,
    sessionEndTime:   r.sessionEndTime,
    flexFromDate:   r.flexFromDate,
    flexToDate:     r.flexToDate,
    cancelReason:   r.cancelReason,
    cancelledAt:    r.cancelledAt,
    impactSummary:  r.impactSummary,
    beneficiaryCount: r.beneficiaryCount,
    createdAt:      r.createdAt,
  };
}


// ─── Unified ProjectCard ─────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ONE_TIME:  { label: 'One-time',  bg: '#f3f4f6', text: '#6b7280' },
  RECURRING: { label: 'Recurring', bg: '#ecfdf5', text: '#10b981' },
  FLEXIBLE:  { label: 'Flexible',  bg: '#fffbeb', text: '#f59e0b' },
};

interface DateInfo {
  fromDate:  string | null;
  toDate:    string | null;
  startTime: string | null;
  endTime:   string | null;
  recurDays: string | null;
}

function getDateInfo(p: AdminProject): DateInfo {
  const tc        = p.projectTypeCode;
  const startTime = p.sessionStartTime ? fmtTime(p.sessionStartTime) : null;
  const endTime   = p.sessionEndTime   ? fmtTime(p.sessionEndTime)   : null;
  const recurDays = p.recurDays
    ? String(p.recurDays).split(',').map(d => d.trim().slice(0, 3)).join(' · ')
    : null;
  if (tc === 'ONE_TIME') return { fromDate: fmtDate(p.oneTimeDate), toDate: null, startTime, endTime, recurDays: null };
  if (tc === 'RECURRING') return { fromDate: fmtDate(p.recurStart), toDate: fmtDate(p.recurEnd), startTime, endTime, recurDays };
  return { fromDate: fmtDate(p.flexFromDate), toDate: fmtDate(p.flexToDate), startTime, endTime, recurDays: null };
}

const BADGE_CONFIG: Record<string, { label: string; bgStyle: object; textColor: string }> = {
  ACTIVE:    { label: 'Active',    bgStyle: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }, textColor: '#16a34a' },
  UPCOMING:  { label: 'Upcoming',  bgStyle: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }, textColor: '#2563eb' },
  CLOSING:   { label: 'Closing',   bgStyle: { backgroundColor: '#fffbeb', borderColor: '#fde68a' }, textColor: '#d97706' },
  COMPLETED: { label: 'Completed', bgStyle: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }, textColor: '#16a34a' },
  CANCELLED: { label: 'Cancelled', bgStyle: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }, textColor: '#be123c' },
  EXPIRED:   { label: 'Expired',   bgStyle: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }, textColor: '#c2410c' },
};

function ProjectCard({
  p, tab, onManage,
}: {
  p:         AdminProject;
  tab:       Tab;
  onManage?: () => void;
  // label is derived from tab inside the component
}) {
  const C = AppConfig.COLORS;

  // UPCOMING-status projects moved client-side into CANCELLED bucket (date passed, never started)
  const isExpiredUnstarted = tab === 'CANCELLED' && p.statusCode === 'UPCOMING';
  // ACTIVE projects whose end date has already passed — still on UPCOMING tab, need admin action
  const isExpiredActive    = tab === 'UPCOMING'  && p.statusCode === 'ACTIVE' && isProjectExpired(p);

  const max       = p.maxVolunteers ?? 0;
  const approved  = p.approvedCount ?? 0;
  const remaining = max > 0 ? Math.max(max - approved, 0) : null;
  const pct       = max > 0 ? Math.min((approved / max) * 100, 100) : 0;
  const barColor  = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f97316' : C.PRIMARY;

  const type  = TYPE_CONFIG[p.projectTypeCode] ?? { label: p.projectType ?? p.projectTypeCode, bg: '#f3f4f6', text: '#6b7280' };
  const di    = getDateInfo(p);
  const badge = (isExpiredUnstarted || isExpiredActive)
    ? BADGE_CONFIG.EXPIRED
    : BADGE_CONFIG[p.statusCode] ?? BADGE_CONFIG.CANCELLED;

  return (
    <View style={s.card}>

      {/* ── Row 1: Title + Status badge ── */}
      <View style={s.cardTitleRow}>
        <Text style={s.cardTitle} numberOfLines={2}>{p.projectName}</Text>
        <View style={[s.activeBadge, badge.bgStyle]}>
          <Text style={[s.activeBadgeText, { color: badge.textColor }]}>{badge.label}</Text>
        </View>
      </View>

      {/* ── Row 2: Type pill + recurring days ── */}
      <View style={s.typePillRow}>
        <View style={[s.typePill, { backgroundColor: type.bg }]}>
          <Text style={[s.typePillText, { color: type.text }]}>{type.label}</Text>
        </View>
        {di.recurDays ? (
          <Text style={s.recurDaysText}>{di.recurDays}</Text>
        ) : null}
      </View>

      {/* ── Row 3: Date range (From → To) ── */}
      {di.fromDate ? (
        <View style={s.cardInfoRow}>
          <Text style={s.cardInfoIcon}>📅</Text>
          <Text style={s.cardInfoText}>
            {di.fromDate}{di.toDate ? ` → ${di.toDate}` : ''}
          </Text>
        </View>
      ) : null}

      {/* ── Row 4: Session time ── */}
      {di.startTime ? (
        <View style={s.cardInfoRow}>
          <Text style={s.cardInfoIcon}>🕐</Text>
          <Text style={s.cardInfoText}>
            {di.startTime}{di.endTime ? ` – ${di.endTime}` : ''}
          </Text>
        </View>
      ) : null}

      {/* ── Row 5: Location ── */}
      {(p.city || p.state) ? (
        <View style={s.cardInfoRow}>
          <Text style={s.cardInfoIcon}>📍</Text>
          <Text style={s.cardInfoText}>{[p.city, p.state].filter(Boolean).join(', ')}</Text>
        </View>
      ) : null}

      {/* ── Row 6: Capacity ── */}
      <View style={{ marginTop: 8 }}>
        {max > 0 ? (
          <>
            <View style={s.capacityRow}>
              <Text style={s.capacityText}>
                <Text style={{ color: '#1e293b', fontWeight: '700' }}>{approved}</Text>
                /{max} per session
              </Text>
              <Text style={[s.capacityRemaining, {
                color: remaining === 0 ? '#ef4444' : (remaining ?? 99) <= 3 ? '#f97316' : '#10b981',
              }]}>
                {remaining === 0 ? 'Full' : `${remaining} remaining`}
              </Text>
            </View>
            {(tab === 'ACTIVE' || tab === 'UPCOMING') ? (
              <View style={s.progressWrap}>
                <View style={[s.progressBar, { width: `${pct}%` as any, backgroundColor: barColor }]} />
              </View>
            ) : null}
          </>
        ) : (
          <Text style={s.unlimitedText}>👥 Open / Unlimited</Text>
        )}
      </View>

      {/* ── Tab-specific extras ── */}

      {isExpiredUnstarted ? (
        <View style={[s.cancelBox, { backgroundColor: '#fff7ed', borderColor: '#fed7aa', marginTop: 10 }]}>
          <Text style={[s.cancelLabel, { color: '#c2410c' }]}>NOT STARTED</Text>
          <Text style={[s.cancelText, { color: '#9a3412' }]}>
            This project passed its scheduled date without being started.
          </Text>
        </View>
      ) : null}

      {isExpiredActive ? (
        <View style={[s.cancelBox, { backgroundColor: '#fff7ed', borderColor: '#fed7aa', marginTop: 10 }]}>
          <Text style={[s.cancelLabel, { color: '#c2410c' }]}>PAST DUE</Text>
          <Text style={[s.cancelText, { color: '#9a3412' }]}>
            This project's schedule has ended. Please mark it as Completed or Closed.
          </Text>
        </View>
      ) : null}

      {tab === 'CANCELLED' && !isExpiredUnstarted ? (
        <>
          {p.cancelledAt ? (
            <Text style={[s.cardMeta, { marginTop: 8 }]}>Cancelled: {fmtDate(p.cancelledAt)}</Text>
          ) : null}
          {p.cancelReason ? (
            <View style={[s.cancelBox, { marginTop: 8 }]}>
              <Text style={s.cancelLabel}>Reason</Text>
              <Text style={s.cancelText}>{p.cancelReason}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {tab === 'COMPLETED' ? (
        <>
          {p.impactSummary ? (
            <View style={[s.impactBox, { marginTop: 10 }]}>
              <Text style={s.impactText}>{p.impactSummary}</Text>
            </View>
          ) : null}
          {p.beneficiaryCount ? (
            <Text style={[s.cardMeta, { marginTop: 6 }]}>Beneficiaries: {p.beneficiaryCount}</Text>
          ) : null}
        </>
      ) : null}

      {/* ── Footer link — Manage for upcoming, View Details for completed/cancelled ── */}
      {onManage ? (
        <View style={[s.cardFooterRow, { marginTop: 10 }]}>
          <View />
          <TouchableOpacity onPress={onManage}>
            <Text style={s.manageLink}>
              {tab === 'UPCOMING' ? 'Manage ›' : 'View Details ›'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CalendarPicker — no external dependency, pure RN
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEK_DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function fmtCalDate(d: Date | null): string {
  if (!d) return '';
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function CalendarPicker({
  visible, title, selected, minDate, maxDate, onSelect, onClose,
}: {
  visible:   boolean;
  title:     string;
  selected:  Date | null;
  minDate?:  Date | null;
  maxDate?:  Date | null;
  onSelect:  (d: Date) => void;
  onClose:   () => void;
}) {
  const today  = new Date();
  const initD  = selected ?? today;
  const [viewY, setViewY] = useState(initD.getFullYear());
  const [viewM, setViewM] = useState(initD.getMonth());

  useEffect(() => {
    if (visible) {
      const d = selected ?? today;
      setViewY(d.getFullYear());
      setViewM(d.getMonth());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const prevMonth = () => {
    setViewM(m => {
      if (m === 0) { setViewY(y => y - 1); return 11; }
      return m - 1;
    });
  };
  const nextMonth = () => {
    setViewM(m => {
      if (m === 11) { setViewY(y => y + 1); return 0; }
      return m + 1;
    });
  };

  const firstWeekday  = new Date(viewY, viewM, 1).getDay();
  const daysInMonth   = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isSel  = (d: number) =>
    !!selected && selected.getFullYear() === viewY && selected.getMonth() === viewM && selected.getDate() === d;
  const isTdy  = (d: number) =>
    today.getFullYear() === viewY && today.getMonth() === viewM && today.getDate() === d;
  const isDis  = (d: number) => {
    const dt = new Date(viewY, viewM, d);
    if (minDate) { const mn = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()); if (dt < mn) return true; }
    if (maxDate) { const mx = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()); if (dt > mx) return true; }
    return false;
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={cal.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={cal.sheet} activeOpacity={1}>

          <Text style={cal.title}>{title}</Text>
          {selected && (
            <Text style={cal.selectedLabel}>{fmtCalDate(selected)}</Text>
          )}

          {/* Month navigation */}
          <View style={cal.nav}>
            <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
              <Text style={cal.arrow}>‹</Text>
            </TouchableOpacity>
            <Text style={cal.monthLabel}>{MONTH_FULL[viewM]} {viewY}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
              <Text style={cal.arrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={cal.weekRow}>
            {WEEK_DAYS.map((d, i) => (
              <Text key={i} style={[cal.weekDay, (i === 0 || i === 6) && { color: '#ef4444' }]}>{d}</Text>
            ))}
          </View>

          {/* Date grid */}
          <View style={cal.grid}>
            {cells.map((day, idx) => {
              if (day === null) return <View key={idx} style={cal.cell} />;
              const sel = isSel(day);
              const tdy = isTdy(day);
              const dis = isDis(day);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[cal.cell, sel && cal.cellSel, tdy && !sel && cal.cellToday]}
                  onPress={() => !dis && onSelect(new Date(viewY, viewM, day))}
                  disabled={dis}
                  activeOpacity={0.65}
                >
                  <Text style={[cal.cellTxt, sel && cal.cellTxtSel, tdy && !sel && cal.cellTxtToday, dis && cal.cellTxtDis]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Done / Cancel */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              style={[cal.btn, { backgroundColor: '#f1f5f9', flex: 1 }]}
              onPress={onClose}
            >
              <Text style={[cal.btnTxt, { color: '#475569' }]}>Cancel</Text>
            </TouchableOpacity>
            {selected && (
              <TouchableOpacity
                style={[cal.btn, { backgroundColor: C_CONST.PRIMARY, flex: 1 }]}
                onPress={onClose}
              >
                <Text style={cal.btnTxt}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const cal = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  title:        { fontSize: 16, fontWeight: '700', color: '#1e293b', textAlign: 'center', marginBottom: 2 },
  selectedLabel:{ fontSize: 13, color: C_CONST.PRIMARY, textAlign: 'center', fontWeight: '600', marginBottom: 12 },
  nav:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  arrow:        { fontSize: 30, color: C_CONST.PRIMARY, lineHeight: 34, paddingHorizontal: 4 },
  monthLabel:   { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  weekRow:      { flexDirection: 'row', marginBottom: 4 },
  weekDay:      { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  grid:         { flexDirection: 'row', flexWrap: 'wrap' },
  cell:         { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 99 },
  cellSel:      { backgroundColor: C_CONST.PRIMARY },
  cellToday:    { borderWidth: 1.5, borderColor: C_CONST.PRIMARY },
  cellTxt:      { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  cellTxtSel:   { color: '#fff', fontWeight: '700' },
  cellTxtToday: { color: C_CONST.PRIMARY, fontWeight: '700' },
  cellTxtDis:   { color: '#d1d5db' },
  btn:          { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnTxt:       { color: '#fff', fontSize: 14, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminProjectsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const { selectedOrg, setAdminOrgs, setSelectedOrg } = useAdminStore();
  const activeOrgId = selectedOrg?.orgId;

  // Load orgs if store is empty (e.g. deep-link or app restart)
  useEffect(() => {
    if (selectedOrg) return;
    getMyOrgs().then(res => {
      const all = (res.data?.data ?? []) as any[];
      const adminOrgs = all.filter((o: any) => ['FOUNDER','ADMIN'].includes(o.roleCode));
      if (adminOrgs.length > 0) {
        setAdminOrgs(adminOrgs);
        setSelectedOrg(adminOrgs[0]);
      }
    }).catch(() => {});
  }, [selectedOrg, setAdminOrgs, setSelectedOrg]);
  const C = AppConfig.COLORS;

  const [activeTab, setActiveTab] = useState<Tab>('UPCOMING');
  const [projects, setProjects] = useState<Record<Tab, AdminProject[]>>({
    UPCOMING: [], CLOSING: [], COMPLETED: [], CANCELLED: [],
  });
  const [loading, setLoading] = useState<Record<Tab, boolean>>({
    UPCOMING: false, CLOSING: false, COMPLETED: false, CANCELLED: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const loadedTabs = useRef<Set<Tab>>(new Set());

  // ── Swipe to change tab ──────────────────────────────────────────────────────
  const swipeState = useRef({ tab: 'UPCOMING' as Tab, handleTabChange: (_t: Tab) => {} });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        const { tab: curTab, handleTabChange } = swipeState.current;
        const idx = TABS.indexOf(curTab);
        if ((dx < -40 || vx < -0.4) && idx < TABS.length - 1) handleTabChange(TABS[idx + 1]);
        else if ((dx > 40 || vx > 0.4) && idx > 0) handleTabChange(TABS[idx - 1]);
      },
    })
  ).current;

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<AdminProject | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // ── Filter state ──────────────────────────────────────────────────────────────
  const [searchText,      setSearchText]      = useState('');
  const [fromDate,        setFromDate]        = useState<Date | null>(null);
  const [toDate,          setToDate]          = useState<Date | null>(null);
  const [fromPickerOpen,  setFromPickerOpen]  = useState(false);
  const [toPickerOpen,    setToPickerOpen]    = useState(false);

  const extractItems = (res: any): any[] => {
    const raw = res.data?.data;
    return Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  };

  const loadTab = useCallback(async (tab: Tab, force = false) => {
    if (!activeOrgId) return;
    if (!force && loadedTabs.current.has(tab)) return;
    setLoading(prev => ({ ...prev, [tab]: true }));
    try {
      if (tab === 'UPCOMING') {
        // Fetch ACTIVE + UPCOMING in parallel; merge into one list (active first)
        const [activeRes, upcomingRes] = await Promise.all([
          projectApi.list({ orgId: activeOrgId, statusCode: 'ACTIVE',   pageNumber: 1, pageSize: 50 }),
          projectApi.list({ orgId: activeOrgId, statusCode: 'UPCOMING', pageNumber: 1, pageSize: 50 }),
        ]);
        const merged = [...extractItems(activeRes), ...extractItems(upcomingRes)].map(mapRow);
        setProjects(prev => ({ ...prev, UPCOMING: merged }));
      } else if (tab === 'CLOSING') {
        const res = await projectApi.list({ orgId: activeOrgId, statusCode: 'CLOSING', pageNumber: 1, pageSize: 50 });
        setProjects(prev => ({ ...prev, CLOSING: extractItems(res).map(mapRow) }));
      } else {
        const res = await projectApi.list({
          orgId: activeOrgId,
          statusCode: tab,
          pageNumber: 1,
          pageSize: 50,
        });
        setProjects(prev => ({ ...prev, [tab]: extractItems(res).map(mapRow) }));
      }
      loadedTabs.current.add(tab);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load projects';
      Alert.alert('Error', msg);
    } finally {
      setLoading(prev => ({ ...prev, [tab]: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  useFocusEffect(useCallback(() => {
    loadedTabs.current.clear();
    // Load all tabs in parallel so counts are visible immediately
    TABS.forEach(tab => loadTab(tab, true));
  }, [loadTab]));

  const onTabPress = (tab: Tab) => {
    setActiveTab(tab);
    loadTab(tab);
  };
  swipeState.current = { tab: activeTab, handleTabChange: onTabPress };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadedTabs.current.delete(activeTab);
    await loadTab(activeTab, true);
    setRefreshing(false);
  }, [activeTab, loadTab]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await projectApi.cancel(cancelTarget.projectId, cancelReason.trim() || undefined);
      if (res.data?.isSuccess) {
        setCancelTarget(null);
        setCancelReason('');
        loadedTabs.current.delete('UPCOMING');
        loadedTabs.current.delete('CLOSING');
        loadedTabs.current.delete('CANCELLED');
        await loadTab('UPCOMING', true);
        if (activeTab === 'CANCELLED') await loadTab('CANCELLED', true);
      } else {
        Alert.alert('Error', res.data?.message ?? 'Could not cancel project.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setCancelling(false);
    }
  };

  // ── Filter helpers ────────────────────────────────────────────────────────────

  function parseIsoDate(str?: string | null): Date | null {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function projectInDateRange(p: AdminProject, from: Date | null, to: Date | null): boolean {
    if (!from && !to) return true;
    const startStr = p.oneTimeDate ?? p.recurStart ?? p.flexFromDate;
    const endStr   = p.recurEnd ?? p.flexToDate ?? startStr;
    if (!startStr) return true;
    const projStart = parseIsoDate(startStr);
    const projEnd   = parseIsoDate(endStr ?? startStr);
    if (!projStart) return true;
    const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (from && projEnd && dayOnly(projEnd)   < dayOnly(from)) return false;
    if (to   && projStart && dayOnly(projStart) > dayOnly(to)) return false;
    return true;
  }

  const hasFilters = searchText.trim() !== '' || fromDate !== null || toDate !== null;

  // Apply filters to every tab so tab counts also reflect filtered state.
  // UPCOMING status projects that have expired are pushed into the CANCELLED bucket.
  // ACTIVE status projects always stay in UPCOMING (admin must manually complete them).
  // CLOSING projects whose statusCode has changed to COMPLETED/CANCELLED (stale cache after
  // finalization/cancellation from AdminProjectDetailScreen) are redirected to their correct tab.
  const filteredAll = useMemo<Record<Tab, AdminProject[]>>(() => {
    const expiredUnstarted = projects['UPCOMING'].filter(
      p => p.statusCode === 'UPCOMING' && isProjectExpired(p),
    );
    const stillUpcoming = projects['UPCOMING'].filter(
      p => !(p.statusCode === 'UPCOMING' && isProjectExpired(p)),
    );

    // Redirect stale CLOSING entries that were finalized or cancelled elsewhere
    const genuineClosing   = projects['CLOSING'].filter(p => p.statusCode === 'CLOSING');
    const closingCompleted = projects['CLOSING'].filter(p => p.statusCode === 'COMPLETED');
    const closingCancelled = projects['CLOSING'].filter(p => p.statusCode === 'CANCELLED');

    const source: Record<Tab, AdminProject[]> = {
      ...projects,
      UPCOMING:  stillUpcoming,
      CLOSING:   genuineClosing,
      COMPLETED: [...projects['COMPLETED'], ...closingCompleted].filter(
        (p, i, arr) => arr.findIndex(x => x.projectId === p.projectId) === i,
      ),
      CANCELLED: [...projects['CANCELLED'], ...expiredUnstarted, ...closingCancelled].filter(
        (p, i, arr) => arr.findIndex(x => x.projectId === p.projectId) === i,
      ),
    };

    const result = {} as Record<Tab, AdminProject[]>;
    for (const tab of TABS) {
      result[tab] = source[tab].filter(p => {
        const matchesText = !searchText.trim() ||
          p.projectName.toLowerCase().includes(searchText.trim().toLowerCase());
        const matchesDate = projectInDateRange(p, fromDate, toDate);
        return matchesText && matchesDate;
      });
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, searchText, fromDate, toDate]);

  function clearAllFilters() {
    setSearchText(''); setFromDate(null); setToDate(null);
  }

  // ── Render data ───────────────────────────────────────────────────────────────

  const isLoading = loading[activeTab];

  const renderItem = ({ item }: { item: AdminProject }) => (
    <ProjectCard
      p={item}
      tab={activeTab}
      onManage={() => nav.navigate('AdminProjectDetail', { projectId: item.projectId, orgId: activeOrgId })}
    />
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Projects</Text>
          <Text style={s.headerSub}>Admin · {selectedOrg?.orgName ?? ''}</Text>
        </View>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => nav.navigate('CreateProject', { orgId: activeOrgId })}
        >
          <Text style={s.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* ── Filter bar ── */}
      {/* Row 1: Search */}
      <View style={s.filterBar}>
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search projects..."
            placeholderTextColor="#94a3b8"
            style={s.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.searchClear}>×</Text>
            </TouchableOpacity>
          )}
        </View>
        {hasFilters && (
          <TouchableOpacity onPress={clearAllFilters} style={s.clearBtn}>
            <Text style={s.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Row 2: Date range chips */}
      <View style={s.dateRow}>
        {/* From chip */}
        <TouchableOpacity
          style={[s.dateChip, fromDate && s.dateChipActive]}
          onPress={() => setFromPickerOpen(true)}
        >
          <Text style={s.dateChipIcon}>📅</Text>
          <Text style={[s.dateChipText, fromDate && { color: C.PRIMARY }]}>
            {fromDate ? fmtCalDate(fromDate) : 'From date'}
          </Text>
          {fromDate ? (
            <TouchableOpacity
              onPress={e => { e.stopPropagation?.(); setFromDate(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={s.dateChipClear}>×</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>

        <Text style={s.dateArrow}>→</Text>

        {/* To chip */}
        <TouchableOpacity
          style={[s.dateChip, toDate && s.dateChipActive]}
          onPress={() => setToPickerOpen(true)}
        >
          <Text style={s.dateChipIcon}>📅</Text>
          <Text style={[s.dateChipText, toDate && { color: C.PRIMARY }]}>
            {toDate ? fmtCalDate(toDate) : 'To date'}
          </Text>
          {toDate ? (
            <TouchableOpacity
              onPress={e => { e.stopPropagation?.(); setToDate(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={s.dateChipClear}>×</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Active filter summary */}
      {hasFilters && (
        <View style={s.filterSummary}>
          <Text style={s.filterSummaryText}>
            {[
              searchText.trim() ? `"${searchText.trim()}"` : null,
              fromDate && toDate ? `${fmtCalDate(fromDate)} – ${fmtCalDate(toDate)}`
                : fromDate ? `From ${fmtCalDate(fromDate)}`
                : toDate   ? `To ${fmtCalDate(toDate)}`
                : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
      )}

      {/* Calendar pickers */}
      <CalendarPicker
        visible={fromPickerOpen}
        title="Select From Date"
        selected={fromDate}
        maxDate={toDate ?? undefined}
        onSelect={d => { setFromDate(d); setFromPickerOpen(false); }}
        onClose={() => setFromPickerOpen(false)}
      />
      <CalendarPicker
        visible={toPickerOpen}
        title="Select To Date"
        selected={toDate}
        minDate={fromDate ?? undefined}
        onSelect={d => { setToDate(d); setToPickerOpen(false); }}
        onClose={() => setToPickerOpen(false)}
      />

      {/* Swipe area — wraps tab bar + list */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map(tab => {
          const cnt = filteredAll[tab].length;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tab, activeTab === tab && s.tabActive]}
              onPress={() => onTabPress(tab)}
            >
              <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                {TAB_LABELS[tab]}{cnt > 0 ? ` (${cnt})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.PRIMARY} size="large" />
        </View>
      ) : filteredAll[activeTab].length === 0 ? (
        <View style={s.center}>
          {hasFilters ? (
            <>
              <Text style={s.emptyIcon}>🔍</Text>
              <Text style={s.emptyTitle}>No matches found</Text>
              <Text style={s.emptyText}>Try adjusting your search or date range.</Text>
              <TouchableOpacity style={[s.newBtn, { marginTop: 12 }]} onPress={clearAllFilters}>
                <Text style={s.newBtnText}>Clear Filters</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.emptyIcon}>
                {activeTab === 'UPCOMING' ? '📅' : activeTab === 'CLOSING' ? '⏳' : activeTab === 'COMPLETED' ? '✅' : '❌'}
              </Text>
              <Text style={s.emptyTitle}>No {TAB_LABELS[activeTab]} Projects</Text>
              <Text style={s.emptyText}>
                {activeTab === 'UPCOMING'
                  ? 'No active or upcoming projects yet.'
                  : `No ${TAB_LABELS[activeTab].toLowerCase()} projects found.`}
              </Text>
              {activeTab === 'UPCOMING' && (
                <TouchableOpacity
                  style={[s.newBtn, { marginTop: 16, backgroundColor: C.PRIMARY }]}
                  onPress={() => nav.navigate('CreateProject', { orgId: activeOrgId })}
                >
                  <Text style={[s.newBtnText, { color: '#fff' }]}>+ Create Project</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredAll[activeTab]}
          keyExtractor={item => String(item.projectId)}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.PRIMARY} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      </View>{/* end swipe area */}

      {/* Cancel modal */}
      <Modal visible={!!cancelTarget} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Cancel Project</Text>
            <Text style={s.modalSubtitle}>{cancelTarget?.projectName}</Text>
            <Text style={s.modalLabel}>Reason (optional)</Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Why is this project being cancelled?"
              placeholderTextColor="#94a3b8"
              multiline
              style={s.cancelInput}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: '#f1f5f9' }]}
                onPress={() => { setCancelTarget(null); setCancelReason(''); }}
              >
                <Text style={[s.modalBtnText, { color: '#475569' }]}>Keep Project</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: '#dc2626' }]}
                onPress={confirmCancel}
                disabled={cancelling}
              >
                {cancelling
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalBtnText}>Cancel Project</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  headerSub:   { fontSize: 11, color: '#64748b', marginTop: 1 },
  newBtn: {
    backgroundColor: C_CONST.PRIMARY + '18', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: C_CONST.PRIMARY + '40',
  },
  newBtnText: { fontSize: 13, fontWeight: '700', color: C_CONST.PRIMARY },
  // Filter bar
  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchIcon:  { fontSize: 13, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 13, color: '#1e293b', padding: 0 },
  searchClear: { fontSize: 18, color: '#94a3b8', lineHeight: 20, paddingLeft: 4 },
  // Date range row
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  dateChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f8fafc', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  dateChipActive:  { borderColor: C_CONST.PRIMARY, backgroundColor: `${C_CONST.PRIMARY}0D` },
  dateChipIcon:    { fontSize: 12 },
  dateChipText:    { flex: 1, fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  dateChipClear:   { fontSize: 16, color: '#94a3b8', lineHeight: 18 },
  dateArrow:       { fontSize: 14, color: '#94a3b8' },
  clearBtn:        { paddingHorizontal: 8, paddingVertical: 8 },
  clearBtnText:    { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  filterSummary: {
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: `${C_CONST.PRIMARY}08`,
    borderBottomWidth: 1, borderBottomColor: `${C_CONST.PRIMARY}20`,
  },
  filterSummaryText: { fontSize: 11, color: C_CONST.PRIMARY, fontWeight: '500' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: C_CONST.PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: C_CONST.PRIMARY },
  list: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  // Card base
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  cardTitleRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 8, marginBottom: 6,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1e293b' },
  activeBadge: {
    backgroundColor: '#f0fdf4', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: '#bbf7d0', flexShrink: 0,
  },
  activeBadgeText: { fontSize: 11, color: '#16a34a', fontWeight: '700' },
  // Type pill
  typePillRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  typePill:      { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12 },
  typePillText:  { fontSize: 11, fontWeight: '700' },
  recurDaysText: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  // Info rows (date, time, location)
  cardInfoRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardInfoIcon: { fontSize: 12, width: 20, textAlign: 'center' as const },
  cardInfoText: { fontSize: 12, color: '#475569', fontWeight: '500', flex: 1 },
  // Capacity
  capacityRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  capacityText:      { fontSize: 12, color: '#64748b' },
  capacityRemaining: { fontSize: 12, fontWeight: '700' },
  unlimitedText:     { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  // Legacy (kept for potential reuse)
  cardMeta: { fontSize: 12, color: '#64748b', marginTop: 6 },
  progressWrap: {
    height: 6, backgroundColor: '#f1f5f9', borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  cardFooterRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 6,
  },
  qrLink: { fontSize: 12, color: C_CONST.PRIMARY, fontWeight: '700' },
  manageLink: { fontSize: 12, color: C_CONST.PRIMARY, fontWeight: '700' },
  impactBox: {
    backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  impactText: { fontSize: 12, color: '#166534', lineHeight: 18 },
  cancelBox: {
    backgroundColor: '#fff1f2', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#fecdd3',
  },
  cancelLabel: { fontSize: 10, fontWeight: '700', color: '#be123c', textTransform: 'uppercase' as const, marginBottom: 4 },
  cancelText: { fontSize: 12, color: '#9f1239', lineHeight: 18 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  cancelInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12,
    padding: 12, fontSize: 14, color: '#1e293b', minHeight: 90,
    textAlignVertical: 'top', backgroundColor: '#f8fafc', marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
