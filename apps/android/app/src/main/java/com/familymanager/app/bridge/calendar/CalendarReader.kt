package com.familymanager.app.bridge.calendar

/** A single calendar event, minimized to the fields the bridge returns to OpenClaw. */
data class CalendarEvent(
    val title: String,
    val startMillis: Long,
    val endMillis: Long
)

/**
 * Abstracts the platform calendar so [CalendarCapabilityHandler] can be unit-tested on the
 * JVM. The real implementation ([AndroidCalendarReader]) wraps `CalendarContract`.
 */
interface CalendarReader {
    /** Whether `READ_CALENDAR` has been granted. */
    fun hasPermission(): Boolean

    /** Today's events, sorted by start time. Only called when [hasPermission] is true. */
    fun readToday(): List<CalendarEvent>
}
