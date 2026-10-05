package expo.modules.lupirabridge

import android.database.sqlite.SQLiteDatabase
import org.json.JSONObject

/// Read-side projection of the RN mirror for the publisher, over the bridge_* views the app's sync modules
/// define. Each `state` is the kernel's stored doc state; the doc itself sits under its "doc" key.

data class MirrorCalendar(val id: String, val displayName: String, val color: Int)

data class MirrorChannel(val medium: String, val value: String, val type: String?, val preferred: Boolean)

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
)

object MirrorReader {
  fun calendars(db: SQLiteDatabase): List<MirrorCalendar> =
    db.rawQuery("SELECT id, state FROM bridge_calendars", null).use { c ->
      val out = mutableListOf<MirrorCalendar>()
      while (c.moveToNext()) {
        val doc = docOf(c.getString(1))
        out.add(
          MirrorCalendar(
            id = c.getString(0),
            displayName = doc.optString("displayName").ifEmpty { c.getString(0) },
            color = parseColor(doc.optString("color")),
          ),
        )
      }
      out
    }

  fun items(db: SQLiteDatabase): List<MirrorItem> =
    db.rawQuery("SELECT id, state FROM bridge_items", null).use { c ->
      val out = mutableListOf<MirrorItem>()
      while (c.moveToNext()) {
        // One malformed doc must never kill the whole publish.
        val item = try {
          fromDoc(c.getString(0), docOf(c.getString(1)))
        } catch (e: Exception) {
          android.util.Log.w(Bridge.TAG, "skipping item ${c.getString(0)}: ${e.message}")
          null
        } ?: continue
        out.add(item)
      }
      out
    }

  fun contacts(db: SQLiteDatabase): List<MirrorContact> =
    db.rawQuery("SELECT id, display_name, state FROM bridge_contacts", null).use { c ->
      val out = mutableListOf<MirrorContact>()
      while (c.moveToNext()) {
        val doc = docOf(c.getString(2))
        val channels = mutableListOf<MirrorChannel>()
        doc.optJSONArray("channels")?.let { arr ->
          for (i in 0 until arr.length()) {
            val ch = arr.optJSONObject(i) ?: continue
            val value = ch.optString("value").trim()
            if (value.isEmpty()) continue
            channels.add(MirrorChannel(ch.optString("medium"), value, ch.optStringOrNull("type"), ch.optBoolean("preferred")))
          }
        }
        out.add(
          MirrorContact(
            id = c.getString(0),
            displayName = c.getString(1),
            givenName = doc.optStringOrNull("givenName"),
            middleName = doc.optStringOrNull("middleName"),
            familyName = doc.optStringOrNull("familyName"),
            nickname = doc.optStringOrNull("nickname"),
            channels = channels,
            birthday = birthdayString(doc.optJSONObject("birthday")),
            notes = doc.optStringOrNull("notes"),
          ),
        )
      }
      out
    }

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
      rrule = doc.optStringOrNull("recurrenceRule")?.removePrefix("RRULE:"),
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
