package expo.modules.lupirabridge

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.CalendarContract
import android.util.Log
import java.security.MessageDigest

/// Mirror → provider, run inside onPerformSync. One provider calendar per mirror calendar (upsert by
/// Calendars._SYNC_ID), one event per item (upsert by Events._SYNC_ID = item id). Recurring items publish
/// DTSTART + DURATION + RRULE so the provider expands them — publishing expanded instances would break
/// stock-app edit semantics. SYNC_DATA1 carries a content hash: unchanged rows are skipped, which is also
/// the echo suppressor (a round-tripped write-back lands as the same hash); SYNC_DATA2 the published location,
/// so a capture can tell a location edit from a row the mirror has moved on from. Rows with a pending inbox
/// capture are skipped so the user's stock-app edit isn't visibly reverted while it rides to the server.
object CalendarPublisher {

  fun publish(context: Context) {
    val mirror = BridgeDb.openMirror(context) ?: return
    val resolver = context.contentResolver
    mirror.use {
      val calendars = MirrorReader.calendars(mirror)
      val items = MirrorReader.items(mirror)
      val holdBack = BridgeDb.pendingSyncIds(context)

      val calendarRowIds = upsertCalendars(resolver, calendars)
      upsertEvents(resolver, items, calendarRowIds, holdBack)
      Log.i(Bridge.TAG, "publish: ${calendars.size} calendars, ${items.size} items (${holdBack.size} held back)")
    }
  }

  private fun upsertCalendars(resolver: ContentResolver, calendars: List<MirrorCalendar>): Map<String, Long> {
    val existing = mutableMapOf<String, Long>()
    resolver.query(
      asSyncAdapter(CalendarContract.Calendars.CONTENT_URI),
      arrayOf(CalendarContract.Calendars._ID, CalendarContract.Calendars._SYNC_ID),
      "${CalendarContract.Calendars.ACCOUNT_TYPE} = ?", arrayOf(Bridge.ACCOUNT_TYPE), null,
    )?.use { c ->
      while (c.moveToNext()) {
        val syncId = c.getString(1)
        // A null _SYNC_ID under our account is the pre-M7 spike calendar — retire it.
        if (syncId == null) {
          resolver.delete(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI),
            "${CalendarContract.Calendars._ID} = ?", arrayOf(c.getLong(0).toString()))
        } else {
          existing[syncId] = c.getLong(0)
        }
      }
    }

    val rowIds = mutableMapOf<String, Long>()
    for (cal in calendars) {
      val values = ContentValues().apply {
        put(CalendarContract.Calendars.ACCOUNT_NAME, Bridge.ACCOUNT_NAME)
        put(CalendarContract.Calendars.ACCOUNT_TYPE, Bridge.ACCOUNT_TYPE)
        put(CalendarContract.Calendars.NAME, cal.displayName)
        put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, cal.displayName)
        put(CalendarContract.Calendars.CALENDAR_COLOR, cal.color)
        put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
        put(CalendarContract.Calendars.OWNER_ACCOUNT, Bridge.ACCOUNT_NAME)
        put(CalendarContract.Calendars.SYNC_EVENTS, 1)
        put(CalendarContract.Calendars.VISIBLE, 1)
        put(CalendarContract.Calendars._SYNC_ID, cal.id)
      }
      val rowId = existing[cal.id]
      if (rowId != null) {
        resolver.update(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), values,
          "${CalendarContract.Calendars._ID} = ?", arrayOf(rowId.toString()))
        rowIds[cal.id] = rowId
      } else {
        val uri = resolver.insert(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), values) ?: continue
        rowIds[cal.id] = uri.lastPathSegment!!.toLong()
      }
    }

    for ((syncId, rowId) in existing) {
      if (!rowIds.containsKey(syncId))
        resolver.delete(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI),
          "${CalendarContract.Calendars._ID} = ?", arrayOf(rowId.toString()))
    }
    return rowIds
  }

  private fun upsertEvents(
    resolver: ContentResolver, items: List<MirrorItem>, calendarRowIds: Map<String, Long>, holdBack: Set<String>,
  ) {
    data class Row(val rowId: Long, val hash: String?, val dirty: Boolean, val publishedLocation: String?)
    val existing = mutableMapOf<String, Row>()
    resolver.query(
      asSyncAdapter(CalendarContract.Events.CONTENT_URI),
      arrayOf(
        CalendarContract.Events._ID, CalendarContract.Events._SYNC_ID,
        CalendarContract.Events.SYNC_DATA1, CalendarContract.Events.DIRTY, CalendarContract.Events.SYNC_DATA2,
      ),
      "${CalendarContract.Events.ACCOUNT_TYPE} = ? AND ${CalendarContract.Events.DELETED} = 0",
      arrayOf(Bridge.ACCOUNT_TYPE), null,
    )?.use { c ->
      while (c.moveToNext()) c.getString(1)?.let { existing[it] = Row(c.getLong(0), c.getString(2), c.getInt(3) == 1, c.getString(4)) }
    }

    val desired = mutableSetOf<String>()
    for (item in items) {
      val calendarRowId = calendarRowIds[item.calendarId] ?: continue
      desired.add(item.id)
      if (holdBack.contains(item.id)) continue           // un-drained stock edit owns this row for now
      val current = existing[item.id]
      if (current?.dirty == true) continue               // capture will pick it up first; don't clobber

      val hash = hashOf(item, calendarRowId)
      if (current?.hash == hash && current?.publishedLocation == item.location) continue

      val values = eventValues(item, calendarRowId, hash)
      if (current != null) {
        resolver.update(asSyncAdapter(CalendarContract.Events.CONTENT_URI), values,
          "${CalendarContract.Events._ID} = ?", arrayOf(current.rowId.toString()))
      } else {
        values.put(CalendarContract.Events._SYNC_ID, item.id)
        resolver.insert(asSyncAdapter(CalendarContract.Events.CONTENT_URI), values)
      }
    }

    for ((syncId, row) in existing) {
      if (desired.contains(syncId) || holdBack.contains(syncId)) continue
      resolver.delete(asSyncAdapter(CalendarContract.Events.CONTENT_URI),
        "${CalendarContract.Events._ID} = ?", arrayOf(row.rowId.toString()))
    }
  }

  private fun eventValues(item: MirrorItem, calendarRowId: Long, hash: String): ContentValues =
    ContentValues().apply {
      put(CalendarContract.Events.CALENDAR_ID, calendarRowId)
      put(CalendarContract.Events.TITLE, item.title)
      put(CalendarContract.Events.DESCRIPTION, item.description)
      put(CalendarContract.Events.EVENT_LOCATION, item.location)
      put(CalendarContract.Events.DTSTART, item.startMs)
      put(CalendarContract.Events.ALL_DAY, if (item.allDay) 1 else 0)
      put(CalendarContract.Events.EVENT_TIMEZONE, "UTC")
      put(CalendarContract.Events.STATUS,
        if (item.cancelled) CalendarContract.Events.STATUS_CANCELED else CalendarContract.Events.STATUS_CONFIRMED)
      put(CalendarContract.Events.SYNC_DATA1, hash)
      put(CalendarContract.Events.SYNC_DATA2, item.location)
      if (item.rrule != null) {
        // Recurring rows must carry DURATION, never DTEND (provider requirement).
        put(CalendarContract.Events.RRULE, item.rrule)
        put(CalendarContract.Events.DURATION, durationOf(item))
        putNull(CalendarContract.Events.DTEND)
      } else {
        put(CalendarContract.Events.DTEND, item.endMs ?: defaultEnd(item))
        putNull(CalendarContract.Events.RRULE)
        putNull(CalendarContract.Events.DURATION)
      }
    }

  private fun durationOf(item: MirrorItem): String {
    val ms = (item.endMs ?: defaultEnd(item)) - item.startMs
    return if (item.allDay) "P${(ms / 86_400_000L).coerceAtLeast(1)}D" else "PT${(ms / 1000L).coerceAtLeast(60)}S"
  }

  private fun defaultEnd(item: MirrorItem): Long =
    item.startMs + if (item.allDay) 86_400_000L else 1_800_000L

  private fun hashOf(item: MirrorItem, calendarRowId: Long): String {
    val canonical = listOf(
      item.title, item.description ?: "", item.location ?: "", item.cancelled, item.allDay,
      item.startMs, item.endMs ?: -1L, item.rrule ?: "", calendarRowId,
    ).joinToString("|")
    return MessageDigest.getInstance("MD5").digest(canonical.toByteArray()).joinToString("") { "%02x".format(it) }
  }

  fun asSyncAdapter(uri: Uri): Uri = uri.buildUpon()
    .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
    .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, Bridge.ACCOUNT_NAME)
    .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, Bridge.ACCOUNT_TYPE)
    .build()
}
