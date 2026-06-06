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
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

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
    var mode by remember { mutableStateOf(AppMode.Child) }
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
                    ChildTodayScreen(messages)
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
private fun ChildTodayScreen(messages: MutableList<ChatLine>) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
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

