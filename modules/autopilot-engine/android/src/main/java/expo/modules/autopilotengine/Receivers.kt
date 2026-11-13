package expo.modules.autopilotengine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    try {
      Engine.onAlarm(context.applicationContext)
    } finally {
      pending.finish()
    }
  }
}

/** Alarms do not survive a reboot or a clock change, so re-arm everything. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val app = context.applicationContext
    when (intent.action) {
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_TIME_CHANGED -> {
        val pending = goAsync()
        try {
          if (intent.action == Intent.ACTION_TIME_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED) Engine.onClockChanged(app)
          // Catch up on anything that should have run while the phone was off, then re-arm.
          Engine.onAlarm(app)
          try {
            Engine.refresh(app)
          } catch (e: Exception) {
            // Starting a foreground service can be refused by the system; alarms are still armed.
          }
        } finally {
          pending.finish()
        }
      }
    }
  }
}
