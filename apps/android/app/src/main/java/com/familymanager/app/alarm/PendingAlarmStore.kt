package com.familymanager.app.alarm

import android.content.Context

/**
 * Lightweight persistence of pending mission alarms so they can be re-armed after
 * a reboot — AlarmManager forgets alarms across reboots. Backed by SharedPreferences;
 * a full Room cache remains a roadmap item (see docs/plans/android-bring-up.md).
 *
 * Each record is stored as `"triggerAtMillis|title"` keyed by `occurrenceId`.
 */
class PendingAlarmStore(context: Context) {
    private val prefs =
        context.applicationContext.getSharedPreferences("pending_alarms", Context.MODE_PRIVATE)

    data class PendingAlarm(val occurrenceId: String, val title: String, val triggerAtMillis: Long)

    fun put(occurrenceId: String, title: String, triggerAtMillis: Long) {
        prefs.edit().putString(occurrenceId, encode(title, triggerAtMillis)).apply()
    }

    fun remove(occurrenceId: String) {
        prefs.edit().remove(occurrenceId).apply()
    }

    /** All recorded alarms still in the future. Past-due/corrupt records are pruned. */
    fun futureAlarms(nowMillis: Long = System.currentTimeMillis()): List<PendingAlarm> {
        val future = mutableListOf<PendingAlarm>()
        val stale = mutableListOf<String>()
        for ((id, raw) in prefs.all) {
            val alarm = (raw as? String)?.let { decode(id, it) }
            if (alarm == null) {
                stale += id
            } else if (alarm.triggerAtMillis > nowMillis) {
                future += alarm
            } else {
                stale += id
            }
        }
        if (stale.isNotEmpty()) {
            prefs.edit().apply { stale.forEach { remove(it) } }.apply()
        }
        return future
    }

    companion object {
        fun encode(title: String, triggerAtMillis: Long): String = "$triggerAtMillis|$title"

        /** Parses a stored record. Splits on the first `|` only, so titles that
         *  themselves contain `|` round-trip correctly. Returns null if malformed. */
        fun decode(occurrenceId: String, raw: String): PendingAlarm? {
            val separator = raw.indexOf('|')
            if (separator <= 0) return null
            val triggerAt = raw.substring(0, separator).toLongOrNull() ?: return null
            return PendingAlarm(occurrenceId, raw.substring(separator + 1), triggerAt)
        }
    }
}
