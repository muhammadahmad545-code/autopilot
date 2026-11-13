package expo.modules.autopilotengine

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * Process-wide rule engine. Everything it needs lives in SharedPreferences, so it works when
 * the React Native side is not running (alarms, boot, the watch service).
 */
object Engine {
  private const val PREFS = "autopilot_engine"
  private const val KEY_RULES = "rules"
  private const val KEY_LOG = "log"
  private const val KEY_PAUSED = "paused"
  private const val LOG_LIMIT = 300
  private const val ALARM_REQUEST = 4201

  /** Set by the module while JavaScript is alive so the UI updates live. */
  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun rules(context: Context): List<Rule> = Rule.parseAll(prefs(context).getString(KEY_RULES, "[]") ?: "[]")

  fun isPaused(context: Context): Boolean = prefs(context).getBoolean(KEY_PAUSED, false)

  fun setRules(context: Context, json: String) {
    prefs(context).edit().putString(KEY_RULES, json).apply()
    refresh(context)
  }

  fun setPaused(context: Context, paused: Boolean) {
    prefs(context).edit().putBoolean(KEY_PAUSED, paused).apply()
    refresh(context)
  }

  /** Re-arm the alarm and start or stop the watch service to match the current rules. */
  fun refresh(context: Context) {
    scheduleNextAlarm(context)
    val needsWatcher = !isPaused(context) && rules(context).any { it.enabled && it.triggerType in WatchService.EVENT_TYPES }
    if (needsWatcher) WatchService.start(context) else WatchService.stop(context)
  }

  // ---- clock triggers --------------------------------------------------------------------------

  private fun alarmIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context, ALARM_REQUEST,
      Intent(context, AlarmReceiver::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  fun scheduleNextAlarm(context: Context) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    val pending = alarmIntent(context)
    alarms.cancel(pending)
    if (isPaused(context)) return
    val now = System.currentTimeMillis()
    val next = rules(context).filter { it.enabled }.mapNotNull { it.nextFireAt(now) }.minOrNull() ?: return
    val exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()
    if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
  }

  fun exactAlarmsAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

  /** Called by the alarm: run every clock rule that is due within the last few minutes. */
  fun onAlarm(context: Context) {
    val now = System.currentTimeMillis()
    val prefs = prefs(context)
    if (!isPaused(context)) {
      for (rule in rules(context)) {
        if (!rule.enabled || rule.triggerType !in setOf("time", "prayer")) continue
        // The due time is the next fire time as seen from slightly in the past.
        val due = rule.nextFireAt(now - GRACE_MS) ?: continue
        if (due > now + EARLY_MS) continue
        val lastKey = "last:${rule.id}"
        if (prefs.getLong(lastKey, 0) >= due) continue
        prefs.edit().putLong(lastKey, due).apply()
        fire(context, rule, describeClock(rule))
      }
    }
    scheduleNextAlarm(context)
  }

  private fun describeClock(rule: Rule): String =
    if (rule.triggerType == "prayer") "Prayer time: ${rule.trigger.optString("prayer")}"
    else "Scheduled time %02d:%02d".format(rule.trigger.optInt("hour"), rule.trigger.optInt("minute"))

  // ---- event triggers ---------------------------------------------------------------------------

  /** Called by the watch service. `event` carries `type` plus the trigger-specific fields. */
  fun onEvent(context: Context, event: JSONObject) {
    if (isPaused(context)) return
    val now = System.currentTimeMillis()
    for (rule in rules(context)) {
      if (!rule.enabled || rule.triggerType != event.optString("type")) continue
      if (!matches(rule.trigger, event)) continue
      fire(context, rule, event.optString("description"))
    }
  }

  fun matches(trigger: JSONObject, event: JSONObject): Boolean = when (trigger.optString("type")) {
    "charging", "headphones" -> trigger.optString("state") == event.optString("state")
    "battery" -> {
      val threshold = trigger.optInt("level", 20)
      val previous = event.optInt("previous", -1)
      val level = event.optInt("level", -1)
      when (trigger.optString("direction", "below")) {
        "above" -> previous in 0 until threshold && level >= threshold
        else -> previous >= threshold && level in 0 until threshold
      }
    }
    "wifi" -> {
      val wanted = trigger.optString("ssid", "").trim()
      trigger.optString("state") == event.optString("state") &&
        (wanted.isEmpty() || wanted.equals(event.optString("ssid", ""), ignoreCase = true))
    }
    else -> false
  }

  // ---- running and logging -----------------------------------------------------------------------

  fun fire(context: Context, rule: Rule, cause: String) {
    if (!rule.conditionsMet(System.currentTimeMillis())) {
      log(context, rule, cause, emptyList(), skipped = "Outside this rule's days or hours")
      return
    }
    log(context, rule, cause, Actions.runAll(context, rule.actions), skipped = null)
  }

  /** Run a rule's actions immediately, from the app's "Test" button. */
  fun runNow(context: Context, ruleJson: String): List<Pair<String, String?>> {
    val rule = Rule.parseAll("[$ruleJson]").firstOrNull() ?: return emptyList()
    val results = Actions.runAll(context, rule.actions)
    log(context, rule, "Manual test", results, skipped = null)
    return results
  }

  @Synchronized
  private fun log(context: Context, rule: Rule, cause: String, results: List<Pair<String, String?>>, skipped: String?) {
    val entry = JSONObject()
      .put("at", System.currentTimeMillis())
      .put("ruleId", rule.id)
      .put("ruleName", rule.name)
      .put("cause", cause)
      .put("skipped", skipped ?: JSONObject.NULL)
      .put("results", JSONArray().apply {
        results.forEach { (type, error) -> put(JSONObject().put("action", type).put("error", error ?: JSONObject.NULL)) }
      })
    val prefs = prefs(context)
    val old = try { JSONArray(prefs.getString(KEY_LOG, "[]")) } catch (e: Exception) { JSONArray() }
    val updated = JSONArray().put(entry)
    for (i in 0 until minOf(old.length(), LOG_LIMIT - 1)) updated.put(old.get(i))
    prefs.edit().putString(KEY_LOG, updated.toString()).apply()
    listener?.invoke(mapOf("entry" to entry.toString()))
  }

  fun readLog(context: Context): String = prefs(context).getString(KEY_LOG, "[]") ?: "[]"

  fun clearLog(context: Context) {
    prefs(context).edit().putString(KEY_LOG, "[]").apply()
  }

  private const val GRACE_MS = 5 * 60 * 1000L
  private const val EARLY_MS = 30 * 1000L
}
