package com.familymanager.app.bridge

import com.familymanager.app.data.ApiClient

/**
 * Pulls the device's pending commands, runs each through the registry, and posts the result
 * back. Result posting is best-effort per command so one failure does not abort the batch
 * (the server result is idempotent, so a later retry is safe).
 */
class DeviceCommandProcessor(
    private val apiClient: ApiClient,
    private val registry: CapabilityHandlerRegistry
) {
    /** Returns the number of commands pulled. */
    suspend fun pollAndExecute(): Int {
        val commands = apiClient.pullDeviceCommands()
        for (command in commands) {
            val result = registry.execute(command)
            runCatching { apiClient.postDeviceCommandResult(command.id, result) }
        }
        return commands.size
    }
}
