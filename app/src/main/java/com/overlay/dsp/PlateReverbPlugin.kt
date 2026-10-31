package com.overlay.dsp

/**
 * PLATE_REVERB — EMT 140-style plate reverb.
 * Hardware ref: EMT 140 (dense, bright, short decay, 0.5-5s)
 * 
 * Algorithm: Schroeder reverb (comb + allpass filters)
 * - 4 comb filters (parallel) with different delay times
 * - 2 allpass filters (series) for diffusion
 * - Damping (high-frequency absorption)
 * - Pre-delay
 * - Stereo width
 * - Mix (wet/dry)
 */
class PlateReverbPlugin(
    private val sampleRate: Float = 48000f,
    var decaySec: Float = 1.4f,
    var preDelayMs: Float = 30f,
    var hpHz: Float = 200f,
    var lpHz: Float = 9000f,
    var width: Float = 0.9f,
    var mix: Float = 0.12f,
    var damping: Float = 0.5f
) : DspPlugin {

    override val name = "PLATE_REVERB"
    override val category = "Space"
    override var enabled = true

    // Comb filter delays (in samples) — tuned for plate reverb
    private val combDelays = intArrayOf(1557, 1617, 1491, 1422)
    private val combBuffers = Array(4) { FloatArray(2000) }
    private val combIndices = IntArray(4)

    // Allpass filter delays
    private val allpassDelays = intArrayOf(225, 556)
    private val allpassBuffers = Array(2) { FloatArray(600) }
    private val allpassIndices = IntArray(2)

    // Pre-delay buffer
    private val preDelaySamples = (preDelayMs * sampleRate / 1000f).toInt()
    private val preDelayBuffer = FloatArray(preDelaySamples + 1)
    private var preDelayIndex = 0

    // Damping filter state
    private var dampingStateL = 0f
    private var dampingStateR = 0f

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        // Pre-delay
        preDelayBuffer[preDelayIndex] = (inL + inR) / 2f
        val delayedInput = preDelayBuffer[(preDelayIndex - preDelaySamples + preDelayBuffer.size) % preDelayBuffer.size]
        preDelayIndex = (preDelayIndex + 1) % preDelayBuffer.size

        // Comb filters (parallel)
        var combSumL = 0f
        var combSumR = 0f
        for (i in 0 until 4) {
            val delay = combDelays[i]
            val idx = (combIndices[i] - delay + combBuffers[i].size) % combBuffers[i].size
            val delayed = combBuffers[i][idx]
            
            // Damping (low-pass on feedback)
            dampingStateL = dampingStateL * damping + delayed * (1f - damping)
            dampingStateR = dampingStateR * damping + delayed * (1f - damping)
            
            val feedback = 0.84f * (1f - decaySec * 0.1f) // decay control
            combBuffers[i][combIndices[i]] = delayedInput + dampingStateL * feedback
            combIndices[i] = (combIndices[i] + 1) % combBuffers[i].size
            
            combSumL += delayed
            combSumR += delayed
        }

        // Allpass filters (series) for diffusion
        var allpassL = combSumL / 4f
        var allpassR = combSumR / 4f
        for (i in 0 until 2) {
            val delay = allpassDelays[i]
            val idx = (allpassIndices[i] - delay + allpassBuffers[i].size) % allpassBuffers[i].size
            val delayed = allpassBuffers[i][idx]
            val feedback = 0.5f
            allpassBuffers[i][allpassIndices[i]] = allpassL + delayed * feedback
            allpassIndices[i] = (allpassIndices[i] + 1) % allpassBuffers[i].size
            allpassL = delayed - allpassL * feedback
            allpassR = delayed - allpassR * feedback
        }

        // Stereo width
        val wetL = allpassL * width
        val wetR = allpassR * (2f - width) // inverse for stereo spread

        // HPF on wet (remove rumble)
        // Simplified: just pass through

        // Mix (wet/dry)
        val finalL = inL * (1f - mix) + wetL * mix
        val finalR = inR * (1f - mix) + wetR * mix

        return Triple(finalL, finalR, 0f)
    }

    override fun reset() {
        for (buf in combBuffers) buf.fill(0f)
        for (buf in allpassBuffers) buf.fill(0f)
        combIndices.fill(0)
        allpassIndices.fill(0)
        preDelayBuffer.fill(0f)
        preDelayIndex = 0
        dampingStateL = 0f
        dampingStateR = 0f
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "decaySec" to decaySec,
        "preDelayMs" to preDelayMs,
        "hpHz" to hpHz,
        "lpHz" to lpHz,
        "width" to width,
        "mix" to mix,
        "damping" to damping
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "decaySec" -> decaySec = value
            "preDelayMs" -> preDelayMs = value
            "hpHz" -> hpHz = value
            "lpHz" -> lpHz = value
            "width" -> width = value
            "mix" -> mix = value
            "damping" -> damping = value
        }
    }
}
