package com.familymanager.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.familymanager.app.data.AlertDto
import com.familymanager.app.data.ApiClient
import com.familymanager.app.data.BootstrapParentRequest
import com.familymanager.app.data.ChatMessageDto
import com.familymanager.app.data.ChildProfileDto
import com.familymanager.app.data.ClaimDeviceRequest
import com.familymanager.app.data.MissionOccurrenceDto
import com.familymanager.app.data.PairingCodeDto
import com.familymanager.app.data.SessionStore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FamilyMissionApp()
        }
    }
}

@Composable
fun FamilyMissionApp() {
    val context = LocalContext.current
    val sessionStore = remember { SessionStore(context) }
    val apiClient = remember { ApiClient(tokenProvider = { sessionStore.accessToken() }) }
    // Parent mode authenticates with a separate token from the child session.
    val parentApiClient = remember { ApiClient(tokenProvider = { sessionStore.parentAccessToken() }) }
    var mode by remember { mutableStateOf(AppMode.Child) }
    var hasChildSession by remember { mutableStateOf(sessionStore.accessToken() != null) }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Family Mission", style = MaterialTheme.typography.headlineMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ModeButton("Child", mode == AppMode.Child) { mode = AppMode.Child }
                    ModeButton("Parent", mode == AppMode.Parent) { mode = AppMode.Parent }
                }

                if (mode == AppMode.Child) {
                    ChildTodayScreen(
                        hasChildSession = hasChildSession,
                        apiClient = apiClient,
                        sessionStore = sessionStore,
                        onPaired = { hasChildSession = true }
                    )
                } else {
                    ParentDashboardScreen(apiClient = parentApiClient, sessionStore = sessionStore)
                }
            }
        }
    }
}

@Composable
private fun ModeButton(text: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        Button(onClick = onClick) { Text(text) }
    } else {
        OutlinedButton(onClick = onClick) { Text(text) }
    }
}

private sealed interface TodayState {
    data object Loading : TodayState
    data class Loaded(val missions: List<MissionOccurrenceDto>) : TodayState
    data class Error(val message: String) : TodayState
}

@Composable
private fun ChildTodayScreen(
    hasChildSession: Boolean,
    apiClient: ApiClient,
    sessionStore: SessionStore,
    onPaired: () -> Unit
) {
    var todayState by remember { mutableStateOf<TodayState>(TodayState.Loading) }
    // Bump to re-trigger the load (e.g. after pairing, an action, or a retry).
    var reloadKey by remember { mutableStateOf(0) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // Lifted so "Talk" on a mission can seed the chat with context.
    var chatDraft by remember { mutableStateOf("") }

    LaunchedEffect(hasChildSession, reloadKey) {
        if (!hasChildSession) return@LaunchedEffect
        val childId = sessionStore.childProfileId()
        if (childId == null) {
            todayState = TodayState.Error("Missing child profile. Re-pair this device.")
            return@LaunchedEffect
        }
        todayState = TodayState.Loading
        todayState = try {
            TodayState.Loaded(apiClient.today(childId))
        } catch (error: Exception) {
            TodayState.Error(error.message ?: "Could not load today's missions.")
        }
    }

    LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!hasChildSession) {
            item {
                PairDeviceCard(
                    apiClient = apiClient,
                    sessionStore = sessionStore,
                    onPaired = onPaired
                )
            }
        } else {
            // Chat panel is the last item; its index is the count of items above it.
            val missionCount = (todayState as? TodayState.Loaded)?.missions?.size ?: 1
            when (val state = todayState) {
                is TodayState.Loading -> item { LoadingCard() }
                is TodayState.Error -> item { ErrorCard(state.message) { reloadKey++ } }
                is TodayState.Loaded ->
                    if (state.missions.isEmpty()) {
                        item { EmptyMissionsCard() }
                    } else {
                        items(state.missions, key = { it.id }) { occurrence ->
                            MissionCard(
                                occurrence = occurrence,
                                apiClient = apiClient,
                                onChanged = { reloadKey++ },
                                onTalk = {
                                    chatDraft = "About \"${occurrence.template.title}\": "
                                    scope.launch { listState.animateScrollToItem(missionCount) }
                                }
                            )
                        }
                    }
            }
            item {
                ChatPanel(apiClient = apiClient, draft = chatDraft, onDraftChange = { chatDraft = it })
            }
        }
    }
}

@Composable
private fun LoadingCard() {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator()
            Text("Loading today's missions…")
        }
    }
}

@Composable
private fun EmptyMissionsCard() {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("All clear", style = MaterialTheme.typography.titleLarge)
            Text("No missions scheduled for today.")
        }
    }
}

@Composable
private fun ErrorCard(message: String, onRetry: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Couldn't load missions", style = MaterialTheme.typography.titleLarge)
            Text(message)
            Button(onClick = onRetry) { Text("Retry") }
        }
    }
}

@Composable
private fun PairDeviceCard(apiClient: ApiClient, sessionStore: SessionStore, onPaired: () -> Unit) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var deviceName by remember { mutableStateOf("Android phone") }
    var status by remember { mutableStateOf<String?>(null) }
    var pairing by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Pair Device", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = code,
                onValueChange = { code = it.uppercase() },
                label = { Text("Pairing code") },
                singleLine = true
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = deviceName,
                onValueChange = { deviceName = it },
                label = { Text("Device name") },
                singleLine = true
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(
                    enabled = !pairing && code.isNotBlank() && deviceName.isNotBlank(),
                    onClick = {
                        pairing = true
                        status = null
                        scope.launch {
                            try {
                                val auth = apiClient.claimDevice(
                                    ClaimDeviceRequest(
                                        code = code.trim(),
                                        deviceName = deviceName.trim()
                                    )
                                )
                                sessionStore.saveTokens(auth.accessToken, auth.refreshToken, auth.childProfileId)
                                onPaired()
                                status = "Paired"
                                // Best-effort FCM registration. When Firebase is not
                                // configured (no google-services.json locally),
                                // getInstance() throws; that must not flip the
                                // successful pairing above into a failure.
                                try {
                                    FirebaseMessaging.getInstance().token
                                        .addOnSuccessListener { fcmToken ->
                                            scope.launch {
                                                try {
                                                    apiClient.registerFcmToken(fcmToken)
                                                } catch (error: Exception) {
                                                    status = "Paired; push token pending"
                                                }
                                            }
                                        }
                                        .addOnFailureListener {
                                            status = "Paired; push token pending"
                                        }
                                } catch (error: Exception) {
                                    status = "Paired; push token pending"
                                }
                            } catch (error: Exception) {
                                android.util.Log.e("Pairing", "claim failed", error)
                                status = "Pairing failed: ${error::class.simpleName}: ${error.message}"
                            } finally {
                                pairing = false
                            }
                        }
                    }
                ) {
                    Text(if (pairing) "Pairing" else "Pair")
                }
                status?.let { Text(it) }
            }
        }
    }
}

@Composable
private fun ParentDashboardScreen(apiClient: ApiClient, sessionStore: SessionStore) {
    var hasParentSession by remember { mutableStateOf(sessionStore.parentAccessToken() != null) }

    if (!hasParentSession) {
        ParentAuthCard(
            apiClient = apiClient,
            sessionStore = sessionStore,
            onAuthed = { hasParentSession = true }
        )
    } else {
        ParentDashboard(
            apiClient = apiClient,
            onLogout = {
                sessionStore.clearParentSession()
                hasParentSession = false
            }
        )
    }
}

@Composable
private fun ParentAuthCard(apiClient: ApiClient, sessionStore: SessionStore, onAuthed: () -> Unit) {
    val scope = rememberCoroutineScope()
    var createMode by remember { mutableStateOf(false) }
    var familyName by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val canSubmit = email.isNotBlank() && password.isNotBlank() &&
        (!createMode || (familyName.isNotBlank() && name.isNotBlank()))

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (createMode) "Create Family" else "Parent Sign In", style = MaterialTheme.typography.titleLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ModeButton("Sign in", !createMode) { createMode = false; status = null }
                ModeButton("Create", createMode) { createMode = true; status = null }
            }
            if (createMode) {
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = familyName,
                    onValueChange = { familyName = it },
                    label = { Text("Family name") },
                    singleLine = true
                )
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Your name") },
                    singleLine = true
                )
            }
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = email,
                onValueChange = { email = it.trim() },
                label = { Text("Email") },
                singleLine = true
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(
                    enabled = !busy && canSubmit,
                    onClick = {
                        busy = true
                        status = null
                        scope.launch {
                            try {
                                val auth = if (createMode) {
                                    apiClient.bootstrapParent(
                                        BootstrapParentRequest(
                                            familyName = familyName.trim(),
                                            name = name.trim(),
                                            email = email.trim(),
                                            password = password
                                        )
                                    )
                                } else {
                                    apiClient.login(email.trim(), password)
                                }
                                sessionStore.saveParentTokens(auth.accessToken, auth.refreshToken)
                                onAuthed()
                            } catch (error: Exception) {
                                status = "${if (createMode) "Create" else "Sign in"} failed: ${error.message}"
                            } finally {
                                busy = false
                            }
                        }
                    }
                ) {
                    Text(if (busy) "Working…" else if (createMode) "Create family" else "Sign in")
                }
                status?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

private sealed interface DashboardState {
    data object Loading : DashboardState
    data class Loaded(val children: List<ChildProfileDto>, val alerts: List<AlertDto>) : DashboardState
    data class Error(val message: String) : DashboardState
}

@Composable
private fun ParentDashboard(apiClient: ApiClient, onLogout: () -> Unit) {
    var state by remember { mutableStateOf<DashboardState>(DashboardState.Loading) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(reloadKey) {
        state = DashboardState.Loading
        state = try {
            DashboardState.Loaded(apiClient.listChildren(), apiClient.listAlerts())
        } catch (error: Exception) {
            DashboardState.Error(error.message ?: "Could not load the dashboard.")
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (val current = state) {
            is DashboardState.Loading -> item { LoadingCard() }
            is DashboardState.Error -> item { ErrorCard(current.message) { reloadKey++ } }
            is DashboardState.Loaded -> {
                item { AlertsCard(current.alerts) }
                if (current.children.isEmpty()) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("No children yet", style = MaterialTheme.typography.titleLarge)
                                Text("Add a child profile from the backend to pair a device.")
                            }
                        }
                    }
                } else {
                    items(current.children, key = { it.id }) { child ->
                        ChildSummaryCard(child = child, apiClient = apiClient)
                    }
                }
            }
        }
        item {
            OutlinedButton(onClick = onLogout) { Text("Log out") }
        }
    }
}

@Composable
private fun AlertsCard(alerts: List<AlertDto>) {
    val open = alerts.filter { it.status.equals("open", ignoreCase = true) }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Open alerts: ${open.size}", style = MaterialTheme.typography.titleLarge)
            if (open.isEmpty()) {
                Text("Nothing needs your attention.")
            } else {
                open.take(5).forEach { alert ->
                    Text("• ${alert.title}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun ChildSummaryCard(child: ChildProfileDto, apiClient: ApiClient) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var pairing by remember { mutableStateOf<PairingCodeDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(child.name, style = MaterialTheme.typography.titleLarge)
            Text("Coins: ${child.coinBalance}")
            pairing?.let {
                Text("Pairing code: ${it.code}", style = MaterialTheme.typography.titleMedium)
                Text("Enter it on the child device within ${it.expiresAtMinutes} min.", style = MaterialTheme.typography.bodySmall)
            }
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            Button(
                enabled = !busy,
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            pairing = apiClient.createPairingCode(child.id)
                        } catch (e: Exception) {
                            error = "Couldn't generate code: ${e.message}"
                        } finally {
                            busy = false
                        }
                    }
                }
            ) { Text(if (busy) "Generating…" else "Generate Code") }
        }
    }
}

@Composable
private fun MissionCard(
    occurrence: MissionOccurrenceDto,
    apiClient: ApiClient,
    onChanged: () -> Unit,
    onTalk: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(occurrence.template.title, style = MaterialTheme.typography.titleLarge)
            Text(occurrence.template.scheduledTime, style = MaterialTheme.typography.titleMedium)
            Text(statusLabel(occurrence.status))
            message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        message = null
                        scope.launch {
                            try {
                                apiClient.markDone(occurrence.id)
                                onChanged()
                            } catch (error: Exception) {
                                message = "Couldn't mark done: ${error.message}"
                            } finally {
                                busy = false
                            }
                        }
                    }
                ) { Text("Done") }
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        message = null
                        scope.launch {
                            try {
                                val result = apiClient.snooze(
                                    occurrence.id,
                                    occurrence.template.snoozePolicy.defaultMinutes
                                )
                                if (result.decision == "approved") {
                                    message = "Snoozed ${result.approvedMinutes} min"
                                    onChanged()
                                } else {
                                    message = result.reason ?: "Snooze denied"
                                }
                            } catch (error: Exception) {
                                message = "Couldn't snooze: ${error.message}"
                            } finally {
                                busy = false
                            }
                        }
                    }
                ) { Text("Snooze") }
                OutlinedButton(enabled = !busy, onClick = onTalk) { Text("Talk") }
            }
        }
    }
}

/** Maps a raw MissionStatus enum value to a child-friendly label. */
private fun statusLabel(status: String): String = when (status.lowercase()) {
    "scheduled" -> "Scheduled"
    "notified" -> "Time to do it"
    "snoozed" -> "Snoozed"
    "proof_pending" -> "Needs proof"
    "parent_review" -> "Waiting for parent"
    "completed" -> "Done"
    "failed" -> "Missed"
    "cancelled" -> "Cancelled"
    else -> status
}

@Composable
private fun ChatPanel(
    apiClient: ApiClient,
    draft: String,
    onDraftChange: (String) -> Unit
) {
    val scope = rememberCoroutineScope()
    val messages = remember { mutableStateListOf<ChatMessageDto>() }
    var threadId by remember { mutableStateOf<String?>(null) }
    // Set when the assistant proposes a confirmable action; cleared on confirm/reject.
    var pendingDraftId by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    // Bootstrap: reuse the most recent thread or create one, then load history.
    LaunchedEffect(Unit) {
        try {
            val thread = apiClient.listThreads().firstOrNull() ?: apiClient.createThread()
            threadId = thread.id
            messages.addAll(apiClient.listMessages(thread.id))
        } catch (error: Exception) {
            status = "Couldn't load chat: ${error.message}"
        }
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("OpenClaw Chat", style = MaterialTheme.typography.titleLarge)
            if (messages.isEmpty()) {
                Text("Ask me to talk or draft a reminder.", style = MaterialTheme.typography.bodyMedium)
            }
            messages.takeLast(8).forEach { message ->
                Text("${senderLabel(message.sender)}: ${message.text}")
            }
            status?.let { Text(it, style = MaterialTheme.typography.bodySmall) }

            pendingDraftId?.let { draftId ->
                ConfirmActionCard(
                    enabled = !busy,
                    onConfirm = {
                        busy = true
                        scope.launch {
                            try {
                                apiClient.confirmActionDraft(draftId)
                                status = "Saved. The reminder was created."
                                pendingDraftId = null
                            } catch (error: Exception) {
                                status = "Couldn't confirm: ${error.message}"
                            } finally {
                                busy = false
                            }
                        }
                    },
                    onReject = {
                        busy = true
                        scope.launch {
                            try {
                                apiClient.rejectActionDraft(draftId)
                                status = "Discarded."
                                pendingDraftId = null
                            } catch (error: Exception) {
                                status = "Couldn't reject: ${error.message}"
                            } finally {
                                busy = false
                            }
                        }
                    }
                )
            }

            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft,
                onValueChange = onDraftChange,
                label = { Text("Message") }
            )
            Button(
                enabled = !busy && draft.isNotBlank() && threadId != null,
                onClick = {
                    val tid = threadId ?: return@Button
                    val text = draft
                    busy = true
                    status = null
                    scope.launch {
                        try {
                            val response = apiClient.sendChatMessage(tid, text)
                            messages.add(response.userMessage)
                            messages.add(response.assistantMessage)
                            pendingDraftId = response.actionDraftId
                            onDraftChange("")
                        } catch (error: Exception) {
                            status = "Couldn't send: ${error.message}"
                        } finally {
                            busy = false
                        }
                    }
                }
            ) {
                Text("Send")
            }
        }
    }
}

@Composable
private fun ConfirmActionCard(enabled: Boolean, onConfirm: () -> Unit, onReject: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Confirm change", style = MaterialTheme.typography.titleMedium)
            Text("OpenClaw drafted a schedule change. Nothing is saved until you confirm.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(enabled = enabled, onClick = onConfirm) { Text("Confirm") }
                OutlinedButton(enabled = enabled, onClick = onReject) { Text("Reject") }
            }
        }
    }
}

private fun senderLabel(sender: String): String = if (sender == "user") "Me" else "OpenClaw"

private enum class AppMode {
    Parent,
    Child
}
