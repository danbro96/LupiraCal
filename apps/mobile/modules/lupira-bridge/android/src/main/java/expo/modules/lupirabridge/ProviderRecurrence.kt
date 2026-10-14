package expo.modules.lupirabridge

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/// A series in the calendar provider's terms: the zone it repeats in, its EXDATE/RDATE lists, and the `_SYNC_ID` of
/// one occurrence's exception row (`<itemId>@<originalStartMs>`). Pure, so it runs under JVM tests.
object ProviderRecurrence {
  const val UTC = "UTC"
  private const val EXCEPTION_MARK = '@'
  private val UTC_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)
  private val DAY = DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC)
  private val FLOATING = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")
  private const val DAY_MS = 86_400_000L

  /// All-day rows are UTC by provider rule; a timed series repeats on its own zone's wall clock.
  fun eventZone(allDay: Boolean, zone: String?): String {
    if (allDay || zone.isNullOrBlank()) return UTC
    return try {
      ZoneId.of(zone).id
    } catch (_: Exception) {
      UTC
    }
  }

  /// EXDATE/RDATE value: UTC stamps, or dates for an all-day series; null when there are none.
  fun formatDates(allDay: Boolean, instants: Collection<Long>): String? {
    val format = if (allDay) DAY else UTC_STAMP
    return instants.distinct().sorted().takeIf { it.isNotEmpty() }?.joinToString(",") { format.format(Instant.ofEpochMilli(it)) }
  }

  /// Reads lines of `[TZID;]value,value…`: `…Z` stamps are UTC, floating ones are read in the line's zone, dates are UTC
  /// midnights. Unreadable values are skipped.
  fun parseDates(text: String?): List<Long> {
    if (text.isNullOrBlank()) return emptyList()
    return text.split('\n').flatMap { line ->
      val zonePart = line.substringBefore(';', "").removePrefix("TZID=")
      val zone = if (zonePart.isBlank()) ZoneOffset.UTC else runCatching { ZoneId.of(zonePart) }.getOrDefault(ZoneOffset.UTC)
      line.substringAfter(';').split(',').mapNotNull { parseDate(it.trim(), zone) }
    }.distinct().sorted()
  }

  private fun parseDate(value: String, zone: ZoneId): Long? = runCatching {
    when {
      value.length == 8 -> LocalDate.parse(value, DateTimeFormatter.BASIC_ISO_DATE).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
      value.endsWith("Z") -> LocalDateTime.parse(value.dropLast(1), FLOATING).toInstant(ZoneOffset.UTC).toEpochMilli()
      else -> LocalDateTime.parse(value, FLOATING).atZone(zone).toInstant().toEpochMilli()
    }
  }.getOrNull()

  fun exceptionSyncId(itemId: String, originalStartMs: Long): String = "$itemId$EXCEPTION_MARK$originalStartMs"

  /// The item a provider row belongs to: the series of an exception row, else the row's own id.
  fun itemIdOf(syncId: String): String = syncId.substringBefore(EXCEPTION_MARK)

  fun originalStartOf(syncId: String): Long? = syncId.substringAfter(EXCEPTION_MARK, "").toLongOrNull()

  /// An all-day change ends on its last day; the provider's end is exclusive.
  fun exceptionEnd(allDay: Boolean, startMs: Long, changedEndMs: Long?, seriesLengthMs: Long): Long = when {
    changedEndMs == null -> startMs + seriesLengthMs
    allDay -> maxOf(changedEndMs + DAY_MS, startMs + DAY_MS)
    else -> maxOf(changedEndMs, startMs)
  }

  /// `lupiracalendar://item/<id>?occ=<key>` key: the occurrence's original start, UTC, whole seconds.
  fun occurrenceKey(originalStartMs: Long): String = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(originalStartMs / 1000 * 1000))
}
