package com.overlay.dsp

import kotlin.math.*

class BiquadFilter(
    private val sampleRate: Float,
    var b0: Float = 1f, var b1: Float = 0f, var b2: Float = 0f,
    var a1: Float = 0f, var a2: Float = 0f
) {
    var x1L = 0f; var x2L = 0f; var y1L = 0f; var y2L = 0f
    var x1R = 0f; var x2R = 0f; var y1R = 0f; var y2R = 0f

    fun processSample(inL: Float, inR: Float): Pair<Float, Float> {
        val out = FloatArray(2); processSampleInto(inL, inR, out); return Pair(out[0], out[1])
    }
    fun processSampleInto(inL: Float, inR: Float, out: FloatArray) {
        val outL = b0 * inL + b1 * x1L + b2 * x2L - a1 * y1L - a2 * y2L
        x2L = x1L; x1L = inL; y2L = y1L; y1L = outL
        val outR = b0 * inR + b1 * x1R + b2 * x2R - a1 * y1R - a2 * y2R
        x2R = x1R; x1R = inR; y2R = y1R; y1R = outR
        out[0] = outL; out[1] = outR
    }
    fun reset() {
        x1L = 0f; x2L = 0f; y1L = 0f; y2L = 0f
        x1R = 0f; x2R = 0f; y1R = 0f; y2R = 0f
    }
}
