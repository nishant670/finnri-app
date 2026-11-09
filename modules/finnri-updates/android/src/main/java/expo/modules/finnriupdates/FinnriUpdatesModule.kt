package expo.modules.finnriupdates

import android.app.Activity
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google Play's in-app updates, for `lib/app-update.ts`.
 *
 * Play decides whether an update exists for this install; the app only asks,
 * starts the flow and listens. Installs that did not come from Play (the
 * Preview APK, a sideloaded build) get "unavailable" back, and the app falls
 * back to opening the Play listing.
 *
 * A flexible update downloads in the background and reports progress through
 * `onUpdateState`; the app calls `completeUpdate` when the person taps Restart.
 * An immediate update is Play's own full-screen flow.
 */
class FinnriUpdatesModule : Module() {
  private var manager: AppUpdateManager? = null
  private var listening = false

  private val stateListener = InstallStateUpdatedListener { state ->
    sendEvent(
      "onUpdateState",
      mapOf(
        "status" to statusName(state.installStatus()),
        "bytesDownloaded" to state.bytesDownloaded().toDouble(),
        "totalBytesToDownload" to state.totalBytesToDownload().toDouble(),
      )
    )
  }

  private fun listen(updates: AppUpdateManager) {
    if (listening) return
    updates.registerListener(stateListener)
    listening = true
  }

  private fun updateManager(): AppUpdateManager? {
    manager?.let { return it }
    val context = appContext.reactContext ?: return null
    return AppUpdateManagerFactory.create(context).also { manager = it }
  }

  override fun definition() = ModuleDefinition {
    Name("FinnriUpdates")

    Events("onUpdateState", "onUpdateResult")

    AsyncFunction("checkForUpdate") { promise: Promise ->
      val updates = updateManager()
      if (updates == null) {
        promise.resolve(unavailable())
        return@AsyncFunction
      }
      updates.appUpdateInfo
        .addOnSuccessListener { info ->
          val availability = info.updateAvailability()
          // A download started before this launch still needs its progress and its Restart.
          if (info.installStatus() == InstallStatus.DOWNLOADING || info.installStatus() == InstallStatus.PENDING) {
            listen(updates)
          }
          promise.resolve(
            mapOf(
              "available" to (availability == UpdateAvailability.UPDATE_AVAILABLE),
              // An immediate update the person left half way: Play expects it resumed.
              "inProgress" to (availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS),
              "availableVersionCode" to info.availableVersionCode(),
              "flexibleAllowed" to info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
              "immediateAllowed" to info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE),
              "status" to statusName(info.installStatus()),
              "stalenessDays" to (info.clientVersionStalenessDays() ?: -1),
            )
          )
        }
        .addOnFailureListener {
          // Not a Play install, no Play Store, or no network: there is simply no update to offer.
          promise.resolve(unavailable())
        }
    }

    AsyncFunction("startUpdate") { type: String, promise: Promise ->
      val updates = updateManager()
      val activity: Activity? = appContext.currentActivity
      if (updates == null || activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val updateType = if (type == "immediate") AppUpdateType.IMMEDIATE else AppUpdateType.FLEXIBLE
      updates.appUpdateInfo
        .addOnSuccessListener { info ->
          val startable = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE ||
            info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
          if (!startable || !info.isUpdateTypeAllowed(updateType)) {
            promise.resolve(false)
            return@addOnSuccessListener
          }
          if (updateType == AppUpdateType.FLEXIBLE) listen(updates)
          try {
            val started = updates.startUpdateFlowForResult(
              info,
              activity,
              AppUpdateOptions.newBuilder(updateType).build(),
              REQUEST_CODE,
            )
            promise.resolve(started)
          } catch (error: Exception) {
            promise.resolve(false)
          }
        }
        .addOnFailureListener { promise.resolve(false) }
    }

    // Installs a downloaded flexible update. The app restarts into the new build.
    Function("completeUpdate") {
      updateManager()?.completeUpdate()
      Unit
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val result = when (payload.resultCode) {
        Activity.RESULT_OK -> "accepted"
        Activity.RESULT_CANCELED -> "cancelled"
        else -> "failed"
      }
      sendEvent("onUpdateResult", mapOf("result" to result))
    }

    OnDestroy {
      if (listening) {
        manager?.unregisterListener(stateListener)
        listening = false
      }
    }
  }

  private fun unavailable() = mapOf(
    "available" to false,
    "inProgress" to false,
    "availableVersionCode" to 0,
    "flexibleAllowed" to false,
    "immediateAllowed" to false,
    "status" to "unknown",
    "stalenessDays" to -1,
  )

  private fun statusName(status: Int) = when (status) {
    InstallStatus.PENDING -> "pending"
    InstallStatus.DOWNLOADING -> "downloading"
    InstallStatus.DOWNLOADED -> "downloaded"
    InstallStatus.INSTALLING -> "installing"
    InstallStatus.INSTALLED -> "installed"
    InstallStatus.FAILED -> "failed"
    InstallStatus.CANCELED -> "cancelled"
    else -> "unknown"
  }

  private companion object {
    const val REQUEST_CODE = 7311
  }
}
