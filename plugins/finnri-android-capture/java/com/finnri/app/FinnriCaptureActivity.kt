package com.finnri.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.io.File
import kotlin.math.min

/**
 * A capture-only lock-screen surface. It deliberately has no React view and no
 * access to ledger data. Once recording stops, MainActivity receives only the
 * cache-file URI; Android's normal keyguard still protects every financial
 * screen until the device is unlocked.
 *
 * Drawn as the redesign's sheet (board R14-Capture): the f mark and "Quick
 * capture" with a close, the mic in its ring with a level meter that moves
 * with your voice, "Listening…", then Type instead and Stop and review, and
 * the promise that balances stay behind the lock screen.
 */
class FinnriCaptureActivity : Activity() {
  private var recorder: MediaRecorder? = null
  private var outputFile: File? = null
  private lateinit var status: TextView
  private lateinit var hint: TextView
  private lateinit var primary: Button
  private val bars = mutableListOf<View>()
  private val handler = Handler(Looper.getMainLooper())
  private val density by lazy { resources.displayMetrics.density }
  /** The app's mood, by the phone's dark mode unless the user picked Light or Dark. */
  private val palette by lazy { FinnriPalette.current(this) }

  /** Bar heights at rest, as the board draws them. */
  private val restHeights = intArrayOf(8, 16, 26, 14, 30, 20, 10, 24, 12, 6)

  private val meter = object : Runnable {
    override fun run() {
      val active = recorder ?: return
      val amplitude = try { active.maxAmplitude } catch (_: Exception) { 0 }
      val level = min(1f, amplitude / 12_000f)
      bars.forEachIndexed { index, bar ->
        val base = restHeights[index]
        val height = (6 + (base - 6) * (0.25f + 0.75f * level)).coerceAtLeast(6f)
        bar.layoutParams = bar.layoutParams.apply { this.height = dp(height) }
      }
      handler.postDelayed(this, 90)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    window.navigationBarColor = palette.background
    renderSheet()

    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      startCapture()
    } else {
      showProblem(
        "Microphone access needed",
        "Unlock and open Finnri once to allow microphone access."
      )
    }
  }

  private fun dp(value: Float) = (value * density).toInt()
  private fun dp(value: Int) = dp(value.toFloat())

  private fun rounded(fill: Int, radiusDp: Float, stroke: Int? = null) = GradientDrawable().apply {
    setColor(fill)
    cornerRadius = radiusDp * density
    if (stroke != null) setStroke(dp(1), stroke)
  }

  private fun oval(fill: Int) = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(fill)
  }

  private fun renderSheet() {
    val root = FrameLayout(this).apply { setBackgroundColor(getColor(R.color.finnri_scrim)) }

    val sheet = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(8), dp(16), dp(28))
      background = GradientDrawable().apply {
        setColor(palette.background)
        val r = 28 * density
        cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
      }
      // Taps on the sheet stay on the sheet.
      isClickable = true
    }

    val handle = View(this).apply { background = rounded(palette.borderStrong, 2f) }
    sheet.addView(handle, LinearLayout.LayoutParams(dp(36), dp(4)).apply {
      gravity = Gravity.CENTER_HORIZONTAL
      bottomMargin = dp(10)
    })

    // Header: the f mark, the name of the surface, and a way out.
    val header = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val mark = TextView(this).apply {
      text = "f"
      textSize = 15f
      gravity = Gravity.CENTER
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(palette.logoInk)
      background = rounded(palette.logoFill, 9f)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    header.addView(mark, LinearLayout.LayoutParams(dp(28), dp(28)))
    val title = TextView(this).apply {
      text = "Quick capture"
      textSize = 15f
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(palette.text)
    }
    header.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginStart = dp(10)
    })
    val close = ImageButton(this).apply {
      setImageResource(R.drawable.ic_close_ink)
      imageTintList = ColorStateList.valueOf(palette.text)
      background = oval(palette.track)
      setPadding(dp(9), dp(9), dp(9), dp(9))
      scaleType = ImageView.ScaleType.FIT_CENTER
      contentDescription = "Close"
      setOnClickListener { discardAndFinish() }
    }
    header.addView(close, LinearLayout.LayoutParams(dp(36), dp(36)))
    sheet.addView(header)

    // The mic in its ring, the level meter, and what is happening.
    val centre = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    val ring = FrameLayout(this).apply { background = oval(palette.selectedFill) }
    val mic = ImageView(this).apply {
      setImageResource(R.drawable.ic_mic_ink)
      imageTintList = ColorStateList.valueOf(palette.onAccent)
      background = oval(palette.accent)
      setPadding(dp(18), dp(18), dp(18), dp(18))
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    ring.addView(mic, FrameLayout.LayoutParams(dp(64), dp(64), Gravity.CENTER))
    centre.addView(ring, LinearLayout.LayoutParams(dp(96), dp(96)))

    val meterRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    restHeights.forEachIndexed { index, height ->
      val bar = View(this).apply { background = rounded(palette.accent, 2f) }
      bars.add(bar)
      meterRow.addView(bar, LinearLayout.LayoutParams(dp(4), dp(height)).apply {
        if (index > 0) marginStart = dp(4)
      })
    }
    centre.addView(meterRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(32)).apply {
      topMargin = dp(14)
    })

    status = TextView(this).apply {
      text = "Starting microphone…"
      textSize = 20f
      gravity = Gravity.CENTER
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(palette.text)
      accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    centre.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(14)
    })
    hint = TextView(this).apply {
      text = "Say it like “Petrol 500 by UPI”"
      textSize = 15f
      gravity = Gravity.CENTER
      setTextColor(palette.textMuted)
    }
    centre.addView(hint, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(14)
    })
    sheet.addView(centre, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(26)
    })

    // Type instead (outlined) beside the one orange action.
    val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    val typeInstead = Button(this).apply {
      text = "Type instead"
      textSize = 15f
      isAllCaps = false
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(palette.text)
      background = rounded(palette.card, 25f, palette.borderStrong)
      stateListAnimator = null
      setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_keyboard_ink, 0, 0, 0)
      compoundDrawableTintList = ColorStateList.valueOf(palette.text)
      compoundDrawablePadding = dp(8)
      setPadding(dp(18), 0, dp(18), 0)
      setOnClickListener { typeInstead() }
    }
    buttons.addView(typeInstead, LinearLayout.LayoutParams(0, dp(50), 1f))
    primary = Button(this).apply {
      text = "Stop and review"
      textSize = 16f
      isAllCaps = false
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(palette.onAccent)
      // A drawable rather than setBackgroundColor: every primary action in the app is a pill.
      background = rounded(palette.accent, 25f)
      // The platform button lifts a shadow off its square bounds, not the pill.
      stateListAnimator = null
    }
    buttons.addView(primary, LinearLayout.LayoutParams(0, dp(50), 1f).apply { marginStart = dp(10) })
    sheet.addView(buttons, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(26)
    })

    val privacy = TextView(this).apply {
      text = "Capture only. Balances stay behind your lock screen."
      textSize = 12f
      gravity = Gravity.CENTER
      setTextColor(palette.textMuted)
      setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_lock_muted, 0, 0, 0)
      // Full ink: the vector's own strokes already carry the caption's 75%.
      compoundDrawableTintList = ColorStateList.valueOf(palette.text)
      compoundDrawablePadding = dp(6)
    }
    // Shrink the 24dp vector to the caption's size.
    privacy.compoundDrawablesRelative[0]?.setBounds(0, 0, dp(14), dp(14))
    privacy.setCompoundDrawablesRelative(privacy.compoundDrawablesRelative[0], null, null, null)
    sheet.addView(privacy, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      gravity = Gravity.CENTER_HORIZONTAL
      topMargin = dp(14)
    })

    root.addView(sheet, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    setContentView(root)
  }

  private fun showProblem(title: String, detail: String) {
    stopMeter()
    status.text = title
    hint.text = detail
    primary.text = "Open Finnri"
    primary.setOnClickListener { openMain(null) }
  }

  private fun startCapture() {
    val target = File(cacheDir, "quick-capture-${System.currentTimeMillis()}.m4a")
    outputFile = target
    val nextRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      MediaRecorder(this)
    } else {
      @Suppress("DEPRECATION")
      MediaRecorder()
    }
    recorder = nextRecorder
    try {
      nextRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
      nextRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      nextRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      nextRecorder.setAudioEncodingBitRate(96_000)
      nextRecorder.setAudioSamplingRate(44_100)
      nextRecorder.setOutputFile(target.absolutePath)
      nextRecorder.prepare()
      nextRecorder.start()
      status.text = "Listening…"
      hint.text = "Say it like “Petrol 500 by UPI”"
      primary.text = "Stop and review"
      primary.setOnClickListener { finishCapture() }
      handler.post(meter)
    } catch (_: Exception) {
      releaseRecorder()
      target.delete()
      showProblem("Microphone could not start.", "Open Finnri to add it there instead.")
    }
  }

  private fun finishCapture() {
    stopMeter()
    val target = outputFile
    try {
      recorder?.stop()
    } catch (_: RuntimeException) {
      target?.delete()
    } finally {
      releaseRecorder()
    }
    if (target == null || !target.exists() || target.length() == 0L) {
      status.text = "That recording was too short."
      hint.text = "Try again, and say the amount."
      primary.text = "Try again"
      primary.setOnClickListener { startCapture() }
      return
    }
    openMain("?captureFile=${Uri.encode(Uri.fromFile(target).toString())}")
  }

  /** Drops the recording and opens the app on the capture field. */
  private fun typeInstead() {
    discardRecording()
    startActivity(FinnriWidgetProvider.typeIntent(this))
    finish()
  }

  private fun discardAndFinish() {
    discardRecording()
    finish()
  }

  private fun discardRecording() {
    stopMeter()
    if (recorder != null) {
      try { recorder?.stop() } catch (_: RuntimeException) { }
      releaseRecorder()
    }
    outputFile?.delete()
    outputFile = null
  }

  /**
   * MainActivity is not allowed over the keyguard. If the device is still
   * locked, Android holds it behind the lock screen until authentication. The
   * app's package name is one of its URL schemes in every variant.
   */
  private fun openMain(query: String?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setShowWhenLocked(false)
    startActivity(Intent(this, MainActivity::class.java).apply {
      if (query != null) {
        action = Intent.ACTION_VIEW
        data = Uri.parse("$packageName://$query")
      }
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    })
    finish()
  }

  private fun stopMeter() {
    handler.removeCallbacks(meter)
  }

  private fun releaseRecorder() {
    recorder?.reset()
    recorder?.release()
    recorder = null
  }

  override fun onDestroy() {
    stopMeter()
    if (recorder != null) {
      try { recorder?.stop() } catch (_: RuntimeException) { outputFile?.delete() }
      releaseRecorder()
    }
    super.onDestroy()
  }
}
