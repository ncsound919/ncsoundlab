# NC Sound Lab — Web Audio Upgrades from Open-Source Research

**Date:** 2026-08-15 · **Sources:** web.dev "A tale of two clocks" (Chris Wilson), Tone.js wiki (Accurate Timing / Performance), Chrome "Audio worklet design pattern" (Hongchan Choi), Paul Adenot's Web Audio perf notes, GitHub patterns (Tone.js Transport, audio-worklet recorder processors, tether-synth, makeloops).

Maps research → concrete upgrades for the shakiest parts of the build.

---

## 1. Sequencer timing (shakiest) — DONE ✅

**Problem:** the Tone transport path fired notes immediately in the JS callback and applied swing/groove/pocket offsets with `setTimeout` (a JS-clock offset — jittery and drifts under main-thread load). The setInterval fallback did the same.

**Research:**
- *A tale of two clocks*: schedule Web Audio events on the **audio clock** (`AudioContext.currentTime`), not JS timers. setTimeout callbacks can be skewed tens of ms by layout/GC/render.
- *Tone.js Accurate Timing*: **must pass the transport `time` into the scheduled event** (`player.start(time)`, `triggerAttackRelease(note, dur, time)`). Firing `player.start()` with no time = INCORRECT.
- *Tone.js Performance*: schedule ~100ms ahead; `context.lookAhead` default 0.1s.

**Fix shipped:**
- `audioEngine.triggerLayer(layer, duration?, chokeKey?, when?)` — schedules at `when` (audio clock) or now.
- `SoundLayerPlayer.playNote(..., when?)` — same.
- `StudioSequencer` Tone path now schedules every note at `time + offsetMs/1000` on the **audio clock**, clamping negative (pushed) offsets to the step time. No more setTimeout for swing.
- setInterval fallback now also schedules at `ctx.currentTime + offset` when possible.
- Offset math extracted to pure `stepOffsetSeconds()` in `sequencerHelpers.ts` (unit-tested: swing/groove/pocket/clamp).
- Tests: `triggerLayer` uses passed time (7.5) / defaults to currentTime (1); new `StudioSequencer.scheduling.test.tsx` mounts the sequencer with a mocked `tone` + transport, drives the Tone.Sequence callback and the setInterval fallback, and asserts notes land at `time + offset` on the audio clock. ✅

**Result:** swing/humanize/groove/pocket land sample-accurately; notes stay tight even when the main thread stalls.

---

## 2. Recording: MediaRecorder → AudioWorklet (recommended next) ⏳

**Problem:** capture uses `MediaRecorder` (webm/opus blob) → decode. Adds latency, is lossy, and `stop()` can hang (already hardened with a timeout).

**Research:**
- Chrome "Audio worklet design pattern": a recorder is the canonical AudioWorklet use case. `AudioWorkletProcessor.process()` runs on the audio thread, buffers 128-frame quanta, and posts raw `Float32Array` PCM to the main thread — no MediaRecorder latency/compression, no decode step.
- Real implementations: `class RecorderProcessor extends AudioWorkletProcessor` (tether-synth, node-CarPlay, professional-services) — accumulate frames, `port.postMessage` chunks, ring-buffer for buffer-size mismatch.

**Recommended upgrade:** add an AudioWorklet-based `createWorkletRecorder()` in `src/audio/transport/` that returns an `AudioBuffer` directly (mono/stereo, 48kHz) instead of a Blob. Wire `TakesRecorder` + `StudioSequencer` to prefer it when `audioWorklet.addModule` is available; keep MediaRecorder as fallback. Big win: loop-recording + punch-in become lossless and lower-latency.

**Effort:** M · **Risk:** low (additive, fallback preserved).

---

## 3. Reverb CPU (ConvolverNode is the most expensive node) ⏳

**Problem:** the app builds a Convolver-based reverb path (`ConvolutionReverbDSP`) plus the lighter Schroeder delay-line reverb (`createSchroederReverbNode`).

**Research (Paul Adenot's perf notes):**
- `ConvolverNode` = **very expensive**; multiple FFTs per block; copies the impulse buffer; bursts on some browsers.
- Cheaper reverb = **delay lines + all-pass + low-pass** (i.e. the Schroeder structure already in the codebase) — convincingly reverby, parameterizable, no convolution.

**Recommended:** make the Schroeder delay-line reverb the default live reverb for every layer (it already is the per-layer path), keep Convolver only for the Compare Engine's reference A/B and offline renders. Add a `latencyHint: "playback"` option on the AudioContext for sustained playback.

---

## 4. AudioParam event hygiene (micro-optimization) ⏳

**Research (perf notes):** a hot envelope can insert 280 AudioParam events/minute; non-Gecko engines linearly scan the event list. Creating fresh nodes for recurring envelopes avoids list growth.

**Status:** the engine already reuses per-trigger chains (createNodeChain) and now disconnects them on end — this is already the recommended "new node per hit" pattern, which is good. No change needed; noted for when envelope-heavy patterns cause artifacts.

---

## 5. Visual sync: use the audio clock for drawing, not the timer ⏳

**Research (A tale of two clocks / Tone.js Performance):** visuals should be driven from the **audio clock** via `requestAnimationFrame`, not from transport callbacks. Tone.js exposes `Tone.Draw.schedule(fn, time)` to run a draw callback on the nearest rAF to the audio time.

**Status:** the sequencer already uses `Tone.Draw.schedule(() => setCurrentStep(stepIdx), time)` for the step indicator ✅. The meter rAF loops (MasterMeter, LayerMixer, CompareEngine) already sample the analysers each frame ✅. No change needed.

---

## 6. Lookahead / latencyHint (free win) ⏳

**Research (Tone.js Performance):** `new Tone.Context({ latencyHint: "playback" })` prioritizes sustained playback over latency; scheduling ahead reduces pops.

**Recommended:** create the AudioContext with `latencyHint: 'interactive'` for the live engine (needed for real-time pads) but consider `'playback'` for the Compare Engine's A/B reference and offline mixdown to reduce pops on long sessions.

---

## Priority order

| # | Upgrade | Effort | Impact | Status |
|---|---|---|---|---|
| 1 | Sample-accurate scheduling (audio-clock `when`) | S | High (timing) | ✅ shipped |
| 2 | AudioWorklet recorder | M | High (loop/punch-in quality + latency) | next |
| 3 | Schroeder reverb as default; Convolver for offline/compare only | S | Med (CPU on constrained machines) | next |
| 4 | latencyHint tuning | S | Low-Med | next |
| 5 | AudioParam hygiene | — | none (already good) | n/a |
| 6 | Audio-clock visual sync | — | none (already good) | n/a |

---

*Owner: founder · Update as each upgrade lands · Companion to the audit in `docs/AUDIT.md`*
