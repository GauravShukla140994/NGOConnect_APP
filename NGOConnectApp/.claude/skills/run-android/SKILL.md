---
description: Build, install, and launch NGOConnectApp on a physical Android device over USB. Use when asked to run, launch, or test the app on an attached Android phone.
---

# Run NGOConnectApp on a physical Android device

`npx react-native run-android` does **not** work in this checkout: the
project path contains a space (`Gaurav PC`), and the React Native
CLI's `execa.sync('gradlew.bat', ...)` call fails to resolve the
executable on Windows when the cwd has a space in it:

```
'gradlew.bat' is not recognized as an internal or external command,
operable program or batch file.
```

Work around it by driving Gradle and adb directly. Don't try
`run-android` first — it will fail the same way every time until the
project is moved to a space-free path.

## 1. Confirm the device is visible to adb

```powershell
adb devices -l
```

Needs to show the device with state `device` (not blank, not
`unauthorized`). If it's missing:

- Phone: Settings → Developer options → USB debugging → ON. If it's
  already on but the device still isn't listed, toggle **Revoke USB
  debugging authorizations**, toggle USB debugging OFF then ON, then
  unplug/replug the cable and accept the "Allow USB debugging?"
  prompt on the phone.
- Phone: pull down the USB notification and set the mode to **File
  Transfer (MTP)**, not "Charging only."
- If Device Manager shows `SAMSUNG Android ADB Interface` (or
  equivalent) with status `Unknown` / problem code `CM_PROB_PHANTOM`,
  that's downstream of USB debugging being off, not a missing driver
  — the driver (`WINUSB`) is already correct. Fixing USB debugging on
  the phone clears it.

## 2. Forward the Metro port

```powershell
adb -s <deviceId> reverse tcp:8081 tcp:8081
```

Use whatever port Metro is actually running on (check with
`netstat -ano | findstr ":8081"` or look for "dev server already
running on port N" in CLI output) — default is 8081.

## 3. Build and install directly with Gradle

```powershell
cd android
.\gradlew.bat app:installDebug -x lint -PreactNativeDevServerPort=8081
```

If multiple devices are attached, set `$env:ANDROID_SERIAL =
"<deviceId>"` first so Gradle installs on the right one.

## 4. Launch the app

```powershell
adb -s <deviceId> shell am start -n com.ngoconnectapp/.MainActivity
```

## 5. Verify it's actually running (not crashed)

```powershell
adb -s <deviceId> shell dumpsys activity activities | Select-String "ResumedActivity"
adb -s <deviceId> logcat -d -t 100 *:E | Select-String "ngoconnectapp|ReactNative"
```

`ResumedActivity` should show `com.ngoconnectapp/.MainActivity`, and
the error logcat tail should be empty (or unrelated to the app).
