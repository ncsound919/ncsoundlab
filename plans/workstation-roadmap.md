# NC Sound Lab — Workstation Feature Roadmap (Blueprint)

**Goal:** Move NC Sound Lab from an in-memory beat sketchpad to a persistent,
full-featured production workstation — save/load projects that actually round-trip
audio, a proper song arrangement + tempo, per-step velocity, real metering and
mixing sends, per-layer stem export, sampling/takes, and performance/MIDI.

**Status:** Planning · **Ownership:** opencode session · **Last updated:** 2026-08-03

This is a **construction plan**, not a spec. Every phase is one-PR-sized with a
self-contained context brief so a fresh agent can execute it cold. Work proceeds
in dependency order: **Phase 0 is mandatory before anything else** (everything
hangs off the project model + undo + autosave). Phases 1–4 and 5–6 can partially
run in parallel once their upstream is merged.

---

## 0. Current state (what the plan builds on — verified)

- Stack: React 19, Vite 6, Zustand, Tone.js 15, Web Audio API, Dexie (IndexedDB),
  JSZip, Tailwind 4, Vitest, Playwright. Desktop via Tauri, web via Vercel.
- **UI shell:** `App.tsx` (2662 lines) with 9 workflow stages
  (`soundlab`, `produce`/sequencer, `mixer`, `spatial`, `evolution`, `compare`,
  `kitcreator`, `catalog`). Sidebar hosts Save/Load, header hosts undo/redo + A/B snapshots.
- **Core stores:**
  - `src/types.ts` — `SoundLayer`, `PatternCell {on, note?, velocity?}`,
    `Pattern` (layerRows, timeSignature, stepLength 16|32, swing, bpm),
    `SongChain {order}`, rich `FXSettings`/`SynthSettings`.
  - `src/store/patternStore.ts` — 4 patterns A–D, activePatternId, songChain.
  - `src/store/sequencerStore.ts` — 16-slot programs for banks A/B/C/D (`(string|null)[]` layerId refs).
  - `src/store/rackStore.ts` — master FX rack modules + A/B + undo/redo (20 steps).
  - `src/lib/db.ts` — Dexie `soundlab-db` tables `soundKits`, `soundProjects`, `favorites`.
- **Audio:** `src/lib/audioEngine.ts` (per-layer chain source→insert FX→pan→env→comp→(parallel reverb)→`masterGain`,
  then masterPan → masterRack (serial) → fixed master chain incl. brickwall limiter + clipper).
  `src/audio/transport/*` — Tone.Transport host, `quantize`, `countIn`, `metronome`, `clickNodes`,
  `liveRecorder` (velocity-aware), `audioCapture` (MediaRecorder mic/take), `mixdown` (dry render).
  `src/audio/SoundLayerPlayer.ts` (playNote MIDI-aware) + `src/audio/AudioEngine.ts` (SharedEngine, module analysers).
- **Components:** `StudioSequencer`, `MpcPadBank`, `PianoRoll`, `SongModePanel`, `TransportBar`,
  `LayerMixer`, `MasterMeter`, `StudioRack`, `ChopEditor`, `FolderUploadModal`, `SoundKitCreator`,
  `SoundKitCatalog`, `ProjectManagerModal`, `PresetBrowser`, modals for shortcuts/manual/etc.
- **DSP:** `src/audio/dsp/AdvancedParametricEQ.ts` (model + response calc, audio not wired),
  `AdvancedCompressor.ts` (model only), `TapeDelayDSP`, `ConvolutionReverbDSP`, `AnalogEngineDSP`.

**Known gaps the plan targets (all verified):**
- Save/Load strips all sample audio (db.ts:119-122, App.tsx:581); saved projects are inaudible on reload.
  Pattern/sequencer/pads/mixer state is never persisted at all. No schemaVersion, no `.nsl` project file export.
- Scheduler hardcodes 16 steps (StudioSequencer.tsx:35 `STEPS=16`); 32-step patterns only play steps 0–15.
  Song mode is a bar-quantized chain that re-sets BPM per bar; no tempo automation, no true arrange timeline.
- `velocity` in `PatternCell` is never captured by `recordNote`/`recordPadHit`; `liveRecorder`/`metronome`/`countIn`
  are fully unit-tested but never imported/UI-wired.
- Undo/redo covers only layers (App.tsx) and rack (rackStore); none for pattern/arrangement/mixer.
- Mixer meters (`LayerMixer.tsx:69-96`) are `Math.random()`-faked; no real per-layer analyser. No send/bus,
  no user sidechain, no per-layer parametric EQ (AdvancedParametricEQ is model-only),
  no master limiter/compressor UI beyond the fixed master chain.
- Export: single stereo WAV only (`exportWav` full-FX, plus a second dry `renderMixdown` that does NOT match
  what you hear). No stems, no per-layer bounce.
- Sampling: ChopEditor equal/smart/tap chop exists; no time-stretch; sample library has no persistent folders;
  recording is single-take MediaRecorder with no punch-in/loop/takes.
- Performance: no keyboard→pad mapping, no per-pattern pad programs, no keyboard splits, no scale lock.
- MIDI: **no Web MIDI** anywhere (no `requestMIDIAccess`).

---

## Phase 0 — Foundations (do first; everything else serializes to these)

### Step 0.1 — Project document schema + serializer (`.nsl` round-trip)
*Context:* persistence currently drops `audioBuffer` and ignores patterns/pads/mixer (see gaps above).
*Context brief:* Define a versioned, fully-serializable project document capturing the ENTIRE session:
  1. `schemaVersion`, `appVersion`, `createdAt/updatedAt`, `title`, `bpm`, `timeSignature`.
  2. `layers: SoundLayer[]` but with sample audio stored as **base64-encoded WAV** (encode via the existing
     `audioBufferToWav` in `src/lib/audioUtils.ts`; decode via `AudioContext.decodeAudioData`). Keep `audioBuffer`
     OUT of the stored object; add a `sampleData: string` field on the layer.
  3. `programs` (4×16 pads) from `sequencerStore`, `patterns` (all pattern cells incl. `velocity` once Phase 1 lands),
     `songChain` (order; Phase 2 adds `arrangement` clips — model both now, keep `songChain` for compat).
  4. `mixer` state standardized in Phase 3 (channel gains/mute/solo, send levels, master, rack modules).
  5. Helpers `serializeProject()` / `deserializeProject()` and a `stripAudioBuffers()`/rehydrate helper.
*Deliver:* `src/lib/projectFormat.ts` with a versioned `ProjectDocument` type + encode/decode; a `snapshotDirty` helper.
*Verify:* unit tests for serialize→deserialize round-trip on a synth layer AND a sample layer; `npm run lint`; `npm test`.
*Note:* do not rely on the old `SavedSoundProject.layers: any[]`. Add a new versioned format entry and stop writing buffers into it.

### Step 0.2 — File export/import (`.nsl`) + persistence wiring
*Context:* users need real "Save / Load project files". `ProjectManagerModal` + `handleSaveProject`/`handleLoadProject`
in App.tsx today just drop buffers (App.tsx:432-443).
*Context brief:* build the file layer on the Step 0.1 schema:
  - **Save:** produce a single self-contained `.nsl` file (JSON with base64 sample audio). Save to IndexedDB
    (`soundProjects`) *and* offer a browser download (`.nsl`) / File-System-Access `showSaveFilePicker` when available.
  - **Load:** open a `.nsl` (via `<input type=file>` or `showOpenFilePicker`), `decodeAudioData` all embedded
    sample data back into buffers, then hydrate layers, patterns, pads, arrangement, mixer into stores.
  - Add a `ProjectManagerEntry` with schema version + migration hook.
  - Route the existing Save/Load buttons (App.tsx sidebar ~1620) through this.
*Exit criteria:* loading a saved project restores layers WITH audible samples, patterns, pads and chain.
Add migration-on-open for old `{layers}`-only rows.

### Step 0.3 — Generalized Undo/Redo store
*Context:* undo only covers local layer history (App.tsx:234-301) + rack history. Everything else is un-undoable.
*Context brief:* introduce `src/store/historyStore.ts` — a snapshot/command bus tracking `{layers, patterns, songChain, programs, mixer}`.
  - Provide `record(fn)` / `snapshot()` that pushes committed state onto a stack (cap ~100), and `undo()/redo()`.
  - Migrate App.tsx `handleUndo`/`handleRedo` to use it (keep keyboard Ctrl/Cmd+Z / Y at App.tsx:678-681).
  - Extend coverage as new state (patterns, pads, mixer) comes online in later phases so everything is undoable.
  - Wire header buttons to it (replace the disabled states that depend on legacy layer-only stacks).
*Verify:* tests that a multi-zone edit (e.g. toggle a pattern cell + move a fader) coalesces into a single undo step; `npm test`.

### Step 0.4 — Autosave + crash recovery
*Context:* autosave writes layers-only to localStorage key `sonik_auto_save_backup` (App.tsx:528-590) and drops audio.
*Context brief:* replace with full-Document autosave (serializer from 0.1) written periodically (debounce ~2–5s after edits,
plus `visibilitychange`/`beforeunload`) to IndexedDB (not localStorage). Add a "Recovered" banner on load offering
*Keep saved version* | *Discard*. Replaces the existing auto-save-restore banner (App.tsx:1893-1916).
*Verify:* simulate edit → close → take the crash path and recover the full project with audible samples.

---

## Phase 1 — Sequencing data model & editor fixes

### Step 1.1 — Honor variable pattern length + velocity model
*Context:* scheduler hardcodes `STEPS=16` (StudioSequencer.tsx:35) and `[...Array(STEPS)]` (:367); 32-step patterns are
broken; the store already supports stepLength 16|32 but playback ignores it. `PatternCell` already has `velocity?: number`.
*Context brief:*
  - Fix both scheduler paths (`tick` at :244 and the `Tone.Sequence` at :367) to iterate `activePattern.stepLength`
    instead of a constant 16. Add a unit test asserting a 32-step sequence emits 32 ticks.
  - Extend `PatternCell` with `duration?: number` (decay length for melodic notes, default = one step) and
    `probability?: number` (0–1; if < 1 the step has a chance to not sound each pass). Update `setCell`.
  - Persist the new fields everywhere (Phase 0.1 serializer).
*Verify:* `npm test` (patternStore tests updated), manual 32-step playback.

### Step 1.2 — Per-step velocity capture & editing
*Context:* velocity is defined but unused; `recordPadHit` (StudioSequencer.tsx:462) never writes the pad's live velocity
into the cell; `liveRecorder.ts` DOES store velocity but is unwired.
*Context brief:*
- Wire `liveRecorder.recordEvent` (velocity-aware overdub) into StudioSequencer's `recordPadHit` + `recordNote` so a hit
  writes `{on:true, note, velocity}`.
- Add a velocity lane editor in `PianoRoll.tsx` and the step grid (draggable per-step velocity bars) writing
  `cell.velocity`. When `velocity` is present, use it to scale the trigger (pad/playNote gain) for real dynamics.
- MPC 16-levels already compute velocity from pointer-Y (`velocityFor`, MpcPadBank.tsx:152) — pipe that into the recorded cell.
*Verify:* record a pad hit; reopened pattern retains velocity; edits in the velocity lane affect loudness. Tests for velocity writes.

### Step 1.3 — Pattern editing: copy/paste, duplicate, clear
*Context:* duplicate-in-chain exists (SongModePanel) but there is no copy/paste/clear of pattern rows or whole patterns.
*Context brief:* add `duplicatePattern(id)`, `clearPattern(id, layerId?)`, `copyPatternCells`/`pastePatternCells` in
patternStore, surfaced in the MpcPadBank toolbar and PianoRoll. Wire into historyStore (Phase 0.3).
*Verify:* tests; keyboard shortcuts placed later in Step 6.4.

### Step 1.4 — Humanize / swing / groove templates
*Context:* swing is a JS `setTimeout` on odd 16ths (StudioSequencer.tsx:252-266) — not sample-accurate, binary on/off, no grooves.
*Context brief:*
- Move swing to sample-accurate scheduling: schedule a cell at `stepStart + swingAmount * stepLength` instead of a JS timeout.
- Groove template library: e.g. swing/groove sets `[offsetPercent per step × 16]` + velocity humanize `[±% per step]`.
  Store as pure data in `src/lib/grooveTemplates.ts`, reusable per-layer and per-pattern.
*Verify:* a 60% swing visibly shifts odd steps earlier and is sample-accurate. Tests.

---

## Phase 2 — Song arrangement & tempo

### Step 2.1 — Arrangement timeline (clips on a shared timeline)
*Context:* song is a linear chain `songChain.order` toggled bar-quantized (SongModePanel + StudioSequencer.tsx:397-427).
*Context brief:* replace it with a **clip arrangement model** inside `SongChain`:
   `arrangement: { clips: Clip[] }` where `Clip = { id, patternId, beats, startBeat, muted, color }` on a shared,
   monotonic beat timeline; add **sections** (e.g. intro/verse/drop with a `count` of repeats).
- Build `ArrangementPanel` (replace/augment SongModePanel): horizontal timeline editor, playhead, drag-resize clips,
  mute, split/duplicate, drag-reorder.
- Derive `songChain.order` from the clips for the old mixdown/export path until 2.3 takes over.
*Verify:* render the arrangement to a timeline; edits survive; existing mixdown keeps working.

### Step 2.2 — Song tempo automation
*Context:* `setBpm` is a direct set (transport.ts:24-26); no ramps; song only changes BPM per bar.
*Context brief:*
- Add a `tempoMap` (list of `{tick, bpm}` cumulative points) on the arrangement/timeline. In the scheduler, interpolate
  BPM between edges (Tone `rampTo`, or a custom lookahead in the scheduler).
- Add a tempo automation lane UI in the arrangement with draggable points.
*Verify:* a 90→120 BPM ramp plays coherently and pattern durations stay beat-correct mid-song.

### Step 2.3 — Automation / CC lanes (per-layer volume, pan, send, rack params)
*Context:* no automation storage today.
*Context brief:*
- Add automation lanes: `AutomationLane = { target, points: [{tick, value}], min, max }` per layer (volume, gain, pan,
  and sends once the mixer exists) plus song-level tempo.
- Add a lane editor in the arrangement / piano roll. During playback schedule `AudioParam.setValueAtTime` /
  `linearRampToValueAtTime` at each point.
- Add a small engine API to set a named layer parameter (volume, pan, filter) at a given time.
- Persist lanes in the Phase 0.1 serializer.
*Verify:* automating layer volume/pan produces audible changes during playback.

---

## Phase 3 — Mixer & metering

### Step 3.1 — Real metering (replace `Math.random()` fakes)
*Context:* LayerMixer.tsx:69-96 simulates meters. The master has a real analyser (MasterMeter.tsx).
*Context brief:* add a real `AnalyserNode` per channel (reuse `SharedAudioEngine.getModuleAnalyser`; add per-channel
gain+analyser feeding the mixer strip). Compute true **peak**, **VU/RMS** (≈ −18 dBFS = 0 VU, ~300ms window), and
optional stereo width. Feed LayerMixer channel strips + master strip.
*Verify:* moving a fader changes the meter; silent input reads 0; add a test that an analyser is wired per layer.

### Step 3.2 — Channel strip view (proper mixer)
*Context:* `LayerMixer` is a compact vertical list.
*Context brief:* build a real channel strip: input/gain, fader (Fader.tsx), pan, mute/solo, peak meter, EQ rack,
sends (Phase 3.3), bypass. Refactor `LayerMixer` DOM into a `ChannelStrip` component.
*Verify:* faders/mute/solo reflect and set store state that drives audio.

### Step 3.3 — FX sends / return buses (reverb & delay)
*Context:* delay/reverb exist only as per-layer inserts; no aux sends/returns.
*Context brief:* add send/return topology in the engine: layer chain → dry → channel output, plus **send** buses
(reverb, delay) → return tracks with their own gain/pan summing to master. Model `Buses` in mixer state + serializer
(Phase 0.1). Provide a per-channel send knob.
*Verify:* a layer's reverb sends to a shared bus; the return control changes the tail; persisted across save/load.

### Step 3.4 — Per-layer parametric EQ
*Context:* per-layer has only a biquad cascade; `AdvancedParametricEQ.ts` is model + response calc only, never bound to audio.
*Context brief:* bind a parametric EQ (bands from the AdvancedParametricEQ model) into each channel between the filter
stage and pan, plus a UI editor (wire `AdvancedEQEditor` to per-channel bands). Expose per-layer HP/LP + 2–4 mid bands.
*Verify:* sweeping a band changes the `calculateAdvancedEQResponse` plot and audibly filters the channel.

### Step 3.5 — Master limiter/compressor UI + sidechain
*Context:* fixed master brickwall limiter + clipper exist (audioEngine.ts:208-227); the user master rack can add
comp/limiter but there are no dedicated controls or sidechain.
*Context brief:*
- Surface master limiter/compressor as a first-class strip with threshold/ratio/attack/release/makeup controls
  (patch the fixed nodes + rack).
- Implement a **sidechain compressor**: bus A's signal feeds a detector that ducks bus B. Wire a sidechain input node
  into `SharedAudioEngine.getModuleGainNode`. Provide a per-channel "SC from" selector. (Build on the existing ducking
  gain mechanism, AudioEngine.ts:183-209.)
*Verify:* a kick→bass sidechain duck audibly reduces the target.

### Step 3.6 — FX-chain presets
*Context:* per-layer presets (`LayerPresetBrowser`) and rack presets (`PresetBrowser`) exist but are stored in
localStorage, un-versioned, and don't round-trip in projects.
*Context brief:* generalize rack/per-layer-chain preset save/load so a preset includes all module settings, stores in
IndexedDB (Dexie) and inside `.nsl`, and loads onto a chosen channel or the master. Add a per-chain reset.
*Verify:* save a rack chain, clear it, reload it; the project file carries it.

---

## Phase 4 — Pro Tools interchange (stems + AAC reference import)

> Goal: round-trip audio with Pro Tools painlessly. Stems import as
> auto-tracked multitrack WAVs; AAC references can be brought in to align
> tempo or for A/B; AAF export for the desktop build (stretch goal).

### Step 4.1 — Per-layer stem render

*Context:* today `audioEngine.exportWav(layers, dur)` renders the full mix
to a single stereo WAV with FX applied; `renderMixdown` is a dry
second path. The user needs per-channel stems with the channel's own FX
chain for import into a DAW.

*Context brief:*

- Add `audioEngine.exportLayerStem(layerId, durSec, opts)` that renders a
  single layer through its existing `createNodeChain` into an
  `OfflineAudioContext`, isolating it from the master bus. Returns a WAV
  blob.
- Options: `sampleRate` (44100 / 48000 / 96000), `bitDepth`
  (16 / 24 / 32), `includeSends` (when true, the layer's send levels are
  baked into the stem; when false, only the dry channel output is
  rendered).
- Naming convention (Pro Tools auto-import friendly):
  `<sanitised-layer-name>_<index>_<take>.wav` (e.g. `Kick_01_Take01.wav`).
- The legacy `exportWav` remains for the single-mix bounce.

*Verify:* each layer's stem length equals the requested duration; stems
sum approximately to `exportWav` output; bit-depth / sample-rate options
match the WAV header.

### Step 4.2 — Multi-stem bundle (Pro Tools "Import As Session Tracks")

*Context:* Pro Tools auto-imports a folder of WAVs as separate session
tracks (File → Import → Audio → "Import As Session Tracks…"). The folder
layout + filename convention drive the auto-track-naming.

*Context brief:*

- New `exportStemsBundle(opts)` that renders every audible layer as a
  stem and writes them into a `.zip` archive laid out like:
  ```
  MySong_Stems/
    MySong_Master.wav      ← the exportWav mixdown
    MySong_Stems/
      Kick_01.wav
      Snare_01.wav
      Bass_01.wav
      …etc
    Markers.csv             ← bar/beat/timestamp markers for Pro Tools
    README.txt              ← naming convention + import instructions
  ```
- `Markers.csv` follows Pro Tools' "Import Session Data → Markers from
  CSV" format: columns `Name, Start, Length, Timecode, …` with Start in
  the user's chosen timecode base (default 48000 for 48 kHz, 30 fps).
- `README.txt` documents how to import (drag the inner `MySong_Stems/`
  folder into Pro Tools; select all → "Import As Session Tracks"; import
  `Markers.csv` for tempo map).
- Reuses `audioEngine.exportLayerStem` (4.1) + JSZip (already a dep for
  `SoundKitCreator`).

*Verify:* the resulting zip opens cleanly in Pro Tools with one track
per stem; `Markers.csv` imports without errors.

### Step 4.3 — AAC / reference track import

*Context:* users want to drop a reference track (often AAC from iTunes)
into the app for A/B, tempo matching, or just to listen alongside their
project. Today the app only supports `decodeAudioData` on user-supplied
file blobs but there's no UI for it.

*Context brief:*

- New `importReferenceTrack(file: File)` that accepts `.m4a` / `.aac` /
  `.mp3` / `.wav` / `.flac` and decodes via
  `AudioContext.decodeAudioData`.
- New session-only `referenceTrack` slice (zustand):
  `{ name, buffer, sourceSampleRate, importedAt }`. Lives alongside the
  song without touching the project model itself.
- UI: a "Reference" panel in the Produce stage with: drop zone, play
  button, gain, A/B switch (mute / unmute the reference vs the session
  while both are playing).

*Verify:* decode round-trips a small AAC fixture in jsdom mock;
`referenceTrack` exposed via store; A/B mute works.

### Step 4.4 — Tempo detection + alignment to a reference

*Context:* once a reference is loaded, the user typically wants to know
its BPM and possibly snap their project tempo to match.

*Context brief:*

- `detectBpmFromBuffer(buffer)` — onset autocorrelation on the
  reference's energy envelope; returns `{ bpm, confidence }`. Pure JS,
  tested in isolation (no real-time requirement).
- "Snap project to reference" button on the Reference panel — sets
  `patternStore.setBpm(detected.bpm)` and updates the song's
  `tempoMap` to start at that BPM.
- "Mark reference downbeats" — manual: user taps spacebar on each
  downbeat, app records the beats and stamps them as markers in
  `Markers.csv` next export.

*Verify:* `detectBpmFromBuffer` recovers 120 / 140 BPM on synthetic
click-track fixtures within ±2 BPM; project tempo updates correctly.

### Step 4.5 — AAF export (Tauri desktop only — stretch)

*Context:* the desktop build (`src-tauri/`) ships Rust code. There's a
mature Rust crate `aaf-rs` that can generate real AAF files. For Pro
Tools users who specifically need AAF rather than stems, this bridges
the gap.

*Context brief:*

- New Tauri command `export_aaf_session(payload)` that takes the
  project + stems + markers + render of each stem and emits a real
  AAF file with one audio track per stem.
- The web build hides this UI / shows a "Available in desktop app"
  badge.
- Mark as a stretch goal — depends on `aaf-rs` API stability.

---

## Phase 5 — Sampling & recording

### Step 5.1 — Sample browser / library with persistent folders + preview
*Context:* `SoundKitCatalog` + `FolderUploadModal` exist, but there is no persistent user library/folders and no
drag-drop sample library in the Producer stage.
*Context brief:*
- Add persistent sample storage (reuse `soundKits` or a new table) with `audioBuffer` persisted via base64 (Phase 0.1
  helper) and a folder structure in DB. Build a left-panel **Sample Browser** in the Producer stage: folders
  (create/rename), search, tags, per-sample preview, drag-and-drop into pads/layers/chopper.
- Reuse the global drop handler (App.tsx:1253-1290) but target a library entry with persistence.
*Verify:* import a sample → refresh → still in folder; preview is audible.

### Step 5.2 — Time-stretch & pitch/slice enhancements
*Context:* there is no independent time@Pitch; pitch uses `playbackRate` (source resample) or batch resample.
*Context brief:*
- Implement a **time-stretch** primitive (granular / phase-vocoder) at `src/audio/dsp/TimeStretch.ts` with a
  `{ ratio }` API, applied per sample/slice.
- Expose per-sample/slice **pitch (without time change)** and **time (without pitch change)** controls in the layer
  editor and ChopEditor slice inspector (existing per-slice `tune`), with root-key mapping.
*Verify:* stretch 1.5x keeps pitch; pitch −12st keeps time; a slice round-trips to a pad on pitch.

### Step 5.3 — Enhanced chop / slice
*Context:* ChopEditor supports equal/smart/tap-to-chop → pads D.
*Context brief:* add onset/beat-synced auto-chop (energy/onset detector, not silence-only); save slice maps into the
sample library so slices persist; per-slice rename; per-pad audition keys.
*Verify:* onset chop splits on transients; reload preserves the slice map.

### Step 5.4 — Recording: punch-in, loop recording, multiple takes
*Context:* mic/instrument recording via `audioCapture.ts` is bare `getUserMedia` + MediaRecorder single-take;
`liveRecorder` (velocity), `countIn`, and `metronome` are test-only / unwired.
*Context brief:*
- Wire `countIn` + `metronome` into transport recording (already built — just not connected; see countIn.ts, metronome.ts).
- Add **punch-in/out** (record-region preview, in/out points), **loop recording** (cycle while recording, accumulate
  into a `takes[]` list), and a **takes browser** to keep/pick favorite takes per pass (audio and MIDI).
- Each take is an AudioBuffer; the UI persists and selects the active take (comping as a later refinement).
*Verify:* 3-loop recording yields N takes you can cycle through; punch-in only records inside the region. Unit tests for the take list.

---

## Phase 6 — Performance, MIDI & shortcuts

### Step 6.1 — Pad performance key-mapping + per-pattern pad programs
*Context:* pads are pointer-only; programs are bank-static (sequencerStore) and don't follow patterns.
*Context brief:*
- Map a QWERTY key band to the 16 pads (configurable; default `z s x d c v g b h n j m , . /` + octave shift),
  triggering pads with live velocity.
- Make pads **follow activePattern** (like MPC scenes: a program per pattern) so pad assignment switches live when the
  pattern changes during a song; store per-pattern programs and serialize them (Phase 0.1).
*Verify:* keys trigger the pad bank; a pattern change swaps pad assignment live during song playback.

### Step 6.2 — Keyboard splits, chords & scale locking
*Context:* a HOME_ROW piano (`react-piano`) exists; chord detection is display-only (StudioSequencer.tsx:770-778).
*Context brief:*
- **Keyboard split:** assign different layers/pads to lower vs upper note ranges (a split point), each side playing its
  assigned instrument; per-split pitch mapping.
- **Chord mode** and **scale lock:** restrict pad/key triggers to a selected scale (tonal is already a dependency);
  a single pad press plays a root→chord derived from the scale. Add UI for scale/root selection.
- Keyboard shortcuts for split toggling + scale presets.
*Verify:* keys outside the locked scale don't trigger; split sides play their own layers; chord mode plays chords.

### Step 6.3 — Web MIDI input
*Context:* no Web MIDI support anywhere.
*Context brief:* add `navigator.requestMIDIAccess()` support:
- Enumerate `MIDIInput`s in a MIDI panel with status lights.
- Map note/CC → pads & layers (editable mapping) and into step-recording, using real MIDI velocity for recorded cells.
- Integrate with performance mode (pads, splits) and note entry.
*Verify:* a virtual MIDI port (loopMIDI) drives pads/layers live; velocity is recorded.

### Step 6.4 — Keyboard shortcuts completion (+ documentation)
*Context brief:* standardize and document a full shortcut set in `handleGlobalKeyDown` (App.tsx:622-708) and
`KeyboardShortcutsModal.tsx`. Add missing shortcuts from earlier steps: save/load (`Ctrl/Cmd+S`), new project,
transport play/stop, record (`R`), bank/pattern switch (A/B/C/D, numbers), pad trigger, mute/solo, render/export,
velocity lane toggle.
*Verify:* the modal lists every implemented key; extend `App.test.tsx` with minimal shortcut assertions.

---

## Parallelism & dependency summary

- **Phase 0** is a hard gate for everything (schema, persist, undo, autosave).
- **Phase 1** (sequencer timing + velocity + pattern editing) can run in parallel **after 0.1/0.3**; it touches
  patternStore + scheduler (audio), independent of the mixer (Phase 3).
- **Phase 2** (arrangement + tempo + automation) depends on 1.1 (honest stepLength) and the scheduler; independent of the mixer.
- **Phase 3** (mixer/metering/sends) is audio-architecture work independent of sequencing; can start after 0.1
  (state gets serialized). Most parallelizable: 3.1/3.2 first, then 3.3/3.4/3.5 (sends need a channel).
- **Phase 4** (stems + AAC reference + Pro Tools interchange) depends on
  3.1/3.4 (per-channel chain to render). 4.1 + 4.2 are the core path;
  4.3 + 4.4 (reference import + tempo detection) are independent of the
  audio engine and can run in parallel.
- **Phase 5** (sampling/recording) is independent; 5.4 wants metronome/countIn wiring.
- **Phase 6** (performance/MIDI) is independent but exercises Phase 1 store/velocity a lot.

Strongest-model work: 0.1 (schema), 2.1 (arrangement timeline), 3.3 (send-bus graph). Everything else default tier.

## Global invariants (verify after every step)

- `npm run lint` (tsc) and `npm test` (Vitest) pass; `npm run test:e2e` (Playwright) green.
- Existing features never regress: sound-lab synth triggers, layer FX playback, `exportWav` master, master rack, chops.
- Everything new is undoable (via historyStore), persisted (Phase 0.1 schema), and versioned.
- Never commit secrets or API keys.

## Rollback strategy
- Each phase merges via PR; reverting the merge reverts that phase. The surface between phases is the `ProjectDocument`
  schema + store shapes, so keep the schema additive/versioned to preserve old saved projects.
- Keep `audioBufferToWav`/`audioUtils` as the single encode path; never fork a second serialization for samples.
