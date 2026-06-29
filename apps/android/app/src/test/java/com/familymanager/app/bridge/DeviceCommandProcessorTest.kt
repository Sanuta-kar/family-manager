package com.familymanager.app.bridge

import com.familymanager.app.bridge.calendar.CalendarCapabilityHandler
import com.familymanager.app.bridge.calendar.CalendarEvent
import com.familymanager.app.bridge.calendar.CalendarReader
import com.familymanager.app.data.ApiClient
import com.familymanager.app.data.DeviceCommandDto
import com.familymanager.app.data.DeviceCommandResultRequest
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceCommandProcessorTest {
    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json")

    /** MockEngine that serves one command and captures the posted result body. */
    private fun engineFor(commandJson: String, posted: MutableList<String>) = MockEngine { request ->
        when {
            request.url.encodedPath.endsWith("/devices/commands") && request.method == HttpMethod.Get ->
                respond("[$commandJson]", HttpStatusCode.OK, jsonHeaders)
            request.url.encodedPath.endsWith("/result") -> {
                posted.add((request.body as TextContent).text)
                respond("{}", HttpStatusCode.Created, jsonHeaders)
            }
            else -> respond("not found", HttpStatusCode.NotFound)
        }
    }

    private fun clientFor(engine: MockEngine) =
        ApiClient(baseUrl = "http://test.local/api", tokenProvider = { "t" }, engine = engine)

    private fun calendarReader(granted: Boolean, events: List<CalendarEvent> = emptyList()) =
        object : CalendarReader {
            override fun hasPermission() = granted
            override fun readToday() = events
        }

    @Test
    fun executesCalendarCommandAndPostsCompletedResult() = runTest {
        val posted = mutableListOf<String>()
        val engine = engineFor(
            """{"id":"cmd-1","capabilityType":"calendar","params":{"kind":"calendar"}}""",
            posted
        )
        val registry = CapabilityHandlerRegistry(
            listOf(CalendarCapabilityHandler(calendarReader(true, listOf(CalendarEvent("Dentist", 1000, 2000)))))
        )

        val count = DeviceCommandProcessor(clientFor(engine), registry).pollAndExecute()

        assertEquals(1, count)
        assertEquals(1, posted.size)
        assertTrue(posted[0].contains("\"completed\""))
        assertTrue(posted[0].contains("Dentist"))
    }

    @Test
    fun reportsPermissionRequiredWhenCalendarDenied() = runTest {
        val posted = mutableListOf<String>()
        val engine = engineFor("""{"id":"cmd-1","capabilityType":"calendar","params":{}}""", posted)
        val registry = CapabilityHandlerRegistry(listOf(CalendarCapabilityHandler(calendarReader(false))))

        DeviceCommandProcessor(clientFor(engine), registry).pollAndExecute()

        assertTrue(posted[0].contains("permission_required"))
    }

    @Test
    fun reportsFailedForAnUnknownCapability() = runTest {
        val posted = mutableListOf<String>()
        val engine = engineFor("""{"id":"cmd-1","capabilityType":"contacts","params":{}}""", posted)
        val registry = CapabilityHandlerRegistry(emptyList())

        DeviceCommandProcessor(clientFor(engine), registry).pollAndExecute()

        assertTrue(posted[0].contains("\"failed\""))
        assertTrue(posted[0].contains("No handler"))
    }

    @Test
    fun reportsFailedWhenAHandlerThrows() = runTest {
        val posted = mutableListOf<String>()
        val engine = engineFor("""{"id":"cmd-1","capabilityType":"calendar","params":{}}""", posted)
        val throwing = object : CapabilityHandler {
            override val capabilityType = DeviceCapabilityType.CALENDAR
            override suspend fun handle(command: DeviceCommandDto): DeviceCommandResultRequest =
                throw IllegalStateException("boom")
        }
        val registry = CapabilityHandlerRegistry(listOf(throwing))

        DeviceCommandProcessor(clientFor(engine), registry).pollAndExecute()

        assertTrue(posted[0].contains("\"failed\""))
        assertTrue(posted[0].contains("boom"))
    }
}
