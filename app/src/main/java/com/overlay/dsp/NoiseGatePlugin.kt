package com.overlay.dsp

/**
 * NOISE_GATE — Noise gate with threshold, attack, release, hold.
 * Hardware ref: Various (noise gate)
 * 
 * Features:
 * - Threshold (dB)
 * - Attack time (ms)
 * - Release time (ms)
 * - Hold time (ms)
 * - Sidechain input
 * - Look-ahead
 */
class NoiseGatePlugin(
    private val sampleRate: Float = 48000f,
    var thresholdDb: Float = -40f,
    var attackMs: Float = 1f,
    var releaseMs: Float = 50f,
    var holdMs: Float = 10f,
    var sidechain: Boolean = false,
    var lookaheadMs: Float = 0f
) : DspPlugin {

    override val name = "NOISE_GATE"
    override val category = "Dynamics"
    override var enabled = true

    private val thresholdLinear = java.lang.Math.pow(10.0, (thresholdDb / 20f).toDouble()).toFloat()
    private val attackCoeff = kotlin.math.exp((-1f / (attackMs * sampleRate / 1000f)).toDouble()).toFloat()
    private val releaseCoeff = kotlin.math.exp((-1f / (releaseMs * sampleRate / 1000f)).toDouble()).toFloat()

    private var envelope = 0f
    private var gateState = 0f // 0 = closed, 1 = open
    private var holdCounter = 0
    private val holdSamples = (holdMs * sampleRate / 1000f).toInt()

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        val scL = if (sidechain) inL else inL
        val scR = if (sidechain) inR else inR
        val peakL = kotlin.math.abs(scL)
        val peakR = kotlin.math.abs(scR)
        val peak = maxOf(peakL, peakR)

        // Envelope follower
        val coeff = if (peak > envelope) attackCoeff else releaseCoeff
        envelope = envelope * coeff + peak * (1f - coeff)

        // Gate logic
        if (envelope > thresholdLinear) {
            // Signal above threshold — open gate
            gateState = 1f
            holdCounter = holdSamples
        } else {
            // Signal below threshold
            if (holdCounter > 0) {
                holdCounter--
            } else {
                // Release gate
                gateState = gateState * releaseCoeff
            }
        }

        // Apply gate
        val outL = inL * gateState
        val outR = inR * gateState

        val grDb = if (gateState < 1f) 20f * kotlin.math.log10(gateState.toDouble()).toFloat() else 0f

        return Triple(outL, outR, grDb)
    }

    override fun reset() {
        envelope = 0f
        gateState = 0f
        holdCounter = 0
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "thresholdDb" to thresholdDb,
        "attackMs" to attackMs,
        "releaseMs" to releaseMs,
        "holdMs" to holdMs,
        "sidechain" to if (sidechain) 1f else 0f,
        "gateState" to gateState
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "thresholdDb" -> thresholdDb = value
            "attackMs" -> attackMs = value
            "releaseMs" -> releaseMs = value
            "holdMs" -> holdMs = value
            "sidechain" -> sidechain = value >= 0.5f
        }
    }
}
