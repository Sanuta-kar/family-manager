package com.familymanager.app.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class FamilyMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Log.i("FamilyMission", "Received new FCM token; backend registration is queued")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Log.i("FamilyMission", "Push received: ${message.data}")
    }
}

