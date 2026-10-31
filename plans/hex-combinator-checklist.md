# Deep Checklist — Hex Combinator plugin (accounted, tested, verified)

Companion to `plans/hex-combinator-plugin.md`. Every item must be checked before
calling the plugin "done". OSS tooling noted where it cuts time.

## 0. OSS tooling to reuse (cut time, don't reinvent)

- [ ] `@soundtouchjs/core` + `stretch-phase-vocoder` — pitch/formant (already dep)
- [ ] `tone` (Tone.js) — LFO nodes, Transport, sync, scheduling (already dep)
- [ ] `meyda` — spectral features for auto-suggest (already dep)
- [ ] `wavesurfer.js` — waveform display for time-shaper (already dep)
- [ ] `zustand` — store (already dep)
- [ ] Web Audio `AudioWorklet` + `OfflineAudioContext` — DSP + render (native)
- [ ] `vitest` + `@vitest/coverage-v8` — tests (already)
- [ ] `playwright` — e2e (already)
- [ ] Consider: `scichart`/`d3`? No — use Canvas 2D for LFO (zero deps)
- [ ] Consider: `tone.Draw` for beat-synced UI scheduling
- [ ] Consider: `essentia.js` (WASM) for pitch/chroma auto-suggest (optional, v2)
- [ ] Reuse `src/audio/studioFx/primitives.ts` bit-exact DSP primitives

## Phase 0 — Foundations

### Types (`src/types.ts`)
- [x] `CombinatorMotionSource` union exported
- [x] `CombinatorLfoShape` interface
- [x] `CombinatorSlot` interface (all fields)
- [x] `ModRoute` interface
- [x] `CombinatorState` interface
- [x] `'combinator'` added to `ModuleType`
- [ ] `CombinatorState` added to `SoundLayer`? (if per-layer) — decide
- [x] tsc clean (`npm run lint`)

### Store (`src/store/combinatorStore.ts`)
- [x] store created with slots, routes, masterMix, bpm, tightMode, xyAssign, presetId, morphTargetPresetId, morphAmount
- [x] actions: addSlot, removeSlot, reorderSlots, updateSlot, setMotion, addRoute, removeRoute, updateRoute, setMasterMix, setBpm, setTightMode, setXyAssign, loadState, reset
- [ ] undo/redo? (optional v1)
- [x] unit tests ≥90% (5 tests passing)

### audioEngine integration
- [x] `setCombinator(state)` method (stub, stores state)
- [ ] combinator module in master rack routes through it
- [ ] bypass when empty (passthrough)
- [ ] unit test

### Rack entry (`src/components/StudioRack.tsx`)
- [x] module option added to MODULE_OPTIONS
- [x] opens CombinatorPanel (toolbar button)
- [x] type checks

### Panel shell (`src/components/CombinatorPanel.tsx`)
- [x] full-screen overlay component
- [x] slot list (vertical)
- [x] close button
- [x] renders without crash
- [ ] component test

### DSP skeleton (`src/audio/combinator/`)
- [x] `CombinatorProcessor.ts` with `processSampleInto` passthrough (single slot)
- [ ] `combinator.worklet.ts` (or reuse main thread for v0)
- [x] primitives reuse verified
- [x] unit test passthrough

## Phase 1 — DSP core

### Per-slot processing
- [ ] module instantiation from combinator module id
- [ ] configure from slot params
- [ ] processSampleInto chain
- [ ] bypass when disabled
- [ ] mix (dry/wet per slot)
- [ ] pre/post gain
- [ ] polarity invert
- [ ] unit tests

### Multiband
- [x] Linkwitz-Riley-ish 4th-order crossover (Multiband.ts) — approx
- [x] 3-band split/merge integrated into processor (per-band effect)
- [x] per-band enable
- [ ] crossover freq params
- [ ] unit tests (crossover flat sum)

### Motion sources
- [ ] Macro: global dial + per-slot curve
- [x] LFO: table (256 pts), preset shapes, draw points, interp modes (Lfo.ts)
- [x] LFO: sync/free rate via phase inc (basic)
- [x] LFO: phase offset, stereo offset, retrigger, free-run (basic)
- [x] Follower: attack/release (Follower.ts)
- [ ] Follower: sensitivity, range, curve, hold
- [ ] Sidechain: external input selector
- [ ] Gate: MIDI note / audio transient / manual
- [x] Sequencer: steps, glide (Sequencer.ts)
- [ ] Sequencer: 1–32 steps UI
- [x] XY: 2D output (CombinatorXYPad.tsx, CombinatorScreenMode.tsx)
- [ ] Evolution: drives params over time
- [x] unit tests per source (Lfo, Follower)

### Modulation matrix
- [x] routes list management (store)
- [x] application (ModMatrix.ts) — amount/polarity/curve
- [ ] smoothing (SmoothValue) per param
- [ ] unit tests

### Master
- [ ] masterMix crossfade
- [ ] master bypass click-free
- [ ] latencySamples reported
- [ ] unit tests

### Parity
- [ ] golden vector test (combinator processor vs expected)
- [ ] passes on Windows + constrained env

## Phase 2 — UI

### Desktop
- [ ] CombinatorPanel full layout (slots | params+motion | mod matrix+master)
- [x] CombinatorLfoEditor canvas (draw, snap, preset shapes)
- [ ] CombinatorModMatrix grid
- [ ] CombinatorPresetBrowser (search/tags/favorites)
- [ ] CombinatorXYPad (reusable)
- [ ] component tests

### Mobile (field)
- [ ] full-screen modal
- [ ] swipe between slots
- [ ] bottom sheets for params
- [ ] XY fills screen in screen mode
- [ ] touch targets ≥44px
- [ ] haptics on snap
- [ ] component tests

### Screen mode
- [ ] CombinatorScreenMode component
- [ ] landscape layout
- [ ] 4 macro buttons
- [ ] preset morph wheel
- [ ] record touch to automation
- [ ] component tests

## Phase 3 — Presets & randomizer

### Preset system
- [x] schema defined (combinatorPresets.ts)
- [x] loader (embedded array)
- [x] search (searchPresets)
- [x] tags
- [ ] favorites (Dexie)
- [ ] recent
- [ ] A/B compare
- [ ] morph (crossfade all params)
- [ ] "surprise me"
- [ ] unit tests (round-trip, search)

### Preset authoring
- [x] 75 deep-variety presets (real tricks/FX/hardware combos)
- [ ] generate candidates via randomizer+evolution
- [ ] curate to ~400
- [ ] categories & counts (§3.8)
- [ ] each has theoryNote
- [ ] preset count verified ≥400

### Randomizer
- [ ] per-slot + global
- [ ] section locks (reuse SectionLocks pattern)
- [ ] intensity 0..1
- [ ] evolve vs fresh
- [ ] unit tests (lock respect)

### Theory
- [ ] theory notes file
- [ ] auto-suggest from Meyda features
- [ ] unit tests

## Phase 4 — Evolution & reshapers

### Evolution
- [x] combinatorEvolution.ts mutates CombinatorState into variants
- [ ] variant grid reuse (8 variants)
- [ ] survivors breeding pool
- [ ] gene freezes
- [ ] unit tests

### Reshapers
- [ ] Reshaper module (spectral fold/wavefold/bitcrush/aliasing/downsampling)
- [ ] "mangle" button randomizes internal curves
- [ ] unit tests

## Phase 5 — Automation, lock/snap, XY record

### Automation
- [ ] all combinator params automatable
- [ ] lanes in automation.ts
- [ ] record from XY/macro/LFO
- [ ] edit in existing lane UI
- [ ] smart automation curves in presets
- [ ] unit tests

### Lock & snap
- [ ] slot.locked respected by randomizer/evolution
- [ ] snapParam quantization
- [ ] LFO phase snap
- [ ] sequencer boundary snap
- [ ] delay musical division snap
- [ ] tight mode toggle
- [ ] unit tests

### XY record
- [x] arm → write trajectory to lane (store xyRecording/xyTrajectory)
- [ ] unit tests

## Phase 6 — Backend processing presets + render

- [ ] Produce tier presets (full chains + automation)
- [ ] one-tap apply
- [x] offline render to layer (combinatorRender.ts)
- [ ] reuse renderChain pattern
- [ ] unit tests

## Phase 7 — Polish, tests, coverage

- [ ] boundary check (`npm run boundary:check`) — engine never imports React/Tauri/state
- [ ] lint clean
- [ ] unit tests all pass
- [ ] coverage ≥90% new code (`npm run coverage:check`)
- [ ] e2e smoke: load preset → non-silent output
- [ ] e2e: XY record writes lane
- [ ] manual device test on phone (S25)
- [ ] changelog entry
- [ ] evidence file (ecosystem audit) if applicable

## Verification commands

```bash
cd ncsoundlab-main
npm run lint
npm test
npm run boundary:check
npm run test:coverage && npm run coverage:check
npm run test:e2e
```

## Definition of done

- All checkboxes above checked.
- No dead controls in combinator UI (audit).
- Preset count ≥400 verified.
- Performance: mobile single-slot process <1ms/frame (profiled on S25).
- One end-to-end run documented on phone.
