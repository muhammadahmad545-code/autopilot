package expo.modules.autopilotengine

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AutopilotEngineModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun openSettings(intent: Intent): Boolean = try {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (e: Exception) {
    context.startActivity(
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    false
  }

  override fun definition() = ModuleDefinition {
    Name("AutopilotEngine")

    Events("onRun")

    OnCreate {
      Engine.listener = { body -> runCatching { sendEvent("onRun", body) } }
    }

    OnDestroy {
      Engine.listener = null
    }

    Function("setRules") { json: String -> Engine.setRules(context, json) }

    Function("setPaused") { paused: Boolean -> Engine.setPaused(context, paused) }

    Function("isPaused") { Engine.isPaused(context) }

    Function("getLog") { Engine.readLog(context) }

    Function("clearLog") { Engine.clearLog(context) }

    Function("runNow") { ruleJson: String ->
      Engine.runNow(context, ruleJson).map { (action, error) -> mapOf("action" to action, "error" to error) }
    }

    Function("nextAlarm") {
      val now = System.currentTimeMillis()
      Engine.rules(context).filter { it.enabled }.mapNotNull { it.nextFireAt(now) }.minOrNull()?.toDouble()
    }

    /** What the rules need from Android, so the app can show what is missing. */
    Function("getPermissions") {
      val nm = context.getSystemService(NotificationManager::class.java)
      val power = context.getSystemService(PowerManager::class.java)
      mapOf(
        "notifications" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
        "doNotDisturb" to nm.isNotificationPolicyAccessGranted,
        "writeSettings" to Settings.System.canWrite(context),
        "exactAlarms" to Engine.exactAlarmsAllowed(context),
        "batteryUnrestricted" to power.isIgnoringBatteryOptimizations(context.packageName)
      )
    }

    Function("openPermission") { which: String ->
      val pkg = Uri.parse("package:${context.packageName}")
      when (which) {
        "notifications" -> openSettings(
          if (Build.VERSION.SDK_INT >= 26) Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        )
        "doNotDisturb" -> openSettings(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
        "writeSettings" -> openSettings(Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, pkg))
        "exactAlarms" -> openSettings(
          if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        )
        "batteryUnrestricted" -> openSettings(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg))
        else -> openSettings(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
      }
    }

    /** Re-arm alarms and the watcher, e.g. after the user grants a permission. */
    Function("refresh") { Engine.refresh(context) }
  }
}
