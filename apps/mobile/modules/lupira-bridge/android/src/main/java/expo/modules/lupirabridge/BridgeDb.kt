package expo.modules.lupirabridge

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File

/// An address typed in the stock Contacts app that no place backs yet; `residencyId` is the published address it
/// stands in for. Local to the phone until the app resolves it into a residency.
data class AddressHint(
  val id: String,
  val contactId: String,
  val residencyId: String?,
  val type: String?,
  val text: String,
  val street: String?,
  val postcode: String?,
  val city: String?,
  val country: String?,
)

/// Kotlin-owned handoff store between onPerformSync (which has no JS runtime) and the app's engine.
/// Captured provider edits land here; the JS drain translates them into outbox ops and acks. Lives in the
/// same SQLite directory as the mirror so expo-sqlite could open it, but only Kotlin writes the schema.
object BridgeDb {
  private const val NAME = "lupira-bridge.db"

  fun open(context: Context): SQLiteDatabase {
    val dir = File(context.filesDir, "SQLite").apply { mkdirs() }
    val db = SQLiteDatabase.openOrCreateDatabase(File(dir, NAME), null)
    setBusyTimeout(db)
    db.execSQL(
      """CREATE TABLE IF NOT EXISTS bridge_inbox (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           domain TEXT NOT NULL,
           kind TEXT NOT NULL,
           sync_id TEXT,
           provider_id INTEGER NOT NULL,
           payload TEXT NOT NULL,
           captured_at INTEGER NOT NULL)""",
    )
    db.execSQL(
      """CREATE TABLE IF NOT EXISTS contact_address_hint (
           id TEXT PRIMARY KEY,
           contact_id TEXT NOT NULL,
           residency_id TEXT,
           type TEXT,
           text TEXT NOT NULL,
           street TEXT,
           postcode TEXT,
           city TEXT,
           country TEXT)""",
    )
    return db
  }

  /// The mirror database the RN app maintains (expo-sqlite, WAL). This connection never writes, but it
  /// must open READWRITE (read-only can't recover a live WAL index) and MUST pass
  /// ENABLE_WRITE_AHEAD_LOGGING: without it, Android's framework rewrites the journal mode to its
  /// non-WAL default on open, silently downgrading the app's own connections to rollback-journal
  /// locking ("database is locked" all over the engine — observed on a fresh install mid-first-sync).
  fun openMirror(context: Context): SQLiteDatabase? {
    val file = File(context.filesDir, "SQLite/lupira-calendar.db")
    if (!file.exists()) return null
    val db = SQLiteDatabase.openDatabase(
      file.path, null,
      SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING,
    )
    setBusyTimeout(db)
    return db
  }

  /// PRAGMA busy_timeout returns a row — Android's execSQL rejects result-bearing statements
  /// ("Queries can be performed using query or rawQuery methods only"), so it must go through rawQuery.
  private fun setBusyTimeout(db: SQLiteDatabase) {
    db.rawQuery("PRAGMA busy_timeout = 30000", null).use { it.moveToFirst() }
  }

  /// Captured rows' sync ids, plus the item each belongs to: an occurrence's capture holds its whole series back.
  fun pendingSyncIds(context: Context): Set<String> =
    open(context).use { db ->
      db.rawQuery("SELECT DISTINCT sync_id FROM bridge_inbox WHERE sync_id IS NOT NULL", null).use { c ->
        val out = mutableSetOf<String>()
        while (c.moveToNext()) {
          out.add(c.getString(0))
          out.add(ProviderRecurrence.itemIdOf(c.getString(0)))
        }
        out
      }
    }

  fun addressHints(context: Context, contactId: String? = null): List<AddressHint> =
    open(context).use { db ->
      db.rawQuery(
        "SELECT id, contact_id, residency_id, type, text, street, postcode, city, country FROM contact_address_hint" +
          (if (contactId == null) "" else " WHERE contact_id = ?") + " ORDER BY id",
        contactId?.let { arrayOf(it) },
      ).use { c ->
        val out = mutableListOf<AddressHint>()
        while (c.moveToNext()) {
          out.add(AddressHint(
            c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4),
            c.getString(5), c.getString(6), c.getString(7), c.getString(8),
          ))
        }
        out
      }
    }

  fun putAddressHint(context: Context, hint: AddressHint) {
    val values = ContentValues().apply {
      put("id", hint.id)
      put("contact_id", hint.contactId)
      put("residency_id", hint.residencyId)
      put("type", hint.type)
      put("text", hint.text)
      put("street", hint.street)
      put("postcode", hint.postcode)
      put("city", hint.city)
      put("country", hint.country)
    }
    open(context).use { it.insertWithOnConflict("contact_address_hint", null, values, SQLiteDatabase.CONFLICT_REPLACE) }
  }

  fun deleteAddressHints(context: Context, ids: List<String>) {
    open(context).use { db -> for (id in ids) db.execSQL("DELETE FROM contact_address_hint WHERE id = ?", arrayOf(id)) }
  }

  fun clearAddressHints(context: Context) {
    open(context).use { it.execSQL("DELETE FROM contact_address_hint") }
  }
}
