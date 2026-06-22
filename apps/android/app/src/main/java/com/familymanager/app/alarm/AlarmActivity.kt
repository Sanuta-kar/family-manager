package com.familymanager.app.alarm

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.familymanager.app.MainActivity
import com.familymanager.app.data.ApiClient
import com.familymanager.app.data.SessionStore
import kotlinx.coroutines.launch

class AlarmActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Mission reminder"
        val occurrenceId = intent.getStringExtra(EXTRA_OCCURRENCE_ID) ?: ""
        setContent {
            AlarmScreen(title = title, occurrenceId = occurrenceId, onClose = { finish() })
        }
    }

    companion object {
        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_OCCURRENCE_ID = "extra_occurrence_id"
    }
}

// When alarms fire the mission is in `notified`, where snooze is allowed. The
// alarm UI has no template, so it falls back to a common duration; a denied
// snooze (duration not allowed) is surfaced to the child.
private const val DEFAULT_SNOOZE_MINUTES = 10

@Composable
private fun AlarmScreen(title: String, occurrenceId: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val sessionStore = remember { SessionStore(context) }
    val apiClient = remember { ApiClient(tokenProvider = { sessionStore.accessToken() }) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val canAct = occurrenceId.isNotBlank()

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text(title, style = MaterialTheme.typography.headlineLarge)
                message?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 24.dp)) {
                    Button(
                        enabled = canAct && !busy,
                        onClick = {
                            busy = true
                            message = null
                            scope.launch {
                                try {
                                    apiClient.markDone(occurrenceId)
                                    onClose()
                                } catch (error: Exception) {
                                    message = "Couldn't mark done: ${error.message}"
                                    busy = false
                                }
                            }
                        }
                    ) { Text("Done") }
                    OutlinedButton(
                        enabled = canAct && !busy,
                        onClick = {
                            busy = true
                            message = null
                            scope.launch {
                                try {
                                    val result = apiClient.snooze(
                                        occurrenceId,
                                        DEFAULT_SNOOZE_MINUTES
                                    )
                                    if (result.decision == "approved") {
                                        onClose()
                                    } else {
                                        message = result.reason ?: "Snooze denied"
                                        busy = false
                                    }
                                } catch (error: Exception) {
                                    message = "Couldn't snooze: ${error.message}"
                                    busy = false
                                }
                            }
                        }
                    ) { Text("Snooze") }
                    OutlinedButton(
                        enabled = !busy,
                        onClick = {
                            val intent = Intent(context, MainActivity::class.java)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(intent)
                            onClose()
                        }
                    ) { Text("Talk") }
                }
            }
        }
    }
}
