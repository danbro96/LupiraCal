package expo.modules.lupirabridge

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MirrorReaderTest {
  private fun state(doc: JSONObject) = JSONObject().put("doc", doc).put("guards", JSONObject()).toString()

  private val snapshot = JSONObject()
    .put("calendars", JSONArray())
    .put(
      "items",
      JSONArray().put(
        JSONObject().put("id", "i1").put(
          "state",
          state(
            JSONObject()
              .put("title", "Picnic")
              .put("isAllDay", false)
              .put("startsAt", "2026-08-10T09:00:00Z")
              .put("endsAt", "2026-08-10T12:00:00+02:00")
              .put("calendars", JSONArray().put(JSONObject().put("calendarId", "cal-1").put("status", "Accepted"))),
          ),
        ),
      ),
    )
    .put(
      "contacts",
      JSONArray().put(
        JSONObject().put("id", "c1").put("display_name", "Anna").put(
          "state",
          state(
            JSONObject()
              .put("givenName", "Anna")
              .put("channels", JSONArray().put(JSONObject().put("medium", "Phone").put("value", " 070 ").put("preferred", true)))
              .put("birthday", JSONObject().put("year", JSONObject.NULL).put("month", 5).put("day", 3)),
          ),
        ),
      ),
    )
    .put(
      "residencies",
      JSONArray()
        .put(
          JSONObject().put("id", "r1").put("contact_id", "c1")
            .put("state", state(JSONObject().put("type", "Home").put("movedIn", JSONObject().put("year", 2020))))
            .put("place", state(JSONObject().put("name", "Hemma").put("formattedAddress", "Storgatan 1, Ljungby"))),
        )
        .put(
          JSONObject().put("id", "r2").put("contact_id", "c1")
            .put("state", state(JSONObject().put("type", "Work")))
            .put("place", JSONObject.NULL),
        ),
    )

  @Test
  fun itemsReadFromSnapshot() {
    val item = MirrorReader.items(snapshot).single()
    assertEquals("i1", item.id)
    assertEquals("cal-1", item.calendarId)
    assertEquals("Picnic", item.title)
    assertEquals(1786352400000L, item.startMs)
    assertEquals(1786352400000L + 3_600_000L, item.endMs)
    assertNull(item.rrule)
  }

  @Test
  fun contactsCarryCurrentPlacedAddresses() {
    val contact = MirrorReader.contacts(snapshot).single()
    assertEquals("Anna", contact.displayName)
    assertEquals(listOf(MirrorChannel("Phone", "070", null, true)), contact.channels)
    assertEquals("--05-03", contact.birthday)
    assertEquals(listOf(MirrorAddress("r1", "Home", "Storgatan 1, Ljungby")), contact.addresses)
  }

  @Test(expected = JSONException::class)
  fun missingSectionFailsInsteadOfReadingEmpty() {
    MirrorReader.items(JSONObject().put("calendars", JSONArray()))
  }
}
