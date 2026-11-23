package expo.modules.autopilotengine

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.RemoteViews
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

/** One place that describes the engine's state for the widget and the Quick Settings tile. */
object Status {
  data class Snapshot(val paused: Boolean, val pausedUntil: Long, val active: Int, val nextName: String?, val nextAt: Long?)

  fun snapshot(context: Context): Snapshot {
    val now = System.currentTimeMillis()
    val enabled = Engine.rules(context).filter { it.enabled }
    val next = enabled.mapNotNull { rule -> rule.nextFireAt(now)?.let { rule to it } }.minByOrNull { it.second }
    return Snapshot(Engine.isPaused(context), Engine.pausedUntil(context), enabled.size, next?.first?.name, next?.second)
  }

  fun timeText(at: Long): String {
    val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(at))
    val target = Calendar.getInstance().apply { timeInMillis = at }
    val today = Calendar.getInstance()
    return when {
      target.get(Calendar.YEAR) == today.get(Calendar.YEAR) && target.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR) -> time
      target.get(Calendar.DAY_OF_YEAR) == (today.get(Calendar.DAY_OF_YEAR) % 365) + 1 -> "tomorrow $time"
      else -> "${DateFormat.getDateInstance(DateFormat.SHORT).format(Date(at))} $time"
    }
  }

  /** Called whenever rules, pauses or the next alarm change. */
  fun publish(context: Context) {
    runCatching { StatusWidget.updateAll(context) }
    runCatching { TileService.requestListeningState(context, ComponentName(context, PauseTileService::class.java)) }
  }

  /** Pause for an hour, or resume, from the widget or tile. */
  fun toggle(context: Context) {
    if (Engine.isPaused(context)) Engine.setPaused(context, false)
    else Engine.pauseUntil(context, System.currentTimeMillis() + 60 * 60 * 1000L)
  }
}

/** Home-screen widget: status, what runs next, and a Pause/Resume button. */
class StatusWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { manager.updateAppWidget(it, views(context)) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_TOGGLE) {
      Status.toggle(context)
      return
    }
    super.onReceive(context, intent)
  }

  companion object {
    const val ACTION_TOGGLE = "expo.modules.autopilotengine.WIDGET_TOGGLE"

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, StatusWidget::class.java))
      if (ids.isEmpty()) return
      val v = views(context)
      ids.forEach { manager.updateAppWidget(it, v) }
    }

    private fun views(context: Context): RemoteViews {
      val s = Status.snapshot(context)
      val v = RemoteViews(context.packageName, R.layout.autopilot_widget)
      val status = when {
        s.paused && s.pausedUntil > 0 -> "Paused until ${Status.timeText(s.pausedUntil)}"
        s.paused -> "Paused"
        s.active == 0 -> "No active rules"
        else -> "${s.active} rule${if (s.active == 1) "" else "s"} on"
      }
      val next = when {
        s.paused -> "Nothing runs while paused."
        s.nextName != null && s.nextAt != null -> "Next: ${s.nextName} at ${Status.timeText(s.nextAt)}"
        s.active > 0 -> "Event rules wait for their trigger."
        else -> "Tap to add a rule."
      }
      v.setTextViewText(R.id.widget_status, status)
      v.setTextViewText(R.id.widget_next, next)
      v.setTextViewText(R.id.widget_toggle, if (s.paused) "Resume" else "Pause 1 h")
      val toggle = PendingIntent.getBroadcast(
        context, 11,
        Intent(context, StatusWidget::class.java).setAction(ACTION_TOGGLE),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      v.setOnClickPendingIntent(R.id.widget_toggle, toggle)
      val open = PendingIntent.getActivity(
        context, 12,
        Intent(Intent.ACTION_VIEW, Uri.parse("autopilot://")).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      v.setOnClickPendingIntent(R.id.widget_root, open)
      return v
    }
  }
}

/** Quick Settings tile: on while rules run; tap to pause for an hour or resume. */
class PauseTileService : TileService() {
  override fun onStartListening() {
    val tile = qsTile ?: return
    val s = Status.snapshot(this)
    tile.state = if (s.paused) Tile.STATE_INACTIVE else Tile.STATE_ACTIVE
    tile.label = "Autopilot"
    if (Build.VERSION.SDK_INT >= 29) {
      tile.subtitle = when {
        s.paused && s.pausedUntil > 0 -> "Paused until ${Status.timeText(s.pausedUntil)}"
        s.paused -> "Paused"
        else -> "${s.active} rule${if (s.active == 1) "" else "s"} on"
      }
    }
    tile.updateTile()
  }

  override fun onClick() {
    Status.toggle(this)
    onStartListening()
  }
}
