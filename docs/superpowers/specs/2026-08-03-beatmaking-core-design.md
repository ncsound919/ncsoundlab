# Beatmaking Core — Transport, Metronome, Live Recording, Song Mode, Mixdown

**Date:** 2026-08-03
**Status:** Design (audited + fixed 2026-08-03, ready for implementation plan)
**App:** NC Sound Lab — React 19 + Vite 6 + TS, raw Web Audio DSP, Tauri desktop + Vercel web

---

## 1. Purpose

The current sequencer (`StudioSequencer.tsx`) plays 16-step patterns via `setInterval` JS timers, which drift and cannot drive sample-accurate recording. This spec introduces a real beatmaking transport so the product works like a proper MPC/DAW:

1. Sample-accurate transport clock
2. Audible metronome / click track with count-in
3. Real-time (live) recording with quantize + overdub
4. Mic/instrument audio recording
5. Time signatures (4/4, 3/4, 6/8) + pattern length
6. Song mode (pattern chaining)
7. Offline mixdown render to WAV

Non-goals for v1: MIDI hardware I/O (webmidi noted for later), full multi-track DAW timeline, plugin VST hosting, pitch-correction.

---

## 2. Architecture

### 2.1 Foundation: Tone.js as transport backbone, custom DSP preserved

- Add `tone` npm dependency.
- Tone runs on the **same `AudioContext`** the app already creates (via `lib/audioEngine.ts`). Never `new Tone.Context()` separately — configure `Tone.setContext()` or pass the shared context so everything routes to one graph.
- **Init-ordering requirement (hard rule):** `Tone.setContext(sharedCtx)` MUST run before any Tone node/transport object is created. If a Tone node is created first, Tone silently creates its own context and everything routes to the wrong graph. Enforcement: the transport init (`initTransport()`) runs at app bootstrap / first audio interaction, before any Tone node construction; a unit test asserts `Tone.context` === the shared context after init.
- The custom DSP engine (`audio/AudioEngine.ts`, `lib/audioEngine.ts`, `SoundLayerPlayer.ts`, DSP modules) stays untouched.
- New transport layer (`src/audio/transport/`) uses Tone `Transport`, `Sequence`, `Part`, and `Recorder`. `Tone.Offline` is NOT used for mixdown — the engine already has offline rendering (see §2.2 Mixdown).

Why: Tone provides proven sample-accurate scheduling, time-signature/swing support, offline rendering, and recording — without rewriting the existing DSP engine.

### 2.2 Module map

| Module | File | Responsibility |
|---|---|---|
| Transport host | `src/audio/transport/transport.ts` | Singleton wrapping Tone Transport; BPM, time sig, swing, play/stop/pause, position, events (`tick`, `bar`, `record-capture`). |
| Click engine | `src/audio/transport/metronome.ts` | Synthesized tick + accent; volume; per-16th audible; routes into existing master chain via module gain node. |
| Count-in | `src/audio/transport/countIn.ts` | 1-bar lead-in beats before recording/playback; bar/beat indicators. |
| Recorder (live events) | `src/audio/transport/liveRecorder.ts` | Captures pad hits + piano notes during record; quantizes to grid; merges into pattern (overdub). |
| Recorder (audio) | `src/audio/transport/audioCapture.ts` | getUserMedia + `MediaRecorder`/Tone `Recorder`; produces an `AudioBuffer` → new sample layer; optional auto-slice to pads. |
| Pattern store | `src/store/patternStore.ts` | New Zustand store: patterns (multi-pattern), active pattern, time signature, pattern length, song chain. Pattern state is LIFTED out of `StudioSequencer.tsx` (currently component-local `useState<Pattern>`) into this new store. |
| Mixdown | `src/audio/transport/mixdown.ts` | Schedules pattern/song cells into an `OfflineAudioContext`, reusing the existing offline render path (`exportWav` + `buildMasterRackModule` in `lib/audioEngine.ts`) → stereo WAV via existing WAV encoder; JSZip integration. |

### 2.3 Integration points

- `StudioSequencer.tsx` — replace `setInterval` playback with transport host; wire click/metronome toggle, record, count-in, time-sig selector, song mode, mixdown button. **This is a real refactor, not a swap:** the file is ~842 lines and bundles swing (via `setTimeout`), tap tempo, step/note recording, pattern save/load/export, and the `setInterval` clock. Preserve these behaviors through a post-refactor behavior-parity checklist (play timing, swing, tap tempo, pattern persistence all verified), while lifting pattern state into `patternStore`.
- `lib/audioEngine.ts` — expose the shared `AudioContext` + a master input node that the click engine and mixdown connect into (so clicks flow through master FX, matching what's heard).
- `SoundLayerPlayer` / `AudioEngine` — reuse as-is for one-shot playback during transport.

### 2.4 Data model (patternStore)

**Note on reality vs. prior assumption:** the pattern is currently component-local `useState<Pattern>` in `StudioSequencer.tsx:62` — there is NO pattern store to migrate. `sequencerStore` holds MPC pad programs (A/B/C/D), unrelated to pattern layout. The work is **lifting** pattern state out of the component into the new `patternStore`, not migrating an existing store.

```ts
interface PatternCell { on: boolean; note?: number; velocity?: number }
interface Pattern {
  id: string;
  name: string;
  layerRows: Record<layerId, PatternCell[]>;
  timeSignature: [beats, noteValue]; // [4,4] | [3,4] | [6,8]
  stepLength: 16 | 32;               // cells per pattern
  swing: number;                     // 0..0.66 (Tone swing)
  bpm: number;
}
interface SongChain { order: string[] } // patternIds
```

**Sequence export format (back-compat):** the existing saved sequence format is `ncsoundlab-mpc-sequence` (see `StudioSequencer.tsx` export logic) with `{bpm, steps:16, ppq:96, pattern}` and lacks time-sig/stepLength. The new `Pattern` model adds fields (`timeSignature`, `stepLength`, `swing`). Bump the format, keep a `version` field (currently 1 → 2), and add a migration rule so old `version:1` exports load into `patternStore` with defaults (`timeSignature:[4,4]`, `stepLength:16`, `swing:0`). No silent misread of legacy files.

---

## 3. Components

### 3.1 Metronome / click
- Synthesized: short noise burst (tick) on every 16th; pitched accent (e.g., sine ~2000Hz or higher-pitched tick) on beat 1 of each bar. Zero asset files.
- Controls: on/off toggle, volume slider (0–100%), optional accent toggle.
- Audible during playback and recording; optional **standalone** mode (plays even when transport stopped). Standalone is a separate, simpler mechanism (autonomous oscillator loop independent of Tone Transport) — the transport-driven click only runs while the transport is active. These two click paths are kept distinct; the standalone path is gated behind an explicit toggle and is not part of the record/playback sync logic.

### 3.2 Count-in
- 1-bar count-in of audible beats before recording/playback starts.
- Visual: flashing bar/beat indicator in transport UI.
- Default enabled for recording; toggleable for playback.

### 3.3 Live recording (events)
- Hit **Record** → count-in → transport plays → any pad hit or piano note is captured.
- Capture quantizes to the current grid resolution (`timeCorrect`: 1/16, 1/8, 1/4 — reuses existing concept).
- **Overdub:** recorded events merge into the existing pattern (doesn't wipe). Repeated pad hits overwrite the cell's note/velocity for that grid slot (MPC-style).
- Stop keeps the take; Record+Stop again continues overdubbing.

### 3.4 Mic/instrument audio recording
- Button enables mic → `getUserMedia({audio})` permission prompt.
- Records audio into a new sample layer; auto-slice option maps the take across 16 pads.
- Works in browser + Tauri desktop (WebView2 supports getUserMedia). **Desktop permission is NOT automatic:** Tauri v2 on Windows requires the microphone capability declared in `src-tauri/capabilities/*.json` (core permission `core:default` + relevant capability granting mic/audio capture); without it getUserMedia fails silently. Phase 4 includes a config step + desktop smoke test.

### 3.5 Time signature + pattern length
- Per-pattern selector: 4/4, 3/4, 6/8.
- Step length: 16 or 32 cells.
- Transport math (beats per bar, step timing) derives from these.

### 3.6 Song mode (pattern chaining)
- New view: ordered list of patterns (A, B, C…) that play back-to-back.
- Chain editor: drag/reorder, duplicate, clear; play song from start or from a selected pattern.
- Transport plays through the chain, looping at end (toggleable).

### 3.7 Mixdown
- Render active pattern or full song chain to a stereo WAV.
- **Reuses the engine's existing offline render** (`exportWav` + `buildMasterRackModule` in `lib/audioEngine.ts`), extended to schedule pattern cells over time instead of layer one-shots. `Tone.Offline` is NOT used — no new offline graph.
- Uses existing `audioBufferToWav` util + JSZip for bundling.
- UI: "Mixdown" button → progress → download.

---

## 4. Data flow

1. User sets BPM/time-sig/step-length in transport UI → `transport.ts` configures Tone Transport.
2. User hits Play → transport schedules pattern cells + click via Tone `Sequence`/`Part`.
3. During record, pad/note events → `liveRecorder` → quantize → merge into `patternStore`.
4. Audio recording → `audioCapture` → AudioBuffer → new layer in `layers` (App state).
5. Song mode reads `songChain` → transport advances through pattern sequence.
6. Mixdown → `mixdown.ts` schedules pattern cells into an `OfflineAudioContext` reusing `lib/audioEngine.ts` offline render machinery (same layer buffers + master rack FX) → WAV.

---

## 5. Error handling

- **Mic denied:** show toast, disable record-audio button, keep note recording working.
- **getUserMedia unavailable (older WebView2):** fall back to note-only recording; log clear error.
- **Mixdown render failure:** toast with reason; leave pattern intact.
- **Transport mid-record stop:** flush captured events to pattern atomically (no partial-bar corruption).
- All async paths guarded; no unhandled rejections.

---

## 6. Testing

- **Unit (Vitest):** transport math (step timing per time-sig, swing timing), quantize, overdub merge logic, count-in beats, song-chain order, mixdown WAV header.
- **Component:** transport UI controls (play/stop/record/click toggle) render & fire handlers.
- **Existing suite:** must keep passing (`npm test`, `CONSTRAINED_ENV=1` on this machine).
- **Manual/desktop smoke:** real metronome audible, mic recording round-trip, mixdown file plays back.

---

## 7. Phasing

- **Phase 1:** Install Tone.js, shared-context wiring (with `setContext` init-ordering + test), transport host, click + count-in, replace `setInterval` playback in `StudioSequencer.tsx` (real refactor w/ behavior-parity checklist).
- **Phase 2:** Lift pattern state out of `StudioSequencer.tsx` into new `patternStore` (NO existing store migration), live event recording (quantize + overdub), time-sig + step-length, sequence-format version bump + legacy migration.
- **Phase 3:** Song mode chaining + UI.
- **Phase 4:** Audio recording (mic), auto-slice to pads; Tauri mic capability config in `src-tauri/capabilities/*.json` + desktop smoke test.
- **Phase 5:** Mixdown offline render via existing `exportWav`/offline machinery (extended for pattern/song timeline) + WAV export.
- Each phase keeps build/lint/tests green and is independently mergeable.

---

## 8. Open decisions (tracked for implementation)

- Exact accent waveform/freq for click (sine vs short envelope — implementation detail).
- Whether mixdown includes click track (default: excludes).
- Standalone (transport-independent) click mode: whether it's shipped in v1 or deferred (spec'd as a distinct path in §3.1).
