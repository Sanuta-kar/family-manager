package com.familymanager.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.familymanager.app.data.ApiClient
import com.familymanager.app.data.ClaimDeviceRequest
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
    var mode by remember { mutableStateOf(AppMode.Child) }
    var hasChildSession by remember { mutableStateOf(sessionStore.accessToken() != null) }
    val messages = remember {
        mutableStateListOf(
            ChatLine("OpenClaw", "I am here in the family app. Ask me to talk or draft reminders.")
        )
    }

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
                        messages = messages,
                        hasChildSession = hasChildSession,
                        apiClient = apiClient,
                        sessionStore = sessionStore,
                        onPaired = { hasChildSession = true }
                    )
                } else {
                    ParentDashboardScreen()
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

@Composable
private fun ChildTodayScreen(
    messages: MutableList<ChatLine>,
    hasChildSession: Boolean,
    apiClient: ApiClient,
    sessionStore: SessionStore,
    onPaired: () -> Unit
) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!hasChildSession) {
            item {
                PairDeviceCard(
                    apiClient = apiClient,
                    sessionStore = sessionStore,
                    onPaired = onPaired
                )
            }
        }
        item {
            MissionCard(
                title = "Walk with dog",
                time = "07:45",
                status = "Needs Done + location proof"
            )
        }
        item {
            MissionCard(
                title = "Brush teeth",
                time = "20:30",
                status = "Needs Done + photo proof"
            )
        }
        item {
            ChatPanel(messages)
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
                                sessionStore.saveTokens(auth.accessToken, auth.refreshToken)
                                onPaired()
                                status = "Paired"
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
                                status = "Pairing failed"
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
private fun ParentDashboardScreen() {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Maxim", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    Text("Coins: 12")
                    Text("Open alerts: 0")
                }
            }
        }
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Pair Child Device", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text("Generate a one-time code from the backend and enter it on the child device.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = {}) { Text("Generate Code") }
                }
            }
        }
    }
}

@Composable
private fun MissionCard(title: String, time: String, status: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(time, style = MaterialTheme.typography.titleMedium)
            Text(status)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {}) { Text("Done") }
                OutlinedButton(onClick = {}) { Text("Snooze") }
                OutlinedButton(onClick = {}) { Text("Talk") }
            }
        }
    }
}

@Composable
private fun ChatPanel(messages: MutableList<ChatLine>) {
    var text by remember { mutableStateOf("") }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("OpenClaw Chat", style = MaterialTheme.typography.titleLarge)
            messages.takeLast(4).forEach { line ->
                Text("${line.sender}: ${line.text}")
            }
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = text,
                onValueChange = { text = it },
                label = { Text("Message") }
            )
            Button(
                onClick = {
                    if (text.isNotBlank()) {
                        messages.add(ChatLine("Me", text))
                        messages.add(ChatLine("OpenClaw", "I will draft that if it changes your schedule. You will confirm before it is saved."))
                        text = ""
                    }
                }
            ) {
                Text("Send")
            }
        }
    }
}

private enum class AppMode {
    Parent,
    Child
}

private data class ChatLine(val sender: String, val text: String)
