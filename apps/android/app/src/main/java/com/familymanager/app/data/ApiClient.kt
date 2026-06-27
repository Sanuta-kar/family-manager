package com.familymanager.app.data

import com.familymanager.app.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class ApiClient(
    private val baseUrl: String = BuildConfig.API_BASE_URL,
    private val tokenProvider: () -> String? = { null }
) {
    private val client = HttpClient(Android) {
        install(ContentNegotiation) {
            // encodeDefaults so default-valued request fields (e.g.
            // ClaimDeviceRequest.platform = "android") are actually sent;
            // the API requires them. ignoreUnknownKeys so extra response
            // fields (e.g. childProfileId) don't break deserialization.
            json(Json { ignoreUnknownKeys = true; encodeDefaults = true })
        }
    }

    suspend fun bootstrapParent(request: BootstrapParentRequest): AuthResponse {
        return client.post("$baseUrl/auth/parent/bootstrap") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.orThrow().body()
    }

    suspend fun login(email: String, password: String): AuthResponse {
        return client.post("$baseUrl/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(LoginRequest(email, password))
        }.orThrow().body()
    }

    /** Lists the children in the parent's family (or the child's own profile for
     *  a child token). Each child carries its current `coinBalance`. */
    suspend fun listChildren(): List<ChildProfileDto> {
        return client.get("$baseUrl/children") {
            tokenProvider()?.let { bearerAuth(it) }
        }.orThrow().body()
    }

    /** Parent-only: mints a one-time pairing code for a child device. The raw
     *  code is only returned here and is never retrievable again. */
    suspend fun createPairingCode(childProfileId: String): PairingCodeDto {
        return client.post("$baseUrl/devices/pairing-codes") {
            tokenProvider()?.let { bearerAuth(it) }
            contentType(ContentType.Application.Json)
            setBody(PairingCodeRequest(childProfileId))
        }.orThrow().body()
    }

    /** Parent-only: lists recent escalation alerts (newest first). */
    suspend fun listAlerts(): List<AlertDto> {
        return client.get("$baseUrl/alerts") {
            tokenProvider()?.let { bearerAuth(it) }
        }.orThrow().body()
    }

    suspend fun claimDevice(request: ClaimDeviceRequest): AuthResponse {
        return client.post("$baseUrl/devices/claim") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()
    }

    suspend fun today(childId: String): List<MissionOccurrenceDto> {
        return client.get("$baseUrl/children/$childId/missions/today") {
            tokenProvider()?.let { bearerAuth(it) }
        }.body()
    }

    /** Marks a mission done (submits a tap-done proof). The response omits the
     *  template, so callers should refresh today() rather than read the result. */
    suspend fun markDone(occurrenceId: String) {
        client.post("$baseUrl/mission-occurrences/$occurrenceId/done") {
            tokenProvider()?.let { bearerAuth(it) }
        }.orThrow()
    }

    /** Requests a snooze. Returns the backend decision (approved or denied);
     *  a denied decision is still an HTTP 2xx, so it does not throw. */
    suspend fun snooze(occurrenceId: String, requestedMinutes: Int): SnoozeResult {
        return client.post("$baseUrl/mission-occurrences/$occurrenceId/snooze") {
            tokenProvider()?.let { bearerAuth(it) }
            contentType(ContentType.Application.Json)
            setBody(SnoozeRequest(requestedMinutes))
        }.orThrow().body()
    }

    // ktor's default expectSuccess = false means non-2xx does not throw; surface
    // those as a typed error carrying the server message instead of letting the
    // body decoder choke on an error payload.
    private suspend fun HttpResponse.orThrow(): HttpResponse {
        if (!status.isSuccess()) {
            throw ApiException(status.value, runCatching { bodyAsText() }.getOrDefault(""))
        }
        return this
    }

    suspend fun listThreads(): List<ChatThreadDto> {
        return client.get("$baseUrl/chat/threads") {
            tokenProvider()?.let { bearerAuth(it) }
        }.orThrow().body()
    }

    suspend fun createThread(): ChatThreadDto {
        return client.post("$baseUrl/chat/threads") {
            tokenProvider()?.let { bearerAuth(it) }
            contentType(ContentType.Application.Json)
            setBody(CreateThreadRequest())
        }.orThrow().body()
    }

    suspend fun listMessages(threadId: String): List<ChatMessageDto> {
        return client.get("$baseUrl/chat/threads/$threadId/messages") {
            tokenProvider()?.let { bearerAuth(it) }
        }.orThrow().body()
    }

    suspend fun sendChatMessage(threadId: String, text: String): SendMessageResponse {
        return client.post("$baseUrl/chat/threads/$threadId/messages") {
            tokenProvider()?.let { bearerAuth(it) }
            contentType(ContentType.Application.Json)
            setBody(ChatMessageRequest(text))
        }.orThrow().body()
    }

    suspend fun confirmActionDraft(draftId: String) {
        client.post("$baseUrl/chat/action-drafts/$draftId/confirm") {
            tokenProvider()?.let { bearerAuth(it) }
        }.orThrow()
    }

    suspend fun rejectActionDraft(draftId: String) {
        client.post("$baseUrl/chat/action-drafts/$draftId/reject") {
            tokenProvider()?.let { bearerAuth(it) }
        }.orThrow()
    }

    suspend fun registerFcmToken(fcmToken: String) {
        client.post("$baseUrl/devices/fcm-token") {
            tokenProvider()?.let { bearerAuth(it) }
            contentType(ContentType.Application.Json)
            setBody(FcmTokenRequest(fcmToken))
        }
    }
}

@Serializable
data class BootstrapParentRequest(
    val familyName: String,
    val name: String,
    val email: String,
    val password: String
)

@Serializable
data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    // Returned by POST /devices/claim so the app can call today(childId)
    // immediately after pairing without decoding the child JWT. Nullable
    // because the parent bootstrap/login responses do not carry them.
    val childProfileId: String? = null,
    val childDisplayName: String? = null
)

@Serializable
data class ClaimDeviceRequest(
    val code: String,
    val deviceName: String,
    val platform: String = "android",
    val fcmToken: String? = null
)

@Serializable
data class MissionOccurrenceDto(
    val id: String,
    // ISO-8601 instant for the scheduled time.
    val scheduledFor: String,
    // MissionStatus enum value from the API (e.g. "scheduled", "notified",
    // "snoozed", "completed", "failed").
    val status: String,
    val template: MissionTemplateDto
)

@Serializable
data class MissionTemplateDto(
    val title: String,
    // Time-of-day string ("HH:mm") the mission is scheduled for.
    val scheduledTime: String,
    // Defaulted so older/partial responses still deserialize; extra policy
    // fields (maxSnoozes, hardDeadlineMinutes, …) are dropped by ignoreUnknownKeys.
    val snoozePolicy: SnoozePolicyDto = SnoozePolicyDto()
)

@Serializable
data class SnoozePolicyDto(
    val allowed: Boolean = true,
    val defaultMinutes: Int = 10,
    val allowedMinutes: List<Int> = listOf(10)
)

@Serializable
data class SnoozeRequest(val requestedMinutes: Int, val source: String = "child")

@Serializable
data class SnoozeResult(
    val decision: String,
    val approvedMinutes: Int? = null,
    val nextAlarmAt: String? = null,
    val reason: String? = null
)

/** Raised for non-2xx API responses, carrying the HTTP status and server body. */
class ApiException(val statusCode: Int, val body: String) :
    Exception("HTTP $statusCode${if (body.isNotBlank()) ": $body" else ""}")

@Serializable
data class ChatMessageRequest(val text: String)

@Serializable
data class CreateThreadRequest(val title: String? = null, val childProfileId: String? = null)

@Serializable
data class ChatThreadDto(val id: String, val title: String = "OpenClaw Chat")

@Serializable
data class ChatMessageDto(
    val id: String,
    // "user" or "openclaw"
    val sender: String,
    val text: String
)

@Serializable
data class SendMessageResponse(
    val userMessage: ChatMessageDto,
    val assistantMessage: ChatMessageDto,
    // Present when the assistant proposed a confirmable action draft.
    val actionDraftId: String? = null
)

@Serializable
data class FcmTokenRequest(val fcmToken: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class ChildProfileDto(
    val id: String,
    val name: String,
    val coinBalance: Int = 0
)

@Serializable
data class PairingCodeRequest(val childProfileId: String, val expiresInMinutes: Int? = null)

@Serializable
data class PairingCodeDto(
    val code: String,
    val childProfileId: String,
    val expiresAtMinutes: Int
)

@Serializable
data class AlertDto(
    val id: String,
    // "open", "resolved", or "dismissed"
    val status: String,
    val title: String,
    val message: String,
    val childProfileId: String? = null
)
