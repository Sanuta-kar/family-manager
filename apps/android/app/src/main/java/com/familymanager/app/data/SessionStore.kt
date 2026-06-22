package com.familymanager.app.data

import android.content.Context

class SessionStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("family_session", Context.MODE_PRIVATE)

    fun accessToken(): String? = preferences.getString(KEY_ACCESS_TOKEN, null)

    fun childProfileId(): String? = preferences.getString(KEY_CHILD_PROFILE_ID, null)

    fun saveTokens(accessToken: String, refreshToken: String, childProfileId: String? = null) {
        preferences.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .apply {
                if (childProfileId != null) putString(KEY_CHILD_PROFILE_ID, childProfileId)
            }
            .apply()
    }

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_CHILD_PROFILE_ID = "child_profile_id"
    }
}
