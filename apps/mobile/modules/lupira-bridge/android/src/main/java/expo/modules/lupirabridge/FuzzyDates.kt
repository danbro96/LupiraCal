package expo.modules.lupirabridge

import java.time.LocalDate
import java.time.YearMonth

/// A residency boundary known to the year, month or day.
data class FuzzyDate(val year: Int, val month: Int?, val day: Int?)

/// Same rule as `residencyStatus` in @danbro96/lupira-domain-contacts/fuzzyDate: current while today falls inside
/// the period, an ambiguous boundary counting as still current.
object FuzzyDates {
  fun isCurrent(movedIn: FuzzyDate?, movedOut: FuzzyDate?, today: LocalDate): Boolean =
    (movedIn == null || !earliest(movedIn).isAfter(today)) && (movedOut == null || !latest(movedOut).isBefore(today))

  private fun earliest(d: FuzzyDate): LocalDate = LocalDate.of(d.year, d.month ?: 1, d.day ?: 1)

  private fun latest(d: FuzzyDate): LocalDate {
    val month = YearMonth.of(d.year, d.month ?: 12)
    return if (d.day != null) month.atDay(d.day) else month.atEndOfMonth()
  }
}
