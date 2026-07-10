# NGO Connect — React Native App

## Project Overview
NGO Connect mobile app (Android-first) built with React Native 0.86 + TypeScript.
Connects to the NGO Connect ASP.NET Core 8 API.

## Stack
- React Native 0.86, TypeScript (built-in, no separate template)
- React Navigation v7 (Native Stack + Bottom Tabs)
- Axios with JWT auto-refresh interceptor
- Zustand for global state management
- MMKV for secure token storage (10x faster than AsyncStorage)
- react-hook-form + zod for form validation

## Project Structure
```
src/
  config/       AppConfig.ts — single source of truth (base URL, colors, constants)
  api/          One file per module: auth, user, org, project, feed, community,
                donation, sos, notification, lookup, settings + apiClient.ts
  navigation/   RootNavigator, AuthNavigator, AppNavigator
  screens/      auth/, home/, ngo/, volunteer/, profile/, community/,
                donations/, sos/, admin/
  store/        authStore.ts (Zustand)
  types/        api.types.ts — all TypeScript interfaces
  utils/        (helpers as needed)
```

## Android UI Standards — MANDATORY FOR ALL SCREENS

These rules make the app feel like a native Android app (think Instagram / WhatsApp), not a web page. Apply to every screen, every session — no exceptions.

### Design Tokens (always import from AppConfig)
```typescript
const C = AppConfig.COLORS;   // C.PRIMARY, C.CARD, C.BG, C.BORDER, C.INPUT_BG, ...
const S = AppConfig.SHADOW;   // S.CARD, S.CARD_SM, S.FAB, S.BTN, S.TOPBAR
const R = AppConfig.RADIUS;   // R.CARD=16, R.BTN=12, R.INPUT=10, R.PILL=20
const F = AppConfig.FONTS;    // F.H1, F.H2, F.H3, F.BODY, F.SM, F.XS
```

### Font Sizes — Instagram Scale (STRICTLY ENFORCE)
| Token | Size | Use for |
|-------|------|---------|
| H1    | 22sp | Screen titles, hero numbers |
| H2    | 18sp | Card section headings |
| H3    | 15sp | Card titles, list item titles |
| BODY  | 14sp | All body text, descriptions |
| SM    | 12sp | Secondary labels, timestamps, org names |
| XS    | 11sp | Tiny metadata, distance, secondary badges |

Never go below 11sp for any visible user text. Tab bar labels may use 9-10sp only.

### Card Shadow — NOT Border
Cards must use Android `elevation` + iOS shadow. NEVER use `borderWidth` on a card.

```typescript
// ✅ CORRECT — card floats off background
cardStyle: {
  backgroundColor: C.CARD,
  borderRadius: R.CARD,  // 16
  ...AppConfig.SHADOW.CARD,  // elevation: 3, shadowColor, shadowOffset, shadowOpacity, shadowRadius
}

// ❌ WRONG — web look
cardStyle: {
  backgroundColor: C.CARD,
  borderWidth: 1,
  borderColor: C.BORDER,
}
```

### Input Fields — Border, NOT Shadow
Input fields use `INPUT_BG` + border (never shadow, never card-style).
```typescript
input: {
  backgroundColor: C.INPUT_BG,  // '#F8F8FC'
  borderWidth: 1.5,
  borderColor: C.BORDER,
  borderRadius: R.INPUT,  // 10
  paddingHorizontal: 12,
  paddingVertical: 11,
  fontSize: 14,
  color: C.TEXT,
}
```

### Toggle Chips (category filters, skill chips, interest chips)
Use border that changes color on active state. NEVER shadow on chips.
```typescript
chip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.CARD, borderWidth: 1, borderColor: C.BORDER },
chipActive: { backgroundColor: C.PRIMARY_LIGHT, borderColor: C.PRIMARY },
chipText:       { fontSize: 13, color: C.TEXT2 },
chipTextActive: { color: C.PRIMARY, fontWeight: '600' },
```

### Primary Button — Pressable with Ripple
```typescript
// Always use Pressable (not TouchableOpacity) for primary actions
<Pressable
  style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
  android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
  onPress={...}
>
  <Text style={styles.btnPrimaryText}>Action Label</Text>
</Pressable>

btnPrimary: {
  backgroundColor: C.PRIMARY,
  borderRadius: R.BTN,   // 12
  paddingVertical: 13,
  alignItems: 'center',
  ...AppConfig.SHADOW.BTN,  // colored shadow
},
btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
```

### FAB (Floating Action Button)
```typescript
fab: {
  position: 'absolute', bottom: 82, right: 16,
  width: 52, height: 52, borderRadius: 26,
  backgroundColor: C.PRIMARY,
  alignItems: 'center', justifyContent: 'center',
  ...AppConfig.SHADOW.FAB,   // elevation: 8
},
```

### SafeAreaView
Every screen root: `<SafeAreaView style={{ flex: 1 }} edges={['top']}>`. Never `edges={['all']}` — bottom is managed by tab bar.

### Tab Bar
NEVER set `height` in `tabBarStyle` — let React Navigation + SafeAreaProvider auto-calculate the correct inset for the Android system navigation bar.

### StatusBar
```typescript
<StatusBar barStyle="dark-content" backgroundColor={AppConfig.COLORS.CARD} translucent={false} />
```

### Horizontal Scroll Card Width
Cards in a horizontal ScrollView should be `Dimensions.get('window').width * 0.80` — never a fixed 200px.

### Section Headers
```typescript
sectionTitle: { fontSize: 15, fontWeight: '700', color: C.TEXT },
viewAll:      { fontSize: 13, color: C.PRIMARY, fontWeight: '600' },
```

### Empty / Error States
Every screen must have:
- Loading: `<ActivityIndicator size="large" color={C.PRIMARY} />`
- Error: red message + Retry button
- Empty: emoji + descriptive text at 14sp

---

## Key Conventions

### API Standard
All API responses follow `ApiResponse<T>`:
```typescript
{ isSuccess: number, message: string, data: T | null, errorCode?: string }
```
Always check `response.data.isSuccess === 1` before using data.

### AppConfig — Single Source of Truth
Import from `src/config/AppConfig.ts` for:
- `AppConfig.BASE_URL` — switches automatically via `__DEV__` flag
- `AppConfig.COLORS` — all brand colors
- `AppConfig.LOOKUP` — lookup type codes
- `AppConfig.JWT_EXPIRY_MINUTES`, `OTP_RESEND_SECONDS`, etc.
Never hardcode colors, URLs, or magic numbers in components.

### Auth Flow
- JWT access token (15 min) + refresh token (30 days)
- Stored in MMKV via `tokenStorage` in `apiClient.ts`
- Auto-refresh on 401 with request queue (no lost API calls)
- Zustand `authStore` exposes: `isAuthenticated`, `user`, `login()`, `logout()`

### Navigation
- `RootNavigator` → checks `isAuthenticated` → Auth or App stack
- `AuthNavigator`: Login → OTP
- `AppNavigator`: 5 bottom tabs (Home 🏠 / Explore 🔍 / Impact 📊 / Community 👥 / Profile 👤) + all 38 screens as stack
- Screen names match prototype screen IDs (s-login, s-home, etc.)

### 38 Screens (Prototype v1.6)
Auth: Login, OTP
Volunteer: Home, AllOpportunities, AllProjects, Explore, NgoProfile, ProjectDetail,
           JoinForm, Impact, Community, Profile, EditProfile, MyOrgs, Notifications
Donate: Donate, DonationPayment, DonationSuccess, MyDonations
SOS: SosTrigger, SosActive, SosResolved, LiveLocation
Admin: AdminDashboard, AdminProjects, ProjectDetail(admin), CreateProject,
       Participants, VolunteerProfile, AdminVolunteers, AdminCommunity, AdminOrg,
       MemberImpact, CreateOrg, AdminDonations, AdminCampaigns, AdminDonors,
       AdminTransactions, AdminWithdrawal

## API Base URL
- Dev: `http://10.55.200.135:58411/api/v1` (PC's LAN IP — update if IP changes)
- Prod: `https://api.ngoconnect.app/api/v1` (future)
- If IP changes: update only `AppConfig.BASE_URL` in `src/config/AppConfig.ts`

## Running on Physical Device
```bash
# Start Metro bundler
npx react-native start

# Run on Android (phone must be connected via USB with USB Debugging ON)
npx react-native run-android
```
Device: RZCW218VD3J (connected via ADB)
Do NOT use emulator — causes PC slowdown.

## Backend API
- ASP.NET Core 8, MySQL 8.0
- Architecture: Controller → Interface → DAL → Stored Procedure
- No EF Core — ADO.NET + SPs only
- API project: C:\Gaurav PC\Projects\NGO_Connect\NGOConnectAPI\NGOConnect_API
- Run on: http://0.0.0.0:58411 (accessible from phone on same network)

## Important Rules
- Never hardcode colors — always use `AppConfig.COLORS`
- Never hardcode strings — use constants or lookup values
- Form validation always via react-hook-form + zod schema
- All screens must handle loading state, error state, and empty state
- Accessibility: all touchable elements must have `accessibilityLabel`
