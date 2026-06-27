package com.familymanager.app.data

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises the 401 → refresh → retry flow in [ApiClient] with ktor's [MockEngine].
 * This is the first JVM unit test in the Android module.
 */
class ApiClientRefreshTest {

    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json")

    /** A protected call that 401s once, then succeeds after the access token rotates. */
    @Test
    fun refreshesAndRetriesOnUnauthorized() = runTest {
        var access = "stale-access"
        var refresh = "good-refresh"
        var refreshCalls = 0

        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("/auth/refresh") -> {
                    refreshCalls++
                    respond(
                        """{"accessToken":"fresh-access","refreshToken":"fresh-refresh"}""",
                        HttpStatusCode.OK,
                        jsonHeaders
                    )
                }
                request.url.encodedPath.endsWith("/children") -> {
                    if (request.headers[HttpHeaders.Authorization] == "Bearer fresh-access") {
                        respond("""[{"id":"c1","name":"Ada","coinBalance":7}]""", HttpStatusCode.OK, jsonHeaders)
                    } else {
                        respond("""{"message":"jwt expired"}""", HttpStatusCode.Unauthorized, jsonHeaders)
                    }
                }
                else -> respond("""{"message":"not found"}""", HttpStatusCode.NotFound, jsonHeaders)
            }
        }

        val client = ApiClient(
            baseUrl = "http://test.local/api",
            tokenProvider = { access },
            refreshTokenProvider = { refresh },
            onTokensRefreshed = { a, r -> access = a; refresh = r },
            engine = engine
        )

        val children = client.listChildren()

        assertEquals(1, children.size)
        assertEquals("Ada", children[0].name)
        assertEquals(7, children[0].coinBalance)
        // Exactly one refresh, and the rotated pair was persisted via the callback.
        assertEquals(1, refreshCalls)
        assertEquals("fresh-access", access)
        assertEquals("fresh-refresh", refresh)
    }

    /** When the refresh token itself is rejected, the original 401 surfaces unchanged. */
    @Test
    fun surfacesOriginalUnauthorizedWhenRefreshFails() = runTest {
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("/auth/refresh") ->
                    respond("""{"message":"Invalid refresh token"}""", HttpStatusCode.Unauthorized, jsonHeaders)
                else ->
                    respond("""{"message":"jwt expired"}""", HttpStatusCode.Unauthorized, jsonHeaders)
            }
        }

        val client = ApiClient(
            baseUrl = "http://test.local/api",
            tokenProvider = { "stale-access" },
            refreshTokenProvider = { "expired-refresh" },
            onTokensRefreshed = { _, _ -> },
            engine = engine
        )

        val error = assertThrows(ApiException::class.java) {
            kotlinx.coroutines.runBlocking { client.listChildren() }
        }
        assertEquals(401, error.statusCode)
        assertTrue(error.body.contains("jwt expired"))
    }

    /** With no refresh token (e.g. unauthenticated client), a 401 is not retried. */
    @Test
    fun doesNotRefreshWithoutRefreshToken() = runTest {
        var refreshAttempted = false
        val engine = MockEngine { request ->
            if (request.url.encodedPath.endsWith("/auth/refresh")) refreshAttempted = true
            respond("""{"message":"jwt expired"}""", HttpStatusCode.Unauthorized, jsonHeaders)
        }

        val client = ApiClient(
            baseUrl = "http://test.local/api",
            tokenProvider = { "stale-access" },
            refreshTokenProvider = { null },
            engine = engine
        )

        assertThrows(ApiException::class.java) {
            kotlinx.coroutines.runBlocking { client.listChildren() }
        }
        assertEquals(false, refreshAttempted)
    }
}
