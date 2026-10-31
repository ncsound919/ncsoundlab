package com.overlay.dsp

import kotlin.math.pow

/**
 * NEVE 1073 — Fixed-frequency EQ with preamp drive and transformer saturation.
 * Hardware ref: Neve 1073 (fixed frequencies: 35/60/110/220 Hz LF, 360/700/1.6k/3.2k/4.8k/7.2k mid, 12k HF shelf)
 * 
 * Features:
 * - Preamp drive with transformer saturation (hysteresis, bias)
 * - Fixed-frequency LF/MF/HF bands
 * - HPF (50/80/160/300 Hz)
 * - Input/output impedance switching (150Ω/300Ω/1200Ω)
 * - Phase invert
 */
class Neve1073Plugin(
    private val sampleRate: Float = 48000f,
    var driveDb: Float = 3f,
    var hpfHz: Float = 80f,
    var lfHz: Float = 60f, // 35, 60, 110, 220
    var lfDb: Float = 0f,
    var midHz: Float = 1600f, // 360, 700, 1600, 3200, 4800, 7200
    var midDb: Float = 0f,
    var hfDb: Float = 0f, // 12k fixed
    var outDb: Float = 0f,
    var impedance: Int = 0, // 0=150Ω, 1=300Ω, 2=1200Ω
    var phaseInvert: Boolean = false
) : DspPlugin {

    override val name = "NEVE 1073"
    override val category = "Filters & EQ"
    override var enabled = true

    // Biquad filters
    private val hpf = BiquadFilter(sampleRate)
    private val lfShelf = BiquadFilter(sampleRate)
    private val midPeak = BiquadFilter(sampleRate)
    private val hfShelf = BiquadFilter(sampleRate)

    // Transformer saturation state
    private var transformerState = 0f
    private var biasState = 0f

    init {
        configureFilters()
    }

    private fun configureFilters() {
        // HPF
        hpf.configure(HpfBand(hpfHz, if (hpfHz > 0f) 0.707f else 0f))
        // LF shelf
        lfShelf.configure(LowShelfBand(lfHz, lfDb, 0.7f))
        // Mid peak
        midPeak.configure(PeakingBand(midHz, midDb, 1.5f))
        // HF shelf (fixed 12kHz)
        hfShelf.configure(HighShelfBand(12000f, hfDb, 0.7f))
    }

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        var l = inL
        var r = inR

        if (phaseInvert) { l = -l; r = -r }

        // Preamp drive with transformer saturation
        val driveLinear = 10.0.pow((driveDb / 20f).toDouble()).toFloat()
        l = transformerSaturation(l * driveLinear)
        r = transformerSaturation(r * driveLinear)

        // Impedance-dependent input loading
        val impedanceFactor = when (impedance) {
            0 -> 1.0f // 150Ω (default)
            1 -> 0.85f // 300Ω (slightly brighter)
            2 -> 0.7f  // 1200Ω (darker, less loading)
            else -> 1.0f
        }
        l *= impedanceFactor
        r *= impedanceFactor

        // EQ processing
        val out = FloatArray(2)
        hpf.processSampleInto(l, r, out); l = out[0]; r = out[1]
        lfShelf.processSampleInto(l, r, out); l = out[0]; r = out[1]
        midPeak.processSampleInto(l, r, out); l = out[0]; r = out[1]
        hfShelf.processSampleInto(l, r, out); l = out[0]; r = out[1]

        // Output gain
        val outGain = 10.0.pow((outDb / 20f).toDouble()).toFloat()
        l *= outGain
        r *= outGain

        return Triple(l, r, 0f)
    }

    private fun transformerSaturation(x: Float): Float {
        // Neve 1073 transformer: hysteresis + bias
        // Simplified: soft clip with harmonic generation
        val biased = x + biasState * 0.1f
        biasState = biasState * 0.99f + x * 0.01f
        val saturated = if (kotlin.math.abs(biased) < 0.5f) {
            biased + biased * biased * biased * 0.1f // 3rd harmonic
        } else {
            val sign = if (biased >= 0f) 1f else -1f
            sign * (0.5f + (kotlin.math.abs(biased) - 0.5f) * 0.5f)
        }
        transformerState = transformerState * 0.95f + saturated * 0.05f
        return saturated * 0.9f + transformerState * 0.1f
    }

    override fun reset() {
        hpf.reset()
        lfShelf.reset()
        midPeak.reset()
        hfShelf.reset()
        transformerState = 0f
        biasState = 0f
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "driveDb" to driveDb,
        "hpfHz" to hpfHz,
        "lfHz" to lfHz,
        "lfDb" to lfDb,
        "midHz" to midHz,
        "midDb" to midDb,
        "hfDb" to hfDb,
        "outDb" to outDb,
        "impedance" to impedance.toFloat(),
        "phaseInvert" to if (phaseInvert) 1f else 0f
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "driveDb" -> driveDb = value
            "hpfHz" -> { hpfHz = value; configureFilters() }
            "lfHz" -> { lfHz = value; configureFilters() }
            "lfDb" -> { lfDb = value; configureFilters() }
            "midHz" -> { midHz = value; configureFilters() }
            "midDb" -> { midDb = value; configureFilters() }
            "hfDb" -> { hfDb = value; configureFilters() }
            "outDb" -> outDb = value
            "impedance" -> impedance = value.toInt()
            "phaseInvert" -> phaseInvert = value >= 0.5f
        }
    }
}

// Helper data classes for filter configuration
data class HpfBand(val freq: Float, val q: Float)
data class LowShelfBand(val freq: Float, val gain: Float, val q: Float)
data class PeakingBand(val freq: Float, val gain: Float, val q: Float)
data class HighShelfBand(val freq: Float, val gain: Float, val q: Float)

fun BiquadFilter.configure(band: HpfBand) {
    val w0 = 2.0 * Math.PI * band.freq / 48000f
    val cosW0 = kotlin.math.cos(w0).toFloat()
    val sinW0 = kotlin.math.sin(w0).toFloat()
    val alpha = sinW0 / (2f * band.q)
    val a0 = 1f + alpha
    b0 = ((1f + cosW0) / 2f) / a0
    b1 = (-(1f + cosW0)) / a0
    b2 = ((1f + cosW0) / 2f) / a0
    a1 = (-2f * cosW0) / a0
    a2 = (1f - alpha) / a0
    if (band.freq <= 0f) { b0 = 1f; b1 = 0f; b2 = 0f; a1 = 0f; a2 = 0f }
}

fun BiquadFilter.configure(band: LowShelfBand) {
    val w0 = 2.0 * Math.PI * band.freq / 48000f
    val cosW0 = kotlin.math.cos(w0).toFloat()
    val sinW0 = kotlin.math.sin(w0).toFloat()
    val A = 10.0.pow(band.gain / 40.0).toFloat()
    val alpha = sinW0 / (2f * band.q)
    val a0 = (A + 1f) + (A - 1f) * cosW0 + 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha
    b0 = A * ((A + 1f) - (A - 1f) * cosW0 + 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha) / a0
    b1 = 2f * A * ((A - 1f) - (A + 1f) * cosW0) / a0
    b2 = A * ((A + 1f) - (A - 1f) * cosW0 - 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha) / a0
    a1 = -2f * ((A - 1f) + (A + 1f) * cosW0) / a0
    a2 = ((A + 1f) + (A - 1f) * cosW0 - 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha) / a0
}

fun BiquadFilter.configure(band: PeakingBand) {
    val w0 = 2.0 * Math.PI * band.freq / 48000f
    val cosW0 = kotlin.math.cos(w0).toFloat()
    val sinW0 = kotlin.math.sin(w0).toFloat()
    val A = 10.0.pow(band.gain / 40.0).toFloat()
    val alpha = sinW0 / (2f * band.q)
    val a0 = 1f + alpha / A
    b0 = (1f + alpha * A) / a0
    b1 = (-2f * cosW0) / a0
    b2 = (1f - alpha * A) / a0
    a1 = (-2f * cosW0) / a0
    a2 = (1f - alpha / A) / a0
}

fun BiquadFilter.configure(band: HighShelfBand) {
    val w0 = 2.0 * Math.PI * band.freq / 48000f
    val cosW0 = kotlin.math.cos(w0).toFloat()
    val sinW0 = kotlin.math.sin(w0).toFloat()
    val A = 10.0.pow(band.gain / 40.0).toFloat()
    val alpha = sinW0 / (2f * band.q)
    val a0 = (A + 1f) - (A - 1f) * cosW0 + 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha
    b0 = A * ((A + 1f) + (A - 1f) * cosW0 + 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha) / a0
    b1 = -2f * A * ((A - 1f) + (A + 1f) * cosW0) / a0
    b2 = A * ((A + 1f) + (A - 1f) * cosW0 - 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha) / a0
    a1 = 2f * ((A - 1f) - (A + 1f) * cosW0) / a0
    a2 = ((A + 1f) - (A - 1f) * cosW0 - 2f * kotlin.math.sqrt((A).toDouble()).toFloat() * alpha) / a0
}

fun BiquadFilter.reset() {
    x1L = 0f; x2L = 0f; y1L = 0f; y2L = 0f
    x1R = 0f; x2R = 0f; y1R = 0f; y2R = 0f
}
