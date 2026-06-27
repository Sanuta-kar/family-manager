package com.familymanager.app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

class MissionAlarmScheduler(private val context: Context) {
    private val pendingAlarms = PendingAlarmStore(context)

    fun scheduleExact(occurrenceId: String, title: String, triggerAtMillis: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, MissionAlarmReceiver::class.java).apply {
            putExtra(AlarmActivity.EXTRA_TITLE, title)
            putExtra(AlarmActivity.EXTRA_OCCURRENCE_ID, occurrenceId)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            occurrenceId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager.setAlarmClock(
            AlarmManager.AlarmClockInfo(triggerAtMillis, pendingIntent),
            pendingIntent
        )
        // Persist so BootReceiver can re-arm this alarm after a reboot.
        pendingAlarms.put(occurrenceId, title, triggerAtMillis)
    }
}

