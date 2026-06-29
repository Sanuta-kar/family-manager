package com.familymanager.app.notifications

import android.content.Intent
import android.util.Log
import com.familymanager.app.alarm.AlarmActivity
import com.familymanager.app.bridge.DeviceBridge
import com.familymanager.app.data.ApiClient
import com.familymanager.app.data.SessionStore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class FamilyMessagingService : FirebaseMessagingService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val sessionStore = SessionStore(this)
        val apiClient = ApiClient(
            tokenProvider = { sessionStore.accessToken() },
            refreshTokenProvider = { sessionStore.refreshToken() },
            onTokensRefreshed = { access, refresh -> sessionStore.saveTokens(access, refresh) }
        )
        serviceScope.launch {
            try {
                apiClient.registerFcmToken(token)
                Log.i("FamilyMission", "Registered FCM token with backend")
            } catch (error: Exception) {
                Log.w("FamilyMission", "Could not register FCM token yet", error)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Log.i("FamilyMission", "Push received: ${message.data}")
        MissionReminderPush.from(message.data)?.let(::openMissionReminder)

        // Device Action Bridge wake ping: pull and execute any pending device commands.
        if (message.data["type"] == "device_command") {
            serviceScope.launch {
                runCatching { DeviceBridge.pollOnce(applicationContext) }
                    .onFailure { Log.w("FamilyMission", "Device command poll failed", it) }
            }
        }
    }

    private fun openMissionReminder(reminder: MissionReminderPush) {
        val alarmIntent = Intent(this, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(AlarmActivity.EXTRA_TITLE, reminder.title)
            putExtra(AlarmActivity.EXTRA_OCCURRENCE_ID, reminder.occurrenceId)
        }
        startActivity(alarmIntent)
    }
}
