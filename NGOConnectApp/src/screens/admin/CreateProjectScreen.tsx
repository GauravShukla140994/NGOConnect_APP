import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, ActivityIndicator, Platform, PermissionsAndroid, Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Geolocation from '@react-native-community/geolocation';
import WebView from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppConfig from '../../config/AppConfig';
import { projectApi } from '../../api/project.api';
import { settingsApi } from '../../api/settings.api';
import * as orgApiModule from '../../api/org.api';
import { useAdminStore } from '../../store/adminStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScheduleType  = 'ONE_TIME' | 'RECURRING' | 'FLEXIBLE';
type LocationTypeCode = 'IN_PERSON' | 'REMOTE' | 'HYBRID';

interface ProjectForm {
  // Step 1
  title: string;
  categoryName: string;
  description: string;
  maxVolunteers: string;
  isPublic: boolean;
  requiresApproval: boolean;
  // Step 2
  scheduleType: ScheduleType;
  date: string;           // ONE_TIME: DD-MM-YYYY
  startTime: string;      // HH:MM
  endTime: string;
  startDate: string;      // RECURRING / FLEXIBLE from date
  endDate: string;        // RECURRING / FLEXIBLE until date
  activeDays: string[];   // RECURRING: ['MON','WED','FRI']
  minHours: string;       // FLEXIBLE min hours
  // Step 3
  locationType: LocationTypeCode;
  address: string;
  landmark: string;
  city: string;
  latitude?: number;
  longitude?: number;
  locationPinned: boolean;
  // Step 2 — Attendance rules (RECURRING/FLEXIBLE only, v5.1)
  minAttendPct: string;    // % sessions required for cert eligibility (>= system default)
  maxDailyHours: string;   // FLEXIBLE: max hours per day (>= system default)
  minSessionHours: string; // FLEXIBLE: min hours per session (>= FLEXIBLE_MIN_SESSION_HOURS floor)
  // Step 4
  skills: string[];
  age18Plus: boolean;
}

const DAYS       = ['MON','TUE','WED','THU','FRI','SAT','SUN'] as const;
const DAY_LABELS: Record<string,string> = { MON:'M', TUE:'T', WED:'W', THU:'T', FRI:'F', SAT:'S', SUN:'S' };

const QUICK_SKILLS = [
  'Teaching','First Aid','Photography','Data Entry',
  'Cooking','Driving','Social Media','Fundraising',
];

const CATEGORIES = [
  'Education','Health','Environment','Animal Welfare',
  'Child Welfare','Elderly Care','Women Empowerment','Rural Development',
  'Disaster Relief','Arts & Culture','Sports','Technology',
];

const LOCATION_TYPES: Array<{ code: LocationTypeCode; label: string; icon: string }> = [
  { code: 'IN_PERSON', label: 'In-person', icon: '📍' },
  { code: 'REMOTE',    label: 'Online',    icon: '💻' },
  { code: 'HYBRID',    label: 'Hybrid',    icon: '🔀' },
];

const DEFAULT_FORM: ProjectForm = {
  title: '', categoryName: '', description: '',
  maxVolunteers: '', isPublic: true, requiresApproval: true,
  scheduleType: 'ONE_TIME',
  date: '', startTime: '', endTime: '',
  startDate: '', endDate: '',
  activeDays: [], minHours: '',
  locationType: 'IN_PERSON', address: '', landmark: '', city: '',
  locationPinned: false,
  skills: [], age18Plus: false,
  minAttendPct: '', maxDailyHours: '', minSessionHours: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIsoDate(ddmmyyyy: string): string | undefined {
  if (!ddmmyyyy) return undefined;
  const [d, m, y] = ddmmyyyy.split('-');
  if (!d || !m || !y || y.length !== 4) return undefined;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function calcDuration(start: string, end: string): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Parse a "DD-MM-YYYY" form string to a Date (safe for picker value). */
function parseDMY(s: string): Date {
  if (!s) return new Date();
  const [dd, mm, yyyy] = s.split('-').map(Number);
  if (!dd || !mm || !yyyy) return new Date();
  return new Date(yyyy, mm - 1, dd);
}

/** Format a Date to "DD-MM-YYYY". */
function formatDMY(d: Date): string {
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getFullYear()),
  ].join('-');
}

/** Parse a "HH:MM" form string to a Date (safe for picker value). */
function parseHM(s: string): Date {
  const d = new Date();
  if (!s) return d;
  const [h, m] = s.split(':').map(Number);
  d.setHours(h ?? 9, m ?? 0, 0, 0);
  return d;
}

/** Format a Date to "HH:MM" (24-hour) — used for API / form state storage. */
function formatHM(d: Date): string {
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join(':');
}

/** Convert stored "HH:MM" (24-hour) to "h:MM AM/PM" for display only. */
function display12H(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Compute the read-only minSessionHours from the current form state.
 * Formula: (minAttendPct / 100) × sessionDurationHours
 *   RECURRING — duration = endTime minus startTime (in hours)
 *   FLEXIBLE  — duration = maxDailyHours
 * Returns undefined when the inputs aren't filled in yet.
 */
function calcMinSessionHours(form: ProjectForm): number | undefined {
  const pct = parseFloat(form.minAttendPct);
  if (isNaN(pct) || pct <= 0) return undefined;

  if (form.scheduleType === 'RECURRING' && form.startTime && form.endTime) {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const durHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (durHours <= 0) return undefined;
    return Math.round((pct / 100) * durHours * 100) / 100; // 2 decimal places
  }

  if (form.scheduleType === 'FLEXIBLE') {
    const maxH = parseFloat(form.maxDailyHours);
    if (isNaN(maxH) || maxH <= 0) return undefined;
    return Math.round((pct / 100) * maxH * 100) / 100;
  }

  return undefined;
}

/** Midnight today (local) — used as minimumDate for date pickers. */
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** True if the "DD-MM-YYYY" string is strictly before today's date. */
function isDateInPast(ddmmyyyy: string): boolean {
  if (!ddmmyyyy) return false;
  return parseDMY(ddmmyyyy) < todayMidnight();
}

// ---------------------------------------------------------------------------
// Map HTML — Leaflet draggable pin for project location picker
// ---------------------------------------------------------------------------

const LOCATION_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #e8e0d8; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false });
    var tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    tileLayer.once('load', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TILES_LOADED' }));
    });

    var pin = null;

    window.setCenter = function(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 16);
    };

    window.placePin = function(lat, lng) {
      if (pin) { pin.setLatLng([lat, lng]); return; }
      pin = L.marker([lat, lng], { draggable: true }).addTo(map);
      pin.on('dragend', function(e) {
        var p = e.target.getLatLng();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PIN_DROPPED', lat: p.lat, lng: p.lng
        }));
      });
    };

    map.setView([20.5937, 78.9629], 5);
  </script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ step, total }: { step: number; total: number }) {
  const C = AppConfig.COLORS;
  return (
    <View style={pb.row}>
      {Array.from({ length: total }).map((_, i) => {
        const done   = i < step - 1;
        const active = i === step - 1;
        return (
          <React.Fragment key={i}>
            <View style={[pb.dot, done && pb.dotDone, active && pb.dotActive, !done && !active && pb.dotPending]}>
              {done
                ? <Text style={pb.dotTxt}>✓</Text>
                : <Text style={[pb.dotTxt, !active && { color: '#94a3b8' }]}>{i + 1}</Text>
              }
            </View>
            {i < total - 1 && (
              <View style={[pb.line, i < step - 1 && { backgroundColor: C.PRIMARY }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const pb = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot:        { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotDone:    { backgroundColor: AppConfig.COLORS.PRIMARY },
  dotActive:  { backgroundColor: AppConfig.COLORS.PRIMARY, width: 32, height: 32, borderRadius: 16 },
  dotPending: { backgroundColor: '#e2e8f0' },
  dotTxt:     { color: '#fff', fontSize: 11, fontWeight: '700' },
  line:       { flex: 1, height: 2, backgroundColor: '#e2e8f0', marginHorizontal: 2 },
});

function SectionLabel({ text }: { text: string }) {
  return <Text style={s.sectionLabel}>{text}</Text>;
}

function FormInput({ label, value, onChangeText, placeholder, multiline, keyboardType, editable }: {
  label?: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any; editable?: boolean;
}) {
  const C = AppConfig.COLORS;
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={C.TEXT_SECONDARY}
        multiline={multiline} keyboardType={keyboardType}
        editable={editable !== false}
        style={[s.input, multiline && { height: 88, textAlignVertical: 'top', paddingTop: 10 }, editable === false && { opacity: 0.55 }]}
      />
    </View>
  );
}

function DatePickerButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity onPress={onPress} style={s.pickerBtn} activeOpacity={0.75}>
        <Text style={[s.pickerBtnText, !value && s.pickerBtnPlaceholder]}>
          {value || 'Select date'}
        </Text>
        <Text style={s.pickerBtnIcon}>📅</Text>
      </TouchableOpacity>
    </View>
  );
}

function TimePickerButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity onPress={onPress} style={s.pickerBtn} activeOpacity={0.75}>
        <Text style={[s.pickerBtnText, !value && s.pickerBtnPlaceholder]}>
          {value ? display12H(value) : 'Select time'}
        </Text>
        <Text style={s.pickerBtnIcon}>🕐</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type RootStackParamList = { CreateProject: { projectId?: number; orgId?: number } | undefined };

export default function CreateProjectScreen() {
  const nav        = useNavigation<NativeStackNavigationProp<any>>();
  const route      = useRoute<RouteProp<RootStackParamList,'CreateProject'>>();
  const projectId  = route.params?.projectId;
  const routeOrgId = route.params?.orgId;
  const { selectedOrg } = useAdminStore();
  const orgId = routeOrgId ?? selectedOrg?.orgId ?? 0;

  const C      = AppConfig.COLORS;
  const [step, setStep]          = useState(1);
  const [form, setForm]          = useState<ProjectForm>(DEFAULT_FORM);
  const [saving, setSaving]      = useState(false);
  const [loading, setLoading]    = useState(!!projectId);
  // System-floor values fetched from Settings.
  // Admin can set a HIGHER value per project but not lower than these floors.
  const [sysDefaults, setSysDefaults] = useState({
    minAttendPct:         70,
    maxDailyHours:        8,
    otMaxDurationHours:   12,
    recurMinDays:         7,
    recurMaxDays:         90,
    flexMinDays:          3,
    flexMaxDays:          60,
    flexMinSessionHours:  1,
  });
  // Org-level project type permissions + cap — default true/100 while loading (avoids jarring lock flash)
  const [orgPerms, setOrgPerms] = useState({ canCreateRecurring: true, canCreateFlexible: true, orgMaxVolunteers: 100 });
  const [skillInput, setSkillInput] = useState('');
  const [tilesLoaded, setTilesLoaded]     = useState(false);
  const [pinnedAddress, setPinnedAddress] = useState('');
  const [mapFocused, setMapFocused]       = useState(false);
  const mapWebViewRef       = useRef<any>(null);
  // Holds GPS result fetched at mount — readable synchronously in onMapMessage
  const currentLocationRef  = useRef<{ latitude: number; longitude: number } | null>(null);
  // True once map tiles have finished loading
  const tilesLoadedRef      = useRef(false);
  // Controls whether GPS is allowed to set the map pin.
  // NEW projects (no projectId): true immediately.
  // EDIT projects: starts false — blocked until project data confirms the project
  // has NO saved coordinates. This prevents any race condition: GPS can never
  // overwrite saved DB coordinates regardless of which async operation arrives first.
  const shouldUseGpsRef     = useRef(!projectId);
  // Tracks skills already saved in DB for this project — used during edit to
  // avoid re-POSTing existing skills (which would create duplicates).
  const savedSkillsRef      = useRef<string[]>([]);

  // ---- date / time picker state ----
  type PickerTarget = 'date' | 'startDate' | 'endDate' | 'startTime' | 'endTime';
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget]   = useState<PickerTarget | null>(null);
  const [pickerMode, setPickerMode]       = useState<'date' | 'time'>('date');
  const [pickerDate, setPickerDate]       = useState(new Date());

  const isEdit = !!projectId;

  // ── Fetch system-default settings at mount ───────────────────────────────────
  useEffect(() => {
    settingsApi.getPublic()
      .then(res => {
        const list = res.data?.data ?? [];
        const num  = (key: string, fallback: number) => {
          const v = parseFloat(list.find((s: any) => s.settingKey === key)?.settingValue ?? '');
          return isNaN(v) ? fallback : v;
        };
        const floors = {
          minAttendPct:        num('DEFAULT_MIN_ATTEND_PCT',       70),
          maxDailyHours:       num('DEFAULT_MAX_DAILY_HOURS',       8),
          otMaxDurationHours:  num('OT_MAX_DURATION_HOURS',        12),
          recurMinDays:        num('RECURRING_MIN_DURATION_DAYS',   7),
          recurMaxDays:        num('RECURRING_MAX_DURATION_DAYS',  90),
          flexMinDays:         num('FLEXIBLE_MIN_DURATION_DAYS',    3),
          flexMaxDays:         num('FLEXIBLE_MAX_DURATION_DAYS',   60),
          flexMinSessionHours: num('FLEXIBLE_MIN_SESSION_HOURS',    1),
        };
        setSysDefaults(floors);
        // Pre-fill attendance fields with system defaults on NEW projects.
        // On EDIT projects these will be overwritten by the project-load effect.
        if (!projectId) {
          setForm(f => ({
            ...f,
            minAttendPct:    String(floors.minAttendPct),
            maxDailyHours:   String(floors.maxDailyHours),
            minSessionHours: String(floors.flexMinSessionHours),
          }));
        }
      })
      .catch(() => { /* keep hardcoded fallback */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // ── Fetch org project permissions ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    orgApiModule.getProfile(orgId)
      .then(res => {
        const org = res.data?.data ?? res.data;
        if (!org) return;
        setOrgPerms({
          canCreateRecurring: org.canCreateRecurring === true || (org as any).canCreateRecurring === 1,
          canCreateFlexible:  org.canCreateFlexible  === true || (org as any).canCreateFlexible  === 1,
          orgMaxVolunteers:   typeof org.orgMaxVolunteers === 'number' ? org.orgMaxVolunteers : 100,
        });
      })
      .catch(() => { /* keep defaults = allowed/100, fail open */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // ── Fetch GPS at mount ───────────────────────────────────────────────────────
  // For NEW projects: GPS fires immediately — provides a default pin the admin
  // can drag to the exact spot.
  // For EDIT projects: GPS is blocked (shouldUseGpsRef = false) until project
  // data loads. If the project has saved coordinates, GPS stays blocked forever.
  // Only if the project has NO saved coordinates does the project-load effect
  // flip shouldUseGpsRef to true and apply the cached GPS result.
  useEffect(() => {
    const onGPS = (pos: { coords: { latitude: number; longitude: number } }) => {
      const { latitude, longitude } = pos.coords;
      currentLocationRef.current = { latitude, longitude };

      // Blocked until project data confirms no saved coordinates (edit mode).
      if (!shouldUseGpsRef.current) return;

      setForm(f => ({ ...f, latitude, longitude, locationPinned: true }));
      reverseGeocode(latitude, longitude);
      // If the map is already showing, center + pin it now
      if (tilesLoadedRef.current) {
        mapWebViewRef.current?.injectJavaScript(
          `window.setCenter(${latitude}, ${longitude}, 16); window.placePin(${latitude}, ${longitude}); true;`
        );
      }
    };

    const doGPS = () =>
      Geolocation.getCurrentPosition(onGPS, () => { /* no GPS — leave map at India default */ },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });

    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
        .then(granted => { if (granted === PermissionsAndroid.RESULTS.GRANTED) doGPS(); });
    } else {
      doGPS();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const res = await projectApi.get(projectId);
        const p = res.data?.data ?? res.data;
        if (!p) return;
        setForm({
          title:            p.title ?? p.projectName ?? '',
          categoryName:     p.category ?? '',
          description:      p.description ?? '',
          maxVolunteers:    String(p.maxVolunteers ?? ''),
          isPublic:         p.isPublic ?? true,
          requiresApproval: Boolean(p.requiresApproval),
          scheduleType:     (p.scheduleTypeCode ?? 'ONE_TIME') as ScheduleType,
          date:             p.oneTimeDate ? p.oneTimeDate.slice(0,10).split('-').reverse().join('-') : '',
          startTime:        p.sessionStartTime ?? '',
          endTime:          p.sessionEndTime ?? '',
          startDate:        (p.recurStart ?? p.flexFromDate ?? '')?.slice?.(0,10)?.split?.('-')?.reverse()?.join?.('-') ?? '',
          endDate:          (p.recurEnd  ?? p.flexToDate   ?? '')?.slice?.(0,10)?.split?.('-')?.reverse()?.join?.('-') ?? '',
          activeDays:       p.recurDays ? p.recurDays.split(',') : [],
          minHours:         p.minHoursRequired != null ? String(p.minHoursRequired) : '',
          locationType:     (p.locationTypeCode ?? 'IN_PERSON') as LocationTypeCode,
          address:          p.addressLine ?? p.address ?? '',
          landmark:         p.landmark ?? p.locationName ?? '',
          city:             p.city ?? '',
          latitude:         p.latitude,
          longitude:        p.longitude,
          locationPinned:   !!(p.latitude && p.longitude),
          skills:           [],   // filled below after skills fetch
          age18Plus:        Boolean(p.ageRestriction),
          // Attendance rules — use saved project values if present, otherwise system defaults
          minAttendPct:    p.minAttendPct    != null ? String(p.minAttendPct)    : String(sysDefaults.minAttendPct),
          maxDailyHours:   p.maxDailyHours   != null ? String(p.maxDailyHours)   : String(sysDefaults.maxDailyHours),
          minSessionHours: p.minSessionHours != null ? String(p.minSessionHours) : String(sysDefaults.flexMinSessionHours),
        });

        // Fetch existing project skills and pre-populate the form so
        // the admin can see what's already saved (and we don't re-add them).
        try {
          const skRes = await projectApi.getSkills(projectId);
          const existing: string[] = (skRes.data?.data ?? []).map(
            (s: any) => s.skillName ?? s.SkillName ?? ''
          ).filter(Boolean);
          savedSkillsRef.current = existing;
          setForm(prev => ({ ...prev, skills: existing }));
        } catch {
          // Non-fatal — form just starts with empty skills list
        }

        if (p.latitude && p.longitude) {
          // Project has saved coordinates — GPS stays permanently blocked.
          // shouldUseGpsRef remains false. The TILES_LOADED handler will
          // centre the map on the saved coordinates.
          // (shouldUseGpsRef is already false for isEdit — no change needed)
        } else {
          // No saved coordinates — enable GPS so the admin has a starting pin.
          shouldUseGpsRef.current = true;
          if (currentLocationRef.current) {
            // GPS already arrived while we were waiting for project data.
            const { latitude, longitude } = currentLocationRef.current;
            setForm(prev => ({ ...prev, latitude, longitude, locationPinned: true }));
            reverseGeocode(latitude, longitude);
          }
          // If GPS hasn't arrived yet, the onGPS callback will fire shortly
          // and shouldUseGpsRef.current === true will let it through.
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const set = useCallback(<K extends keyof ProjectForm>(k: K, v: ProjectForm[K]) => {
    setForm(f => ({ ...f, [k]: v }));
  }, []);

  const toggleDay = (day: string) => {
    setForm(f => ({
      ...f,
      activeDays: f.activeDays.includes(day)
        ? f.activeDays.filter(d => d !== day)
        : [...f.activeDays, day],
    }));
  };

  const addSkill = () => {
    const t = skillInput.trim();
    if (!t || form.skills.includes(t)) { setSkillInput(''); return; }
    set('skills', [...form.skills, t]);
    setSkillInput('');
  };

  const removeSkill = (sk: string) => set('skills', form.skills.filter(x => x !== sk));

  // ---- picker helpers ----
  const openDatePicker = (target: 'date' | 'startDate' | 'endDate') => {
    const raw = target === 'date' ? form.date
              : target === 'startDate' ? form.startDate
              : form.endDate;
    setPickerDate(parseDMY(raw));
    setPickerTarget(target);
    setPickerMode('date');
    setPickerVisible(true);
  };

  const openTimePicker = (target: 'startTime' | 'endTime') => {
    const raw = target === 'startTime' ? form.startTime : form.endTime;
    setPickerDate(parseHM(raw));
    setPickerTarget(target);
    setPickerMode('time');
    setPickerVisible(true);
  };

  const applyPickerDate = (d: Date) => {
    if (!pickerTarget) return;
    if (pickerMode === 'date') {
      const v = formatDMY(d);
      if (pickerTarget === 'date')      set('date', v);
      if (pickerTarget === 'startDate') set('startDate', v);
      if (pickerTarget === 'endDate')   set('endDate', v);
    } else {
      const v = formatHM(d);
      if (pickerTarget === 'startTime') {
        // If start time is moved past the existing end time, clear end time
        if (form.endTime && v >= form.endTime) {
          set('endTime', '');
          Alert.alert('End Time Cleared', 'Start time is now at or after the previous end time. Please select a new end time.');
        }
        set('startTime', v);
      }
      if (pickerTarget === 'endTime') {
        if (form.startTime && v <= form.startTime) {
          Alert.alert('Invalid Time', `End time must be after start time (${display12H(form.startTime)}).`);
          // Don't apply — leave picker closed, user must pick again
          setPickerVisible(false);
          setPickerTarget(null);
          return;
        }
        set('endTime', v);
      }
    }
    setPickerVisible(false);
    setPickerTarget(null);
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    // Android closes automatically; iOS stays open until Done is tapped
    if (Platform.OS === 'android') {
      setPickerVisible(false);
      if (event.type === 'set' && selected) applyPickerDate(selected);
      setPickerTarget(null);
    } else {
      if (selected) setPickerDate(selected);
    }
  };

  // Reverse geocode lat/lng → readable address via Nominatim.
  // forceLandmark: true  → always update form.landmark (user manually moved pin)
  // forceLandmark: false → only update landmark if it's currently empty
  //                        (new project with no name typed, or GPS fallback)
  const reverseGeocode = async (lat: number, lng: number, forceLandmark = false) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: { 'User-Agent': 'RippleHub/1.0' } }
      );
      const data = await res.json();
      let geocodedName = '';
      if (data.address) {
        const a = data.address;
        geocodedName = [
          a.road, a.neighbourhood, a.suburb,
          a.city || a.town || a.village || a.county,
        ].filter(Boolean).join(', ') || data.display_name;
      } else if (data.display_name) {
        geocodedName = data.display_name;
      }
      if (geocodedName) {
        setPinnedAddress(geocodedName);
        // Update landmark only when user explicitly dragged pin, OR when landmark is empty.
        // This prevents GPS auto-geocoding from overwriting a saved/typed landmark.
        setForm(f => ({
          ...f,
          landmark: forceLandmark || !f.landmark.trim() ? geocodedName : f.landmark,
        }));
      }
    } catch {
      const coords = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
      setPinnedAddress(coords);
    }
  };

  // Forward geocode a city/place name → lat/lng via Nominatim (for centering the map
  // view when a project has no saved coordinates but has a city text field filled in).
  const forwardGeocode = async (query: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'User-Agent': 'RippleHub/1.0' } }
      );
      const data = await res.json();
      if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      return null;
    } catch {
      return null;
    }
  };

  // Handle messages from the map WebView
  const onMapMessage = (e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);

      if (msg.type === 'TILES_LOADED') {
        setTilesLoaded(true);
        tilesLoadedRef.current = true;

        if (form.locationPinned && form.latitude != null && form.longitude != null) {
          // Priority 1: coordinates already in form state (saved DB coords for edit,
          // or GPS for new project if it arrived before tiles finished loading).
          const lat = form.latitude;
          const lon = form.longitude;
          mapWebViewRef.current?.injectJavaScript(
            `window.setCenter(${lat}, ${lon}, 16); window.placePin(${lat}, ${lon}); true;`
          );
          // Always reverse geocode with the ACTUAL pinned coordinates so the
          // address card reflects the correct location (not a stale GPS address).
          reverseGeocode(lat, lon);
        } else if (shouldUseGpsRef.current && currentLocationRef.current) {
          // Priority 2: GPS arrived but form not yet updated (edge case — very fast map load).
          const { latitude, longitude } = currentLocationRef.current;
          mapWebViewRef.current?.injectJavaScript(
            `window.setCenter(${latitude}, ${longitude}, 16); window.placePin(${latitude}, ${longitude}); true;`
          );
          reverseGeocode(latitude, longitude);
          setForm(f => ({ ...f, latitude, longitude, locationPinned: true }));
        } else if (form.city) {
          // Priority 3: No pin yet, but city text is available — centre the view
          // at city level so the admin sees a useful starting area (no pin placed).
          forwardGeocode(form.city).then(coords => {
            if (coords) {
              mapWebViewRef.current?.injectJavaScript(
                `window.setCenter(${coords.lat}, ${coords.lng}, 12); true;`
              );
            }
          });
        }
        // else: nothing available yet — map stays at the India default zoom (5)
      } else if (msg.type === 'PIN_DROPPED') {
        const { lat, lng } = msg;
        setForm(f => ({ ...f, latitude: lat, longitude: lng, locationPinned: true }));
        // forceLandmark = true: user manually moved the pin, so update the landmark field
        reverseGeocode(lat, lng, true);
      }
    } catch { /* ignore malformed messages */ }
  };

  // Validation per step
  const validate = (): boolean => {
    if (step === 1) {
      if (!form.title.trim())    { Alert.alert('Required', 'Please enter a project title.');  return false; }
      if (!form.categoryName)    { Alert.alert('Required', 'Please select a category.');      return false; }
      if (form.maxVolunteers) {
        const mv = parseInt(form.maxVolunteers, 10);
        if (!isNaN(mv) && mv > orgPerms.orgMaxVolunteers) {
          Alert.alert(
            'Exceeds Org Limit',
            `Max volunteers cannot exceed your organisation's limit of ${orgPerms.orgMaxVolunteers}. Contact support to increase the limit.`
          );
          return false;
        }
      }
    }
    if (step === 2) {
      if (form.scheduleType === 'ONE_TIME') {
        if (!form.date)      { Alert.alert('Required', 'Please enter the project date.');   return false; }
        if (!isEdit && isDateInPast(form.date)) {
          Alert.alert('Invalid Date', 'Project date cannot be in the past.'); return false;
        }
        if (!form.startTime) { Alert.alert('Required', 'Please select a start time.');      return false; }
        if (!form.endTime)   { Alert.alert('Required', 'Please select an end time.');       return false; }
        // Duration cap: session must not exceed OT_MAX_DURATION_HOURS
        if (form.startTime && form.endTime) {
          const [sh, sm] = form.startTime.split(':').map(Number);
          const [eh, em] = form.endTime.split(':').map(Number);
          const durHrs = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
          if (durHrs > sysDefaults.otMaxDurationHours) {
            Alert.alert('Session Too Long', `One-time session cannot exceed ${sysDefaults.otMaxDurationHours} hours.`);
            return false;
          }
        }
      }
      if (form.scheduleType === 'RECURRING') {
        if (!form.startDate || !form.endDate || form.activeDays.length === 0) {
          Alert.alert('Required', 'Please fill all recurring schedule fields.'); return false;
        }
        if (!isEdit && isDateInPast(form.startDate)) {
          Alert.alert('Invalid Date', 'Start date cannot be in the past.'); return false;
        }
        if (!form.startTime) { Alert.alert('Required', 'Please select a start time.');      return false; }
        if (!form.endTime)   { Alert.alert('Required', 'Please select an end time.');       return false; }
        // Duration range check: RECURRING_MIN_DURATION_DAYS – RECURRING_MAX_DURATION_DAYS
        if (form.startDate && form.endDate) {
          const startMs = parseDMY(form.startDate).getTime();
          const endMs   = parseDMY(form.endDate).getTime();
          const days    = Math.round((endMs - startMs) / 86400000);
          if (days < sysDefaults.recurMinDays) {
            Alert.alert('Date Range Too Short', `Recurring projects must span at least ${sysDefaults.recurMinDays} days.`);
            return false;
          }
          if (days > sysDefaults.recurMaxDays) {
            Alert.alert('Date Range Too Long', `Recurring projects cannot span more than ${sysDefaults.recurMaxDays} days.`);
            return false;
          }
        }
      }
      if (form.scheduleType === 'FLEXIBLE') {
        if (!form.startDate || !form.endDate) {
          Alert.alert('Required', 'Please enter the availability window.'); return false;
        }
        if (!isEdit && isDateInPast(form.startDate)) {
          Alert.alert('Invalid Date', 'Available from date cannot be in the past.'); return false;
        }
        if (!form.startTime) { Alert.alert('Required', 'Please select a start time.');      return false; }
        if (!form.endTime)   { Alert.alert('Required', 'Please select an end time.');       return false; }
        // Duration range check: FLEXIBLE_MIN_DURATION_DAYS – FLEXIBLE_MAX_DURATION_DAYS
        if (form.startDate && form.endDate) {
          const startMs = parseDMY(form.startDate).getTime();
          const endMs   = parseDMY(form.endDate).getTime();
          const days    = Math.round((endMs - startMs) / 86400000);
          if (days < sysDefaults.flexMinDays) {
            Alert.alert('Date Range Too Short', `Flexible projects must span at least ${sysDefaults.flexMinDays} days.`);
            return false;
          }
          if (days > sysDefaults.flexMaxDays) {
            Alert.alert('Date Range Too Long', `Flexible projects cannot span more than ${sysDefaults.flexMaxDays} days.`);
            return false;
          }
        }
        // Min session hours floor
        const msh = parseFloat(form.minSessionHours);
        if (!isNaN(msh) && msh < sysDefaults.flexMinSessionHours) {
          Alert.alert('Invalid Min Session Hours', `Min session hours cannot be below the platform floor of ${sysDefaults.flexMinSessionHours}h.`);
          set('minSessionHours', String(sysDefaults.flexMinSessionHours));
          return false;
        }
      }
      // Time order check — applies to all schedule types
      if (form.startTime && form.endTime && form.endTime <= form.startTime) {
        Alert.alert('Invalid Time', `End time (${display12H(form.endTime)}) must be after start time (${display12H(form.startTime)}).`);
        return false;
      }
      // Attendance floor — admin cannot set below platform minimum
      if (form.scheduleType !== 'ONE_TIME') {
        const attendPct = parseFloat(form.minAttendPct);
        if (!isNaN(attendPct) && attendPct < sysDefaults.minAttendPct) {
          Alert.alert('Invalid Attendance %', `Min attendance cannot be below the platform floor of ${sysDefaults.minAttendPct}%. It has been reset.`);
          set('minAttendPct', String(sysDefaults.minAttendPct));
          return false;
        }
      }
    }
    return true;
  };

  const next = () => { if (validate()) setStep(s => Math.min(s + 1, 5)); };
  const back = () => setStep(s => Math.max(s - 1, 1));

  const buildPayload = (isDraft = false) => ({
    orgId,
    title:            form.title.trim(),
    description:      form.description.trim() || undefined,
    category:         form.categoryName || undefined,
    maxVolunteers:    form.maxVolunteers ? parseInt(form.maxVolunteers, 10) : undefined,
    isPublic:         form.isPublic,
    requiresApproval: form.requiresApproval,
    // Schedule
    scheduleType:     form.scheduleType,
    startDate:        toIsoDate(form.scheduleType === 'ONE_TIME' ? form.date : form.startDate),
    endDate:          form.scheduleType === 'ONE_TIME' ? toIsoDate(form.date) : toIsoDate(form.endDate),
    startTime:        form.startTime || undefined,
    endTime:          form.endTime   || undefined,
    recurrenceDays:   form.scheduleType === 'RECURRING' && form.activeDays.length > 0
                        ? form.activeDays.join(',') : undefined,
    durationMinutes:  form.minHours ? parseInt(form.minHours, 10) * 60 : undefined,
    // Location
    locationTypeCode: form.locationType,
    locationName:     form.landmark.trim() || undefined,
    address:          form.address.trim()  || undefined,
    city:             form.city.trim()     || undefined,
    latitude:         form.latitude,
    longitude:        form.longitude,
    // Restrictions
    minAge:           form.age18Plus ? 18 : 0,
    // Attendance rules (v5.1) — only sent for RECURRING/FLEXIBLE
    minAttendPct:    form.scheduleType !== 'ONE_TIME' && form.minAttendPct  ? parseFloat(form.minAttendPct)  : undefined,
    maxDailyHours:   form.scheduleType === 'FLEXIBLE' && form.maxDailyHours ? parseFloat(form.maxDailyHours) : undefined,
    // FLEXIBLE: admin-entered minSessionHours; RECURRING: auto-computed from attendance %
    minSessionHours: form.scheduleType === 'FLEXIBLE' && form.minSessionHours
                       ? parseFloat(form.minSessionHours)
                       : calcMinSessionHours(form),
    // Status
    isDraft,
  });

  const doSave = async (isDraft: boolean) => {
    setSaving(true);
    try {
      let pid = projectId;
      if (isEdit) {
        const r = await projectApi.update(projectId!, buildPayload(isDraft));
        if (!r.data?.isSuccess) { Alert.alert('Error', r.data?.message ?? 'Update failed.'); return; }
      } else {
        const r = await projectApi.create(buildPayload(isDraft));
        if (!r.data?.isSuccess) { Alert.alert('Error', r.data?.message ?? 'Could not create project.'); return; }
        pid = r.data.data?.projectId ?? r.data?.data;
      }
      // For new projects: add all skills.
      // For edits: only add skills that weren't already saved — avoids duplicates.
      const skillsToAdd = isEdit
        ? form.skills.filter(sk => !savedSkillsRef.current.includes(sk))
        : form.skills;
      if (pid && skillsToAdd.length > 0) {
        for (const skill of skillsToAdd) {
          await projectApi.addSkill(pid, skill, false);
        }
      }
      const msg = isDraft ? 'Project saved as draft.' : (isEdit ? 'Project updated!' : 'Project published!');
      Alert.alert('Success', msg, [{ text: 'OK', onPress: () => nav.goBack() }]);
    } catch (err: any) {
      // Surface the real API error message so we can debug SP issues
      const apiMsg = err?.response?.data?.message ?? err?.response?.data?.Message;
      const msg    = apiMsg ?? err?.message ?? 'Something went wrong. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Picker renderer (shared across all date/time fields in Step 2)
  // ---------------------------------------------------------------------------

  const renderPicker = () => {
    if (!pickerVisible) return null;

    if (Platform.OS === 'android') {
      return (
        <DateTimePicker
          value={pickerDate}
          mode={pickerMode}
          display="default"
          is24Hour={false}
          minimumDate={pickerMode === 'date' ? todayMidnight() : undefined}
          onChange={onPickerChange}
        />
      );
    }

    // iOS — show in a bottom-sheet Modal with Cancel / Done
    return (
      <Modal transparent animationType="slide" visible={pickerVisible}>
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => { setPickerVisible(false); setPickerTarget(null); }}>
                <Text style={s.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>
                {pickerMode === 'date' ? 'Select Date' : 'Select Time'}
              </Text>
              <TouchableOpacity onPress={() => applyPickerDate(pickerDate)}>
                <Text style={s.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={pickerDate}
              mode={pickerMode}
              display="spinner"
              is24Hour={false}
              minimumDate={pickerMode === 'date' ? todayMidnight() : undefined}
              onChange={onPickerChange}
              style={{ height: 200 }}
            />
          </View>
        </View>
      </Modal>
    );
  };

  // ---------------------------------------------------------------------------
  // Step renderers
  // ---------------------------------------------------------------------------

  const renderStep1 = () => (
    <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
      <SectionLabel text="Basic Information" />
      <FormInput
        label="Project Title *"
        value={form.title}
        onChangeText={v => set('title', v)}
        placeholder="e.g., Weekly Tuition Classes"
      />
      <Text style={s.label}>Category *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              onPress={() => set('categoryName', cat)}
              style={[s.chip, form.categoryName === cat && { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY }]}
            >
              <Text style={[s.chipText, form.categoryName === cat && { color: '#fff' }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <FormInput
        label="Description"
        value={form.description}
        onChangeText={v => set('description', v)}
        placeholder="What will volunteers be doing?"
        multiline
      />
      <FormInput
        label={`Max Volunteers (org limit: ${orgPerms.orgMaxVolunteers})`}
        value={form.maxVolunteers}
        onChangeText={v => set('maxVolunteers', v.replace(/[^0-9]/g, ''))}
        placeholder={`e.g., 20 (max ${orgPerms.orgMaxVolunteers})`}
        keyboardType="number-pad"
      />
      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Public Project</Text>
          <Text style={s.subText}>Visible to all volunteers</Text>
        </View>
        <Switch value={form.isPublic} onValueChange={v => set('isPublic', v)} trackColor={{ true: C.PRIMARY }} />
      </View>
      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Required Approval for Attendance</Text>
          <Text style={s.subText}>Admin reviews each application</Text>
        </View>
        <Switch value={form.requiresApproval} onValueChange={v => set('requiresApproval', v)} trackColor={{ true: C.PRIMARY }} />
      </View>
    </ScrollView>
  );

  const renderStep2 = () => {
    const dur = calcDuration(form.startTime, form.endTime);
    return (
      <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
        <SectionLabel text="Schedule" />
        <Text style={s.label}>Schedule Type</Text>
        <View style={[s.chipRow, { marginBottom: 20 }]}>
          {(['ONE_TIME','RECURRING','FLEXIBLE'] as ScheduleType[]).map(t => {
            const locked =
              (t === 'RECURRING' && !orgPerms.canCreateRecurring) ||
              (t === 'FLEXIBLE'  && !orgPerms.canCreateFlexible);
            return (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  if (locked) {
                    Alert.alert(
                      'Plan Upgrade Required',
                      `${t === 'RECURRING' ? 'Recurring' : 'Flexible'} projects are available on upgraded plans. Contact support to enable this for your organisation.`,
                      [{ text: 'OK' }]
                    );
                    return;
                  }
                  set('scheduleType', t);
                }}
                style={[s.segBtn, form.scheduleType === t && s.segBtnActive, locked && { opacity: 0.45 }]}
              >
                <Text style={[s.segText, form.scheduleType === t && s.segTextActive]}>
                  {t === 'ONE_TIME'
                    ? 'One-time'
                    : `${t === 'RECURRING' ? 'Recurring' : 'Flexible'}${locked ? ' 🔒' : ''}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {form.scheduleType === 'ONE_TIME' && (
          <>
            <DatePickerButton label="Date *" value={form.date}
              onPress={() => openDatePicker('date')} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TimePickerButton label="Start Time *"
                  value={form.startTime} onPress={() => openTimePicker('startTime')} />
              </View>
              <View style={{ flex: 1 }}>
                <TimePickerButton label="End Time *"
                  value={form.endTime} onPress={() => openTimePicker('endTime')} />
              </View>
            </View>
            {dur ? <Text style={s.durationBadge}>{dur}</Text> : null}
          </>
        )}

        {form.scheduleType === 'RECURRING' && (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <DatePickerButton label={`From * (min ${sysDefaults.recurMinDays}d)`} value={form.startDate}
                  onPress={() => openDatePicker('startDate')} />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerButton label={`Until * (max ${sysDefaults.recurMaxDays}d)`} value={form.endDate}
                  onPress={() => openDatePicker('endDate')} />
              </View>
            </View>
            <Text style={s.label}>Active Days *</Text>
            <View style={[s.chipRow, { marginBottom: 16 }]}>
              {DAYS.map(day => (
                <TouchableOpacity key={day} onPress={() => toggleDay(day)}
                  style={[s.dayBtn, form.activeDays.includes(day) && { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY }]}>
                  <Text style={[s.dayText, form.activeDays.includes(day) && { color: '#fff' }]}>{DAY_LABELS[day]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TimePickerButton label="Start Time *"
                  value={form.startTime} onPress={() => openTimePicker('startTime')} />
              </View>
              <View style={{ flex: 1 }}>
                <TimePickerButton label="End Time *"
                  value={form.endTime} onPress={() => openTimePicker('endTime')} />
              </View>
            </View>
            {dur ? <Text style={s.durationBadge}>{dur}</Text> : null}
          </>
        )}

        {form.scheduleType === 'FLEXIBLE' && (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <DatePickerButton label={`Available From * (min ${sysDefaults.flexMinDays}d)`} value={form.startDate}
                  onPress={() => openDatePicker('startDate')} />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerButton label={`Available Until * (max ${sysDefaults.flexMaxDays}d)`} value={form.endDate}
                  onPress={() => openDatePicker('endDate')} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TimePickerButton label="Start Time *"
                  value={form.startTime} onPress={() => openTimePicker('startTime')} />
              </View>
              <View style={{ flex: 1 }}>
                <TimePickerButton label="End Time *"
                  value={form.endTime} onPress={() => openTimePicker('endTime')} />
              </View>
            </View>
            {dur ? <Text style={s.durationBadge}>{dur}</Text> : null}
            <FormInput label="Minimum Hours Required" value={form.minHours}
              onChangeText={v => set('minHours', v)} placeholder="e.g., 4"
              keyboardType="number-pad" />
          </>
        )}

        {/* ── Attendance Rules — only for RECURRING / FLEXIBLE ─────────── */}
        {form.scheduleType !== 'ONE_TIME' && (() => {
          const computedMsh = calcMinSessionHours(form);
          const mshDisplay  = computedMsh != null ? `${computedMsh} hr${computedMsh !== 1 ? 's' : ''}` : '—';
          return (
            <>
              <SectionLabel text="Attendance Rules" />
              <Text style={[s.subText, { marginBottom: 10, marginHorizontal: 2 }]}>
                Platform minimum is {sysDefaults.minAttendPct}% — you can set a higher bar for this project. These lock once the project goes Active.
              </Text>

              {/* Min Attendance % */}
              <Text style={s.label}>Min Attendance % for Certificate *</Text>
              <TextInput
                style={s.input}
                keyboardType="numeric"
                value={form.minAttendPct}
                onChangeText={v => set('minAttendPct', v)}
                onBlur={() => {
                  const n = parseFloat(form.minAttendPct);
                  if (isNaN(n) || n < sysDefaults.minAttendPct) {
                    set('minAttendPct', String(sysDefaults.minAttendPct));
                  } else if (n > 100) {
                    set('minAttendPct', '100');
                  }
                }}
                placeholderTextColor={C.TEXT2}
              />
              <Text style={[s.subText, { marginBottom: 12 }]}>
                Volunteer must attend ≥{form.minAttendPct || sysDefaults.minAttendPct}% of sessions to earn a certificate.
              </Text>

              {/* Max Daily Hours — FLEXIBLE only */}
              {form.scheduleType === 'FLEXIBLE' && (
                <>
                  <Text style={s.label}>Max Daily Hours *</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="numeric"
                    value={form.maxDailyHours}
                    onChangeText={v => set('maxDailyHours', v)}
                    onBlur={() => {
                      const n = parseFloat(form.maxDailyHours);
                      if (isNaN(n) || n < sysDefaults.maxDailyHours) {
                        set('maxDailyHours', String(sysDefaults.maxDailyHours));
                      } else if (n > 24) {
                        set('maxDailyHours', '24');
                      }
                    }}
                    placeholderTextColor={C.TEXT2}
                  />
                  <Text style={[s.subText, { marginBottom: 12 }]}>
                    Maximum hours a volunteer can log in one day on this project.
                  </Text>
                </>
              )}

              {/* Min Session Hours — editable for FLEXIBLE, auto-calculated for RECURRING */}
              {form.scheduleType === 'FLEXIBLE' ? (
                <>
                  <Text style={s.label}>Min Hours per Session * (floor: {sysDefaults.flexMinSessionHours}h)</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="numeric"
                    value={form.minSessionHours}
                    onChangeText={v => set('minSessionHours', v)}
                    onBlur={() => {
                      const n     = parseFloat(form.minSessionHours);
                      const maxH  = parseFloat(form.maxDailyHours) || sysDefaults.maxDailyHours;
                      if (isNaN(n) || n < sysDefaults.flexMinSessionHours) {
                        set('minSessionHours', String(sysDefaults.flexMinSessionHours));
                      } else if (n > maxH) {
                        set('minSessionHours', String(maxH));
                      }
                    }}
                    placeholderTextColor={C.TEXT2}
                  />
                  <Text style={[s.subText, { marginBottom: 8 }]}>
                    A volunteer must log at least this many hours in a session for it to count as Attended. Min: {sysDefaults.flexMinSessionHours}h, max: {form.maxDailyHours || sysDefaults.maxDailyHours}h.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.label}>Min Hours per Session (auto-calculated)</Text>
                  <View style={[s.input, { justifyContent: 'center', backgroundColor: C.INPUT_BG }]}>
                    <Text style={{ color: computedMsh != null ? C.TEXT : C.TEXT2 }}>
                      {mshDisplay}
                    </Text>
                  </View>
                  <Text style={[s.subText, { marginBottom: 8 }]}>
                    = {form.minAttendPct || sysDefaults.minAttendPct}% × session duration ({dur || '?'}). A volunteer must log at least this much in a single session for it to count as Attended.
                  </Text>
                </>
              )}
            </>
          );
        })()}
      </ScrollView>
    );
  };

  const renderStep3 = () => (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled" scrollEnabled={!mapFocused}>
      <SectionLabel text="Location" />
      <Text style={s.label}>Location Type</Text>
      <View style={[s.chipRow, { marginBottom: 20 }]}>
        {LOCATION_TYPES.map(lt => (
          <TouchableOpacity
            key={lt.code}
            onPress={() => set('locationType', lt.code)}
            style={[s.chip, form.locationType === lt.code && { backgroundColor: C.PRIMARY, borderColor: C.PRIMARY }]}
          >
            <Text style={{ marginRight: 4 }}>{lt.icon}</Text>
            <Text style={[s.chipText, form.locationType === lt.code && { color: '#fff' }]}>{lt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {form.locationType !== 'REMOTE' && (
        <>
          <FormInput label="Address" value={form.address}
            onChangeText={v => set('address', v)} placeholder="Street address" />
          <FormInput label="Landmark / Venue Name" value={form.landmark}
            onChangeText={v => set('landmark', v)} placeholder="e.g., Near City Park Gate" />
          <FormInput label="City" value={form.city}
            onChangeText={v => set('city', v)} placeholder="e.g., Mumbai" />

          {/* Map Location Picker */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={s.label}>Pin Project Location</Text>
            {form.locationPinned && (
              <View style={s.geoInfoBadge}>
                <Text style={s.geoInfoBadgeText}>
                  {/* isEdit + has coordinates = saved DB pin; else = GPS default */}
                  {isEdit && form.latitude ? '📌 Saved location' : '📍 Current location'}
                </Text>
              </View>
            )}
          </View>
          {form.locationPinned && (
            <View style={s.geoInfoBox}>
              <Text style={s.geoInfoIcon}>ℹ️</Text>
              <Text style={s.geoInfoText}>
                {isEdit && form.latitude
                  ? 'Saved location is shown on the map. Drag the pin to adjust if needed.'
                  : 'Current location is pinned by default. Drag the pin to set the exact meeting point.'}
              </Text>
            </View>
          )}
          <View
            style={s.mapContainer}
            onTouchStart={() => setMapFocused(true)}
            onTouchEnd={() => setMapFocused(false)}
            onTouchCancel={() => setMapFocused(false)}
          >
            <WebView
              ref={mapWebViewRef}
              source={{ html: LOCATION_MAP_HTML }}
              style={{ flex: 1 }}
              originWhitelist={['*']}
              onMessage={onMapMessage}
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="always"
            />
            {!tilesLoaded && (
              <View style={s.mapLoadingOverlay}>
                <ActivityIndicator color={C.PRIMARY} size="small" />
                <Text style={s.mapLoadingText}>Loading map…</Text>
              </View>
            )}
          </View>

          {/* Pin status card */}
          <View style={s.mapCard}>
            <View style={s.mapCardIcon}>
              <Text style={{ fontSize: 24 }}>{form.locationPinned ? '📌' : '🗺️'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {form.locationPinned && form.latitude != null ? (
                <>
                  <Text style={s.mapPinnedTitle}>Location Pinned</Text>
                  <Text style={s.mapPinnedCoords} numberOfLines={2}>
                    {pinnedAddress || `${form.latitude.toFixed(5)}° N, ${form.longitude?.toFixed(5)}° E`}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.mapUnpinnedTitle}>No location pinned yet</Text>
                  <Text style={s.mapUnpinnedSub}>Drag the pin on the map to select a location</Text>
                </>
              )}
            </View>
            {form.locationPinned && (
              <TouchableOpacity
                onPress={() => {
                  setForm(f => ({ ...f, latitude: undefined, longitude: undefined, locationPinned: false }));
                  setPinnedAddress('');
                }}
              >
                <Text style={{ fontSize: 18, color: '#ef4444', lineHeight: 22 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {!form.locationPinned && (
            <Text style={s.geoNote}>
              Drag the pin to mark the exact meeting point. Volunteers will see this on the project detail screen.
            </Text>
          )}
        </>
      )}

      {form.locationType !== 'IN_PERSON' && (
        <FormInput
          label={form.locationType === 'REMOTE' ? 'Meeting Link' : 'Online Meeting Link (optional)'}
          value={form.landmark}
          onChangeText={v => set('landmark', v)}
          placeholder="https://meet.google.com/..."
          keyboardType="url"
        />
      )}
    </ScrollView>
  );

  const renderStep4 = () => (
    <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
      <SectionLabel text="Skills & Requirements" />
      <Text style={s.label}>Required Skills</Text>
      <View style={s.skillInputRow}>
        <TextInput
          value={skillInput} onChangeText={setSkillInput}
          placeholder="Type a skill..." placeholderTextColor={C.TEXT_SECONDARY}
          style={[s.input, { flex: 1, marginBottom: 0 }]}
          returnKeyType="done" onSubmitEditing={addSkill}
        />
        <TouchableOpacity onPress={addSkill} style={s.addSkillBtn}>
          <Text style={s.addSkillBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
          {QUICK_SKILLS.filter(q => !form.skills.includes(q)).map(q => (
            <TouchableOpacity key={q} onPress={() => set('skills', [...form.skills, q])}
              style={[s.chip, { borderStyle: 'dashed' }]}>
              <Text style={s.chipText}>+ {q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      {form.skills.length > 0 && (
        <View style={[s.chipRow, { flexWrap: 'wrap', marginBottom: 16 }]}>
          {form.skills.map(sk => (
            <View key={sk} style={[s.chip, { backgroundColor: C.PRIMARY + '18', borderColor: C.PRIMARY }]}>
              <Text style={[s.chipText, { color: C.PRIMARY }]}>{sk}</Text>
              <TouchableOpacity
                onPress={() => removeSkill(sk)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginLeft: 6, padding: 4 }}
              >
                <Text style={{ color: C.PRIMARY, fontSize: 16, fontWeight: '700', lineHeight: 18 }}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <SectionLabel text="Requirements" />
      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>18+ Only</Text>
          <Text style={s.subText}>Volunteers must be adults</Text>
        </View>
        <Switch value={form.age18Plus} onValueChange={v => set('age18Plus', v)} trackColor={{ true: C.PRIMARY }} />
      </View>

    </ScrollView>
  );

  const renderStep5 = () => {
    const locType  = LOCATION_TYPES.find(l => l.code === form.locationType);
    const timeStr  = form.startTime
      ? `${display12H(form.startTime)}${form.endTime ? ' – ' + display12H(form.endTime) : ''}`
      : null;
    const locationStr = form.locationType === 'REMOTE'
      ? (form.landmark || 'Online')
      : [form.landmark || form.address, form.city].filter(Boolean).join(', ') || null;
    const schedLabel =
      form.scheduleType === 'ONE_TIME'
        ? `One-time · ${form.date}`
        : form.scheduleType === 'RECURRING'
        ? `Recurring · ${form.activeDays.join(' & ')} · ${form.startDate} – ${form.endDate}`
        : `Flexible · ${form.startDate} – ${form.endDate}${form.minHours ? ' · Min ' + form.minHours + 'h' : ''}`;

    const IconRecur    = () => <ReviewIcon emoji="🔄" />;
    const IconClock    = () => <ReviewIcon emoji="🕐" />;
    const IconPin      = () => <ReviewIcon emoji="📍" />;
    const IconMap      = () => <ReviewIcon emoji="🗺️" />;
    const IconPeople   = () => <ReviewIcon emoji="👥" />;

    return (
      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 20 }}>
        <SectionLabel text="Step 5 — Review & Publish" />

        {/* Main review card — matches prototype .card */}
        <View style={s.reviewCard}>

          {/* Row 1: title + orange category pill (space-between) */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={[s.reviewTitle, { flex: 1, marginRight: 8 }]}>{form.title || '(No title)'}</Text>
            {form.categoryName ? (
              <View style={s.catPill}>
                <Text style={s.catPillText}>{form.categoryName}</Text>
              </View>
            ) : null}
          </View>

          {/* Description */}
          {form.description ? (
            <Text style={s.reviewDesc}>{form.description}</Text>
          ) : null}

          {/* Review rows — SVG icon + text, matching prototype layout */}
          <View style={{ flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <ReviewIconRow icon={<IconRecur />} text={schedLabel} />
            {timeStr ? <ReviewIconRow icon={<IconClock />} text={timeStr} /> : null}
            {locationStr ? <ReviewIconRow icon={<IconPin />} text={locationStr} /> : null}
            {form.locationPinned && form.latitude != null ? (
              <ReviewIconRow icon={<IconMap />}
                text={`${form.latitude.toFixed(5)}° N, ${form.longitude?.toFixed(5)}° E`}
                textColor={C.PRIMARY} />
            ) : null}
            {form.maxVolunteers ? (
              <ReviewIconRow icon={<IconPeople />} text={`Max ${form.maxVolunteers} volunteers`} />
            ) : null}
          </View>

          {/* Divider + skills */}
          {form.skills.length > 0 ? (
            <>
              <View style={s.reviewDivider} />
              <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 6 }}>
                SKILLS REQUIRED
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {form.skills.map(sk => (
                  <View key={sk} style={s.skillPill}>
                    <Text style={s.skillPillText}>{sk}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Visibility / restriction tags */}
          <View style={s.reviewDivider} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <View style={[s.tagPill, { borderColor: form.isPublic ? '#16a34a40' : '#64748b40', backgroundColor: form.isPublic ? '#16a34a12' : '#64748b12' }]}>
              <Text style={[s.tagPillText, { color: form.isPublic ? '#16a34a' : '#64748b' }]}>{form.isPublic ? 'Public' : 'Private'}</Text>
            </View>
            {form.requiresApproval ? (
              <View style={[s.tagPill, { borderColor: '#d9770640', backgroundColor: '#d9770612' }]}>
                <Text style={[s.tagPillText, { color: '#d97706' }]}>Approval Required</Text>
              </View>
            ) : null}
            {form.age18Plus ? (
              <View style={[s.tagPill, { borderColor: '#7c3aed40', backgroundColor: '#7c3aed12' }]}>
                <Text style={[s.tagPillText, { color: '#7c3aed' }]}>18+</Text>
              </View>
            ) : null}
          </View>

          {/* Attendance rule summary — RECURRING / FLEXIBLE only */}
          {form.scheduleType !== 'ONE_TIME' && (() => {
            const msh = calcMinSessionHours(form);
            return (
              <>
                <View style={s.reviewDivider} />
                <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 6 }}>
                  ATTENDANCE RULES
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <View style={[s.tagPill, { borderColor: '#0284c740', backgroundColor: '#0284c712' }]}>
                    <Text style={[s.tagPillText, { color: '#0284c7' }]}>
                      Min {form.minAttendPct || sysDefaults.minAttendPct}% attendance
                    </Text>
                  </View>
                  {form.scheduleType === 'FLEXIBLE' && (
                    <View style={[s.tagPill, { borderColor: '#0284c740', backgroundColor: '#0284c712' }]}>
                      <Text style={[s.tagPillText, { color: '#0284c7' }]}>
                        Max {form.maxDailyHours || sysDefaults.maxDailyHours}h / day
                      </Text>
                    </View>
                  )}
                  {msh != null && (
                    <View style={[s.tagPill, { borderColor: '#0284c740', backgroundColor: '#0284c712' }]}>
                      <Text style={[s.tagPillText, { color: '#0284c7' }]}>
                        Min {msh}h per session
                      </Text>
                    </View>
                  )}
                </View>
              </>
            );
          })()}
        </View>

        {/* Warning box — matches prototype .warn */}
        <View style={s.warningBox}>
          <Text style={s.warningText}>
            Once published, enrolled volunteers will be notified of any changes or cancellations.
          </Text>
        </View>

        <TouchableOpacity
          style={s.publishBtn}
          onPress={() => doSave(false)}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.publishBtnText}>🚀 {isEdit ? 'Update' : 'Publish'}</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.PRIMARY} size="large" />
      </SafeAreaView>
    );
  }

  const stepTitles = ['Basic Info', 'Schedule', 'Location', 'Skills', 'Review'];

  return (
    <SafeAreaView style={s.container} edges={['top','bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => step === 1 ? nav.goBack() : back()} style={s.backBtn}>
          <Text style={s.backBtnText}>{'←'} {step === 1 ? 'Back' : 'Prev'}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isEdit ? 'Edit Project' : 'New Project'}</Text>
        <Text style={s.stepCounter}>{step}/5</Text>
      </View>

      {/* Progress */}
      <View style={s.progressSection}>
        <ProgressBar step={step} total={5} />
        <Text style={s.progressLabel}>{stepTitles[step - 1]}</Text>
      </View>

      {/* Step content */}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}

      {/* Footer (only for steps 1-4) */}
      {step < 5 && (
        <View style={s.footer}>
          <TouchableOpacity style={s.nextBtn} onPress={next}>
            <Text style={s.nextBtnText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {renderPicker()}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Emoji icon for review rows — renders natively without react-native-svg
function ReviewIcon({ emoji }: { emoji: string }) {
  return (
    <Text style={{ fontSize: 15, lineHeight: 18, width: 20, textAlign: 'center', flexShrink: 0 }}>{emoji}</Text>
  );
}

function ReviewIconRow({ icon, text, textColor }: { icon: React.ReactNode; text: string; textColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {icon}
      <Text style={{ fontSize: 11, color: textColor ?? '#64748b', flex: 1 }}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const C_CONST = AppConfig.COLORS;
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn:       { paddingVertical: 4, paddingRight: 8 },
  backBtnText:   { fontSize: 16, color: C_CONST.PRIMARY, fontWeight: '600' },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  stepCounter:   { fontSize: 13, color: '#64748b', fontWeight: '600' },

  progressSection: {
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12, color: '#64748b', fontWeight: '600',
    marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.8,
  },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16,
  },
  label:   { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  subText: { fontSize: 12, color: '#94a3b8', marginTop: 1 },

  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#1e293b', backgroundColor: '#fff',
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', marginBottom: 4,
  },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff',
  },
  chipText: { fontSize: 13, color: '#475569', fontWeight: '500' },

  segBtn:       { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center' },
  segBtnActive: { backgroundColor: C_CONST.PRIMARY, borderColor: C_CONST.PRIMARY },
  segText:      { fontSize: 13, color: '#475569', fontWeight: '600' },
  segTextActive:{ color: '#fff' },

  dayBtn:  { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 12, fontWeight: '700', color: '#475569' },

  durationBadge: {
    fontSize: 13, color: C_CONST.PRIMARY, fontWeight: '600',
    backgroundColor: C_CONST.PRIMARY + '15', alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 8,
  },

  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  mapLoadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  mapCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0', padding: 14,
    marginBottom: 12, alignItems: 'center', gap: 12,
  },
  mapCardIcon:      { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  mapPinnedTitle:   { fontSize: 14, fontWeight: '700', color: '#16a34a' },
  mapPinnedCoords:  { fontSize: 12, color: '#334155', fontWeight: '500', marginTop: 2 },
  mapPinnedAddr:    { fontSize: 11, color: '#64748b', marginTop: 2 },
  mapUnpinnedTitle: { fontSize: 14, fontWeight: '600', color: '#334155' },
  mapUnpinnedSub:   { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  mapBtn: {
    borderWidth: 1.5, borderColor: C_CONST.PRIMARY, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginBottom: 8,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  mapBtnSuccess: { backgroundColor: C_CONST.PRIMARY, borderColor: C_CONST.PRIMARY },
  mapBtnText:    { fontSize: 14, color: C_CONST.PRIMARY, fontWeight: '600' },

  clearPinBtn:  { alignItems: 'center', marginBottom: 8 },
  clearPinText: { fontSize: 13, color: '#ef4444', fontWeight: '500', textDecorationLine: 'underline' },
  geoNote:      { fontSize: 11, color: '#94a3b8', lineHeight: 16, marginTop: 4, marginBottom: 8 },
  geoInfoBadge: {
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
  },
  geoInfoBadgeText: { fontSize: 11, color: '#1D4ED8', fontWeight: '600' },
  geoInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
    borderRadius: 10, padding: 10, marginBottom: 10,
  },
  geoInfoIcon: { fontSize: 14, lineHeight: 18 },
  geoInfoText: { flex: 1, fontSize: 12, color: '#1D4ED8', lineHeight: 17, fontWeight: '500' },

  skillInputRow:  { flexDirection: 'row', gap: 10, marginBottom: 4 },
  addSkillBtn:    { backgroundColor: C_CONST.PRIMARY, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addSkillBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },

  reviewCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
    marginBottom: 10,
  },
  reviewTitle:   { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  reviewDesc:    { fontSize: 11, color: '#64748b', lineHeight: 16, marginBottom: 9 },
  reviewDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 },

  catPill: {
    backgroundColor: '#FFF4EE', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3, flexShrink: 0,
  },
  catPillText: { fontSize: 10, fontWeight: '600', color: '#f97316' },

  skillPill: {
    backgroundColor: C_CONST.PRIMARY + '18', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  skillPillText: { fontSize: 10, fontWeight: '600', color: C_CONST.PRIMARY },

  tagPill:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  tagPillText:{ fontSize: 10, fontWeight: '600' },

  warningBox: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, padding: 9, marginBottom: 10,
  },
  warningText: { fontSize: 11, color: '#92400E', lineHeight: 16 },

  publishBtn: {
    backgroundColor: C_CONST.PRIMARY, borderRadius: 12,
    padding: 9, alignItems: 'center', marginBottom: 7,
  },
  publishBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },


  footer: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  nextBtn:     { backgroundColor: C_CONST.PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff',
  },
  pickerBtnText:        { fontSize: 14, color: '#1e293b', fontWeight: '500' },
  pickerBtnPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  pickerBtnIcon:        { fontSize: 16 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  pickerSheet:   { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  pickerHeader:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  pickerTitle:  { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  pickerCancel: { fontSize: 14, color: '#64748b' },
  pickerDone:   { fontSize: 14, color: C_CONST.PRIMARY, fontWeight: '700' },
});
