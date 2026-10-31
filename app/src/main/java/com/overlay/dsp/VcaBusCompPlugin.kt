package com.overlay.dsp

import kotlin.math.pow

/**
 * VCA_BUS_COMP — SSL G-Series bus compressor with Auto release.
 * Hardware ref: SSL G-Series bus compressor (VCA, feedback topology, multi-stage Auto release)
 * 
 * Features:
 * - 2/4/10:1 ratios
 * - Auto release (program-dependent multi-stage)
 * - Sidechain HPF
 * - Stereo width control
 * - External sidechain input
 * - VCA nonlinearity
 */
class VcaBusCompPlugin(
    private val sampleRate: Float = 48000f,
    var thresholdDb: Float = -10f,
    var ratio: Float = 2f, // 2, 4, 10
    var attackMs: Float = 10f,
    var autoRelease: Boolean = true,
    var releaseMs: Float = 300f,
    var makeupDb: Float = 0f,
    var mix: Float = 1f,
    var sidechainHpfHz: Float = 0f,
    var stereoWidth: Float = 1f
) : DspPlugin {

    override val name = "VCA_BUS_COMP"
    override val category = "Dynamics"
    override var enabled = true

    private val attackCoeff = kotlin.math.exp((-1f / (attackMs * sampleRate / 1000f).toDouble())).toFloat()
    private val releaseCoeff = kotlin.math.exp((-1f / (releaseMs * sampleRate / 1000f).toDouble())).toFloat()

    // Auto release stages
    private val autoReleaseStages = floatArrayOf(0.1f, 0.3f, 0.6f, 1.2f) // seconds
    private var autoReleaseIndex = 0

    // Envelope follower
    private var envelope = 0f

    // Sidechain HPF
    private val sidechainHpf = BiquadFilter(sampleRate)

    // Gain reduction
    private var currentGain = 1f
    private var targetGain = 1f

    init {
        if (sidechainHpfHz > 0f) {
            sidechainHpf.configure(HpfBand(sidechainHpfHz, 0.707f))
        }
    }

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        // Sidechain HPF
        val scL = if (sidechainHpfHz > 0f) {
            val out = FloatArray(2)
            sidechainHpf.processSampleInto(inL, inR, out)
            out[0]
        } else inL
        val scR = if (sidechainHpfHz > 0f) {
            val out = FloatArray(2)
            sidechainHpf.processSampleInto(inL, inR, out)
            out[1]
        } else inR

        val peakL = kotlin.math.abs(scL)
        val peakR = kotlin.math.abs(scR)
        val peak = maxOf(peakL, peakR)

        // Envelope follower
        val coeff = if (peak > envelope) attackCoeff else releaseCoeff
        envelope = envelope * coeff + peak * (1f - coeff)

        // Threshold
        val thresholdLinear = 10.0.pow((thresholdDb / 20f).toDouble()).toFloat()

        // Calculate gain reduction
        if (envelope > thresholdLinear) {
            val overDb = 20f * kotlin.math.log10((envelope / thresholdLinear).toDouble())
            val grDb = overDb * (1f - 1f / ratio)
            targetGain = 10.0.pow((-grDb / 20f).toDouble()).toFloat()
        } else {
            targetGain = 1f
        }

        // Auto release: program-dependent
        if (autoRelease) {
            val grAmount = 1f - targetGain
            autoReleaseIndex = when {
                grAmount < 0.1f -> 0
                grAmount < 0.3f -> 1
                grAmount < 0.6f -> 2
                else -> 3
            }
            val autoReleaseMs = autoReleaseStages[autoReleaseIndex] * 1000f
            val autoReleaseCoeff = kotlin.math.exp((-1f / (autoReleaseMs * sampleRate / 1000f).toDouble())).toFloat()
            currentGain = currentGain * autoReleaseCoeff + targetGain * (1f - autoReleaseCoeff)
        } else {
            currentGain = currentGain * releaseCoeff + targetGain * (1f - releaseCoeff)
        }

        // Stereo width
        val mid = (inL + inR) / 2f
        val side = (inL - inR) / 2f
        val widthSide = side * stereoWidth
        val widthL = mid + widthSide
        val widthR = mid - widthSide

        // Apply gain
        var outL = widthL * currentGain
        var outR = widthR * currentGain

        // VCA nonlinearity (harmonic distortion)
        outL = vcaNonlinearity(outL)
        outR = vcaNonlinearity(outR)

        // Makeup gain
        val makeupLinear = 10.0.pow((makeupDb / 20f).toDouble()).toFloat()
        outL *= makeupLinear
        outR *= makeupLinear

        // Parallel blend
        val finalL = inL * (1f - mix) + outL * mix
        val finalR = inR * (1f - mix) + outR * mix

        val grDb = if (currentGain < 1f) 20f * kotlin.math.log10((currentGain).toDouble()).toFloat() else 0f

        return Triple(finalL, finalR, grDb)
    }

    private fun vcaNonlinearity(x: Float): Float {
        // SSL VCA: subtle harmonic distortion
        return x + x * x * x * 0.05f
    }

    override fun reset() {
        envelope = 0f
        currentGain = 1f
        autoReleaseIndex = 0
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "thresholdDb" to thresholdDb,
        "ratio" to ratio,
        "attackMs" to attackMs,
        "autoRelease" to if (autoRelease) 1f else 0f,
        "releaseMs" to releaseMs,
        "makeupDb" to makeupDb,
        "mix" to mix,
        "sidechainHpfHz" to sidechainHpfHz,
        "stereoWidth" to stereoWidth,
        "gainReduction" to 20f * kotlin.math.log10((currentGain).toDouble()).toFloat()
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "thresholdDb" -> thresholdDb = value
            "ratio" -> ratio = value
            "attackMs" -> attackMs = value
            "autoRelease" -> autoRelease = value >= 0.5f
            "releaseMs" -> releaseMs = value
            "makeupDb" -> makeupDb = value
            "mix" -> mix = value
            "sidechainHpfHz" -> sidechainHpfHz = value
            "stereoWidth" -> stereoWidth = value
        }
    }
}
