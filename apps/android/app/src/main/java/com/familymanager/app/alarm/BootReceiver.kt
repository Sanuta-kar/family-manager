package com.familymanager.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // AlarmManager forgets alarms across reboots; re-arm the ones still ahead.
            val scheduler = MissionAlarmScheduler(context)
            val pending = PendingAlarmStore(context).futureAlarms()
            pending.forEach { scheduler.scheduleExact(it.occurrenceId, it.title, it.triggerAtMillis) }
            Log.i("FamilyMission", "Rescheduled ${pending.size} mission alarm(s) after reboot")
        }
    }
}

