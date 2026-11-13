package expo.modules.autopilotengine

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * Process-wide rule engine. Everything it needs lives in device-protected SharedPreferences, so it
 * works when the React Native side is not running and right after a reboot, before first unlock.
 */
object Engine {
  private const val PREFS = "autopilot_engine"
  private const val KEY_RULES = "rules"
  private const val KEY_LOG = "log"
  private const val KEY_PAUSED = "paused"
  private const val KEY_LAST_CHECK = "lastCheckedAt"
  private const val LOG_LIMIT = 300
  private const val ALARM_REQUEST = 4201

  /** How late a missed state-setting rule may still run (phone off, deep doze). Older ones are logged as missed. */
  private const val CATCH_UP_MS = 2 * 60 * 60 * 1000L
  /** Battery rules re-arm only after the level moves this far back across the threshold. */
  private const val BATTERY_HYSTERESIS = 3
  private const val PRAYER_WARN_MS = 14 * 24 * 60 * 60 * 1000L

  /** Set by the module while JavaScript is alive so the UI updates live. */
  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

  @Volatile private var cached: SharedPreferences? = null

  /** Opened once per process; the one-time move from credential storage runs under a lock. */
  private fun prefs(context: Context): SharedPreferences {
    cached?.let { return it }
    synchronized(this) {
      cached?.let { return it }
      val storage = if (Build.VERSION.SDK_INT >= 24) context.applicationContext.createDeviceProtectedStorageContext() else context.applicationContext
      if (Build.VERSION.SDK_INT >= 24) {
        val probe = storage.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!probe.getBoolean("migrated", false)) {
          // Moves v1.0 rules from credential-protected storage. Must happen before anyone writes here.
          runCatching { storage.moveSharedPreferencesFrom(context.applicationContext, PREFS) }
        }
      }
      val prefs = storage.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (!prefs.getBoolean("migrated", false)) prefs.edit().putBoolean("migrated", true).commit()
      cached = prefs
      return prefs
    }
  }

  fun rules(context: Context): List<Rule> = Rule.parseAll(prefs(context).getString(KEY_RULES, "[]") ?: "[]")

  fun isPaused(context: Context): Boolean = prefs(context).getBoolean(KEY_PAUSED, false)

  @Synchronized
  fun setRules(context: Context, json: String) {
    val prefs = prefs(context)
    val now = System.currentTimeMillis()
    // Compare what the user set, not the precomputed prayer timestamps that change on every sync.
    fun shape(rule: Rule) = JSONObject(rule.trigger.toString()).apply { remove("times") }.toString()
    val before = rules(context).filter { it.enabled }.associate { it.id to shape(it) }
    val editor = prefs.edit()
    if (!prefs.contains(KEY_LAST_CHECK)) editor.putLong(KEY_LAST_CHECK, now)
    // A rule that is new, just turned on, or given a different time starts counting from now, so a
    // 09:00 rule created at 09:30 does not immediately "catch up" on a time from before it existed.
    for (rule in Rule.parseAll(json)) {
      if (rule.enabled && rule.isClock && before[rule.id] != shape(rule)) editor.putLong("last:${rule.id}", now)
    }
    editor.putString(KEY_RULES, json).apply()
    refresh(context)
  }

  fun setPaused(context: Context, paused: Boolean) {
    prefs(context).edit().putBoolean(KEY_PAUSED, paused).putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
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
    if (exactAlarmsAllowed(context)) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
  }

  fun exactAlarmsAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

  /**
   * Runs every clock rule whose latest occurrence fell since the last check. Alarms can arrive late
   * (doze) or not at all (phone off), so this catches up instead of only looking at "now".
   */
  @Synchronized
  fun onAlarm(context: Context) {
    val now = System.currentTimeMillis()
    val prefs = prefs(context)
    val lastCheck = prefs.getLong(KEY_LAST_CHECK, now - 60_000)
    if (!isPaused(context)) {
      for (rule in rules(context)) {
        if (!rule.enabled || !rule.isClock) continue
        val due = rule.latestOccurrence(lastCheck, now + EARLY_MS) ?: continue
        val lastKey = "last:${rule.id}"
        if (prefs.getLong(lastKey, 0) >= due) continue
        prefs.edit().putLong(lastKey, due).apply()
        val late = now - due
        when {
          late > CATCH_UP_MS -> log(context, rule, describeClock(rule), emptyList(), skipped = "Missed: the phone was off or asleep at ${clockText(due)}")
          late > 90_000 -> fire(context, rule, "${describeClock(rule)} (ran ${late / 60_000} min late)")
          else -> fire(context, rule, describeClock(rule))
        }
      }
    }
    prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
    warnIfPrayerTimesRunningOut(context, now)
    scheduleNextAlarm(context)
  }

  private fun clockText(at: Long) = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(at))

  private fun describeClock(rule: Rule): String =
    if (rule.triggerType == "prayer") "Prayer time: ${rule.trigger.optString("prayer").replaceFirstChar { it.uppercase() }}"
    else "Scheduled time %02d:%02d".format(rule.trigger.optInt("hour"), rule.trigger.optInt("minute"))

  /** After a clock correction, forget "already ran" marks that lie in the future. */
  fun onClockChanged(context: Context) {
    val prefs = prefs(context)
    val now = System.currentTimeMillis()
    val editor = prefs.edit()
    prefs.all.forEach { (key, value) -> if (key.startsWith("last:") && value is Long && value > now) editor.remove(key) }
    if (prefs.getLong(KEY_LAST_CHECK, 0) > now) editor.putLong(KEY_LAST_CHECK, now)
    editor.apply()
  }

  /** Prayer times are precomputed by the app; remind the user to open it before they run out. */
  private fun warnIfPrayerTimesRunningOut(context: Context, now: Long) {
    val prayerRules = rules(context).filter { it.enabled && it.triggerType == "prayer" }
    if (prayerRules.isEmpty()) return
    val lastTime = prayerRules.mapNotNull { it.prayerTimes().lastOrNull() }.minOrNull() ?: return
    if (lastTime - now > PRAYER_WARN_MS) return
    val prefs = prefs(context)
    if (now - prefs.getLong("prayerWarnedAt", 0) < 24 * 60 * 60 * 1000L) return
    prefs.edit().putLong("prayerWarnedAt", now).apply()
    Actions.notify(context, "Open Autopilot to refresh prayer times", "Prayer rules have times for only a few more days. Opening the app recalculates the next four months.", "")
  }

  // ---- event triggers ---------------------------------------------------------------------------

  /** Called by the watch service. `event` carries `type` plus the trigger-specific fields. */
  @Synchronized
  fun onEvent(context: Context, event: JSONObject) {
    if (isPaused(context)) return
    for (rule in rules(context)) {
      if (!rule.enabled || rule.triggerType != event.optString("type")) continue
      if (rule.triggerType == "battery") {
        if (batteryShouldFire(context, rule, event.optInt("level", -1))) fire(context, rule, event.optString("description"))
        continue
      }
      if (rule.triggerType == "wifi" && rule.trigger.optString("ssid").isNotBlank() && event.optString("ssid").isEmpty()) {
        log(context, rule, event.optString("description"), emptyList(), skipped = "Couldn’t read the Wi-Fi name. Check that Location is on and Autopilot may use it all the time.")
        continue
      }
      if (!matches(rule.trigger, event)) continue
      fire(context, rule, event.optString("description"))
    }
  }

  /**
   * Fires once per crossing, then waits until the level moves [BATTERY_HYSTERESIS] points back.
   * Stops "Unplug at 80%" from firing on every 79↔80 bounce while the charger holds the level.
   */
  private fun batteryShouldFire(context: Context, rule: Rule, level: Int): Boolean {
    if (level < 0) return false
    val prefs = prefs(context)
    val key = "armed:${rule.id}"
    val threshold = rule.trigger.optInt("level", 20)
    val above = rule.trigger.optString("direction", "below") == "above"
    val crossed = if (above) level >= threshold else level < threshold
    val rearm = if (above) level <= threshold - BATTERY_HYSTERESIS else level >= threshold + BATTERY_HYSTERESIS
    if (!prefs.contains(key)) {
      // First reading for this rule: armed only if we start on the far side of the threshold.
      prefs.edit().putBoolean(key, !crossed).apply()
      return false
    }
    val armed = prefs.getBoolean(key, true)
    return when {
      armed && crossed -> {
        prefs.edit().putBoolean(key, false).apply()
        true
      }
      !armed && rearm -> {
        prefs.edit().putBoolean(key, true).apply()
        false
      }
      else -> false
    }
  }

  fun matches(trigger: JSONObject, event: JSONObject): Boolean = when (trigger.optString("type")) {
    "charging", "headphones" -> trigger.optString("state") == event.optString("state")
    "unlock" -> true
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
      log(context, rule, cause, emptyList(), skipped = "Outside this rule’s days or hours")
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

  private const val EARLY_MS = 30 * 1000L
}
