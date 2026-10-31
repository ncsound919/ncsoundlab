package com.overlay.dsp

import kotlin.math.pow

/**
 * PHONE_NOISE_REDUCTION — Tailored spectral subtraction for phone mic.
 * 
 * Algorithm: Adaptive spectral subtraction (Boll 1979) with phone-specific tuning
 * 
 * Phone mic noise profile:
 * - Low-frequency rumble (handling, wind, HVAC)
 * - High-frequency hiss (electronic noise)
 * - Wind noise (non-stationary low-freq bursts)
 * - Handling noise (impulsive transients)
 * 
 * Implementation:
 * 1. Noise profile capture: first 2-3s of recording (silence)
 * 2. FFT analysis: compute magnitude spectrum of noise
 * 3. Adaptive threshold: per-frequency-bin noise floor
 * 4. Spectral subtraction: subtract noise floor from signal
 * 5. Temporal smoothing: exponential moving average of noise floor
 * 6. Phone-specific: wind detection, handling detection
 */
class PhoneNoiseReduction(
    private val sampleRate: Float = 48000f,
    var reductionDb: Float = 12f, // Amount of noise reduction
    var smoothingMs: Float = 100f, // Temporal smoothing
    var windDetection: Boolean = true,
    var handlingDetection: Boolean = true
) : DspPlugin {

    override val name = "PHONE_NOISE_REDUCTION"
    override val category = "Phone Mic"
    override var enabled = true

    // FFT size (power of 2)
    private val fftSize = 512
    private val halfSize = fftSize / 2

    // Noise profile (magnitude spectrum)
    private val noiseProfile = FloatArray(halfSize + 1)
    private var noiseCaptured = false
    private var noiseFrameCount = 0
    private val maxNoiseFrames = 20 // ~400ms at 48kHz with 512-sample frames

    // Temporal smoothing
    private val smoothingAlpha = kotlin.math.exp((-1f / (smoothingMs * sampleRate / 1000f).toDouble())).toFloat()
    private val smoothedNoise = FloatArray(halfSize + 1)

    // Wind detection
    private var windEnergy = 0f
    private var windThreshold = 0.5f

    // Handling noise detection
    private var handlingEnergy = 0f
    private var handlingThreshold = 0.3f

    // Overlap-add buffers
    private val inputBuffer = FloatArray(fftSize)
    private val outputBuffer = FloatArray(fftSize)
    private var bufferIndex = 0

    // Hann window
    private val window = FloatArray(fftSize) { i ->
        (0.5f * (1f - kotlin.math.cos(2.0 * Math.PI * i / fftSize))).toFloat()
    }

    override fun process(inL: Float, inR: Float): Triple<Float, Float, Float> {
        // Mono processing (use left channel)
        val input = inL

        // Add to input buffer
        inputBuffer[bufferIndex] = input
        bufferIndex++

        if (bufferIndex < fftSize) {
            return Triple(inL, inR, 0f) // Not enough samples yet
        }

        // Process frame
        bufferIndex = 0

        // Apply window
        val windowed = FloatArray(fftSize)
        for (i in 0 until fftSize) {
            windowed[i] = inputBuffer[i] * window[i]
        }

        // FFT (simplified - use magnitude spectrum)
        val magnitude = FloatArray(halfSize + 1)
        for (k in 0 until halfSize + 1) {
            var real = 0f
            var imag = 0f
            for (n in 0 until fftSize) {
                val angle = -2.0 * Math.PI * k * n / fftSize
                real += windowed[n] * kotlin.math.cos(angle).toFloat()
                imag += windowed[n] * kotlin.math.sin(angle).toFloat()
            }
            magnitude[k] = kotlin.math.sqrt((real * real + imag * imag).toDouble()).toFloat()
        }

        // Noise profile capture (first N frames)
        if (!noiseCaptured) {
            for (k in 0 until halfSize + 1) {
                noiseProfile[k] += magnitude[k]
            }
            noiseFrameCount++
            if (noiseFrameCount >= maxNoiseFrames) {
                for (k in 0 until halfSize + 1) {
                    noiseProfile[k] /= noiseFrameCount
                    smoothedNoise[k] = noiseProfile[k]
                }
                noiseCaptured = true
            }
            return Triple(inL, inR, 0f) // No processing during capture
        }

        // Wind detection
        if (windDetection) {
            // Low-frequency energy (0-200 Hz)
            var lowEnergy = 0f
            for (k in 0 until 5) { // ~0-200 Hz at 48kHz with 512 FFT
                lowEnergy += magnitude[k]
            }
            windEnergy = windEnergy * 0.9f + lowEnergy * 0.1f
            if (windEnergy > windThreshold) {
                // Increase reduction for low frequencies
                reductionDb = 18f
            }
        }

        // Handling noise detection
        if (handlingDetection) {
            // Check for impulsive transients (sudden energy spikes)
            val currentEnergy = magnitude.sum()
            handlingEnergy = handlingEnergy * 0.95f + currentEnergy * 0.05f
            if (currentEnergy > handlingEnergy * 3f) {
                // Reduce gain briefly to suppress handling noise
                reductionDb = 24f
            }
        }

        // Spectral subtraction
        val alpha = 10.0.pow((reductionDb / 20f).toDouble()).toFloat() // over-subtraction factor
        val beta = 0.01f // spectral floor

        val processedMagnitude = FloatArray(halfSize + 1)
        for (k in 0 until halfSize + 1) {
            // Smooth noise estimate
            smoothedNoise[k] = smoothingAlpha * smoothedNoise[k] + (1f - smoothingAlpha) * noiseProfile[k]
            // Subtract noise
            val subtracted = magnitude[k] - alpha * smoothedNoise[k]
            // Spectral floor
            processedMagnitude[k] = kotlin.math.max(subtracted, beta * magnitude[k])
        }

        // Inverse FFT (simplified - use magnitude only)
        val output = FloatArray(fftSize)
        for (n in 0 until fftSize) {
            var sum = 0f
            for (k in 0 until halfSize + 1) {
                val angle = 2.0 * Math.PI * k * n / fftSize
                sum += processedMagnitude[k] * kotlin.math.cos(angle).toFloat()
            }
            output[n] = sum / fftSize
        }

        // Overlap-add (simplified)
        val outSample = output[0] * window[0] // Use first sample with window

        // Calculate gain reduction
        val gr = kotlin.math.abs(inL) - kotlin.math.abs(outSample)

        return Triple(outSample, outSample, gr) // Mono output
    }

    override fun reset() {
        noiseProfile.fill(0f)
        smoothedNoise.fill(0f)
        noiseCaptured = false
        noiseFrameCount = 0
        windEnergy = 0f
        handlingEnergy = 0f
        inputBuffer.fill(0f)
        outputBuffer.fill(0f)
        bufferIndex = 0
    }

    override fun getParams(): Map<String, Float> = mapOf(
        "reductionDb" to reductionDb,
        "smoothingMs" to smoothingMs,
        "windDetection" to if (windDetection) 1f else 0f,
        "handlingDetection" to if (handlingDetection) 1f else 0f,
        "noiseCaptured" to if (noiseCaptured) 1f else 0f
    )

    override fun setParam(key: String, value: Float) {
        when (key) {
            "reductionDb" -> reductionDb = value
            "smoothingMs" -> smoothingMs = value
            "windDetection" -> windDetection = value >= 0.5f
            "handlingDetection" -> handlingDetection = value >= 0.5f
        }
    }
}
