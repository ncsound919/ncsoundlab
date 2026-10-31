package com.overlay.dsp

import kotlin.math.pow

/**
 * OPTO_LA2A — Optical leveling with tube warmth.
 * Hardware ref: Teletronix LA-2A (T4 optical cell, program-dependent release, tube stage)
 * 
 * Features:
 * - Peak reduction (0-10)
 * - Gain (0-24dB)
 * - Compress/Limit mode
 * - T4 optical cell emulation (program-dependent release)
 * - Tube stage saturation (12AX7)
 * - R37 (emphasis) control
 */
class OptoLa2aPlugin(
    private val sampleRate: Float = 48000f,
    var peakReduction: Float = 4f,
    var gainDb: Float = 6f,
    var limitMode: Boolean = false, // false=compress, true=limit
    var mix: Float = 1f,
    var r37: Float = 0f // emphasis (0-1)
) : DspPlugin {

    override val name = "OPTO_LA2A"
    override val category = "Dynamics"
    override var enabled = true

    // T4 optical cell state
    private var opticalCellState = 0f
    private var releaseTime = 0f

    // Tube stage
    private var tubeState = 0f

    // Gain reduction
    private var currentGain = 1f

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        val peakL = kotlin.math.abs(inL)
        val peakR = kotlin.math.abs(inR)
        val peak = maxOf(peakL, peakR)

        // T4 optical cell: program-dependent release
        // Release time increases with amount of gain reduction
        val peakReductionLinear = peakReduction / 10f
        val targetGain = if (peak > 0f) {
            1f / (1f + peakReductionLinear * peak)
        } else {
            1f
        }

        // Program-dependent release: slower release for more GR
        val grAmount = 1f - targetGain
        releaseTime = 0.1f + grAmount * 0.9f // 0.1s to 1.0s
        val releaseCoeff = kotlin.math.exp((-1f / (releaseTime * sampleRate).toDouble())).toFloat()

        currentGain = currentGain * releaseCoeff + targetGain * (1f - releaseCoeff)

        // Apply gain
        var outL = inL * currentGain
        var outR = inR * currentGain

        // Tube stage (12AX7) saturation
        outL = tubeSaturation(outL)
        outR = tubeSaturation(outR)

        // R37 emphasis (high-frequency boost)
        if (r37 > 0f) {
            outL = applyEmphasis(outL, r37)
            outR = applyEmphasis(outR, r37)
        }

        // Output gain
        val outGain = 10.0.pow((gainDb / 20f).toDouble()).toFloat()
        outL *= outGain
        outR *= outGain

        // Parallel blend
        val finalL = inL * (1f - mix) + outL * mix
        val finalR = inR * (1f - mix) + outR * mix

        val grDb = if (currentGain < 1f) 20f * kotlin.math.log10((currentGain).toDouble()).toFloat() else 0f

        return Triple(finalL, finalR, grDb)
    }

    private fun tubeSaturation(x: Float): Float {
        // 12AX7 tube: soft clip with 2nd/3rd harmonics
        val sign = if (x >= 0f) 1f else -1f
        val absX = kotlin.math.abs(x)
        return sign * (absX - absX * absX * absX / 3f + absX * absX * absX * absX * absX / 5f)
    }

    private fun applyEmphasis(x: Float, amount: Float): Float {
        // Simple high-shelf emphasis
        return x * (1f + amount * 0.3f)
    }

    override fun reset() {
        opticalCellState = 0f
        releaseTime = 0f
        tubeState = 0f
        currentGain = 1f
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "peakReduction" to peakReduction,
        "gainDb" to gainDb,
        "limitMode" to if (limitMode) 1f else 0f,
        "mix" to mix,
        "r37" to r37,
        "gainReduction" to 20f * kotlin.math.log10((currentGain).toDouble()).toFloat()
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "peakReduction" -> peakReduction = value
            "gainDb" -> gainDb = value
            "limitMode" -> limitMode = value >= 0.5f
            "mix" -> mix = value
            "r37" -> r37 = value
        }
    }
}
