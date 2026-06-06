package com.familymanager.app.alarm

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

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

@Composable
private fun AlarmScreen(title: String, occurrenceId: String, onClose: () -> Unit) {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text(title, style = MaterialTheme.typography.headlineLarge)
                Text("Mission id: $occurrenceId")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 24.dp)) {
                    Button(onClick = onClose) { Text("Done") }
                    OutlinedButton(onClick = onClose) { Text("Snooze") }
                    OutlinedButton(onClick = onClose) { Text("Talk") }
                }
            }
        }
    }
}

