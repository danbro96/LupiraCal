package expo.modules.lupirabridge

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class MirrorSnapshotTest {
  @get:Rule val folder = TemporaryFolder()

  private fun snapshot(generation: String?) =
    JSONObject().put("calendars", "[]").apply { if (generation != null) put("generation", generation) }.toString()

  @Test
  fun readsTheSnapshotOfItsOwnGeneration() {
    MirrorSnapshot.write(folder.root, snapshot("g1"))
    assertEquals("g1", MirrorSnapshot.read(folder.root, "g1")!!.getString("generation"))
  }

  @Test
  fun ignoresAnotherGenerationsSnapshot() {
    MirrorSnapshot.write(folder.root, snapshot("g1"))
    assertNull(MirrorSnapshot.read(folder.root, "g2"))
    assertNull(MirrorSnapshot.read(folder.root, null))
  }

  @Test
  fun aSnapshotFromBeforeGenerationsReadsOnlyWhileNoneIsStored() {
    MirrorSnapshot.write(folder.root, snapshot(null))
    assertEquals("[]", MirrorSnapshot.read(folder.root, null)!!.getString("calendars"))
    assertNull(MirrorSnapshot.read(folder.root, "g1"))
  }

  @Test
  fun clearRemovesTheSnapshotAndAnUnfinishedWrite() {
    MirrorSnapshot.write(folder.root, snapshot("g1"))
    File(folder.root, "bridge-mirror.json.tmp").writeText("{")
    MirrorSnapshot.clear(folder.root)
    assertNull(MirrorSnapshot.read(folder.root, "g1"))
    assertFalse(File(folder.root, "bridge-mirror.json.tmp").exists())
  }
}
