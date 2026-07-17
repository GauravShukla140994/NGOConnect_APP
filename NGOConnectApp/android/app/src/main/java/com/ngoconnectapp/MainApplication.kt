package com.ngoconnectapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
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
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createNotificationChannels()
  }

  // Android 8+ requires notification channels to be registered before any
  // FCM notification can be displayed. The channelId must match what the
  // backend sends in AndroidConfig.Notification.ChannelId ("ngoconnect_default").
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

      // Default channel — used for all general NGO Connect push notifications
      NotificationChannel(
        "ngoconnect_default",
        "NGO Connect Notifications",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Volunteer applications, org approvals, badges, community updates"
        enableVibration(true)
        enableLights(true)
        manager.createNotificationChannel(this)
      }
    }
  }
}
