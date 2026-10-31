package com.overlay.dsp

import kotlin.math.pow

/**
 * TRIM — Gain staging to -18 dBFS sweet spot.
 * Hardware ref: Neve 1073 input stage, SSL E channel gain
 * 
 * Features:
 * - Auto-gain detection (RMS-based, target -18 dBFS)
 * - Phase invert (polarity flip)
 * - Input meter (peak + RMS)
 * - Soft clipping at +24dB
 */
class TrimPlugin(
    private val sampleRate: Float = 48000f,
    var gainDb: Float = 0f,
    var autoStage: Boolean = false,
    var phaseInvert: Boolean = false
) : DspPlugin {

    override val name = "TRIM"
    override val category = "Gain & Utility"
    override var enabled = true

    private var peakLevel = 0f
    private var rmsLevel = 0f
    private val rmsWindow = FloatArray(480) // 10ms at 48kHz
    private var rmsIndex = 0
    private var rmsSum = 0f

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        var l = inL
        var r = inR

        // Phase invert
        if (phaseInvert) {
            l = -l
            r = -r
        }

        // Auto-gain staging
        if (autoStage) {
            // Calculate RMS
            val sample = (l + r) / 2f
            rmsSum -= rmsWindow[rmsIndex]
            rmsWindow[rmsIndex] = sample * sample
            rmsSum += rmsWindow[rmsIndex]
            rmsIndex = (rmsIndex + 1) % rmsWindow.size
            rmsLevel = kotlin.math.sqrt((rmsSum / rmsWindow.size).toDouble()).toFloat()
            val rmsDb = if (rmsLevel > 0f) 20f * kotlin.math.log10((rmsLevel).toDouble()).toFloat() else -100f
            val targetDb = -18f
            val correction = targetDb - rmsDb
            // Smooth correction (100ms time constant)
            gainDb = gainDb * 0.99f + correction * 0.01f
        }

        // Apply gain
        val gainLinear = 10.0.pow((gainDb / 20f).toDouble()).toFloat()
        l *= gainLinear
        r *= gainLinear

        // Soft clipping at +24dB (15.85 linear)
        val clipThreshold = 15.85f
        l = softClip(l, clipThreshold)
        r = softClip(r, clipThreshold)

        // Peak metering
        peakLevel = maxOf(peakLevel * 0.999f, maxOf(kotlin.math.abs(l), kotlin.math.abs(r)))

        return Triple(l, r, 0f) // No gain reduction
    }

    private fun softClip(x: Float, threshold: Float): Float {
        val absX = kotlin.math.abs(x)
        if (absX <= threshold) return x
        val sign = if (x >= 0f) 1f else -1f
        val over = absX - threshold
        val compressed = threshold + over / (1f + over / threshold)
        return sign * compressed
    }

    override fun reset() {
        peakLevel = 0f
        rmsLevel = 0f
        rmsIndex = 0
        rmsSum = 0f
        rmsWindow.fill(0f)
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "gainDb" to gainDb,
        "autoStage" to if (autoStage) 1f else 0f,
        "phaseInvert" to if (phaseInvert) 1f else 0f,
        "peakLevel" to peakLevel,
        "rmsLevel" to rmsLevel
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "gainDb" -> gainDb = value
            "autoStage" -> autoStage = value >= 0.5f
            "phaseInvert" -> phaseInvert = value >= 0.5f
        }
    }
}
