package expo.modules.lupirabridge

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/// Read-side projection of the RN mirror for the publisher, over the snapshot of the bridge_* views the app's sync
/// modules define. Each `state` is the kernel's stored doc state; the doc itself sits under its "doc" key.

data class MirrorCalendar(val id: String, val displayName: String, val color: Int)

data class MirrorChannel(val medium: String, val value: String, val type: String?, val preferred: Boolean)

/// A current residency as the stock app shows it: the place's address, else its name.
data class MirrorAddress(val residencyId: String, val type: String?, val formatted: String)

data class MirrorContact(
  val id: String,
  val displayName: String,
  val givenName: String?,
  val middleName: String?,
  val familyName: String?,
  val nickname: String?,
  val channels: List<MirrorChannel>,
  val birthday: String?,   // "yyyy-MM-dd", or Android's year-less "--MM-dd"
  val notes: String?,
  val addresses: List<MirrorAddress>,
)

/// One occurrence's change, by its unmodified start; null members inherit from the series. An all-day `endMs` is the
/// last day.
data class MirrorOverride(
  val originalStartMs: Long,
  val startMs: Long?,
  val endMs: Long?,
  val title: String?,
  val description: String?,
  val status: String?,
  val location: String?,
)

data class MirrorItem(
  val id: String,
  val calendarId: String,      // first accepted membership — the provider calendar that hosts the event
  val title: String,
  val description: String?,
  val location: String?,
  val cancelled: Boolean,
  val allDay: Boolean,
  val startMs: Long,
  val endMs: Long?,            // exclusive; null = open-ended
  val rrule: String?,
  val zone: String? = null,
  val excluded: List<Long> = emptyList(),
  val extras: List<Long> = emptyList(),
  val overrides: List<MirrorOverride> = emptyList(),
)

object MirrorReader {
  fun calendars(snapshot: JSONObject): List<MirrorCalendar> =
    rows(snapshot, "calendars").map { row ->
      val id = row.getString("id")
      val doc = docOf(row.getString("state"))
      MirrorCalendar(
        id = id,
        displayName = doc.optString("displayName").ifEmpty { id },
        color = parseColor(doc.optString("color")),
      )
    }

  fun items(snapshot: JSONObject): List<MirrorItem> =
    rows(snapshot, "items").mapNotNull { row ->
      // One malformed doc must never kill the whole publish.
      try {
        fromDoc(row.getString("id"), docOf(row.getString("state")))
      } catch (e: Exception) {
        android.util.Log.w(Bridge.TAG, "skipping item ${row.optString("id")}: ${e.message}")
        null
      }
    }

  fun contacts(snapshot: JSONObject): List<MirrorContact> {
    val addresses = addresses(snapshot)
    return rows(snapshot, "contacts").map { row ->
      val id = row.getString("id")
      val doc = docOf(row.getString("state"))
      val channels = mutableListOf<MirrorChannel>()
      doc.optJSONArray("channels")?.let { arr ->
        for (i in 0 until arr.length()) {
          val ch = arr.optJSONObject(i) ?: continue
          val value = ch.optString("value").trim()
          if (value.isEmpty()) continue
          channels.add(MirrorChannel(ch.optString("medium"), value, ch.optStringOrNull("type"), ch.optBoolean("preferred")))
        }
      }
      MirrorContact(
        id = id,
        displayName = row.getString("display_name"),
        givenName = doc.optStringOrNull("givenName"),
        middleName = doc.optStringOrNull("middleName"),
        familyName = doc.optStringOrNull("familyName"),
        nickname = doc.optStringOrNull("nickname"),
        channels = channels,
        birthday = birthdayString(doc.optJSONObject("birthday")),
        notes = doc.optStringOrNull("notes"),
        addresses = addresses[id].orEmpty(),
      )
    }
  }

  /// Current residencies by contact id. Residencies whose place hasn't been looked up yet stay out until it has.
  fun addresses(snapshot: JSONObject, today: LocalDate = LocalDate.now()): Map<String, List<MirrorAddress>> {
    val out = mutableMapOf<String, MutableList<MirrorAddress>>()
    for (row in rows(snapshot, "residencies")) {
      val address = try {
        val place = if (row.isNull("place")) null else docOf(row.getString("place"))
        addressOf(row.getString("id"), docOf(row.getString("state")), place, today)
      } catch (e: Exception) {
        android.util.Log.w(Bridge.TAG, "skipping residency ${row.optString("id")}: ${e.message}")
        null
      } ?: continue
      out.getOrPut(row.getString("contact_id")) { mutableListOf() }.add(address)
    }
    return out
  }

  /// getJSONArray, not opt: a missing section must fail the publish, never read as empty and unpublish everything.
  private fun rows(snapshot: JSONObject, key: String): List<JSONObject> {
    val arr = snapshot.getJSONArray(key)
    return (0 until arr.length()).map { arr.getJSONObject(it) }
  }

  private fun addressOf(id: String, residency: JSONObject, place: JSONObject?, today: LocalDate): MirrorAddress? {
    if (!FuzzyDates.isCurrent(fuzzyOf(residency.optJSONObject("movedIn")), fuzzyOf(residency.optJSONObject("movedOut")), today)) return null
    val formatted = place?.optStringOrNull("formattedAddress") ?: place?.optStringOrNull("name") ?: return null
    return MirrorAddress(id, residency.optStringOrNull("type"), formatted)
  }

  private fun fuzzyOf(d: JSONObject?): FuzzyDate? =
    if (d == null || d.isNull("year")) null else FuzzyDate(d.getInt("year"), d.optIntOrNull("month"), d.optIntOrNull("day"))

  private fun docOf(state: String): JSONObject = JSONObject(state).getJSONObject("doc")

  /// PartialDate → the contacts provider's Event.START_DATE conventions ("--MM-dd" when year unknown).
  private fun birthdayString(b: JSONObject?): String? {
    if (b == null) return null
    val month = b.optString("month").toIntOrNull() ?: return null
    val day = b.optString("day").toIntOrNull() ?: return null
    val year = if (b.isNull("year")) null else b.optString("year").toIntOrNull()
    val md = "%02d-%02d".format(month, day)
    return if (year == null) "--$md" else "%04d-$md".format(year)
  }

  private fun fromDoc(id: String, doc: JSONObject): MirrorItem? {
    val calendarId = firstAccepted(doc) ?: return null   // proposed-only items stay out of the provider
    val allDay = doc.optBoolean("isAllDay", false)
    val startMs: Long
    var endMs: Long?
    if (allDay) {
      val startDate = doc.optStringOrNull("startDate") ?: return null
      startMs = dayUtcMs(startDate)
      endMs = doc.optStringOrNull("endDate")?.let { dayUtcMs(it) }
    } else {
      val startsAt = doc.optStringOrNull("startsAt") ?: return null
      startMs = isoMs(startsAt)
      endMs = doc.optStringOrNull("endsAt")?.let { isoMs(it) }
    }
    if (endMs != null && endMs <= startMs) endMs = null
    val rrule = doc.optStringOrNull("recurrenceRule")?.removePrefix("RRULE:")
    return MirrorItem(
      id = id,
      calendarId = calendarId,
      title = doc.optStringOrNull("title") ?: "(untitled)",
      description = doc.optStringOrNull("description"),
      location = doc.optStringOrNull("locationLabel"),
      cancelled = doc.optStringOrNull("status") == "Cancelled",
      allDay = allDay,
      startMs = startMs,
      endMs = endMs,
      rrule = rrule,
      zone = doc.optStringOrNull("startTimezone"),
      excluded = if (rrule == null) emptyList() else instants(doc.optJSONArray("excludedOccurrences")),
      extras = if (rrule == null) emptyList() else instants(doc.optJSONArray("extraOccurrences")),
      overrides = if (rrule == null) emptyList() else overrides(doc.optJSONArray("occurrenceOverrides")),
    )
  }

  private fun instants(values: JSONArray?): List<Long> =
    (0 until (values?.length() ?: 0)).mapNotNull { i -> values!!.optString(i).takeIf { it.isNotEmpty() }?.let { runCatching { isoMs(it) }.getOrNull() } }

  private fun overrides(values: JSONArray?): List<MirrorOverride> =
    (0 until (values?.length() ?: 0)).mapNotNull { i ->
      val o = values!!.optJSONObject(i) ?: return@mapNotNull null
      val original = o.optStringOrNull("originalStart")?.let { runCatching { isoMs(it) }.getOrNull() } ?: return@mapNotNull null
      MirrorOverride(
        originalStartMs = original,
        startMs = o.optStringOrNull("startsAt")?.let { isoMs(it) },
        endMs = o.optStringOrNull("endsAt")?.let { isoMs(it) },
        title = o.optStringOrNull("title"),
        description = o.optStringOrNull("description"),
        status = o.optStringOrNull("status"),
        location = o.optStringOrNull("locationLabel"),
      )
    }

  private fun firstAccepted(doc: JSONObject): String? {
    val memberships = doc.optJSONArray("calendars") ?: return null
    for (i in 0 until memberships.length()) {
      val m = memberships.optJSONObject(i) ?: continue
      if (m.optString("status") == "Accepted") return m.optStringOrNull("calendarId")
    }
    return null
  }

  private fun dayUtcMs(day: String): Long = java.time.LocalDate.parse(day.take(10))
    .atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()

  /// Server timestamps are DateTimeOffset — 'Z' or '±hh:mm' (older imported items carry local
  /// offsets). Instant.parse only accepts 'Z'; OffsetDateTime handles both.
  private fun isoMs(value: String): Long =
    java.time.OffsetDateTime.parse(value).toInstant().toEpochMilli()

  private fun parseColor(hex: String?): Int {
    if (hex.isNullOrBlank()) return 0xFF4457C2.toInt()
    return try {
      android.graphics.Color.parseColor(hex)
    } catch (_: IllegalArgumentException) {
      0xFF4457C2.toInt()
    }
  }
}

private fun JSONObject.optStringOrNull(key: String): String? =
  if (isNull(key)) null else optString(key).ifEmpty { null }

private fun JSONObject.optIntOrNull(key: String): Int? = if (isNull(key)) null else optInt(key)
