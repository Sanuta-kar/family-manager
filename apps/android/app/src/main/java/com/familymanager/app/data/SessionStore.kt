package com.familymanager.app.data

import android.content.Context

class SessionStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("family_session", Context.MODE_PRIVATE)

    fun accessToken(): String? = preferences.getString(KEY_ACCESS_TOKEN, null)

    fun refreshToken(): String? = preferences.getString(KEY_REFRESH_TOKEN, null)

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

    // Parent session is stored separately from the child session: the app
    // toggles between Child and Parent modes on the same device, and the two
    // roles authenticate with different tokens.
    fun parentAccessToken(): String? = preferences.getString(KEY_PARENT_ACCESS_TOKEN, null)

    fun parentRefreshToken(): String? = preferences.getString(KEY_PARENT_REFRESH_TOKEN, null)

    fun saveParentTokens(accessToken: String, refreshToken: String) {
        preferences.edit()
            .putString(KEY_PARENT_ACCESS_TOKEN, accessToken)
            .putString(KEY_PARENT_REFRESH_TOKEN, refreshToken)
            .apply()
    }

    fun clearParentSession() {
        preferences.edit()
            .remove(KEY_PARENT_ACCESS_TOKEN)
            .remove(KEY_PARENT_REFRESH_TOKEN)
            .apply()
    }

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_CHILD_PROFILE_ID = "child_profile_id"
        private const val KEY_PARENT_ACCESS_TOKEN = "parent_access_token"
        private const val KEY_PARENT_REFRESH_TOKEN = "parent_refresh_token"
    }
}
