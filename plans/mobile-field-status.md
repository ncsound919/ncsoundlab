# Mobile Field Build — Status

Last updated after the engine pass. The earlier version of this file listed
scaffolding as if it were finished: `pitchDetection` returned a hardcoded 440 Hz,
`onsetSlicer` returned two fake slices, `genome.ts` did not compile (it imported a
`./layers` module that does not exist and had a syntax error), `dspCleanup`'s
"spectral denoise" was a no-op stub, and nothing had tests. That is corrected
below.

## Verified now (typecheck + tests)

`npm run lint` clean (`tsc --noEmit`), `npm run boundary:check` clean (17 files scanned, 0 errors, 0 warnings), and 275 tests across 17 files green (`npx vitest run src/lib/mobile src/audio/mobile src/components/field`).

### Enhanced Genetic Evolution Engine

- `src/lib/mobile/genome.ts`:
  - **Directional Evolution Targets** (`EvolutionTarget`): `'balanced'`, `'sub-bass'`, `'snappy-transient'`, `'lofi-crunch'`, `'ambient-cloud'`, `'diverse'`. Biases mutation distribution toward targeted acoustic archetypes.
  - **Category Gene Freezes** (`GeneLocks`): Granular locks for `filter`, `pitch`, `layers`, `grain`, `crush`, `drive`, `tremolo`, `envelopes`, and `transient`. Preserves dialed-in parameters while exploring other sonic dimensions.
  - **Multi-Parent Pool Crossover** (`poolCrossover`): Combines genetic parameters across arbitrary parent pools ($N \ge 2$) with deterministic RNG.
  - **Genetic Distance Metric** (`genomeDistance`): Normalized multi-dimensional parameter distance ($0..1$) capturing true sound-design variance between variants.
- `src/lib/mobile/variantGrid.ts`:
  - **Greedy Pairwise Diversity Selection**: Generates an oversampled candidate pool ($1.5\times$ target count) and greedily selects candidates maximizing pairwise `genomeDistance`, preventing sibling clumping.
  - **Multi-Parent Pool Breeding** (`breedPool`): Evolves a new generation from all kept variants in the pool, tracking generational lineage (`generation` counter).
  - **Telemetry Metric** (`meanGridDiversity`): Computes real-time diversity score of visible slots.
- `src/components/field/VariantGridTouch.tsx`:
  - Evolution Objective selector chips (Balanced, Sub Bass, Snappy, Lo-Fi, Ambient, Diverse).
  - Gene Freezes drawer with 6 categorical parameter locks.
  - Multi-Parent Pool Breeding button (`Pool Breed (N)`).
  - Live Generation badge and Diversity spread telemetry readout.
  - Swipe right to Keep, swipe left to Trash touch gestures.
- `src/components/field/FieldStudio.tsx`:
  - Evolution target and gene lock state bindings.
  - Pool breeding pipeline rendering audio and updating grid generation.

### Shared DSP

- `src/audio/dsp/spectralFlux.ts` — spectral-flux curve + adaptive peak picking
  on raw `Float32Array`. `src/audio/onsetDetection.ts` now delegates to it, so the
  desktop slicer and the field slicer run one detector (behaviour preserved: the
  existing six onset tests still pass).
- `src/audio/mobile/analysis.ts` — peak/RMS/crest/DC/clipping/silence/attack/tail,
  spectral centroid, rolloff, band shares, and flux; `spectralDistance` +
  `isNearDuplicate` for grid diversity; `autoFilterIssues` for the pre-view
  filter; `suggestSubLayer` ("thin low end → add sub at N Hz, weight W").

### Capture path

- `src/audio/mobile/captureSpec.ts` — capture planning from device facts:
  `UNPROCESSED` with `MIC` fallback, Bluetooth microphones refused (narrowband),
  USB allowed with a latency note, sample-rate substitution, `float32 → int24`
  fallback, RECORD_AUDIO gating, storage/battery preflight, and the declared
  `microphone|dataSync` service types plus Android 14 permissions.
- `src/audio/mobile/preRoll.ts` — allocation-free pre-roll ring buffer, take
  assembler (pre-roll + streamed chunks, hard length cap, lead-in fade), transient
  lock and attack-preserving blend.
- `src/audio/mobile/wavCodec.ts` — 32-bit float / 32-bit int / 24-bit / 16-bit WAV
  encode + decode, chunk-walking parser (handles `LIST` and
  `WAVE_FORMAT_EXTENSIBLE`). Reuses the existing `aafPcm` quantisers, so there is
  one 16/24-bit quantiser in the codebase.

### Slicing, cleanup, tuning

- `src/audio/mobile/onsetSlicer.ts` — onset slices with pre-roll padding, gap,
  short-slice merge, long-slice split (also on the no-onset path), edge trimming
  and click-free cut-out. Deterministic.
- `src/audio/mobile/dspCleanup.ts` — DC block, 2nd-order Butterworth low cut,
  de-click (slope-reversal detection + interpolation), STFT denoise (zero-padded,
  noise profile from the quietest frames, gain floor, skipped when there are no
  noise-only frames), gate with hysteresis/hold/smooth gain, raised-cosine fades,
  peak normalise — plus a report of what each step did and `suggestCleanupParams`.
- `src/audio/mobile/pitchDetection.ts` — YIN with dip selection (a plain
  threshold crossing reads ~3% sharp on tones), note/cents conversion, Catmull-Rom
  resampling, tune-to-root with a cents clamp, kit root from slice medians.

### Variants and kit

- `src/lib/mobile/genome.ts` — one typed schema for every parameter, deep-partial
  construction, generic clamping that drops unknown keys, deterministic
  `mulberry32`/`deriveSeed`, mutation that respects the transient lock, per-gene
  crossover, stable serialisation (~0.5 KB), and `genomeJsonSchema()` +
  `applyGenomeEdits()` — the constrained-decoding contract and the validator the
  assistant's edits must pass. Audio is never touched here.
- `src/lib/mobile/variantGrid.ts` — deterministic rounds from `deriveSeed`,
  preview attachment, auto-filter rejection, near-duplicate diversity, keep/trash,
  breeding from two keeps, round-robin export, and a parameter-spread measure.
  Replaces the old `swipeGrid.ts`.
- `src/lib/mobile/fieldMeta.ts` — one canonical `FieldMeta`, place+time seeds,
  deterministic cover-art parameters (hue from place, lightness from hour), take
  naming.
- `src/lib/mobile/storageAdapter.ts` — metadata store + audio file IO injected
  (memory and Dexie-table backends), save/load/delete, and the boundary-shaped
  `StorageAdapter` view.
- `src/lib/mobile/fieldKit.ts` — kit manifest with per-slice serialized genomes and
  named round-robin groups; parse/validate; Pro Tools-safe file names.
- `src/lib/mobile/engineBoundary.ts` + `scripts/check-engine-boundary.ts` — the
  portability rule, enforced: no React/Tauri/state-library imports, no
  self-constructed AudioContext, no runtime Dexie, DOM access as a warning. Wired
  as `npm run boundary:check` (errors fail the run).

## Deliberate deviations from the original plan

- **Meyda is not used in the mobile engine.** Its feature extractor needs an
  `AudioContext` and is not deterministic offline in Node; the engine needs
  identical numbers in the web build, in tests and in a later native port. The
  FFT-based analysis here is pure and unit-tested. Meyda stays in the desktop app.
- **SoundTouch is not used for tuning slices.** Stretch-for-time-preservation is
  right for loops, wrong for one-shots: a field slice is tuned by resampling, and
  the cents clamp stops it from becoming a different sound. SoundTouch remains
  available for full-length material.
- **The engine lives in `src/audio/mobile` + `src/lib/mobile`, not a workspace
  package yet.** The boundary is enforced by the script; promotion to
  `@ncsoundlab/engine` is a later, mechanical step.

### Phone Beat & DAW Interchange

- `src/lib/mobile/ncbeatBridge.ts` — `.ncbeat` container generation conforming to `ncbeat.v1`
  spec (matches `C:\Users\tap45\Downloads\phone beat\NCBEAT_FORMAT.md`). Generates
  `manifest.json`, `drum.v1` 16-step `pattern.json`, v2 `mixer.json`, `stems/master.wav` loop,
  and 48 kHz mono `samples/pad00.wav`..`pad15.wav`. Slices recorded in the field can be
  loaded directly into NC Phone Beat pads.
- `src/lib/mobile/fieldAssistant.ts` — offline grammar-constrained sound design assistant.
  Translates language/intents (808 sub kicks, snappy clap/snares, 12-bit lo-fi crunch,
  granular scatter) into parameter mutations bounded by `GENOME_SCHEMA` and validated with
  `applyGenomeEdits()`.

### Mobile Touch UI Components

- `src/components/field/FieldWaveform.tsx` — canvas-rendered amplitude waveform with
  slice boundary regions, pre-roll transient indicator, interactive tap-to-select, and
  real-time playhead.
- `src/components/field/SliceEditor.tsx` — YIN pitch detection (`detectPitchHz`, `hzToNote`),
  one-click tonic root lock (`tuneToRoot`), acoustic sub-layer injection (`suggestSubLayer`),
  and cleanup DSP sliders.
- `src/components/field/VariantGridTouch.tsx` — 8-slot touch/swipe grid with swipe-right
  keep, swipe-left trash, transient attack lock slider, layer tweaking drawer, and breeding.
- `src/components/field/FieldAssistantModal.tsx` — on-device AI sound designer dialog
  with instant audition preview before applying edits to working variant.
- `src-tauri/mobile/android/CaptureService.kt` + `AndroidManifest.snippet.xml` — native
  Android 14 foreground capture service with declared `microphone|dataSync` types,
  `UNPROCESSED` probing, Bluetooth mic rejection, and `ENCODING_PCM_FLOAT` streaming.

## Remain

1. **Tauri Android shell verification on device** (`tauri android init`, capabilities for `microphone` + `dataSync`, release manifest without `INTERNET`).
2. **On-device llama.cpp GGUF optional runner** (when GGUF runtime is bound in Tauri/NDK; pure offline rule engine is active and functional now).
3. **USB class-compliant input** (phase 2, hardware interfaces).
