package expo.modules.lupirabridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class ProviderRecurrenceTest {
  private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()

  @Test
  fun timedSeriesRepeatInTheirZoneAndAllDayInUtc() {
    assertEquals("Europe/Stockholm", ProviderRecurrence.eventZone(false, "Europe/Stockholm"))
    assertEquals("UTC", ProviderRecurrence.eventZone(true, "Europe/Stockholm"))
    assertEquals("UTC", ProviderRecurrence.eventZone(false, null))
    assertEquals("UTC", ProviderRecurrence.eventZone(false, "Not/AZone"))
  }

  @Test
  fun formatsExclusionsAsUtcStampsOrDates() {
    val dates = listOf(ms("2026-10-26T08:00:00Z"), ms("2026-10-19T07:00:00Z"), ms("2026-10-19T07:00:00Z"))
    assertEquals("20261019T070000Z,20261026T080000Z", ProviderRecurrence.formatDates(false, dates))
    assertEquals("20261019,20261026", ProviderRecurrence.formatDates(true, listOf(ms("2026-10-26T00:00:00Z"), ms("2026-10-19T00:00:00Z"))))
    assertNull(ProviderRecurrence.formatDates(false, emptyList()))
  }

  @Test
  fun readsWhatTheProviderAndStockAppsWrite() {
    assertEquals(listOf(ms("2026-10-19T07:00:00Z"), ms("2026-10-26T08:00:00Z")), ProviderRecurrence.parseDates("20261026T080000Z,20261019T070000Z"))
    assertEquals(listOf(ms("2026-10-19T00:00:00Z")), ProviderRecurrence.parseDates("20261019"))
    assertEquals(
      listOf(ms("2026-10-19T07:00:00Z"), ms("2026-10-26T08:00:00Z")),
      ProviderRecurrence.parseDates("Europe/Stockholm;20261019T090000,20261026T090000"),
    )
    assertEquals(listOf(ms("2026-10-19T07:00:00Z"), ms("2026-11-02T08:00:00Z")), ProviderRecurrence.parseDates("20261019T070000Z\nTZID=Europe/Stockholm;20261102T090000,garbage"))
    assertEquals(emptyList<Long>(), ProviderRecurrence.parseDates(null))
  }

  @Test
  fun exceptionRowsAreNamedByTheirSeriesAndOriginalStart() {
    val id = ProviderRecurrence.exceptionSyncId("6f1c1b1e-1c55-4c9a-9b3b-1b2d3c4d5e6f", ms("2026-10-19T07:00:00Z"))
    assertEquals("6f1c1b1e-1c55-4c9a-9b3b-1b2d3c4d5e6f@1792393200000", id)
    assertEquals("6f1c1b1e-1c55-4c9a-9b3b-1b2d3c4d5e6f", ProviderRecurrence.itemIdOf(id))
    assertEquals(ms("2026-10-19T07:00:00Z"), ProviderRecurrence.originalStartOf(id))
    assertEquals("6f1c1b1e-1c55-4c9a-9b3b-1b2d3c4d5e6f", ProviderRecurrence.itemIdOf("6f1c1b1e-1c55-4c9a-9b3b-1b2d3c4d5e6f"))
    assertNull(ProviderRecurrence.originalStartOf("6f1c1b1e-1c55-4c9a-9b3b-1b2d3c4d5e6f"))
    assertEquals("2026-10-19T07:00:00Z", ProviderRecurrence.occurrenceKey(ms("2026-10-19T07:00:00Z")))
  }

  @Test
  fun anAllDayChangeEndsTheDayAfterItsLastDay() {
    val start = ms("2026-10-19T00:00:00Z")
    assertEquals(ms("2026-10-21T00:00:00Z"), ProviderRecurrence.exceptionEnd(true, start, ms("2026-10-20T00:00:00Z"), 86_400_000L))
    assertEquals(ms("2026-10-20T00:00:00Z"), ProviderRecurrence.exceptionEnd(true, start, null, 86_400_000L))
    assertEquals(ms("2026-10-19T10:00:00Z"), ProviderRecurrence.exceptionEnd(false, ms("2026-10-19T09:00:00Z"), ms("2026-10-19T10:00:00Z"), 1_800_000L))
  }
}
