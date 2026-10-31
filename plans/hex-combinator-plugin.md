# Plan — "Hex Combinator" multi-effect modulation plugin for NC Sound Lab

Status: **research + plan only** (no code yet). Owner: soundlab. Date: 2026-10-29.
Companion to: `plans/workstation-roadmap.md`, `src/audio/studioFx/*`, `src/lib/evolutionEngine.ts`,
`src/lib/soundPresets.ts`, `src/components/SmartRandomizerModal.tsx`.

## 0. Vision

Add a single, self-contained **multi-effect modulation combinator** ("Hex Combinator",
working name) to the Sound Lab that behaves like a mash-up of:

- **Serato Hex FX** — 6 chainable effect slots, 50+ effects, central macro "Hex Dial",
  200+ presets, per-slot LFO modulation, Infinity Flanger-style endless sweeps.
- **Cableguys ShaperBox 3** — drawable LFO shapes per effect, 3-band multiband,
  envelope followers, audio triggering, time-shaper stutter/reverse, pitch/formant.
- **Baby Audio Transit 2** — 7 effect slots, 6 motion modes (Macro / LFO / Follower /
  Sidechain / Gate / Sequencer), 28 modules, 800+ presets, transition design.

…plus Sound Lab's own superpowers: **Smart Randomizer** (section locks), **Evolution
Engine** (seeded mutations), **Chaos Synth DSP** (ZDF ladder, wavefolding, bitcrush,
granular scatter), and the **mobile field capture engine**.

The plugin's job: make intricate sound-design moves **one tap / one swipe** away on a
phone, with all the heavy DSP and preset logic running as *backend processing presets*
so the user never has to be meticulous on a small screen. BPM lock + snap keeps
everything tight; an **XY pad** in screen mode shifts sound in real time.

## 1. Research summary — what each reference does well

### Serato Hex FX
- 6 effect slots, reorderable, each loads any of 50+ effects in 13 categories
  (Bit Crush, Braker, Compression, Delay, Distortion, Filter, Lo-Fi, Modulation,
  Repeater, Reverb, Saturation, Shapers, Time Stretch).
- **Hex Dial** = one macro that drives curves across all slots simultaneously
  (drawn per-preset movement curves).
- Per-effect LFO: sync/free rate, shape, depth, stereo; some effects have
  "Infinity" variants with endless rise/fall.
- Brakers (back spin, pitch brake, roll, lo-fi braker) are the unique DJ-flavored
  effects — perfect for "synth mangling".
- Repeater / Time Stretch / Half Time give glitch/stutter.
- 200+ presets, many artist signature.

### ShaperBox 3
- 11 Shapers (Pitch, Reverb, Time, Drive, Noise, Liquid, Filter, Crush, Volume,
  Pan, Width) + separate multiband compressor.
- Every Shaper: **drawable LFO** (points/curves/steps), 3 frequency bands each
  with its own LFO + envelope follower, audio triggering, MIDI triggering,
  external sidechain overlay.
- TimeShaper: stutter, reverse, slow-mo, tape stop.
- PitchShaper: formant + 4 pitch algorithms.
- Oscilloscope + waveform display locked to beats.

### Transit 2
- 7 effect slots, 28 modules, 6 motion modes: Macro / LFO / Follower / Sidechain /
  Gate / Sequencer.
- Follower: FX follows input dynamics (ducking, pumping, but any param).
- Sidechain: FX follows an external signal (multidimensional sidechain).
- Gate: instant FX motion for live performance.
- Sequencer: DAW-synced transitions with one click.
- 800+ presets by Andrew Huang + community.
- Master Mix morphs dry↔wet.

### Cross-cutting patterns to adopt
1. **Slots + modules** (reorderable chain, each slot picks a module).
2. **One master motion source per slot** (Macro knob / LFO / Follower / Sidechain /
   Gate / Sequencer) that modulates any param of that slot's module.
3. **Drawable LFO shapes** with snap-to-grid / quantize.
4. **Multiband** (3 bands) per slot.
5. **Envelope follower + sidechain** as modulation sources (not just ducking).
6. **Preset = full chain state + motion curves + macro mapping**.
7. **Master Mix** dry/wet morph.
8. **BPM sync everywhere** (rates in beats, delays in ms+sync).

## 2. Sound Lab assets we reuse (do not reinvent)

- `src/audio/studioFx/*` — StudioFxChainProcessor, StudioModule interface,
  catalog.json, primitives (Biquad, Oversampler, PeakEnvelope, SmoothValue),
  modulesEq/Dynamics/ColorSpace. **Reuse as the per-slot DSP substrate.**
- `src/lib/evolutionEngine.ts` — seeded mutation pipeline; reuse for
  "Evolve preset" button.
- `src/lib/soundPresets.ts` — existing preset patterns.
- `src/components/SmartRandomizerModal.tsx` — section locks + intensity; reuse
  for "Randomize combinator" with locks per slot/modulation.
- `src/lib/chaosSynth.ts`, `src/lib/audioUtils.ts` (`safeAudioValue`).
- `src/lib/automation.ts` — existing automation lanes; extend with combinator
  params.
- `src/lib/genome.ts`, `src/lib/variantGrid.ts` — field evolution.
- `src/store/rackStore.ts`, `src/lib/audioEngine.ts` — master rack integration.
- Mobile capture + cleanup DSP in `src/audio/mobile/*`.

## 3. Feature set (the plugin)

### 3.1 Core: slots & modules
- **6 slots** (configurable 4–8), reorderable drag-and-drop, each slot:
  - module picker (from a combinator module catalog, see §6)
  - enable/bypass, mix (dry/wet per slot), pre/post gain, polarity
  - per-slot 3-band split (low/mid/high) with crossover freqs, each band
    independently enableable
- **Master Mix** slider morphs whole chain dry↔wet.
- **Master Bypass** click-free.
- **Latency compensation** reported via `latencySamples` (already in
  StudioModule).

### 3.2 Motion engine (the "modulation combinator" heart)
Each slot has one **Motion Source** chosen from:
- `MACRO` — driven by the global Hex Dial + per-slot curve (Serato style)
- `LFO` — drawable shape, sync/free rate, phase, depth, stereo offset
- `FOLLOWER` — envelope follower on input (attack/release, range, curve)
- `SIDECHAIN` — envelope follower on external input
- `GATE` — instant trigger (MIDI note / audio transient / manual button)
- `SEQUENCER` — step sequencer (1–32 steps) with per-step value + glide
- `XY` — 2D pad (X→param A, Y→param B) with smoothing + record-to-automation
- `EVOLUTION` — Sound Lab evolution engine drives params over time (unique)

Each motion source outputs a normalized 0..1 (or -1..1) signal that can be
**routed to any param of any slot** via a modulation matrix (source × destination
with amount + polarity + curve). This is the "combinator": N sources × M params.

Modulation matrix UI: a compact grid (sources as rows, params as columns) with
drag-to-assign and amount knobs; overflow params scroll.

### 3.3 LFO shapes
- Preset shapes: sine, tri, saw up/down, square, pulse (duty), random S&H,
  random smooth, exponential, logarithmic.
- **Draw mode**: click/drag to add points; curve interpolation (linear / smooth
  / step / spline); snap to grid (time grid = 1/16 beat, value grid = 0.05).
- Per-band LFO (3 independent) when multiband enabled.
- Phase offset, stereo phase, retrigger (on note/transient), free-run.

### 3.4 Envelope follower / sidechain
- Input level → param, with attack/release, sensitivity, range, curve (linear /
  exponential / log), hold.
- Sidechain input selector (from master mix, from a chosen layer, or external).
- Multiband: follower per band.

### 3.5 Time manipulation (ShaperBox TimeShaper style)
- Stutter (1/4, 1/8, 1/16, 1/32, triplets), reverse, half-time, tape-stop,
  scratch, granular scatter (reuses chaos synth granular).
- All sync-locked to BPM with snap.

### 3.6 Pitch / formant
- Pitch shift ±24 st with formant preserve, 4 algorithms (complex/vocals/drums/
  vintage) — reuse `@soundtouchjs`.
- Pitch LFO for vibrato/wobble.

### 3.7 Reshapers (Sound Lab originals)
- **Reshaper**: spectral fold / wavefold / bitcrush / aliasing / downsampling —
  the evolution engine's FX primitives exposed as a module with intensity +
  "mangle" button that randomizes internal curves.
- **Randomizer**: per-slot and global, with section locks (reuse
  `SectionLocks` pattern), intensity 0..1, "evolve" (mutate) vs "randomize fresh".
- **Evolution button**: runs `generateEvolutionVariations` on the current chain
  state, presents 8 variants in a swipe grid (mobile) / grid (desktop), keeps
  survivors for breeding (reuses variantGrid).

### 3.8 Presets
- **Tremendous set**: target ~400 presets at launch (Hex 200 + Transit 800-scale
  ambition, but curated). Categories:
  - Movement (pumps, wobbles, gates) — 60
  - Transitions (builds, drops, sweeps) — 60
  - Glitch / stutter / mangling — 60
  - Vocal / instrument FX — 40
  - Lo-fi / degradation — 40
  - Space / reverb tails — 40
  - Bass design (wobble, growl, reese) — 40
  - Drums (transient shaping, groove) — 30
  - Ambient / pads — 30
- Each preset: chain slots + params + motion sources + mod matrix + macro curves +
  BPM + tags + author + "theory note" (short sound-design rationale).
- Preset browser: search, tags, favorites, recent, "surprise me", A/B.
- Backend processing presets: "Produce" presets that bake a full intricate chain
  (e.g. "Vocal Polish", "Drum Bus Glue", "Bass Growl") so one tap yields a
  finished sound — no meticulous tweaking.

### 3.9 Sound design theory baked in
- Presets tagged with theory concepts: sidechain pumping (1/4 note), Haas width,
  comb filtering, formant, spectral centroid, crest factor, etc.
- A "Why this works" tooltip per preset (1–2 sentences) — educational.
- Auto-suggest: given input analysis (Meyda features: RMS, ZCR, spectral
  centroid, rolloff), suggest 3 presets.

### 3.10 Lock & snap (BPM tight)
- Global BPM from transport; all rates/delays/sequencers sync.
- **Lock**: pin a slot or param so randomize/evolve won't touch it (padlock icon).
- **Snap**: quantize LFO phase / step boundaries to beat grid; delays to
  musical divisions; stutter to grid.
- "Tight mode": forces all time-based params to nearest musical division.

### 3.11 XY screen-mode sound shifting
- Full-screen XY pad (landscape on phone, any size on desktop) where:
  - X axis = user-assignable param (default: filter cutoff)
  - Y axis = user-assignable param (default: modulation depth)
  - Multi-touch: second finger = secondary XY (filter resonance / wet mix)
  - Trails + visual feedback; motion can be **recorded to automation lane**
    (touch → automation write).
- "Sound shifting": moving XY morphs between two presets (A↔B) via
  crossfade of all params (morph engine).
- Gyroscope/tilt optional on phone (parallax modulation) — bonus.

### 3.12 Automation
- Every combinator param automatable; lanes in `src/lib/automation.ts`.
- Record from XY / macro / LFO; edit in Piano-Roll-style lane (existing).
- "Smart automation": presets include pre-written automation curves (e.g.
  filter sweep over 4 bars) that apply on load.

## 4. Architecture

### 4.1 Data model (new types in `src/types.ts`)

```ts
export type CombinatorMotionSource =
  | 'macro' | 'lfo' | 'follower' | 'sidechain' | 'gate'
  | 'sequencer' | 'xy' | 'evolution';

export interface CombinatorLfoShape { points: { t: number; v: number }[]; interp: 'linear'|'smooth'|'step'|'spline'; }

export interface CombinatorSlot {
  id: string;
  moduleId: string;            // combinator module id (see §6)
  enabled: boolean;
  mix: number;                 // 0..1
  preGainDb: number; postGainDb: number;
  polarity: boolean;
  bands: { low: boolean; mid: boolean; high: boolean };
  crossovers: [number, number]; // Hz
  params: Record<string, number>;
  motion: CombinatorMotionSource;
  motionParams: Record<string, number>; // rate, depth, attack, ...
  lfoShape?: CombinatorLfoShape;
  locked: boolean;             // lock & snap
}

export interface ModRoute { src: string; /* motion source id */ dst: string; /* slotId.param */ amount: number; polarity: boolean; curve: 'linear'|'exp'|'log'; }

export interface CombinatorState {
  slots: CombinatorSlot[];
  routes: ModRoute[];
  masterMix: number;
  bpm: number;
  tightMode: boolean;
  xyAssign: { x: string; y: string; x2?: string; y2?: string };
  presetId?: string;
  morphTargetPresetId?: string;
  morphAmount: number;
}
```

### 4.2 DSP engine
- New `src/audio/combinator/CombinatorProcessor.ts` implementing the same
  `processSampleInto` contract as `StudioFxChainProcessor`, but with:
  - per-slot motion evaluation (LFO tables, follower envelopes, sequencer step)
  - modulation matrix application (smoothed)
  - multiband split/merge (Linkwitz-Riley 4th-order crossovers, reuse BiquadCascade)
  - master mix crossfade
- Runs in an `AudioWorklet` for low latency on mobile (fallback ScriptProcessor,
  matching field engine pattern). Worklet file: `src/audio/combinator/combinator.worklet.ts`.
- Reuses `src/audio/studioFx/primitives.ts` (`f`, Biquad, PeakEnvelope, SmoothValue,
  Oversampler) for bit-exact parity with Kotlin core where shared.

### 4.3 State & integration
- New Zustand store `src/store/combinatorStore.ts` (mirrors rackStore).
- `audioEngine` gains `setCombinator(state)`; when a `combinator` module is in the
  master rack, route through it.
- New ModuleType `'combinator'` in `src/types.ts` + entry in `MODULE_OPTIONS`
  in `StudioRack.tsx`; opens `CombinatorPanel` (full-screen overlay).
- Persistence: Dexie table `combinatorPresets` + `combinatorState` in project
  format (`src/lib/projectFormat.ts`).

### 4.4 Preset system
- `src/lib/combinatorPresets.ts` — preset catalog (JSON), loader, search, tags,
  favorites, A/B, morph.
- `src/lib/combinatorRandomizer.ts` — randomize with locks (port
  `applyStateWithLocks` pattern).
- `src/lib/combinatorTheory.ts` — "why this works" notes + auto-suggest from
  Meyda features.

### 4.5 Evolution integration
- `src/lib/combinatorEvolution.ts` wraps `generateEvolutionVariations` but operates
  on `CombinatorState` (mutate params/curves/sources) and uses the field
  variant grid UI.

### 4.6 Backend processing presets
- A "Produce" tier of presets that are full chains (combinator + studio suite)
  with baked automation curves. Stored as `CombinatorState` + automation lanes.
- One-tap apply; optional "render to layer" (offline OfflineAudioContext render,
  reuse `renderChain` pattern).

## 5. UI plan

### 5.1 Desktop
- `CombinatorPanel.tsx` — full-screen overlay launched from StudioRack module.
  Layout: left = slot chain (vertical), center = selected slot params + motion
  editor (LFO draw / follower / sequencer), right = mod matrix + master.
- `CombinatorLfoEditor.tsx` — drawable canvas LFO.
- `CombinatorModMatrix.tsx` — grid.
- `CombinatorPresetBrowser.tsx` — search/tags/favorites.
- `CombinatorXYPad.tsx` — reusable XY (also used mobile).

### 5.2 Mobile (field app)
- New route/panel in `src/components/field/` or a full-screen modal.
- Swipe between slots; bottom sheet for params; XY pad fills screen in "screen
  mode"; large touch targets (≥44px); haptics on snap.

### 5.3 Screen mode sound shifting
- `CombinatorScreenMode.tsx` — landscape full-screen XY + 4 macro buttons +
  preset morph wheel; records touch to automation when armed.

## 6. Combinator module catalog (initial set, ~36 modules)

Reuse studioFx modules where possible (tagged REUSE), plus new ones (NEW):

Gain/Color: Trim (REUSE), Saturation (REUSE), Tape Machine (REUSE), BitCrush
(NEW), Wavefolder (NEW), Aliasing/Downsampler (NEW), Spectral Fold (NEW, from
evolution engine), Noise (NEW), Exciter (REUSE).
Filter: Filter (REUSE), Neve 1073 (REUSE), SSL EQ (REUSE), Pultec (REUSE),
Air Shelf (REUSE), Mid-Side EQ (REUSE), Drive Filter (NEW, Hex-style), Combo
Filter (NEW), Wah (NEW), Infinity Filter (NEW, endless sweep).
Dynamics: FET 1176 (REUSE), Opto LA-2A (REUSE), VCA Bus (REUSE), Vari-Mu
(REUSE), Parallel Comp (REUSE), De-Esser (REUSE), Sidechain Duck (REUSE),
Clean/Hex Compressor (NEW), Limiter/TP (REUSE).
Space: Plate/Hall/Room Reverb (REUSE), Inverse/Pitch/Spring Reverb (NEW),
Tempo Delay (REUSE), Ping-Pong/Reverse/Tape Delay (NEW), Chorus/Flanger/Phaser
(REUSE + Infinity Flanger NEW), Chorus Width (REUSE).
Modulation/Shapers: Tremolo (REUSE), Auto Pan (NEW), Pumper (NEW, Transit-style
pump), DJ Transform (NEW), Vintage Tremolo (NEW).
Time/Pitch: Half Time / Retro Stretch (NEW), Pitch Shifter (NEW, soundtouchjs),
Repeater/Roll/Looper (NEW), Stutter/Granular (NEW, chaos synth granular).
Brakers (Hex-style, NEW): Back Spin, Pitch Braker, Vinyl Braker, Lo-Fi Braker.

## 7. Preset library plan

- Store as `public/combinator/presets.json` (or bundled) with schema:
  `{ id, name, category, tags[], author, theoryNote, bpm, state: CombinatorState,
    automation?: AutomationLane[] }`.
- Generation strategy for "tremendous set":
  1. Hand-author ~60 hero presets.
  2. Use Smart Randomizer + Evolution Engine (seeded) to generate candidate
     variations; curate down to ~400.
  3. Tag each with theory note (auto-drafted via LLM mesh? optional, offline
     template strings preferred for determinism).
- Categories & counts as in §3.8.

## 8. Lock & snap implementation notes

- `CombinatorSlot.locked` already in model. Randomizer skips locked slots/params.
- Snap: a `snapParam(slotId, paramKey)` rounds to nearest musical division using
  BPM + time signature; LFO phase snaps to 0/0.25/0.5/0.75 beat; step sequencer
  boundaries to grid.
- "Tight mode" toggle forces snap on all time params and re-quantizes on BPM
  change.

## 9. XY pad implementation notes

- Canvas-based, 60fps, pointer events, multi-touch (2 fingers).
- Smoothing: 5ms low-pass on pointer position to avoid zipper noise.
- Assignable axes (dropdown of all params); default filter cutoff / mod depth.
- "Record" toggle writes XY trajectory to automation lanes (arm → write).
- Morph mode: XY X = morph amount between current preset and `morphTargetPresetId`.

## 10. Implementation phases

### Phase 0 — Foundations (1–2 days)
- Add `CombinatorState` types to `src/types.ts`.
- Create `src/audio/combinator/` skeleton: processor + worklet + primitives reuse.
- Add `'combinator'` to `ModuleType` + `MODULE_OPTIONS`.
- Create `combinatorStore.ts`.
- Wire `audioEngine.setCombinator`.

### Phase 1 — DSP core (3–5 days)
- Implement per-slot processing, multiband crossovers, master mix.
- Implement motion sources: LFO (with draw table), follower, sidechain, gate,
  sequencer, macro, xy, evolution.
- Implement modulation matrix application.
- Parity test against a small Kotlin/JS golden vector (reuse parity.test.ts pattern).

### Phase 2 — UI (4–6 days)
- `CombinatorPanel`, slot chain, param panel, LFO editor canvas, mod matrix,
  preset browser, XY pad.
- Desktop full-screen overlay; mobile full-screen modal + bottom sheets.

### Phase 3 — Presets & randomizer (3–4 days)
- Preset schema + loader + browser.
- Hand-author 60 hero presets; generate + curate to 400.
- Randomizer with locks + intensity.
- Theory notes + auto-suggest.

### Phase 4 — Evolution & reshapers (2–3 days)
- `combinatorEvolution.ts` + variant grid reuse.
- Reshaper module + "mangle" button.

### Phase 5 — Automation, lock/snap, XY record (2–3 days)
- Automation lane integration; XY record; tight mode; snap.

### Phase 6 — Backend processing presets + render-to-layer (2 days)
- Produce presets; offline render to layer.

### Phase 7 — Polish, tests, coverage gate (2 days)
- Unit tests ≥90% new code; e2e smoke; boundary check.

Total estimate: ~3–4 weeks solo. Can be parallelized across slots/UI/presets.

## 11. Testing strategy

- Unit: motion math (LFO tables, follower, sequencer), modulation matrix, snap
  quantization, preset load/save round-trip, randomizer lock respect.
- Parity: combinator processor vs golden vectors (like `parity.test.ts`).
- Component: panel renders, XY pointer events, preset browser filter.
- E2e: load preset → audio output non-silent; XY record writes lane.
- Coverage gate: 90% on new code (`npm run coverage:check`).

## 12. Risks & mitigations

- **Performance on mobile**: 6 slots × 3 bands × motion eval per sample. Mitigate:
  worklet + downscaled LFO tables (256 points) + skip disabled bands; profile on S25.
- **AudioWorklet availability**: field engine already has ScriptProcessor fallback;
  reuse.
- **Preset size**: 400 presets × full state could be large. Mitigate: store
  compressed (gzip) in IndexedDB; lazy-load categories.
- **Scope creep**: keep v1 to 6 slots, ~36 modules, ~400 presets; defer
  gyroscope/tilt and cloud preset sync to v2.
- **BPM sync across apps**: combinator reads transport BPM; ensure field engine
  exposes BPM (it does via studioFx setTempoBpm pattern).

## 13. Open questions for the user

1. Should the combinator be a **master-bus rack module** (like Studio Suite) or a
   **per-layer insert**? (Recommend: both — master module + "open in layer" button.)
2. Preset count target: 400 (plan) or push to 800 (Transit-scale)? More presets =
   more curation time.
3. Should "Evolution" run on the combinator state itself, or generate new
   combinator presets from a seed? (Recommend: both.)
4. Include **gyroscope/tilt sound shifting** in v1 or v2? (Recommend v2.)
5. Do we want **cloud preset sync** via the shared llm-mesh / R2, or local-only
   (matching Sound Lab's local-first ethos)? (Recommend local-first + optional export.)

## 14. First concrete PR (smallest useful slice)

1. `src/types.ts`: add `CombinatorState`, `CombinatorSlot`, `ModRoute`,
   `'combinator'` to `ModuleType`.
2. `src/store/combinatorStore.ts`: minimal store (slots, masterMix, bpm).
3. `src/audio/combinator/CombinatorProcessor.ts`: passthrough processor that
   runs a single slot's studioFx module (proves plumbing).
4. `StudioRack.tsx`: add module option + open panel.
5. `CombinatorPanel.tsx`: empty shell with slot list.
6. Tests for store + processor passthrough.

This slice proves integration without committing to full DSP; subsequent phases
layer on motion, multiband, presets.
