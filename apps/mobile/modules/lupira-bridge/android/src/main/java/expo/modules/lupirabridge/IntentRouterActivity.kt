package expo.modules.lupirabridge

import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.provider.CalendarContract
import android.provider.CalendarContract.Events
import android.provider.ContactsContract
import android.util.Log
import android.widget.Toast
import java.io.File
import java.util.UUID

/// Invisible entry for what other apps hand us: each intent becomes an in-app deep link, and a calendar
/// event that isn't ours goes back to the system calendar app.
class IntentRouterActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    intent?.let { route(it) }?.let {
      startActivity(Intent(Intent.ACTION_VIEW, it).setPackage(packageName))
    }
    finish()
  }

  private fun route(intent: Intent): Uri? {
    val type = intent.resolveType(contentResolver)
    return when {
      type == CONTACT_ROW_TYPE -> intent.data?.let { contactRowLink(it) }
      type == EVENT_ITEM_TYPE && intent.action == Intent.ACTION_VIEW -> intent.data?.let { eventLink(intent, it) }
      type == EVENT_ITEM_TYPE && intent.action == Intent.ACTION_EDIT ->
        intent.data?.let { ourItemId(it) }?.let { link("item/${Uri.encode(it)}/edit") } ?: eventDraftLink(intent)
      type == EVENT_ITEM_TYPE || type == EVENT_DIR_TYPE -> eventDraftLink(intent)
      type in CONTACT_DIR_TYPES -> contactDraftLink(intent)
      type in CALENDAR_FILE_TYPES -> intent.data?.let { importLink(it, "calendar") }
      type in CONTACT_FILE_TYPES -> intent.data?.let { importLink(it, "contacts") }
      else -> null
    }
  }

  /// The "Open in Lupira" contact row: DATA1 holds the Lupira contact id.
  private fun contactRowLink(uri: Uri): Uri? =
    contentResolver.query(uri, arrayOf(ContactsContract.Data.DATA1), null, null, null)?.use {
      if (it.moveToFirst()) it.getString(0) else null
    }?.let { link("contact/${Uri.encode(it)}") }

  private fun eventLink(intent: Intent, uri: Uri): Uri? {
    ourItemId(uri)?.let { return link("item/${Uri.encode(it)}") }
    handOffToCalendarApp(intent)
    return null
  }

  /// The item id behind a provider event row of our account; a pending marker means it isn't created yet.
  private fun ourItemId(uri: Uri): String? {
    val row = try {
      contentResolver.query(uri, arrayOf(Events._SYNC_ID, Events.ACCOUNT_TYPE), null, null, null)?.use {
        if (it.moveToFirst()) it.getString(0) to it.getString(1) else null
      }
    } catch (e: SecurityException) {
      null
    }
    return row?.takeIf { it.second == Bridge.ACCOUNT_TYPE }?.first?.takeUnless { it.startsWith("pending:") }
  }

  private fun handOffToCalendarApp(original: Intent) {
    val forward = Intent(original).setComponent(null).setPackage(null)
    val candidates = packageManager.queryIntentActivities(forward, 0)
      .filter { it.activityInfo.packageName != packageName }
    val target = candidates.firstOrNull { it.activityInfo.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0 }
      ?: candidates.firstOrNull()
      ?: return
    startActivity(forward.setClassName(target.activityInfo.packageName, target.activityInfo.name))
  }

  private fun eventDraftLink(intent: Intent): Uri = draftLink(
    "event",
    "begin" to intent.longExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME),
    "end" to intent.longExtra(CalendarContract.EXTRA_EVENT_END_TIME),
    "allDay" to intent.takeIf { it.hasExtra(CalendarContract.EXTRA_EVENT_ALL_DAY) }
      ?.getBooleanExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, false)?.toString(),
    "title" to intent.getStringExtra(Events.TITLE),
    "location" to intent.getStringExtra(Events.EVENT_LOCATION),
    "description" to intent.getStringExtra(Events.DESCRIPTION),
    "recurrence" to intent.getStringExtra(Events.RRULE),
  )

  private fun contactDraftLink(intent: Intent): Uri = draftLink(
    "contact",
    "name" to intent.getStringExtra(ContactsContract.Intents.Insert.NAME),
    "phone" to intent.getStringExtra(ContactsContract.Intents.Insert.PHONE),
    "email" to intent.getStringExtra(ContactsContract.Intents.Insert.EMAIL),
    "company" to intent.getStringExtra(ContactsContract.Intents.Insert.COMPANY),
    "notes" to intent.getStringExtra(ContactsContract.Intents.Insert.NOTES),
  )

  private fun draftLink(kind: String, vararg params: Pair<String, String?>): Uri =
    Uri.Builder().scheme(SCHEME).authority("draft").path(kind).apply {
      for ((key, value) in params) if (!value.isNullOrEmpty()) appendQueryParameter(key, value)
    }.build()

  /// The JS side reads files through the bridge, so the shared uri is copied while our grant to it lasts.
  private fun importLink(uri: Uri, kind: String): Uri? {
    val name = UUID.randomUUID().toString()
    val copied = try {
      copyCapped(uri, File(Bridge.importsDir(this).apply { mkdirs() }, name))
    } catch (e: Exception) {
      Log.w(Bridge.TAG, "IntentRouterActivity: couldn't copy $uri", e)
      null
    }
    if (copied != true) {
      val message = if (copied == false) "That file is too large to open" else "Couldn't open that file"
      Toast.makeText(applicationContext, message, Toast.LENGTH_LONG).show()
      return null
    }
    return Uri.Builder().scheme(SCHEME).authority("import").path(kind).appendQueryParameter("file", name).build()
  }

  /// False when the file is over the cap; the partial copy is removed.
  private fun copyCapped(uri: Uri, target: File): Boolean {
    val input = contentResolver.openInputStream(uri) ?: throw IllegalStateException("no stream")
    var total = 0L
    input.use { source ->
      target.outputStream().use { sink ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = source.read(buffer)
          if (read < 0) break
          total += read
          if (total > MAX_IMPORT_BYTES) break
          sink.write(buffer, 0, read)
        }
      }
    }
    if (total <= MAX_IMPORT_BYTES) return true
    target.delete()
    return false
  }

  private fun Intent.longExtra(key: String): String? =
    takeIf { it.hasExtra(key) }?.getLongExtra(key, 0L)?.toString()

  private fun link(path: String): Uri = Uri.parse("$SCHEME://$path")

  private companion object {
    const val SCHEME = "lupiracalendar"
    const val MAX_IMPORT_BYTES = 5L * 1024 * 1024
    const val CONTACT_ROW_TYPE = "vnd.android.cursor.item/vnd.com.lupira.calendar.contact"
    const val EVENT_ITEM_TYPE = "vnd.android.cursor.item/event"
    const val EVENT_DIR_TYPE = "vnd.android.cursor.dir/event"
    val CONTACT_DIR_TYPES = setOf("vnd.android.cursor.dir/contact", "vnd.android.cursor.dir/raw_contact")
    val CALENDAR_FILE_TYPES = setOf("text/calendar", "application/ics", "text/x-vcalendar")
    val CONTACT_FILE_TYPES = setOf("text/vcard", "text/x-vcard", "text/directory")
  }
}
