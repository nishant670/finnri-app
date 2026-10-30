package com.finnri.app

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import org.json.JSONObject

/**
 * The app's mood, for the widget and the capture sheet. The app stores it
 * through the `FinnriTheme` module (`lib/native-theme.ts`) whenever the mood
 * or Light · Dark · Match phone changes: a day half and a night half, the same
 * half twice once the user picked Light or Dark.
 *
 * Until the app has run once with that module, both halves come from
 * `finnri_capture_colors.xml` — the Finnri mood, following the phone.
 */
class FinnriPalette(
  val background: Int,
  val card: Int,
  val text: Int,
  val borderStrong: Int,
  val track: Int,
  val selectedFill: Int,
  val accent: Int,
  val onAccent: Int,
  val logoFill: Int,
  val logoInk: Int
) {
  /** Captions: text at 75%. */
  val textMuted get() = withAlpha(text, 0xBF)
  /** The widget's "Log an expense": text at 70%. */
  val hint get() = withAlpha(text, 0xB3)

  companion object {
    /** Written by `FinnriThemeModule`; keep the two in step. */
    private const val PREFS = "finnri_theme"
    private const val KEY = "theme"

    /** The day and night halves. */
    fun load(context: Context): Pair<FinnriPalette, FinnriPalette> {
      val stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
      val parsed = stored?.let {
        try {
          val theme = JSONObject(it)
          fromJson(theme.getJSONObject("day")) to fromJson(theme.getJSONObject("night"))
        } catch (_: Exception) {
          null
        }
      }
      return parsed ?: (fromResources(context, night = false) to fromResources(context, night = true))
    }

    /** The half for a context's own configuration, as the capture sheet is drawn. */
    fun current(context: Context): FinnriPalette {
      val (day, night) = load(context)
      val nightMode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
      return if (nightMode == Configuration.UI_MODE_NIGHT_YES) night else day
    }

    private fun fromJson(json: JSONObject): FinnriPalette {
      fun color(name: String) = Color.parseColor(json.getString(name))
      return FinnriPalette(
        background = color("background"),
        card = color("card"),
        text = color("text"),
        borderStrong = color("borderStrong"),
        track = color("track"),
        selectedFill = color("selectedFill"),
        accent = color("accent"),
        onAccent = color("onAccent"),
        logoFill = color("logoFill"),
        logoInk = color("logoInk")
      )
    }

    private fun fromResources(context: Context, night: Boolean): FinnriPalette {
      val configuration = Configuration(context.resources.configuration).apply {
        uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
          (if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
      }
      val resolved = context.createConfigurationContext(configuration)
      fun color(id: Int) = resolved.getColor(id)
      return FinnriPalette(
        background = color(R.color.finnri_background),
        card = color(R.color.finnri_card),
        text = color(R.color.finnri_text),
        borderStrong = color(R.color.finnri_border_strong),
        track = color(R.color.finnri_track),
        selectedFill = color(R.color.finnri_tint),
        accent = color(R.color.finnri_accent),
        onAccent = color(R.color.finnri_on_accent),
        logoFill = color(R.color.finnri_logo_fill),
        logoInk = color(R.color.finnri_logo_ink)
      )
    }

    private fun withAlpha(color: Int, alpha: Int) = (color and 0x00FFFFFF) or (alpha shl 24)
  }
}
