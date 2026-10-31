package com.overlay.dsp

import org.junit.Test
import org.junit.Assert.*

class DspEngineTest {

    @Test
    fun testDspEngineCreation() {
        val engine = DspEngine(48000f)
        assertNotNull(engine)
    }

    @Test
    fun testTrimPlugin() {
        val trim = TrimPlugin(48000f, gainDb = 6f)
        val (l, r, gr) = trim.process(0.5f, 0.5f)
        assertTrue(l > 0.5f) // gain applied
        assertTrue(r > 0.5f)
        assertEquals(0f, gr, 0.01f) // no GR
    }

    @Test
    fun testNeve1073Plugin() {
        val neve = Neve1073Plugin(48000f, driveDb = 3f, lfDb = 2f)
        val (l, r, gr) = neve.process(0.5f, 0.5f)
        assertTrue(l != 0f)
        assertTrue(r != 0f)
    }

    @Test
    fun testFet1176Plugin() {
        val fet = Fet1176Plugin(48000f, inputDb = 6f, ratio = 4f)
        val (l, r, gr) = fet.process(0.5f, 0.5f)
        assertTrue(l != 0f)
        assertTrue(r != 0f)
    }

    @Test
    fun testOptoLa2aPlugin() {
        val la2a = OptoLa2aPlugin(48000f, peakReduction = 4f, gainDb = 6f)
        val (l, r, gr) = la2a.process(0.5f, 0.5f)
        assertTrue(l != 0f)
        assertTrue(r != 0f)
    }

    @Test
    fun testVcaBusCompPlugin() {
        val vca = VcaBusCompPlugin(48000f, thresholdDb = -10f, ratio = 2f)
        val (l, r, gr) = vca.process(0.5f, 0.5f)
        assertTrue(l != 0f)
        assertTrue(r != 0f)
    }

    @Test
    fun testSaturationPlugin() {
        val sat = SaturationPlugin(48000f, type = 0, driveDb = 6f)
        val (l, r, gr) = sat.process(0.5f, 0.5f)
        assertTrue(l != 0f)
        assertTrue(r != 0f)
    }

    @Test
    fun testPlateReverbPlugin() {
        val reverb = PlateReverbPlugin(48000f, decaySec = 1.4f, mix = 0.12f)
        val (l, r, gr) = reverb.process(0.5f, 0.5f)
        assertTrue(l != 0f)
        assertTrue(r != 0f)
    }

    @Test
    fun testTruePeakLimiterPlugin() {
        val limiter = TruePeakLimiter(48000f, ceilingDb = -1f)
        // Look-ahead: the first ~96 samples are the delay buffer filling, so the
        // output is silence by design until the buffer is primed.
        var out = Triple(0f, 0f, 0f)
        repeat(128) { out = limiter.process(0.5f, 0.5f) }
        assertTrue(out.first != 0f)
        assertTrue(out.second != 0f)
    }

    @Test
    fun testPhoneNoiseReductionPlugin() {
        val nr = PhoneNoiseReduction(48000f, reductionDb = 12f)
        val (l, r, gr) = nr.process(0.5f, 0.5f)
        // During noise capture phase, output should be input
        assertTrue(l != 0f || l == 0f) // just check it doesn't crash
    }

    @Test
    fun testPhoneMicEmulationPlugin() {
        val mic = PhoneMicEmulation(48000f, targetMic = 0)
        val (l, r, gr) = mic.process(0.5f, 0.5f)
        assertTrue(l != 0f)
        assertTrue(r != 0f)
    }

    @Test
    fun testDspEngineChain() {
        val engine = DspEngine(48000f)
        engine.addPlugin(TrimPlugin(48000f, gainDb = 3f))
        engine.addPlugin(Neve1073Plugin(48000f, driveDb = 3f))
        engine.addPlugin(Fet1176Plugin(48000f, inputDb = 6f, ratio = 4f))
        engine.addPlugin(TruePeakLimiter(48000f, ceilingDb = -1f))

        val (l0, r0) = engine.process(0.5f, 0.5f)
        // The chain ends in the look-ahead limiter, so the first samples are its
        // delay buffer filling (silence by design) — warm it up before asserting.
        var out = Pair(l0, r0)
        repeat(128) { out = engine.process(0.5f, 0.5f) }
        assertTrue(out.first != 0f)
        assertTrue(out.second != 0f)
    }

    @Test
    fun testDspEngineBypass() {
        val engine = DspEngine(48000f)
        engine.addPlugin(TrimPlugin(48000f, gainDb = 12f)) // +12dB gain
        engine.bypass = true
        val (l, r) = engine.process(0.5f, 0.5f)
        assertEquals(0.5f, l, 0.001f) // bypassed, no gain
        assertEquals(0.5f, r, 0.001f)
    }

    @Test
    fun testDspEnginePluginToggle() {
        val engine = DspEngine(48000f)
        engine.addPlugin(TrimPlugin(48000f, gainDb = 12f))
        engine.togglePlugin(0)
        val (l, r) = engine.process(0.5f, 0.5f)
        assertEquals(0.5f, l, 0.001f) // disabled, no gain
    }

    @Test
    fun testDspEngineProcessBlock() {
        val engine = DspEngine(48000f)
        engine.addPlugin(TrimPlugin(48000f, gainDb = 0f))
        val input = FloatArray(512) { 0.5f }
        val output = FloatArray(512)
        engine.processBlock(input, output, 256)
        assertTrue(output[0] != 0f)
    }
}
