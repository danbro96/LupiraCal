package expo.modules.lupirabridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class FuzzyDatesTest {
  private val today = LocalDate.of(2026, 10, 13)

  @Test
  fun openPeriodIsCurrent() {
    assertTrue(FuzzyDates.isCurrent(null, null, today))
    assertTrue(FuzzyDates.isCurrent(FuzzyDate(2020, null, null), null, today))
  }

  @Test
  fun ambiguousBoundariesCountAsCurrent() {
    assertTrue(FuzzyDates.isCurrent(FuzzyDate(2026, null, null), null, today))
    assertTrue(FuzzyDates.isCurrent(FuzzyDate(2026, 10, null), FuzzyDate(2026, null, null), today))
    assertTrue(FuzzyDates.isCurrent(null, FuzzyDate(2026, 10, null), today))
    assertTrue(FuzzyDates.isCurrent(null, FuzzyDate(2026, 10, 13), today))
  }

  @Test
  fun formerAndFutureAreNot() {
    assertFalse(FuzzyDates.isCurrent(null, FuzzyDate(2026, 10, 12), today))
    assertFalse(FuzzyDates.isCurrent(null, FuzzyDate(2025, null, null), today))
    assertFalse(FuzzyDates.isCurrent(FuzzyDate(2026, 10, 14), null, today))
    assertFalse(FuzzyDates.isCurrent(FuzzyDate(2027, null, null), null, today))
  }

  @Test
  fun monthEndsAreRespected() {
    assertTrue(FuzzyDates.isCurrent(null, FuzzyDate(2024, 2, null), LocalDate.of(2024, 2, 29)))
    assertFalse(FuzzyDates.isCurrent(null, FuzzyDate(2023, 2, null), LocalDate.of(2023, 3, 1)))
  }
}
