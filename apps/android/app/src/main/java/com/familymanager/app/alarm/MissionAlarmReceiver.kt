package com.familymanager.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class MissionAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val occurrenceId = intent.getStringExtra(AlarmActivity.EXTRA_OCCURRENCE_ID)
        val alarmIntent = Intent(context, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(AlarmActivity.EXTRA_TITLE, intent.getStringExtra(AlarmActivity.EXTRA_TITLE))
            putExtra(AlarmActivity.EXTRA_OCCURRENCE_ID, occurrenceId)
        }
        context.startActivity(alarmIntent)
        // The alarm has fired; drop it from the reboot-restore set.
        occurrenceId?.let { PendingAlarmStore(context).remove(it) }
    }
}

