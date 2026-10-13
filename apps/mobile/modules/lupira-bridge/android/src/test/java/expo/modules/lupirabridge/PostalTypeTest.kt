package expo.modules.lupirabridge

import android.provider.ContactsContract.CommonDataKinds.StructuredPostal
import org.junit.Assert.assertEquals
import org.junit.Test

class PostalTypeTest {
  @Test
  fun residencyTypesMapToProviderTypes() {
    assertEquals(StructuredPostal.TYPE_HOME to null, ContactsPublisher.postalType("Home"))
    assertEquals(StructuredPostal.TYPE_WORK to null, ContactsPublisher.postalType("Work"))
    assertEquals(StructuredPostal.TYPE_OTHER to null, ContactsPublisher.postalType("Other"))
    assertEquals(StructuredPostal.TYPE_CUSTOM to "Vacation", ContactsPublisher.postalType("Vacation"))
  }

  @Test
  fun unknownOrMissingTypeIsHome() {
    assertEquals(StructuredPostal.TYPE_HOME to null, ContactsPublisher.postalType(null))
    assertEquals(StructuredPostal.TYPE_HOME to null, ContactsPublisher.postalType("Cabin"))
  }
}
