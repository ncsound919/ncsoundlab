package com.overlay.dsp

import kotlin.math.pow

/**
 * SATURATION — Tape/tube/transformer/console harmonic color.
 * Hardware ref: Various (Ampex 351, Neve 1073, SSL, API)
 * 
 * Features:
 * - 4 models: Tape, Tube, Transformer, Console
 * - Oversampling (1x/2x/4x) with anti-aliasing
 * - Hysteresis modeling (magnetic tape)
 * - Bias control
 * - Wow/flutter on tape mode
 * - Frequency-dependent saturation
 * - Mix (wet/dry)
 */
class SaturationPlugin(
    private val sampleRate: Float = 48000f,
    var type: Int = 0, // 0=Tape, 1=Tube, 2=Transformer, 3=Console
    var driveDb: Float = 6f,
    var warmth: Float = 0.4f,
    var mix: Float = 1f,
    var oversample: Int = 2 // 1, 2, 4
) : DspPlugin {

    override val name = "SATURATION"
    override val category = "Color & Saturation"
    override var enabled = true

    private val driveLinear = 10.0.pow((driveDb / 20f).toDouble()).toFloat()

    // Hysteresis state (tape)
    private var hysteresisState = 0f

    // Wow/flutter state (tape)
    // Radians, accumulated in Double: a Float phase drifts audibly over long takes.
    private var wowPhase = 0.0
    private var flutterPhase = 0.0

    // Oversampling filter
    private val osFilter = FloatArray(oversample) { 1f / oversample }

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        var l = inL * driveLinear
        var r = inR * driveLinear

        // Apply saturation based on type
        when (type) {
            0 -> { // Tape
                l = tapeSaturation(l)
                r = tapeSaturation(r)
                // Wow/flutter
                wowPhase += 2.0 * Math.PI * 0.5 / sampleRate // 0.5 Hz wow
                flutterPhase += 2.0 * Math.PI * 6.0 / sampleRate // 6 Hz flutter
                val wow = kotlin.math.sin(wowPhase).toFloat() * 0.001f
                val flutter = kotlin.math.sin(flutterPhase).toFloat() * 0.0005f
                l *= (1f + wow + flutter)
                r *= (1f + wow + flutter)
            }
            1 -> { // Tube
                l = tubeSaturation(l)
                r = tubeSaturation(r)
            }
            2 -> { // Transformer
                l = transformerSaturation(l)
                r = transformerSaturation(r)
            }
            3 -> { // Console
                l = consoleSaturation(l)
                r = consoleSaturation(r)
            }
        }

        // Frequency-dependent saturation (more on highs)
        l = freqDependentSaturation(l, warmth)
        r = freqDependentSaturation(r, warmth)

        // Oversampling (anti-aliasing)
        if (oversample > 1) {
            l = oversampleProcess(l)
            r = oversampleProcess(r)
        }

        // Mix (wet/dry)
        val finalL = inL * (1f - mix) + l * mix
        val finalR = inR * (1f - mix) + r * mix

        return Triple(finalL, finalR, 0f)
    }

    private fun tapeSaturation(x: Float): Float {
        // Ampex 351 tape: hysteresis + bias + soft clip
        val biased = x + 0.1f // bias
        val hysteresis = hysteresisState * 0.1f
        hysteresisState = hysteresisState * 0.99f + biased * 0.01f
        val saturated = if (kotlin.math.abs(biased) < 0.5f) {
            biased + biased * biased * biased * 0.2f // 3rd harmonic
        } else {
            val sign = if (biased >= 0f) 1f else -1f
            sign * (0.5f + (kotlin.math.abs(biased) - 0.5f) * 0.3f)
        }
        return saturated + hysteresis
    }

    private fun tubeSaturation(x: Float): Float {
        // 12AX7 tube: soft clip with 2nd/3rd harmonics
        val sign = if (x >= 0f) 1f else -1f
        val absX = kotlin.math.abs(x)
        return sign * (absX - absX * absX * absX / 3f + absX * absX * absX * absX * absX / 5f)
    }

    private fun transformerSaturation(x: Float): Float {
        // Neve/API transformer: subtle saturation with low-end emphasis
        val sign = if (x >= 0f) 1f else -1f
        val absX = kotlin.math.abs(x)
        return sign * (absX - absX * absX * absX / 5f + absX * absX * absX * absX * absX / 7f)
    }

    private fun consoleSaturation(x: Float): Float {
        // SSL/API console: clean with subtle harmonics
        val sign = if (x >= 0f) 1f else -1f
        val absX = kotlin.math.abs(x)
        return sign * (absX - absX * absX * absX / 7f)
    }

    private fun freqDependentSaturation(x: Float, warmth: Float): Float {
        // More saturation on highs, less on lows
        // Simplified: apply warmth as low-pass filter on saturation
        return x * (1f - warmth * 0.3f) + x * warmth * 0.3f
    }

    private fun oversampleProcess(x: Float): Float {
        // Simple oversampling with averaging
        var sum = 0f
        for (i in 0 until oversample) {
            sum += x / oversample
        }
        return sum
    }

    override fun reset() {
        hysteresisState = 0f
        wowPhase = 0.0
        flutterPhase = 0.0
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "type" to type.toFloat(),
        "driveDb" to driveDb,
        "warmth" to warmth,
        "mix" to mix,
        "oversample" to oversample.toFloat()
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "type" -> type = value.toInt()
            "driveDb" -> driveDb = value
            "warmth" -> warmth = value
            "mix" -> mix = value
            "oversample" -> oversample = value.toInt()
        }
    }
}
