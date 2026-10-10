/**
 * App Build Version
 *
 * This MUST stay in sync with:
 *   Android → android/app/build.gradle  → versionName
 *   iOS     → ios/NGOConnectApp/Info.plist → CFBundleShortVersionString
 *
 * Format: major.minor[.patch]  e.g. "1.0" or "1.2.3"
 *
 * The update-check hook (useAppUpdateCheck) compares this against
 * APP_VERSION_IOS / APP_VERSION_ANDROID in the Settings table.
 * When the server value is strictly higher, the "Update Available" banner appears.
 *
 * HOW TO RELEASE A NEW BUILD:
 *  1. Bump versionName in build.gradle (Android)
 *  2. Bump CFBundleShortVersionString in Info.plist (iOS)
 *  3. Update APP_BUILD_VERSION below to match
 *  4. After publishing to stores, update APP_VERSION_IOS and APP_VERSION_ANDROID
 *     in the Settings table to trigger the banner for users on older builds.
 */
export const APP_BUILD_VERSION = '1.3.1';
