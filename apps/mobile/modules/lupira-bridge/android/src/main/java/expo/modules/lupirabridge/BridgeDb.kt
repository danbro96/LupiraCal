package expo.modules.lupirabridge

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File

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

  fun pendingSyncIds(context: Context): Set<String> =
    open(context).use { db ->
      db.rawQuery("SELECT DISTINCT sync_id FROM bridge_inbox WHERE sync_id IS NOT NULL", null).use { c ->
        val out = mutableSetOf<String>()
        while (c.moveToNext()) out.add(c.getString(0))
        out
      }
    }
}
