package expo.modules.lupirabridge

import android.accounts.Account
import android.app.Service
import android.content.AbstractThreadedSyncAdapter
import android.content.ContentProviderClient
import android.content.Context
import android.content.Intent
import android.content.SyncResult
import android.os.Bundle
import android.os.IBinder
import android.util.Log

/// The calendar-authority sync body: capture the user's stock-app edits into the bridge inbox FIRST
/// (so publish can't clobber them), then publish the mirror. Runs without the JS engine — the inbox is
/// drained by the app (foreground triggers + background task) into the normal outbox/LWW path.
class CalendarSyncAdapter(context: Context) : AbstractThreadedSyncAdapter(context, true) {
  override fun onPerformSync(
    account: Account, extras: Bundle, authority: String, provider: ContentProviderClient, syncResult: SyncResult,
  ) {
    Log.i(Bridge.TAG, "onPerformSync: account=${account.name} authority=$authority")
    synchronized(BridgeLock) {
      try {
        CalendarCapturer.capture(context)
        CalendarPublisher.publish(context)
      } catch (e: Exception) {
        Log.e(Bridge.TAG, "onPerformSync failed", e)
        syncResult.stats.numIoExceptions++
      }
      Bridge.prefs(context).edit().putLong(Bridge.PREF_LAST_SYNC, System.currentTimeMillis()).apply()
    }
  }
}

class CalendarSyncService : Service() {
  override fun onBind(intent: Intent?): IBinder {
    synchronized(lock) {
      adapter = adapter ?: CalendarSyncAdapter(applicationContext)
    }
    return adapter!!.syncAdapterBinder
  }

  companion object {
    private val lock = Any()
    private var adapter: CalendarSyncAdapter? = null
  }
}
