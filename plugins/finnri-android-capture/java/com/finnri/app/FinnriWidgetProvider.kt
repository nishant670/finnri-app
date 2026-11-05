package com.finnri.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

/**
 * The home-screen widget (board R14-Widget): capture only, in three sizes.
 *
 * It used to show the month's spend on the home screen, for anyone holding the
 * phone to read, while the capture screen promised that balances stay behind
 * the lock screen. It now shows no figure at all: Type opens the app on the
 * capture field, the mic opens the lock-screen-safe recorder.
 */
class FinnriWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    super.onUpdate(context, manager, ids)
    forgetStoredSpend(context)
    for (id in ids) update(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    id: Int,
    options: Bundle
  ) {
    super.onAppWidgetOptionsChanged(context, manager, id, options)
    update(context, manager, id)
  }

  companion object {
    /** Where the old widget kept the month's spend; cleared so it does not linger. */
    private const val LEGACY_PREFS = "finnri_widget"

    private fun forgetStoredSpend(context: Context) {
      context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun update(context: Context, manager: AppWidgetManager, id: Int) {
      val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // The launcher picks whichever fits as the widget is resized.
        RemoteViews(
          mapOf(
            SizeF(40f, 40f) to build(context, R.layout.widget_finnri_small),
            SizeF(110f, 40f) to build(context, R.layout.widget_finnri_medium),
            SizeF(250f, 40f) to build(context, R.layout.widget_finnri)
          )
        )
      } else {
        val width = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
        build(context, layoutForWidth(width))
      }
      manager.updateAppWidget(id, views)
    }

    private fun layoutForWidth(widthDp: Int) = when {
      widthDp < 110 -> R.layout.widget_finnri_small
      widthDp < 250 -> R.layout.widget_finnri_medium
      else -> R.layout.widget_finnri
    }

    private fun build(context: Context, layout: Int): RemoteViews {
      val views = RemoteViews(context.packageName, layout)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) paint(views, layout, FinnriPalette.load(context))
      val speak = PendingIntent.getActivity(
        context,
        4202,
        Intent(context, FinnriCaptureActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      views.setOnClickPendingIntent(R.id.widget_capture, speak)
      if (layout == R.layout.widget_finnri_small) {
        views.setOnClickPendingIntent(R.id.widget_root, speak)
        return views
      }
      val type = PendingIntent.getActivity(
        context,
        4201,
        typeIntent(context),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      views.setOnClickPendingIntent(R.id.widget_type, type)
      // The rest of the pill ("Log an expense") types too.
      views.setOnClickPendingIntent(R.id.widget_root, type)
      return views
    }

    /**
     * Repaints the layout in the app's mood. Each colour goes over as a day and
     * a night pair, and the launcher picks one by the phone's dark mode — so
     * Match phone still flips with the phone while the app is closed.
     *
     * Android 12 is the first that lets a widget tint a view's background. On
     * older phones the layouts keep their resource colours: the Finnri mood,
     * following the phone.
     */
    @RequiresApi(Build.VERSION_CODES.S)
    private fun paint(views: RemoteViews, layout: Int, theme: Pair<FinnriPalette, FinnriPalette>) {
      val (day, night) = theme
      // Tints replace a drawable's colour but keep its alpha, so the pill stays 92%.
      fun tint(id: Int, method: String, color: (FinnriPalette) -> Int) =
        views.setColorStateList(id, method, ColorStateList.valueOf(color(day)), ColorStateList.valueOf(color(night)))

      tint(R.id.widget_capture, "setBackgroundTintList") { it.accent }
      tint(R.id.widget_capture, "setImageTintList") { it.onAccent }
      if (layout == R.layout.widget_finnri_small) return

      tint(R.id.widget_root, "setBackgroundTintList") { it.card }
      tint(R.id.widget_type, "setImageTintList") { it.text }
      if (layout == R.layout.widget_finnri_medium) {
        tint(R.id.widget_type, "setBackgroundTintList") { it.track }
        return
      }
      tint(R.id.widget_logo, "setBackgroundTintList") { it.logoFill }
      views.setColorInt(R.id.widget_logo, "setTextColor", day.logoInk, night.logoInk)
      views.setColorInt(R.id.widget_prompt, "setTextColor", day.hint, night.hint)
    }

    /**
     * Opens Home with the capture field focused (`compose=type`). The app's own
     * package name is one of its URL schemes in every variant, so the Preview
     * build opens itself rather than the Play copy.
     */
    fun typeIntent(context: Context): Intent =
      Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("${context.packageName}://?compose=type")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
  }
}
