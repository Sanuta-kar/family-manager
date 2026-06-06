package com.familymanager.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class MissionAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarmIntent = Intent(context, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(AlarmActivity.EXTRA_TITLE, intent.getStringExtra(AlarmActivity.EXTRA_TITLE))
            putExtra(AlarmActivity.EXTRA_OCCURRENCE_ID, intent.getStringExtra(AlarmActivity.EXTRA_OCCURRENCE_ID))
        }
        context.startActivity(alarmIntent)
    }
}

