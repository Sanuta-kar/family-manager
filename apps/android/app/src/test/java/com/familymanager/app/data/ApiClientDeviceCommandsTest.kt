package com.familymanager.app.data

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Covers the Device Action Bridge command-pull client methods on [ApiClient]. */
class ApiClientDeviceCommandsTest {
    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json")

    @Test
    fun pullsPendingCommands() = runTest {
        val engine = MockEngine { request ->
            if (request.url.encodedPath.endsWith("/devices/commands") && request.method == HttpMethod.Get) {
                respond(
                    """[{"id":"cmd-1","capabilityType":"calendar","params":{"kind":"calendar","range":"today"},"status":"dispatched"}]""",
                    HttpStatusCode.OK,
                    jsonHeaders
                )
            } else {
                respond("not found", HttpStatusCode.NotFound)
            }
        }
        val client = ApiClient(baseUrl = "http://test.local/api", tokenProvider = { "t" }, engine = engine)

        val commands = client.pullDeviceCommands()

        assertEquals(1, commands.size)
        assertEquals("cmd-1", commands[0].id)
        assertEquals("calendar", commands[0].capabilityType)
    }

    @Test
    fun postsResultToTheCommandResultEndpoint() = runTest {
        var capturedPath: String? = null
        var capturedBody: String? = null
        val engine = MockEngine { request ->
            capturedPath = request.url.encodedPath
            capturedBody = (request.body as TextContent).text
            respond("{}", HttpStatusCode.Created, jsonHeaders)
        }
        val client = ApiClient(baseUrl = "http://test.local/api", tokenProvider = { "t" }, engine = engine)

        client.postDeviceCommandResult(
            "cmd-1",
            DeviceCommandResultRequest(
                status = "completed",
                payload = buildJsonObject { put("events", 0) }
            )
        )

        assertEquals("/api/devices/commands/cmd-1/result", capturedPath)
        assertTrue(capturedBody!!.contains("\"completed\""))
    }
}
