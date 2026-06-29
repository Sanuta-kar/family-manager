package com.familymanager.app.bridge.calendar

import com.familymanager.app.bridge.CapabilityHandler
import com.familymanager.app.bridge.DeviceCapabilityType
import com.familymanager.app.bridge.DeviceCommandResultStatus
import com.familymanager.app.data.DeviceCommandDto
import com.familymanager.app.data.DeviceCommandResultRequest
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * Reads today's calendar events via `READ_CALENDAR`. If the permission is not granted it
 * returns a `permission_required` result (the server/app can then prompt) rather than failing.
 */
class CalendarCapabilityHandler(private val reader: CalendarReader) : CapabilityHandler {
    override val capabilityType: String = DeviceCapabilityType.CALENDAR

    override suspend fun handle(command: DeviceCommandDto): DeviceCommandResultRequest {
        if (!reader.hasPermission()) {
            return DeviceCommandResultRequest(
                status = DeviceCommandResultStatus.PERMISSION_REQUIRED,
                error = "READ_CALENDAR permission is not granted"
            )
        }

        val events = reader.readToday()
        return DeviceCommandResultRequest(
            status = DeviceCommandResultStatus.COMPLETED,
            payload = buildJsonObject {
                putJsonArray("events") {
                    events.forEach { event ->
                        add(
                            buildJsonObject {
                                put("title", event.title)
                                put("startMillis", event.startMillis)
                                put("endMillis", event.endMillis)
                            }
                        )
                    }
                }
            }
        )
    }
}
