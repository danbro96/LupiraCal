package expo.modules.lupirabridge

import android.accounts.AccountManager
import android.content.ContentResolver
import android.content.ContentValues
import android.net.Uri
import android.os.Process
import android.os.SystemClock
import android.provider.CalendarContract
import android.provider.ContactsContract
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/// JS-facing spike API. Everything runs in the app process; provider writes go through the
/// CALLER_IS_SYNCADAPTER door so the rows belong to the Lupira account (that is also what exempts
/// them from the provider's dirty-flag bookkeeping — user edits in stock apps set DIRTY, ours don't).
class LupiraBridgeModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private val resolver: ContentResolver get() = context.contentResolver

  override fun definition() = ModuleDefinition {
    Name("LupiraBridge")

    AsyncFunction("ensureAccount") {
      val am = AccountManager.get(context)
      val existed = am.getAccountsByType(Bridge.ACCOUNT_TYPE).isNotEmpty()
      if (!existed && !am.addAccountExplicitly(Bridge.account, null, null))
        throw CodedException("ERR_ACCOUNT", "addAccountExplicitly returned false", null)
      // Idempotent on purpose: a failed first run must be repairable by tapping again.
      for (authority in listOf(Bridge.CALENDAR_AUTHORITY, Bridge.CONTACTS_AUTHORITY)) {
        ContentResolver.setIsSyncable(Bridge.account, authority, 1)
        // Auto-sync makes the framework schedule an upload sync when provider rows go dirty —
        // that's the near-immediate stock-app-edit capture. The hourly periodic sync is the backstop.
        ContentResolver.setSyncAutomatically(Bridge.account, authority, true)
        ContentResolver.addPeriodicSync(Bridge.account, authority, android.os.Bundle.EMPTY, 3600L)
      }
      existed
    }

    AsyncFunction("removeAccount") {
      val am = AccountManager.get(context)
      val accounts = am.getAccountsByType(Bridge.ACCOUNT_TYPE)
      for (a in accounts) am.removeAccountExplicitly(a)
      accounts.isNotEmpty()
    }

    AsyncFunction("requestSync") {
      val extras = android.os.Bundle().apply {
        putBoolean(ContentResolver.SYNC_EXTRAS_MANUAL, true)
        putBoolean(ContentResolver.SYNC_EXTRAS_EXPEDITED, true)
      }
      ContentResolver.requestSync(Bridge.account, Bridge.CALENDAR_AUTHORITY, extras)
      ContentResolver.requestSync(Bridge.account, Bridge.CONTACTS_AUTHORITY, extras)
    }

    AsyncFunction("getBridgeState") {
      val am = AccountManager.get(context)
      val lastSync = Bridge.prefs(context).getLong(Bridge.PREF_LAST_SYNC, 0L)
      // Callable before the runtime permission grant (the screen reads state on mount).
      val calendarId = try {
        findCalendarId()
      } catch (_: SecurityException) {
        null
      }
      mapOf(
        "accountPresent" to am.getAccountsByType(Bridge.ACCOUNT_TYPE).isNotEmpty(),
        "calendarId" to calendarId,
        "lastSyncAt" to if (lastSync == 0L) null else lastSync.toDouble(),
      )
    }

    /// Runs the sync body in-process, immediately — the deterministic path for tests and the spike
    /// screen. requestSync stays for verifying OS scheduling.
    AsyncFunction("bridgeSyncNow") {
      CalendarCapturer.capture(context)
      CalendarPublisher.publish(context)
      ContactsCapturer.capture(context)
      ContactsPublisher.publish(context)
      Bridge.prefs(context).edit().putLong(Bridge.PREF_LAST_SYNC, System.currentTimeMillis()).apply()
    }

    AsyncFunction("drainInbox") {
      BridgeDb.open(context).use { db ->
        db.rawQuery("SELECT id, domain, kind, sync_id, provider_id, payload, captured_at FROM bridge_inbox ORDER BY id", null).use { c ->
          val rows = mutableListOf<Map<String, Any?>>()
          while (c.moveToNext()) {
            rows.add(
              mapOf(
                "id" to c.getLong(0), "domain" to c.getString(1), "kind" to c.getString(2),
                "syncId" to c.getString(3), "providerId" to c.getLong(4),
                "payload" to c.getString(5), "capturedAt" to c.getLong(6).toDouble(),
              ),
            )
          }
          rows
        }
      }
    }

    AsyncFunction("ackInbox") { ids: List<Double> ->
      BridgeDb.open(context).use { db ->
        for (id in ids) db.execSQL("DELETE FROM bridge_inbox WHERE id = ?", arrayOf(id.toLong()))
      }
    }

    /// After the JS drain creates the aggregate for a stock-created event, the provider row's pending
    /// marker is replaced with the real item id so future publishes upsert instead of duplicating.
    AsyncFunction("assignEventSyncId") { pendingMarker: String, syncId: String ->
      val values = ContentValues().apply { put(CalendarContract.Events._SYNC_ID, syncId) }
      resolver.update(
        asSyncAdapter(CalendarContract.Events.CONTENT_URI), values,
        "${CalendarContract.Events._SYNC_ID} = ?", arrayOf(pendingMarker),
      )
    }

    /// Recon for M7's write-back design: raw-contact rows with the columns the dirty-flag flow
    /// pivots on (ACCOUNT_TYPE, SOURCE_ID, DIRTY, DELETED).
    AsyncFunction("readContactsSample") { limit: Int ->
      val projection = arrayOf(
        ContactsContract.RawContacts._ID,
        ContactsContract.RawContacts.ACCOUNT_TYPE,
        ContactsContract.RawContacts.ACCOUNT_NAME,
        ContactsContract.RawContacts.SOURCE_ID,
        ContactsContract.RawContacts.DIRTY,
        ContactsContract.RawContacts.DELETED,
        ContactsContract.RawContacts.DISPLAY_NAME_PRIMARY,
      )
      val rows = mutableListOf<Map<String, Any?>>()
      var total = 0
      resolver.query(ContactsContract.RawContacts.CONTENT_URI, projection, null, null, null)?.use { c ->
        total = c.count
        while (c.moveToNext() && rows.size < limit) {
          rows.add(
            mapOf(
              "id" to c.getLong(0),
              "accountType" to c.getString(1),
              "accountName" to c.getString(2),
              "sourceId" to c.getString(3),
              "dirty" to c.getInt(4),
              "deleted" to c.getInt(5),
              "displayName" to c.getString(6),
            ),
          )
        }
      }
      mapOf("total" to total, "rows" to rows)
    }

    /// Hands a shared file's text over once; the name comes from a deep link, so it must be a bare uuid.
    AsyncFunction("readImport") { name: String ->
      if (!IMPORT_NAME.matches(name)) throw CodedException("ERR_IMPORT", "Not an import name", null)
      val file = File(Bridge.importsDir(context), name)
      if (!file.exists()) throw CodedException("ERR_IMPORT", "The shared file is gone", null)
      try {
        file.readText(Charsets.UTF_8)
      } finally {
        file.delete()
      }
    }

    /// Files copied during this process's lifetime may still be on their way to readImport.
    AsyncFunction("clearImports") {
      val processStartedAt = System.currentTimeMillis() - (SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime())
      Bridge.importsDir(context).listFiles()?.filter { it.lastModified() < processStartedAt }?.forEach { it.delete() }
    }
  }

  private companion object {
    val IMPORT_NAME = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
  }

  private fun asSyncAdapter(uri: Uri): Uri = CalendarPublisher.asSyncAdapter(uri)

  private fun findCalendarId(): Long? =
    resolver.query(
      CalendarContract.Calendars.CONTENT_URI, arrayOf(CalendarContract.Calendars._ID),
      "${CalendarContract.Calendars.ACCOUNT_TYPE} = ?", arrayOf(Bridge.ACCOUNT_TYPE), null,
    )?.use { if (it.moveToFirst()) it.getLong(0) else null }
}
