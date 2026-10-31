package com.overlay.dsp

import kotlin.math.*

/**
 * FET_1176 — Fast FET compression with all-buttons-in mode and soft knee.
 * Hardware ref: UREI 1176 (FET, program-dependent release, all-buttons-in = "British" mode)
 */
class Fet1176Plugin(
    private val sampleRate: Float = 48000f,
    var inputDb: Float = 6f,
    var ratio: Float = 4f,
    var attackUs: Float = 200f,
    var releaseMs: Float = 250f,
    var outputDb: Float = 0f,
    var allButtons: Boolean = false,
    var mix: Float = 1f,
    var sidechain: Boolean = false,
    var kneeDb: Float = 0f
) : DspPlugin {

    override val name = "FET_1176"
    override val category = "Dynamics"
    override var enabled = true

    private val attackCoeff = kotlin.math.exp((-1f / (attackUs * sampleRate / 1_000_000f)).toDouble()).toFloat()
    private val releaseCoeff = kotlin.math.exp((-1f / (releaseMs * sampleRate / 1000f)).toDouble()).toFloat()

    private var envelope = 0f
    private var currentGain = 1f
    private var targetGain = 1f
    private var transformerState = 0f

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        val inputLinear = java.lang.Math.pow(10.0, (inputDb / 20f).toDouble()).toFloat()
        val l = inL * inputLinear
        val r = inR * inputLinear

        val scL = if (sidechain) l else l
        val scR = if (sidechain) r else r

        val peakL = kotlin.math.abs(scL)
        val peakR = kotlin.math.abs(scR)
        val peak = maxOf(peakL, peakR)

        val coeff = if (peak > envelope) attackCoeff else releaseCoeff
        envelope = envelope * coeff + peak * (1f - coeff)

        val threshold = 1f

        if (envelope > threshold) {
            val overDb = (20f * kotlin.math.log10((envelope / threshold).toDouble())).toFloat()
            val kneeFactor = if (kneeDb > 0f) {
                val kneeStart = threshold * java.lang.Math.pow(10.0, (-kneeDb / 20f).toDouble()).toFloat()
                if (envelope < kneeStart) {
                    val t = (envelope - kneeStart) / (threshold - kneeStart)
                    t * t * 0.5f
                } else 1f
            } else 1f
            val grDb = overDb * (1f - 1f / ratio) * kneeFactor
            targetGain = java.lang.Math.pow(10.0, (-grDb / 20f).toDouble()).toFloat()
        } else {
            targetGain = 1f
        }

        currentGain = currentGain * releaseCoeff + targetGain * (1f - releaseCoeff)

        var outL = l * currentGain
        var outR = r * currentGain

        if (allButtons) {
            outL = allButtonsDistortion(outL)
            outR = allButtonsDistortion(outR)
        }

        outL = transformerSaturation(outL)
        outR = transformerSaturation(outR)

        val outGain = java.lang.Math.pow(10.0, (outputDb / 20f).toDouble()).toFloat()
        outL *= outGain
        outR *= outGain

        val finalL = inL * (1f - mix) + outL * mix
        val finalR = inR * (1f - mix) + outR * mix

        val grDbOut: Float = if (currentGain < 1f) (20f * kotlin.math.log10((currentGain).toDouble())).toFloat() else 0f

        return Triple(finalL, finalR, grDbOut)
    }

    private fun allButtonsDistortion(x: Float): Float {
        val sign = if (x >= 0f) 1f else -1f
        val absX = kotlin.math.abs(x)
        val distorted = if (absX < 0.5f) {
            absX + absX * absX * 0.5f
        } else {
            0.5f + (absX - 0.5f) * 0.3f
        }
        return sign * distorted
    }

    private fun transformerSaturation(x: Float): Float {
        val sign = if (x >= 0f) 1f else -1f
        val absX = kotlin.math.abs(x)
        return sign * (absX - absX * absX * absX / 3f + absX * absX * absX * absX * absX / 5f)
    }

    override fun reset() {
        envelope = 0f
        currentGain = 1f
        targetGain = 1f
        transformerState = 0f
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "inputDb" to inputDb,
        "ratio" to ratio,
        "attackUs" to attackUs,
        "releaseMs" to releaseMs,
        "outputDb" to outputDb,
        "allButtons" to if (allButtons) 1f else 0f,
        "mix" to mix,
        "sidechain" to if (sidechain) 1f else 0f,
        "kneeDb" to kneeDb,
        "gainReduction" to (20f * kotlin.math.log10((currentGain).toDouble())).toFloat()
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "inputDb" -> inputDb = value
            "ratio" -> ratio = value
            "attackUs" -> attackUs = value
            "releaseMs" -> releaseMs = value
            "outputDb" -> outputDb = value
            "allButtons" -> allButtons = value >= 0.5f
            "mix" -> mix = value
            "sidechain" -> sidechain = value >= 0.5f
            "kneeDb" -> kneeDb = value
        }
    }
}
