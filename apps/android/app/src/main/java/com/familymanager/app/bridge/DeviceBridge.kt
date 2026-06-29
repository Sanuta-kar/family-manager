package com.familymanager.app.bridge

import android.content.Context
import com.familymanager.app.bridge.calendar.AndroidCalendarReader
import com.familymanager.app.bridge.calendar.CalendarCapabilityHandler
import com.familymanager.app.data.ApiClient
import com.familymanager.app.data.SessionStore

/**
 * Single integration point for the Device Action Bridge on-device: builds the capability
 * registry and runs one pull/execute/report cycle for the current child session. Triggered on
 * app-open and on an FCM command ping; the durable server queue + polling is the source of
 * truth, so a missed ping is not fatal.
 */
object DeviceBridge {
    fun buildRegistry(context: Context): CapabilityHandlerRegistry =
        CapabilityHandlerRegistry(
            listOf(
                CalendarCapabilityHandler(AndroidCalendarReader(context)),
                // app_usage / device_state ship as mock handlers until their real OS readers land.
                MockCapabilityHandler(DeviceCapabilityType.APP_USAGE),
                MockCapabilityHandler(DeviceCapabilityType.DEVICE_STATE)
            )
        )

    /** Runs one cycle if a child session exists; returns the number of commands handled. */
    suspend fun pollOnce(context: Context): Int {
        val session = SessionStore(context)
        if (session.accessToken() == null) {
            return 0
        }
        val apiClient = ApiClient(
            tokenProvider = { session.accessToken() },
            refreshTokenProvider = { session.refreshToken() },
            onTokensRefreshed = { access, refresh -> session.saveTokens(access, refresh) }
        )
        return DeviceCommandProcessor(apiClient, buildRegistry(context)).pollAndExecute()
    }
}
