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

  val account = Account(ACCOUNT_NAME, ACCOUNT_TYPE)

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /// Files other apps shared, copied by IntentRouterActivity until the app reads them.
  fun importsDir(context: Context) = File(context.cacheDir, "imports")
}
