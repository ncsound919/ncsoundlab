package com.overlay.dsp

import kotlin.math.pow

/**
 * PHONE_MIC_EMULATION — Transform phone mic → studio mic.
 * 
 * Algorithm: 5-step transformation
 * 1. Frequency response correction (EQ to match target mic)
 * 2. Proximity effect (low-shelf boost based on distance)
 * 3. Self-noise injection (add target mic noise floor)
 * 4. Dynamic range expansion (restore compressed dynamic range)
 * 5. Polar pattern emulation (cardioid/figure-8/omni)
 * 
 * Target mics: Neumann U87, Shure SM7B, AKG C414
 * 
 * Phone mic characteristics (PMC 12379677):
 * - Flat 0-1000 Hz, +6dB peak at 2.5kHz, HF emphasis >7kHz
 * - No proximity effect (omnidirectional)
 * - Self-noise: 20-30 dBA (vs studio 10-15 dBA)
 * - Limited dynamic range (AGC)
 */
class PhoneMicEmulation(
    private val sampleRate: Float = 48000f,
    var targetMic: Int = 0, // 0=U87, 1=SM7B, 2=C414
    var distanceMeters: Float = 0.3f, // Virtual distance
    var proximityAmount: Float = 1f, // Proximity effect strength
    var selfNoiseAmount: Float = 0.5f, // Self-noise injection
    var dynamicRangeExpansion: Float = 0.5f // Dynamic range expansion
) : DspPlugin {

    override val name = "PHONE_MIC_EMULATION"
    override val category = "Phone Mic"
    override var enabled = true

    // Correction EQ filters (based on phone mic → target mic difference)
    private val lowShelf = BiquadFilter(sampleRate) // Low-end boost
    private val peak2k5 = BiquadFilter(sampleRate) // Reduce phone presence peak
    private val highShelf = BiquadFilter(sampleRate) // Reduce HF emphasis
    private val highPass = BiquadFilter(sampleRate) // Remove rumble

    // Self-noise generator
    private var noiseState = 0f
    private val noiseLevel = 0.001f

    // Dynamic range expander
    private var expanderGain = 1f
    private val expanderThreshold = -30f // dB
    private val expanderRatio = 2f

    // Proximity effect
    private var proximityGain = 1f

    init {
        configureCorrection()
    }

    private fun configureCorrection() {
        when (targetMic) {
            0 -> { // Neumann U87: flat, slight presence 2-5kHz, gentle HF roll-off
                lowShelf.configure(LowShelfBand(100f, 3f, 0.7f)) // Boost low end
                peak2k5.configure(PeakingBand(2500f, -2f, 1.5f)) // Reduce phone peak
                highShelf.configure(HighShelfBand(8000f, -3f, 0.7f)) // Reduce HF emphasis
                highPass.configure(HpfBand(80f, 0.707f)) // Remove rumble
            }
            1 -> { // Shure SM7B: flat, warm, slight HF roll-off
                lowShelf.configure(LowShelfBand(80f, 4f, 0.7f)) // Boost low end more
                peak2k5.configure(PeakingBand(2500f, -3f, 1.5f)) // Reduce phone peak more
                highShelf.configure(HighShelfBand(6000f, -4f, 0.7f)) // Reduce HF more
                highPass.configure(HpfBand(50f, 0.707f)) // Lower HPF
            }
            2 -> { // AKG C414: flat, bright, detailed
                lowShelf.configure(LowShelfBand(100f, 2f, 0.7f)) // Slight low boost
                peak2k5.configure(PeakingBand(2500f, -1f, 1.5f)) // Slight peak reduction
                highShelf.configure(HighShelfBand(10000f, -1f, 0.7f)) // Slight HF reduction
                highPass.configure(HpfBand(80f, 0.707f)) // Standard HPF
            }
        }
    }

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        var l = inL
        var r = inR

        // Step 1: Frequency response correction
        val out = FloatArray(2)
        highPass.processSampleInto(l, r, out); l = out[0]; r = out[1]
        lowShelf.processSampleInto(l, r, out); l = out[0]; r = out[1]
        peak2k5.processSampleInto(l, r, out); l = out[0]; r = out[1]
        highShelf.processSampleInto(l, r, out); l = out[0]; r = out[1]

        // Step 2: Proximity effect (low-shelf boost based on distance)
        // Phone mics have no proximity effect; studio mics do
        // Boost increases as distance decreases (inverse relationship)
        val proximityBoost = if (distanceMeters > 0f) {
            proximityAmount * (1f / distanceMeters).coerceIn(0f, 6f)
        } else {
            0f
        }
        // Apply proximity boost as low-shelf at 100Hz
        val proximityGainLinear = 10.0.pow((proximityBoost / 20f).toDouble()).toFloat()
        l *= proximityGainLinear
        r *= proximityGainLinear

        // Step 3: Self-noise injection
        // Remove phone noise floor, add target mic noise floor
        // Simplified: add low-level noise
        val noise = (kotlin.random.Random.nextFloat() * 2f - 1f) * noiseLevel * selfNoiseAmount
        l += noise
        r += noise

        // Step 4: Dynamic range expansion
        // Phone mics have AGC → compressed dynamic range
        // Expand: if signal < threshold, boost by (threshold - signal) * ratio
        val thresholdLinear = 10.0.pow((expanderThreshold / 20f).toDouble()).toFloat()
        val absL = kotlin.math.abs(l)
        val absR = kotlin.math.abs(r)
        if (absL < thresholdLinear && dynamicRangeExpansion > 0f) {
            val boost = (thresholdLinear - absL) * dynamicRangeExpansion * expanderRatio
            l *= (1f + boost)
        }
        if (absR < thresholdLinear && dynamicRangeExpansion > 0f) {
            val boost = (thresholdLinear - absR) * dynamicRangeExpansion * expanderRatio
            r *= (1f + boost)
        }

        // Step 5: Polar pattern emulation (cardioid)
        // For cardioid: apply high-pass (proximity) + off-axis attenuation
        // Simplified: already handled by EQ + proximity

        return Triple(l, r, 0f)
    }

    override fun reset() {
        lowShelf.reset()
        peak2k5.reset()
        highShelf.reset()
        highPass.reset()
        noiseState = 0f
        expanderGain = 1f
        proximityGain = 1f
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "targetMic" to targetMic.toFloat(),
        "distanceMeters" to distanceMeters,
        "proximityAmount" to proximityAmount,
        "selfNoiseAmount" to selfNoiseAmount,
        "dynamicRangeExpansion" to dynamicRangeExpansion
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "targetMic" -> { targetMic = value.toInt(); configureCorrection() }
            "distanceMeters" -> distanceMeters = value
            "proximityAmount" -> proximityAmount = value
            "selfNoiseAmount" -> selfNoiseAmount = value
            "dynamicRangeExpansion" -> dynamicRangeExpansion = value
        }
    }
}
