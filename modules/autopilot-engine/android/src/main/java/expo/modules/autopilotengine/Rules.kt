package expo.modules.autopilotengine

import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** Parsed form of the rules JSON written by the JavaScript side. Unknown fields are ignored. */
data class Rule(
  val id: String,
  val name: String,
  val enabled: Boolean,
  val trigger: JSONObject,
  val conditions: JSONObject?,
  val actions: JSONArray
) {
  val triggerType: String get() = trigger.optString("type")

  /** Next time this rule should fire by the clock, or null for event-driven triggers. */
  fun nextFireAt(now: Long): Long? = when (triggerType) {
    "time" -> nextTime(trigger, now)
    "prayer" -> {
      val times = trigger.optJSONArray("times")
      var next: Long? = null
      if (times != null) {
        for (i in 0 until times.length()) {
          val t = times.optLong(i)
          if (t > now) { next = t; break }
        }
      }
      next
    }
    else -> null
  }

  /** Optional limits that apply to any trigger: weekdays and a time-of-day window. */
  fun conditionsMet(now: Long): Boolean {
    val c = conditions ?: return true
    val cal = Calendar.getInstance().apply { timeInMillis = now }
    val days = c.optJSONArray("days")
    if (days != null && days.length() > 0) {
      val today = isoDay(cal)
      if ((0 until days.length()).none { days.optInt(it) == today }) return false
    }
    val window = c.optJSONObject("window")
    if (window != null) {
      val minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
      val start = window.optInt("start", 0)
      val end = window.optInt("end", 0)
      val inside = if (start <= end) minute in start until end else minute >= start || minute < end
      if (!inside) return false
    }
    return true
  }

  companion object {
    fun isoDay(cal: Calendar): Int = ((cal.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1

    fun nextTime(trigger: JSONObject, now: Long): Long? {
      val hour = trigger.optInt("hour", -1)
      val minute = trigger.optInt("minute", -1)
      if (hour !in 0..23 || minute !in 0..59) return null
      val daysJson = trigger.optJSONArray("days")
      val days = if (daysJson == null || daysJson.length() == 0) (1..7).toSet()
        else (0 until daysJson.length()).map { daysJson.optInt(it) }.toSet()
      val cal = Calendar.getInstance().apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, hour)
        set(Calendar.MINUTE, minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      for (i in 0..7) {
        if (cal.timeInMillis > now && isoDay(cal) in days) return cal.timeInMillis
        cal.add(Calendar.DAY_OF_YEAR, 1)
        cal.set(Calendar.HOUR_OF_DAY, hour)
        cal.set(Calendar.MINUTE, minute)
      }
      return null
    }

    fun parseAll(json: String): List<Rule> {
      val array = try { JSONArray(json) } catch (e: Exception) { return emptyList() }
      val out = mutableListOf<Rule>()
      for (i in 0 until array.length()) {
        val o = array.optJSONObject(i) ?: continue
        val trigger = o.optJSONObject("trigger") ?: continue
        out.add(Rule(
          id = o.optString("id"),
          name = o.optString("name", "Rule"),
          enabled = o.optBoolean("enabled", true),
          trigger = trigger,
          conditions = o.optJSONObject("conditions"),
          actions = o.optJSONArray("actions") ?: JSONArray()
        ))
      }
      return out
    }
  }
}
