package expo.modules.lupirabridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BridgeTest {
  @Test
  fun acceptsItsOwnGenerationOrAdoptsOneWhenNoneIsStored() {
    assertTrue(Bridge.accepts("g1", "g1"))
    assertTrue(Bridge.accepts(null, "g1"))
    assertFalse(Bridge.accepts("g1", "g2"))
  }
}
