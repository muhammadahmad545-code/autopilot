package expo.modules.autopilotengine

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/** Executes rule actions. Each returns null on success or a short, user-readable reason it could not run. */
object Actions {
  const val CHANNEL_REMINDERS = "autopilot_reminders"

  fun runAll(context: Context, actions: JSONArray): List<Pair<String, String?>> {
    val results = mutableListOf<Pair<String, String?>>()
    for (i in 0 until actions.length()) {
      val action = actions.optJSONObject(i) ?: continue
      val type = action.optString("type")
      val error = try {
        run(context, type, action)
      } catch (e: SecurityException) {
        "Permission missing"
      } catch (e: Exception) {
        e.message ?: "Failed"
      }
      results.add(type to error)
    }
    return results
  }

  private fun run(context: Context, type: String, a: JSONObject): String? = when (type) {
    "ringer" -> ringer(context, a.optString("mode"))
    "dnd" -> dnd(context, a.optBoolean("on"))
    "mediaVolume" -> volume(context, AudioManager.STREAM_MUSIC, a.optInt("percent", 50))
    "ringVolume" -> volume(context, AudioManager.STREAM_RING, a.optInt("percent", 50))
    "brightness" -> brightness(context, a.optInt("percent", 50))
    "flashlight" -> flashlight(context, a.optBoolean("on"))
    "notify" -> notify(context, a.optString("title", "Autopilot"), a.optString("body", ""), a.optString("openPackage", ""))
    else -> "Unknown action"
  }

  private fun policyAccess(context: Context): Boolean {
    val nm = context.getSystemService(NotificationManager::class.java)
    return nm.isNotificationPolicyAccessGranted
  }

  private fun ringer(context: Context, mode: String): String? {
    val audio = context.getSystemService(AudioManager::class.java)
    val target = when (mode) {
      "silent" -> AudioManager.RINGER_MODE_SILENT
      "vibrate" -> AudioManager.RINGER_MODE_VIBRATE
      "normal" -> AudioManager.RINGER_MODE_NORMAL
      else -> return "Unknown ringer mode"
    }
    if (target == AudioManager.RINGER_MODE_SILENT && !policyAccess(context)) return "Needs Do Not Disturb access"
    audio.ringerMode = target
    return null
  }

  private fun dnd(context: Context, on: Boolean): String? {
    if (!policyAccess(context)) return "Needs Do Not Disturb access"
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.setInterruptionFilter(if (on) NotificationManager.INTERRUPTION_FILTER_PRIORITY else NotificationManager.INTERRUPTION_FILTER_ALL)
    return null
  }

  private fun volume(context: Context, stream: Int, percent: Int): String? {
    val audio = context.getSystemService(AudioManager::class.java)
    val max = audio.getStreamMaxVolume(stream)
    val min = if (Build.VERSION.SDK_INT >= 28) audio.getStreamMinVolume(stream) else 0
    val level = (min + (max - min) * percent.coerceIn(0, 100) / 100.0).toInt()
    audio.setStreamVolume(stream, level, 0)
    return null
  }

  private fun brightness(context: Context, percent: Int): String? {
    if (!Settings.System.canWrite(context)) return "Needs Modify system settings access"
    val resolver = context.contentResolver
    Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
    Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, (percent.coerceIn(1, 100) * 255 / 100))
    return null
  }

  private fun flashlight(context: Context, on: Boolean): String? {
    val camera = context.getSystemService(CameraManager::class.java)
    val id = camera.cameraIdList.firstOrNull {
      camera.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
    } ?: return "This phone has no flashlight"
    camera.setTorchMode(id, on)
    return null
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL_REMINDERS) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_REMINDERS, "Rule reminders", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Notifications your rules show"
      })
    }
  }

  private fun notify(context: Context, title: String, body: String, openPackage: String): String? {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return "Notifications are turned off for Autopilot"
    ensureChannel(context)
    val launch = (if (openPackage.isNotEmpty()) context.packageManager.getLaunchIntentForPackage(openPackage) else null)
      ?: context.packageManager.getLaunchIntentForPackage(context.packageName)
    val pending = launch?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      PendingIntent.getActivity(context, title.hashCode(), it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .apply { if (pending != null) setContentIntent(pending) }
      .build()
    NotificationManagerCompat.from(context).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    return null
  }
}
