package expo.modules.lupirabridge

import android.content.Context
import org.json.JSONObject
import java.io.File

/// The bridge_* view rows as JS last handed them over. Native never opens the app's expo-sqlite file: a second SQLite
/// copy in the same process drops the app's file locks on close and deletes its WAL ("disk I/O error").
object MirrorSnapshot {
  private const val NAME = "bridge-mirror.json"

  fun write(context: Context, json: String) {
    val tmp = File(context.filesDir, "$NAME.tmp")
    tmp.writeText(json)
    if (!tmp.renameTo(File(context.filesDir, NAME))) throw IllegalStateException("could not replace $NAME")
  }

  fun read(context: Context): JSONObject? {
    val file = File(context.filesDir, NAME)
    return if (file.exists()) JSONObject(file.readText()) else null
  }

  fun clear(context: Context) {
    File(context.filesDir, NAME).delete()
  }
}
