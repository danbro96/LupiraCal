package expo.modules.lupirabridge

import android.accounts.Account
import android.content.Context
import java.io.File

/// Spike-wide constants. The account type must match lupira_authenticator.xml and
/// lupira_syncadapter_calendar.xml — three places, one string.
object Bridge {
  const val ACCOUNT_TYPE = "com.lupira.calendar"
  const val ACCOUNT_NAME = "Lupira"
  const val CALENDAR_AUTHORITY = "com.android.calendar"
  const val CONTACTS_AUTHORITY = "com.android.contacts"
  const val TAG = "LupiraBridge"
  const val PREFS = "lupira-bridge"
  const val PREF_LAST_SYNC = "last_sync_at"
  const val PREF_GENERATION = "generation"

  /// Lazy so JVM tests can touch Bridge without the android.jar Account stub.
  val account by lazy { Account(ACCOUNT_NAME, ACCOUNT_TYPE) }

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun generation(context: Context): String? = prefs(context).getString(PREF_GENERATION, null)

  /// commit, not apply: the rotation must be on disk before the purge it guards.
  fun setGeneration(context: Context, generation: String) {
    if (!prefs(context).edit().putString(PREF_GENERATION, generation).commit()) throw IllegalStateException("could not store the generation")
  }

  /// An install that never stored one adopts the app's.
  fun accepts(stored: String?, incoming: String) = stored == null || stored == incoming

  /// Files other apps shared, copied by IntentRouterActivity until the app reads them.
  fun importsDir(context: Context) = File(context.cacheDir, "imports")
}
