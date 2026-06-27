package com.familymanager.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PendingAlarmStoreTest {

    @Test
    fun encodeDecodeRoundTrips() {
        val raw = PendingAlarmStore.encode("Brush teeth", 1_700_000_000_000L)
        val alarm = PendingAlarmStore.decode("occ-1", raw)
        assertEquals(PendingAlarmStore.PendingAlarm("occ-1", "Brush teeth", 1_700_000_000_000L), alarm)
    }

    @Test
    fun decodePreservesTitlesContainingSeparator() {
        // Split on the first '|' only, so a title with '|' survives.
        val raw = PendingAlarmStore.encode("Read | study", 42L)
        val alarm = PendingAlarmStore.decode("occ-2", raw)
        assertEquals("Read | study", alarm?.title)
        assertEquals(42L, alarm?.triggerAtMillis)
    }

    @Test
    fun decodeRejectsMalformedRecords() {
        assertNull(PendingAlarmStore.decode("occ", "no-separator"))
        assertNull(PendingAlarmStore.decode("occ", "notanumber|title"))
        assertNull(PendingAlarmStore.decode("occ", "|title")) // empty trigger
    }
}
