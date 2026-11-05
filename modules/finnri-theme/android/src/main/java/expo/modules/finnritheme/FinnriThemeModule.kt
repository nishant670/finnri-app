package expo.modules.finnritheme

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Hands the app's mood to the native surfaces that cannot read it themselves:
 * the home-screen widget and the quick-capture sheet (`lib/native-theme.ts`).
 *
 * Both live in the app's own package, copied in by `withFinnriAndroidCapture`,
 * so this module reaches them by name rather than by class. The preferences
 * file and key are read back in `FinnriPalette.kt`; keep the two in step.
 */
class FinnriThemeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FinnriTheme")

    Function("setTheme") { theme: String ->
      val context = appContext.reactContext ?: return@Function
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      // Every launch sends the theme; only a change is worth a redraw.
      if (prefs.getString(KEY, null) == theme) return@Function
      prefs.edit().putString(KEY, theme).apply()
      redrawWidgets(context)
    }
  }

  private fun redrawWidgets(context: Context) {
    val provider = ComponentName(context.packageName, "${context.packageName}.FinnriWidgetProvider")
    val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(provider)
    if (ids.isEmpty()) return
    context.sendBroadcast(
      Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        .setComponent(provider)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    )
  }

  private companion object {
    const val PREFS = "finnri_theme"
    const val KEY = "theme"
  }
}
