package expo.modules.lupirabridge

import android.content.ContentValues
import android.content.Context
import android.provider.CalendarContract
import android.util.Log
import org.json.JSONObject
import java.util.UUID

/// Provider → inbox, run BEFORE publish in onPerformSync. Captures the user's stock-app edits
/// (DIRTY=1), creations (no _SYNC_ID), and deletions (DELETED=1) into the bridge inbox, then settles the
/// provider row: dirty cleared, deletions physically removed, creations stamped with a pending marker.
/// The marker doubles as the deterministic sourceKey ("bridge:<uuid>"), so a re-captured or re-drained
/// creation converges on the same aggregate — no duplicate creation.
object CalendarCapturer {

  fun capture(context: Context) {
    val resolver = context.contentResolver
    var captured = 0
    resolver.query(
      CalendarPublisher.asSyncAdapter(CalendarContract.Events.CONTENT_URI),
      arrayOf(
        CalendarContract.Events._ID, CalendarContract.Events._SYNC_ID, CalendarContract.Events.DELETED,
        CalendarContract.Events.TITLE, CalendarContract.Events.DESCRIPTION, CalendarContract.Events.EVENT_LOCATION,
        CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND, CalendarContract.Events.DURATION,
        CalendarContract.Events.ALL_DAY, CalendarContract.Events.RRULE, CalendarContract.Events.CALENDAR_ID,
        CalendarContract.Events.SYNC_DATA2,
      ),
      "${CalendarContract.Events.ACCOUNT_TYPE} = ? AND (${CalendarContract.Events.DIRTY} = 1 OR ${CalendarContract.Events.DELETED} = 1)",
      arrayOf(Bridge.ACCOUNT_TYPE), null,
    )?.use { c ->
      BridgeDb.open(context).use { inbox ->
        while (c.moveToNext()) {
          val rowId = c.getLong(0)
          var syncId = c.getString(1)
          val deleted = c.getInt(2) == 1

          val kind = when {
            deleted -> "deleted"
            syncId == null -> "created"
            else -> "revised"
          }
          if (deleted && syncId == null) {
            // Created and deleted in the stock app before we ever saw it — nothing to sync.
            resolver.delete(CalendarPublisher.asSyncAdapter(CalendarContract.Events.CONTENT_URI),
              "${CalendarContract.Events._ID} = ?", arrayOf(rowId.toString()))
            continue
          }

          val payload = JSONObject().apply {
            put("title", c.getString(3) ?: JSONObject.NULL)
            put("description", c.getString(4) ?: JSONObject.NULL)
            put("location", c.getString(5) ?: JSONObject.NULL)
            put("publishedLocation", c.getString(12) ?: JSONObject.NULL)
            put("dtstart", if (c.isNull(6)) JSONObject.NULL else c.getLong(6))
            put("dtend", if (c.isNull(7)) JSONObject.NULL else c.getLong(7))
            put("duration", c.getString(8) ?: JSONObject.NULL)
            put("allDay", c.getInt(9) == 1)
            put("rrule", c.getString(10) ?: JSONObject.NULL)
            put("calendarSyncId", calendarSyncIdOf(context, c.getLong(11)) ?: JSONObject.NULL)
          }

          if (kind == "created") {
            syncId = "pending:${UUID.randomUUID()}"
            val stamp = ContentValues().apply { put(CalendarContract.Events._SYNC_ID, syncId) }
            resolver.update(CalendarPublisher.asSyncAdapter(CalendarContract.Events.CONTENT_URI), stamp,
              "${CalendarContract.Events._ID} = ?", arrayOf(rowId.toString()))
          }

          inbox.execSQL(
            "INSERT INTO bridge_inbox (domain, kind, sync_id, provider_id, payload, captured_at) VALUES (?, ?, ?, ?, ?, ?)",
            arrayOf("cal", kind, syncId, rowId, payload.toString(), System.currentTimeMillis()),
          )
          captured++

          if (deleted) {
            resolver.delete(CalendarPublisher.asSyncAdapter(CalendarContract.Events.CONTENT_URI),
              "${CalendarContract.Events._ID} = ?", arrayOf(rowId.toString()))
          } else {
            val clear = ContentValues().apply { put(CalendarContract.Events.DIRTY, 0) }
            resolver.update(CalendarPublisher.asSyncAdapter(CalendarContract.Events.CONTENT_URI), clear,
              "${CalendarContract.Events._ID} = ?", arrayOf(rowId.toString()))
          }
        }
      }
    }
    if (captured > 0) Log.i(Bridge.TAG, "capture: $captured provider edits into the inbox")
  }

  private fun calendarSyncIdOf(context: Context, calendarRowId: Long): String? =
    context.contentResolver.query(
      CalendarContract.Calendars.CONTENT_URI, arrayOf(CalendarContract.Calendars._SYNC_ID),
      "${CalendarContract.Calendars._ID} = ?", arrayOf(calendarRowId.toString()), null,
    )?.use { if (it.moveToFirst()) it.getString(0) else null }
}
