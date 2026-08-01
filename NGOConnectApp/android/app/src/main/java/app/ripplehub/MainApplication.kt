package app.ripplehub

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createNotificationChannels()
  }

  // Android 8+ (API 26+): sound, vibration, and importance are set at the CHANNEL level.
  // Per-notification overrides are ignored by the OS — the channel is the source of truth.
  //
  // IMPORTANT: once a channel is created on a device, Android ignores setSound/vibration
  // updates for that same channel ID. New channels must use a new ID.
  // ⚠️  setSound() MUST be called explicitly — many OEM ROMs (Samsung OneUI, Xiaomi MIUI,
  // OnePlus) default to SILENT if setSound() is omitted, even with IMPORTANCE_HIGH.
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

      // ── AudioAttributes for standard notifications ──────────────────────────
      val notifAudioAttr = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build()

      // ── AudioAttributes for SOS — alarm-class so it cuts through on some ROMs
      val sosAudioAttr = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .build()

      // ── General notifications (applications, memberships, donations, badges…) ─
      NotificationChannel(
        "ripplehub_default",
        "RippleHub Notifications",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Volunteer applications, org approvals, donations, badges, community updates"
        setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
          notifAudioAttr
        )
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 250, 100, 250)   // pause, buzz, gap, buzz (ms)
        enableLights(true)
        lightColor = Color.parseColor("#6B4EFF")            // RippleHub brand purple
        manager.createNotificationChannel(this)
      }

      // ── SOS emergency alerts ───────────────────────────────────────────────
      // Separate channel so users can give SOS a distinct sound/volume in Settings,
      // independent of general notifications (e.g. keep general on low, SOS always loud).
      // Uses alarm URI — more likely to play on MIUI/OneUI even at low media volume.
      NotificationChannel(
        "ripplehub_sos",
        "SOS Emergency Alerts",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Emergency SOS alerts and responder updates — always shown immediately"
        setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
          sosAudioAttr
        )
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)  // urgent triple-pulse
        enableLights(true)
        lightColor = Color.RED
        manager.createNotificationChannel(this)
      }
    }
  }
}
