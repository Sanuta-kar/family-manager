package com.familymanager.app.bridge

import com.familymanager.app.data.DeviceCommandDto
import com.familymanager.app.data.DeviceCommandResultRequest

/**
 * Routes a device command to the handler for its capability type. An unknown capability or a
 * handler exception becomes a `failed` result rather than crashing the poll loop.
 */
class CapabilityHandlerRegistry(handlers: List<CapabilityHandler>) {
    private val handlersByType = handlers.associateBy { it.capabilityType }

    suspend fun execute(command: DeviceCommandDto): DeviceCommandResultRequest {
        val handler = handlersByType[command.capabilityType]
            ?: return DeviceCommandResultRequest(
                status = DeviceCommandResultStatus.FAILED,
                error = "No handler for capability ${command.capabilityType}"
            )
        return try {
            handler.handle(command)
        } catch (error: Exception) {
            DeviceCommandResultRequest(
                status = DeviceCommandResultStatus.FAILED,
                error = error.message ?: "Capability handler failed"
            )
        }
    }
}
