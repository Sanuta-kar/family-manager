package com.familymanager.app.notifications

data class MissionReminderPush(
    val occurrenceId: String,
    val childProfileId: String,
    val title: String,
    val scheduledFor: String?,
    val deadlineAt: String?
) {
    companion object {
        fun from(data: Map<String, String>): MissionReminderPush? {
            if (data["type"] != "mission_reminder") return null
            val occurrenceId = data["occurrenceId"].orEmpty()
            val childProfileId = data["childProfileId"].orEmpty()
            val title = data["title"].orEmpty()
            if (occurrenceId.isBlank() || childProfileId.isBlank() || title.isBlank()) return null
            return MissionReminderPush(
                occurrenceId = occurrenceId,
                childProfileId = childProfileId,
                title = title,
                scheduledFor = data["scheduledFor"],
                deadlineAt = data["deadlineAt"]
            )
        }
    }
}
