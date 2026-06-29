package com.familymanager.app.bridge

import com.familymanager.app.data.DeviceCommandDto
import com.familymanager.app.data.DeviceCommandResultRequest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Returns canned data for a capability without touching any real OS API. Used to prove the
 * on-device protocol end-to-end, and as the V1 stand-in for capabilities whose real handler
 * is not built yet (app_usage, device_state).
 */
class MockCapabilityHandler(override val capabilityType: String) : CapabilityHandler {
    override suspend fun handle(command: DeviceCommandDto): DeviceCommandResultRequest {
        return DeviceCommandResultRequest(
            status = DeviceCommandResultStatus.COMPLETED,
            payload = buildJsonObject {
                put("mock", true)
                put("capabilityType", command.capabilityType)
            }
        )
    }
}
