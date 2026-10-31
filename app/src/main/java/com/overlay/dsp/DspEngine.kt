package com.overlay.dsp

/**
 * Core DSP Engine — Real-time audio processing for NC Studio.
 * 
 * Architecture: AAudio callback loop → plugin chain → output buffer
 * 
 * Latency target: < 5ms (256 samples at 48kHz = 5.3ms)
 * CPU target: < 5% per plugin instance
 * 
 * Essential plugins only (8 core + 2 phone-specific):
 * 1. TRIM — gain staging, auto-gain, phase invert
 * 2. NEVE_1073 — fixed-freq EQ with transformer saturation
 * 3. FET_1176 — FET compression, all-buttons-in
 * 4. OPTO_LA2A — optical leveling, tube warmth
 * 5. VCA_BUS_COMP — SSL bus glue, auto release
 * 6. SATURATION — tape/tube/transformer/console
 * 7. PLATE_REVERB — EMT-style plate
 * 8. TRUE_PEAK_LIMITER — inter-sample safe ceiling
 * 9. PHONE_NOISE_REDUCTION — tailored spectral subtraction for phone mic
 * 10. PHONE_MIC_EMULATION — phone mic → studio mic transformation
 */
class DspEngine(private val sampleRate: Float = 48000f) {

    // Plugin chain (ordered)
    private val chain = mutableListOf<DspPlugin>()

    // Real-time audio buffers
    private val inputBuffer = FloatArray(256)
    private val outputBuffer = FloatArray(256)
    private val tempBuffer = FloatArray(256)

    // Gain reduction metering
    var gainReductionDb: Float = 0f
        private set

    // CPU usage tracking
    var cpuUsagePercent: Float = 0f
        private set

    // Plugin bypass
    var bypass: Boolean = false

    fun addPlugin(plugin: DspPlugin) {
        chain.add(plugin)
    }

    fun removePlugin(index: Int) {
        if (index in chain.indices) chain.removeAt(index)
    }

    fun movePlugin(from: Int, to: Int) {
        if (from in chain.indices && to in chain.indices) {
            val plugin = chain.removeAt(from)
            chain.add(to, plugin)
        }
    }

    fun togglePlugin(index: Int) {
        if (index in chain.indices) {
            chain[index].enabled = !chain[index].enabled
        }
    }

    fun process(inL: Float, inR: Float): Pair<Float, Float> {
        // Silence gate: skip processing when signal < 1e-6 (saves CPU)
        if (kotlin.math.abs(inL) < 1e-6f && kotlin.math.abs(inR) < 1e-6f) {
            return Pair(inL, inR)
        }

        if (bypass) return Pair(inL, inR)

        var outL = inL
        var outR = inR
        var totalGr = 0f

        for (plugin in chain) {
            if (!plugin.enabled) continue
            val (l, r, gr) = plugin.process(outL, outR)
            outL = l
            outR = r
            totalGr += gr
        }

        gainReductionDb = totalGr
        return Pair(outL, outR)
    }

    fun processBlock(input: FloatArray, output: FloatArray, frames: Int) {
        val startTime = System.nanoTime()
        for (i in 0 until frames) {
            val (l, r) = process(input[i * 2], input[i * 2 + 1])
            output[i * 2] = l
            output[i * 2 + 1] = r
        }
        val elapsed = (System.nanoTime() - startTime) / 1_000_000f
        cpuUsagePercent = (elapsed / (frames / sampleRate * 1000f)) * 100f
    }

    fun reset() {
        chain.clear()
        gainReductionDb = 0f
        cpuUsagePercent = 0f
    }
}

interface DspPlugin {
    val name: String
    val category: String
    var enabled: Boolean
    fun process(inL: Float, inR: Float): Triple<Float, Float, Float> // (outL, outR, gainReductionDb)
    fun reset()
    fun getParams(): Map<String, Float>
    fun setParam(key: String, value: Float)
}
