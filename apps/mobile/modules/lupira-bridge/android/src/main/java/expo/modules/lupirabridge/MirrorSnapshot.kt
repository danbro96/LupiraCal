package expo.modules.lupirabridge

import android.content.Context
import org.json.JSONObject
import java.io.File

/// The bridge_* view rows as JS last handed them over. Native never opens the app's expo-sqlite file: a second SQLite
/// copy in the same process drops the app's file locks on close and deletes its WAL ("disk I/O error").
object MirrorSnapshot {
  private const val NAME = "bridge-mirror.json"

  fun write(context: Context, json: String) = write(context.filesDir, json)

  fun read(context: Context): JSONObject? = read(context.filesDir, Bridge.generation(context))

  fun clear(context: Context) = clear(context.filesDir)

  fun write(dir: File, json: String) {
    val tmp = File(dir, "$NAME.tmp")
    tmp.writeText(json)
    if (!tmp.renameTo(File(dir, NAME))) throw IllegalStateException("could not replace $NAME")
  }

  /// Only the generation native holds; a file from before generations reads while native holds none.
  fun read(dir: File, generation: String?): JSONObject? {
    val file = File(dir, NAME)
    if (!file.exists()) return null
    val json = JSONObject(file.readText())
    val own = if (json.isNull("generation")) null else json.getString("generation")
    return if (own == generation) json else null
  }

  fun clear(dir: File) {
    File(dir, NAME).delete()
    File(dir, "$NAME.tmp").delete()
  }
}
