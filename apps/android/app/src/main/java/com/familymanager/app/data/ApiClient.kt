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
import io.ktor.http.ContentType
import io.ktor.http.contentType
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
        }.body()
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

    suspend fun sendChatMessage(threadId: String, text: String): ChatSendResponse {
        return client.post("$baseUrl/chat/threads/$threadId/messages") {
            tokenProvider()?.let { bearerAuth(it) }
            contentType(ContentType.Application.Json)
            setBody(ChatMessageRequest(text))
        }.body()
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
    val refreshToken: String
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
    val scheduledFor: String,
    val status: String
)

@Serializable
data class ChatMessageRequest(val text: String)

@Serializable
data class ChatSendResponse(
    val actionDraftId: String? = null
)

@Serializable
data class FcmTokenRequest(val fcmToken: String)
