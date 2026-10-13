package expo.modules.lupirabridge

import android.content.ContentValues
import android.content.Context
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/// Provider → inbox for contacts, run BEFORE publish. Captures stock-app edits (DIRTY) and deletions
/// (DELETED) of Lupira-owned raw contacts, then settles the row. No creation branch: Samsung Contacts
/// never offers third-party accounts as contact storage, so stock-created contacts can't land under our
/// account — creation lives in the app/web.
object ContactsCapturer {

  fun capture(context: Context) {
    val resolver = context.contentResolver
    var captured = 0
    resolver.query(
      ContactsPublisher.rawContactsUri(),
      arrayOf(
        ContactsContract.RawContacts._ID, ContactsContract.RawContacts.SOURCE_ID,
        ContactsContract.RawContacts.DIRTY, ContactsContract.RawContacts.DELETED,
      ),
      "${ContactsContract.RawContacts.ACCOUNT_TYPE} = ? AND (${ContactsContract.RawContacts.DIRTY} = 1 OR ${ContactsContract.RawContacts.DELETED} = 1)",
      arrayOf(Bridge.ACCOUNT_TYPE), null,
    )?.use { c ->
      BridgeDb.open(context).use { inbox ->
        while (c.moveToNext()) {
          val rawId = c.getLong(0)
          val sourceId = c.getString(1)
          val deleted = c.getInt(3) == 1

          if (sourceId == null) {
            // Ours but never source-stamped — nothing upstream to reconcile; drop it quietly.
            resolver.delete(ContactsPublisher.rawContactsUri(),
              "${ContactsContract.RawContacts._ID} = ?", arrayOf(rawId.toString()))
            continue
          }

          val payload = if (deleted) JSONObject() else readDataRows(context, rawId)
          inbox.execSQL(
            "INSERT INTO bridge_inbox (domain, kind, sync_id, provider_id, payload, captured_at) VALUES (?, ?, ?, ?, ?, ?)",
            arrayOf("contact", if (deleted) "deleted" else "revised", sourceId, rawId, payload.toString(), System.currentTimeMillis()),
          )
          captured++

          if (deleted) {
            resolver.delete(ContactsPublisher.rawContactsUri(),
              "${ContactsContract.RawContacts._ID} = ?", arrayOf(rawId.toString()))
          } else {
            val clear = ContentValues().apply { put(ContactsContract.RawContacts.DIRTY, 0) }
            resolver.update(ContactsPublisher.rawContactsUri(), clear,
              "${ContactsContract.RawContacts._ID} = ?", arrayOf(rawId.toString()))
          }
        }
      }
    }
    if (captured > 0) Log.i(Bridge.TAG, "contacts capture: $captured provider edits into the inbox")
  }

  private fun readDataRows(context: Context, rawId: Long): JSONObject {
    val payload = JSONObject()
    val phones = JSONArray()
    val emails = JSONArray()
    val postals = JSONArray()
    context.contentResolver.query(
      ContactsContract.Data.CONTENT_URI,
      arrayOf(
        ContactsContract.Data.MIMETYPE, ContactsContract.Data.DATA1, ContactsContract.Data.DATA2,
        ContactsContract.Data.DATA3, ContactsContract.Data.DATA5, ContactsContract.Data.IS_SUPER_PRIMARY,
        CommonDataKinds.StructuredPostal.STREET, CommonDataKinds.StructuredPostal.CITY,
        CommonDataKinds.StructuredPostal.POSTCODE, CommonDataKinds.StructuredPostal.COUNTRY,
        ContactsContract.Data.SYNC1, ContactsContract.Data.SYNC2,
      ),
      "${ContactsContract.Data.RAW_CONTACT_ID} = ?", arrayOf(rawId.toString()), null,
    )?.use { c ->
      while (c.moveToNext()) {
        when (c.getString(0)) {
          CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE -> {
            // Data2 = given, Data3 = family, Data5 = middle (provider column aliases).
            payload.put("given", c.getString(2) ?: JSONObject.NULL)
            payload.put("family", c.getString(3) ?: JSONObject.NULL)
            payload.put("middle", c.getString(4) ?: JSONObject.NULL)
          }
          CommonDataKinds.Nickname.CONTENT_ITEM_TYPE -> payload.put("nickname", c.getString(1) ?: JSONObject.NULL)
          CommonDataKinds.Note.CONTENT_ITEM_TYPE -> payload.put("notes", c.getString(1) ?: JSONObject.NULL)
          CommonDataKinds.Phone.CONTENT_ITEM_TYPE -> phones.put(channelJson(c.getString(1), c.getString(2), c.getInt(5)))
          CommonDataKinds.Email.CONTENT_ITEM_TYPE -> emails.put(channelJson(c.getString(1), c.getString(2), c.getInt(5)))
          CommonDataKinds.StructuredPostal.CONTENT_ITEM_TYPE -> postals.put(JSONObject().apply {
            put("text", c.getString(1) ?: JSONObject.NULL)
            put("type", c.getString(2)?.toIntOrNull() ?: JSONObject.NULL)
            put("label", c.getString(3) ?: JSONObject.NULL)
            put("street", c.getString(6) ?: JSONObject.NULL)
            put("city", c.getString(7) ?: JSONObject.NULL)
            put("postcode", c.getString(8) ?: JSONObject.NULL)
            put("country", c.getString(9) ?: JSONObject.NULL)
            put("source", c.getString(10) ?: JSONObject.NULL)
            put("published", c.getString(11) ?: JSONObject.NULL)
          })
          CommonDataKinds.Event.CONTENT_ITEM_TYPE ->
            if (c.getString(2) == CommonDataKinds.Event.TYPE_BIRTHDAY.toString())
              payload.put("birthday", c.getString(1) ?: JSONObject.NULL)
        }
      }
    }
    payload.put("phones", phones)
    payload.put("emails", emails)
    payload.put("postals", postals)
    return payload
  }

  private fun channelJson(value: String?, type: String?, superPrimary: Int): JSONObject =
    JSONObject().apply {
      put("value", value ?: "")
      put("type", type?.toIntOrNull() ?: JSONObject.NULL)
      put("preferred", superPrimary == 1)
    }
}
