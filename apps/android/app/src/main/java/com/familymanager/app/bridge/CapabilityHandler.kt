package com.familymanager.app.bridge

import com.familymanager.app.data.DeviceCommandDto
import com.familymanager.app.data.DeviceCommandResultRequest

/** Result statuses a device reports for a command (mirrors the API contract). */
object DeviceCommandResultStatus {
    const val COMPLETED = "completed"
    const val FAILED = "failed"
    const val PERMISSION_REQUIRED = "permission_required"
}

/** Capability identifiers the V1 read-only context bridge handles. */
object DeviceCapabilityType {
    const val CALENDAR = "calendar"
    const val APP_USAGE = "app_usage"
    const val DEVICE_STATE = "device_state"
}

/**
 * Executes exactly one OS-integration capability on-device. New capabilities plug in by
 * registering another handler — the command protocol does not change. See
 * docs/features/device-action-bridge.md.
 */
interface CapabilityHandler {
    val capabilityType: String

    suspend fun handle(command: DeviceCommandDto): DeviceCommandResultRequest
}
