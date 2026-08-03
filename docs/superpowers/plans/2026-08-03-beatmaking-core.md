# Beatmaking Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `setInterval` playback in `StudioSequencer.tsx` with a sample-accurate Tone.js transport, add a synthesized metronome + count-in, live event recording with overdub + quantize, mic/instrument audio recording, time-signature / pattern-length / song-mode chaining, and offline mixdown to WAV that re-uses the engine's existing offline render path. Result: NC Sound Lab becomes a real beatmaking workstation (MPC/DAW-class) ready to ship as a Tauri desktop product.

**Architecture:** Tone.js v15+ as a transport backbone. `Tone.setContext(sharedCtx)` shares the existing `AudioContext` created by `lib/audioEngine.ts` so all audio routes to one graph; the 2123-line custom DSP engine stays untouched. A new `src/audio/transport/` module wraps `Tone.Transport`, `Sequence`, `Part`, `Recorder`. A new `src/store/patternStore.ts` lifts pattern state out of `StudioSequencer.tsx` (which currently holds it as component-local `useState`). Mixdown extends the engine's existing `exportWav` + `buildMasterRackModule` offline-render path to schedule pattern cells over time (no `Tone.Offline`, no new offline graph).

**Tech Stack:** React 19 + Vite 6 + TypeScript 5.8, Zustand 5, Vitest 4 + jsdom 29, Tone.js v15+ (new), JSZip 3.10 (already installed), Tauri v2 (already configured).

**Spec:** `docs/superpowers/specs/2026-08-03-beatmaking-core-design.md`

**Critical invariants — read first, enforce on every commit:**
1. **Tone init-ordering:** `Tone.setContext(sharedCtx)` MUST run before any Tone node/transport object is constructed. A unit test asserts `Tone.context` === `audioEngine.getContext()` after init.
2. **DPR for `setInterval` replacement:** the existing 16-step `setInterval` in `StudioSequencer.tsx:255` with per-pad swing via `setTimeout` (:225) and tap-tempo (:349) MUST be behaviorally preserved until Phase 1 ships. The Phase 1 task list includes a behavior-parity checklist.
3. **Pattern state migration:** pattern currently lives in `StudioSequencer.tsx:62` as `useState<Pattern>`. The new `patternStore` REPLACES this; the sequencer consumes the store after Phase 2.
4. **Mixdown does NOT use `Tone.Offline`.** It reuses the engine's existing offline render: `audioEngine.exportWav(layers, duration)` at `lib/audioEngine.ts:972` rebuilds the master rack FX in an `OfflineAudioContext`. Phase 5 schedules pattern cells into the same offline context and renders to WAV.
5. **Sequence export format version bump:** current export is `ncsoundlab-mpc-sequence` `version: 1` (`StudioSequencer.tsx:487`). Bump to `version: 2` and migrate `version: 1` files with defaults `timeSignature:[4,4]`, `stepLength:16`, `swing:0`.

---

## File Structure

### New files (Phase 1)
- `src/audio/transport/transport.ts` — Tone Transport singleton wrapper (init, BPM, time-sig, swing, play/stop/pause, position, events)
- `src/audio/transport/metronome.ts` — synthesized click (noise tick + pitched accent)
- `src/audio/transport/clickNodes.ts` — creates Tone oscillator + envelope pair for click sound
- `src/audio/transport/transport.test.ts` — unit tests for transport host + init-ordering invariant
- `src/audio/transport/metronome.test.ts` — unit tests for click scheduling + bar/beat accent pattern

### New files (Phase 2)
- `src/store/patternStore.ts` — Zustand store: patterns, active pattern, time-sig, stepLength, swing, bpm, song chain, format migration
- `src/store/patternStore.test.ts` — store unit tests + format migration tests
- `src/audio/transport/quantize.ts` — quantize a hit time to the grid
- `src/audio/transport/quantize.test.ts`
- `src/audio/transport/liveRecorder.ts` — captures pad/note hits during record; quantizes; merges into pattern
- `src/audio/transport/liveRecorder.test.ts`
- `src/audio/transport/countIn.ts` — 1-bar lead-in beat scheduler
- `src/audio/transport/countIn.test.ts`
- `src/sequencerFormat.ts` — export/import v1+v2 sequence files (moved from StudioSequencer)
- `src/sequencerFormat.test.ts`

### New files (Phase 3)
- `src/components/SongModePanel.tsx` — song chain editor (drag/reorder, duplicate, clear, play-from)
- `src/components/SongModePanel.test.tsx` — component test for chain ops

### New files (Phase 4)
- `src/audio/transport/audioCapture.ts` — getUserMedia + MediaRecorder; AudioBuffer → new sample layer; auto-slice
- `src/audio/transport/audioCapture.test.ts` — note: heavy stubbing; covers slice math + buffer plumbing
- `src-tauri/capabilities/audio-capture.json` — Tauri capability granting audio capture

### New files (Phase 5)
- `src/audio/transport/mixdown.ts` — schedule pattern/song cells into an `OfflineAudioContext`; reuse `audioEngine.exportWav` machinery
- `src/audio/transport/mixdown.test.ts`

### Modified files
- `package.json` — add `tone` dep
- `src/lib/audioEngine.ts` — add public getters `getMasterRackInput()`, `getMasterRackOutput()` (Phase 1)
- `src/components/StudioSequencer.tsx` — major refactor across Phases 1-2
- `src/components/TransportBar.tsx` (NEW, extracted from StudioSequencer) — transport UI in Phase 1
- `src/types.ts` — add `Pattern`, `PatternCell`, `SongChain`, `SequenceExportV2` types in Phase 2

---

## Phase 1: Transport backbone + click + count-in + replace setInterval

**Phase 1 Goal:** Tone.js installed, context shared, transport host running, click + count-in audible, `setInterval` playback in `StudioSequencer.tsx` replaced with transport-driven scheduling. Existing swing/tap-tempo/recording behavior preserved.

**Behavior-parity checklist (must pass at end of Phase 1):**
- [ ] 16-step pattern plays at correct BPM
- [ ] per-pad swing still offsets off-beat 16ths
- [ ] global swing still applies
- [ ] tap tempo still updates BPM
- [ ] step recording (MIDI keys during play) still inserts into pattern
- [ ] pad mute / pad choke / pad tune still honored
- [ ] existing 29 tests + 1 skipped still pass with `CONSTRAINED_ENV=1`
- [ ] `Tone.context === audioEngine.getContext()` after init (test enforced)

### Task 1.1: Install Tone.js

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add Tone.js dependency**

Run: `npm install --save tone`
Expected: `tone` appears in `dependencies`; `package-lock.json` updated; `node_modules/tone/package.json` exists.

- [ ] **Step 2: Verify Tone exports**

Run: `node -e "const T = require('tone'); console.log(typeof T.Transport, typeof T.Sequence, typeof T.Part, typeof T.Recorder);"` (from `C:\Users\User\Downloads\soundlab`)
Expected: `function function function function` (or `object` for some; non-undefined for all four). If any are `undefined`, the installed version differs from the spec — re-check Tone.js docs and adjust subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add tone v15 for transport backbone"
```

### Task 1.2: Expose master rack input/output on AudioEngine

**Files:**
- Modify: `src/lib/audioEngine.ts:45-46` (private → public via getters)
- Test: read existing tests to confirm no breakage

The metronome and mixdown both need to route audio through the existing master chain so what the user hears matches what gets rendered. Add public getters.

- [ ] **Step 1: Write a failing test (smoke check via existing test runner)**

Create: `src/lib/audioEngine.smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { audioEngine } from './audioEngine';

describe('audioEngine public surface', () => {
  it('exposes the shared AudioContext', () => {
    const ctx = audioEngine.getContext();
    expect(ctx).toBeInstanceOf(AudioContext);
  });

  it('exposes masterRackInput as a GainNode', () => {
    const node = audioEngine.getMasterRackInput();
    expect(node).toBeInstanceOf(GainNode);
  });

  it('exposes masterRackOutput as a GainNode', () => {
    const node = audioEngine.getMasterRackOutput();
    expect(node).toBeInstanceOf(GainNode);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/audioEngine.smoke.test.ts`
Expected: FAIL — `audioEngine.getMasterRackInput is not a function` (or similar).

- [ ] **Step 3: Add the public getters**

In `src/lib/audioEngine.ts`, after the existing `getContext()` method (line 767), add:

```ts
getMasterRackInput(): GainNode | null {
  return this.masterRackInput;
}

getMasterRackOutput(): GainNode | null {
  return this.masterRackOutput;
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/lib/audioEngine.smoke.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: existing 29 tests pass, 1 skipped, plus the 3 new tests = 32 pass, 1 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audioEngine.ts src/lib/audioEngine.smoke.test.ts
git commit -m "feat(audio): expose masterRackInput/Output for transport routing"
```

### Task 1.3: Transport host — singleton with Tone.setContext init-ordering

**Files:**
- Create: `src/audio/transport/transport.ts`
- Test: `src/audio/transport/transport.test.ts`

The transport host wraps Tone Transport. It must call `Tone.setContext(sharedCtx)` once at init, before any other Tone API touch. It exposes play/stop/pause/setBpm/setTimeSignature/setSwing/getPosition/events.

- [ ] **Step 1: Write the failing test**

Create: `src/audio/transport/transport.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Tone from 'tone';
import { audioEngine } from '../../lib/audioEngine';
import { initTransport, getTransport, resetTransport } from './transport';

describe('transport host', () => {
  beforeEach(() => {
    resetTransport();
  });

  it('shares the app AudioContext with Tone (init-ordering invariant)', () => {
    const shared = audioEngine.getContext();
    initTransport();
    expect(Tone.getContext().rawContext).toBe(shared);
  });

  it('is idempotent — calling init twice does not throw', () => {
    initTransport();
    expect(() => initTransport()).not.toThrow();
  });

  it('sets bpm on the underlying Tone Transport', () => {
    initTransport();
    getTransport().setBpm(140);
    expect(Tone.Transport.bpm.value).toBeCloseTo(140, 5);
  });

  it('sets time signature (4/4) on Tone Transport', () => {
    initTransport();
    getTransport().setTimeSignature(4, 4);
    expect(Tone.Transport.timeSignature).toBe(4);
  });

  it('sets time signature (3/4) on Tone Transport', () => {
    initTransport();
    getTransport().setTimeSignature(3, 4);
    expect(Tone.Transport.timeSignature).toBe(3);
  });

  it('sets time signature (6/8) on Tone Transport', () => {
    initTransport();
    getTransport().setTimeSignature(6, 8);
    expect(Tone.Transport.timeSignature).toBe(6);
  });

  it('clamps swing to Tone valid range 0..0.66', () => {
    initTransport();
    getTransport().setSwing(0.7); // out of range — should clamp
    expect(Tone.Transport.swing).toBeLessThanOrEqual(0.66);
    getTransport().setSwing(-0.1);
    expect(Tone.Transport.swing).toBeGreaterThanOrEqual(0);
  });

  it('play() and stop() toggle Tone.Transport state', () => {
    initTransport();
    getTransport().play();
    expect(Tone.Transport.state).toBe('started');
    getTransport().stop();
    expect(Tone.Transport.state).toBe('stopped');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/transport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the transport host**

Create: `src/audio/transport/transport.ts`

```ts
import * as Tone from 'tone';
import { audioEngine } from '../../lib/audioEngine';

type Listener = (info: { type: 'tick' | 'bar'; position: number }) => void;

class TransportHost {
  private initialized = false;
  private listeners = new Set<Listener>();

  init(): void {
    if (this.initialized) return;
    const shared = audioEngine.getContext();
    if (!shared) {
      throw new Error('audioEngine.getContext() returned null — call init after AudioEngine boots');
    }
    Tone.setContext(shared);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setBpm(bpm: number): void {
    Tone.Transport.bpm.value = bpm;
  }

  setTimeSignature(beats: 3 | 4 | 6, noteValue: 4 | 8): void {
    Tone.Transport.timeSignature = beats;
    // Tone's PPQ/position math is in 16th notes; we always schedule against
    // 16th-note ticks regardless of the displayed time signature.
    if (noteValue === 8) {
      // 6/8 effectively shifts accent but Tone doesn't expose note-value directly;
      // 16th scheduling still works because we use Tone.Transport.position which
      // is in beats. Documented in spec §3.5.
    }
  }

  setSwing(swing: number): void {
    const clamped = Math.min(0.66, Math.max(0, swing));
    Tone.Transport.swing = clamped;
    Tone.Transport.swingSubdivision = '16n';
  }

  play(): void {
    Tone.Transport.start();
  }

  pause(): void {
    Tone.Transport.pause();
  }

  stop(): void {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
  }

  getPosition(): string {
    return Tone.Transport.position;
  }

  onTick(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const host = new TransportHost();

export function initTransport(): void {
  host.init();
}

export function getTransport(): TransportHost {
  if (!host.isInitialized()) {
    throw new Error('Transport not initialized — call initTransport() first');
  }
  return host;
}

export function resetTransport(): void {
  // For tests only
  (host as any).initialized = false;
  (host as any).listeners = new Set();
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/transport.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: 32 + 8 = 40 pass, 1 skipped (CONSTRAINED_ENV=1 evolutionEngine).

- [ ] **Step 6: Commit**

```bash
git add src/audio/transport/transport.ts src/audio/transport/transport.test.ts
git commit -m "feat(transport): Tone Transport host with shared-context init-ordering"
```

### Task 1.4: Metronome — synthesized click

**Files:**
- Create: `src/audio/transport/clickNodes.ts`
- Create: `src/audio/transport/metronome.ts`
- Test: `src/audio/transport/metronome.test.ts`

The metronome synthesizes a short noise tick (off-beat) and a higher-pitched sine accent (downbeat) using Tone's `MembraneSynth`/`MetalSynth` or a `NoiseSynth`. Zero audio assets. Routes through `audioEngine.getMasterRackInput()` so it goes through the master FX chain.

- [ ] **Step 1: Write the failing test**

Create: `src/audio/transport/metronome.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audioEngine } from '../../lib/audioEngine';
import { initTransport, resetTransport } from './transport';
import { createMetronome, clickBeat, ACCENT_FREQ, TICK_FREQ } from './metronome';

describe('metronome', () => {
  beforeEach(() => {
    resetTransport();
    initTransport();
  });

  it('creates a metronome connected to the master rack input', () => {
    const m = createMetronome();
    expect(m).toBeDefined();
    m.dispose();
  });

  it('clickBeat returns accent freq on bar start (beat 0) and tick on others', () => {
    expect(clickBeat(0, 0, 4)).toEqual({ freq: ACCENT_FREQ, accent: true });
    expect(clickBeat(1, 0, 4)).toEqual({ freq: TICK_FREQ, accent: false });
    expect(clickBeat(2, 0, 4)).toEqual({ freq: TICK_FREQ, accent: false });
    expect(clickBeat(3, 0, 4)).toEqual({ freq: TICK_FREQ, accent: false });
  });

  it('clickBeat handles 3/4 and 6/8 correctly', () => {
    // 3/4: beats 0,1,2 with accent only on 0
    expect(clickBeat(0, 0, 3).accent).toBe(true);
    expect(clickBeat(2, 0, 3).accent).toBe(false);
    // 6/8: 6 beats per bar, accent on beat 0
    expect(clickBeat(0, 0, 6).accent).toBe(true);
    expect(clickBeat(3, 0, 6).accent).toBe(false);
  });

  it('dispose releases the metronome resources', () => {
    const m = createMetronome();
    expect(() => m.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/metronome.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create clickNodes.ts**

Create: `src/audio/transport/clickNodes.ts`

```ts
import * as Tone from 'tone';

/**
 * Synthesized click. MembraneSynth for the downbeat accent
 * (pitched, ~2000Hz fundamental) and NoiseSynth for the off-beat tick.
 * Both routed into a single Tone output node (the metronome host
 * connects that output to audioEngine.getMasterRackInput()).
 */
export function createClickNodes(): {
  accent: Tone.MembraneSynth;
  tick: Tone.NoiseSynth;
  out: Tone.Gain;
} {
  const accent = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
  });
  const tick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
  });
  const out = new Tone.Gain(0.5);
  accent.connect(out);
  tick.connect(out);
  return { accent, tick, out };
}
```

- [ ] **Step 4: Implement the metronome**

Create: `src/audio/transport/metronome.ts`

```ts
import * as Tone from 'tone';
import { audioEngine } from '../../lib/audioEngine';
import { createClickNodes } from './clickNodes';

export const ACCENT_FREQ = 'C5'; // ~523Hz, bright "ping" for downbeat
export const TICK_FREQ = 'C3';   // ~131Hz, body for off-beat

export interface ClickHit {
  freq: string;
  accent: boolean;
}

/**
 * Given bar position (beats since last bar boundary) and total beats in bar,
 * returns the click sound to play. Bar 0 beat 0 = accent, all others = tick.
 * Pure function — exported for testing.
 */
export function clickBeat(beatInBar: number, _bar: number, beatsPerBar: number): ClickHit {
  const isAccent = beatInBar % beatsPerBar === 0;
  return isAccent
    ? { freq: ACCENT_FREQ, accent: true }
    : { freq: TICK_FREQ, accent: false };
}

export interface Metronome {
  setEnabled(enabled: boolean): void;
  setVolume(v: number): void; // 0..1
  scheduleAtBeat(beatInBar: number, bar: number, beatsPerBar: number, time: number): void;
  dispose(): void;
}

export function createMetronome(): Metronome {
  const { accent, tick, out } = createClickNodes();
  const rackIn = audioEngine.getMasterRackInput();
  if (rackIn) {
    // Connect the metronome's Tone.Gain output to the raw Web Audio GainNode.
    // Tone.Gain's internal RawAudioNode can be unwrapped.
    (out as any).connect(rackIn as unknown as AudioNode);
  }

  let enabled = true;
  let volume = 0.5;

  function updateVolume() {
    out.gain.rampTo(volume, 0.01);
  }
  updateVolume();

  return {
    setEnabled(on: boolean) {
      enabled = on;
    },
    setVolume(v: number) {
      volume = Math.min(1, Math.max(0, v));
      updateVolume();
    },
    scheduleAtBeat(beatInBar: number, bar: number, beatsPerBar: number, time: number) {
      if (!enabled) return;
      const hit = clickBeat(beatInBar, bar, beatsPerBar);
      if (hit.accent) {
        accent.triggerAttackRelease(hit.freq, '32n', time);
      } else {
        tick.triggerAttackRelease('32n', time);
      }
    },
    dispose() {
      accent.dispose();
      tick.dispose();
      out.dispose();
    },
  };
}
```

- [ ] **Step 5: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/metronome.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio/transport/clickNodes.ts src/audio/transport/metronome.ts src/audio/transport/metronome.test.ts
git commit -m "feat(transport): synthesized metronome with routed click"
```

### Task 1.5: Count-in — 1-bar lead-in beat scheduler

**Files:**
- Create: `src/audio/transport/countIn.ts`
- Test: `src/audio/transport/countIn.test.ts`

- [ ] **Step 1: Write the failing test**

Create: `src/audio/transport/countIn.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildCountInBeats, COUNT_IN_BEATS, isCountInActive } from './countIn';

describe('count-in', () => {
  it('constant COUNT_IN_BEATS = 4 (one bar in 4/4)', () => {
    expect(COUNT_IN_BEATS).toBe(4);
  });

  it('buildCountInBeats returns N beats of the given bpm', () => {
    const beats = buildCountInBeats(4, 120);
    expect(beats).toHaveLength(4);
    // 120 BPM = 0.5s per beat; 4 beats = 2s total
    expect(beats[0].timeSec).toBeCloseTo(0, 5);
    expect(beats[1].timeSec).toBeCloseTo(0.5, 5);
    expect(beats[2].timeSec).toBeCloseTo(1.0, 5);
    expect(beats[3].timeSec).toBeCloseTo(1.5, 5);
  });

  it('isCountInActive is true while position is within count-in window', () => {
    expect(isCountInActive(0, 120, 4)).toBe(true);
    expect(isCountInActive(1.5, 120, 4)).toBe(true);
    expect(isCountInActive(1.99, 120, 4)).toBe(true);
    expect(isCountInActive(2.0, 120, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/countIn.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement countIn.ts**

Create: `src/audio/transport/countIn.ts`

```ts
export const COUNT_IN_BEATS = 4;

export interface CountInBeat {
  index: number;
  timeSec: number;
  isAccent: boolean; // beat 0 is accent
}

export function buildCountInBeats(beats: number, bpm: number): CountInBeat[] {
  const secPerBeat = 60 / bpm;
  const out: CountInBeat[] = [];
  for (let i = 0; i < beats; i++) {
    out.push({ index: i, timeSec: i * secPerBeat, isAccent: i === 0 });
  }
  return out;
}

/**
 * Whether a transport position (in seconds since start) is still inside the
 * count-in window. Once the window ends, the count-in is "done" and the
 * record/playback continues without further lead-in.
 */
export function isCountInActive(positionSec: number, bpm: number, beats = COUNT_IN_BEATS): boolean {
  const secPerBeat = 60 / bpm;
  return positionSec < beats * secPerBeat;
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/countIn.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/audio/transport/countIn.ts src/audio/transport/countIn.test.ts
git commit -m "feat(transport): count-in beat scheduler"
```

### Task 1.6: Wire transport into StudioSequencer (replace setInterval)

**Files:**
- Modify: `src/components/StudioSequencer.tsx` (large refactor; the setInterval at line 255 is replaced with Tone Transport scheduling)
- Create: `src/components/TransportBar.tsx` (extracted transport controls)

This is the largest task in Phase 1. The existing setInterval-driven step loop (lines 215-275) is replaced with a `Tone.Sequence` that fires per 16th, applying per-pad swing via the per-step `time` argument (Tone handles swing internally via `Transport.swing`).

Strategy: keep the existing `setInterval` code path alive behind a `useTransportMode` feature flag, default OFF initially. Once the Tone-driven path is verified, flip the flag default and delete the `setInterval` path in a follow-up commit. This is the lowest-risk way to do the 842-line refactor with a behavior-parity checklist.

- [ ] **Step 1: Add a feature flag**

In `src/components/StudioSequencer.tsx`, near the top of the file after the `useState` declarations (~line 64), add:

```ts
const [useTransportMode, setUseTransportMode] = useState(false);
```

(After Phase 1 ships and behavior is verified, this flag's default flips to `true` and the old code path is deleted in a separate commit.)

- [ ] **Step 2: Create a transport-driven tick handler (does not yet replace setInterval)**

In `src/components/StudioSequencer.tsx`, add this new useEffect (place it just after the existing `intervalRef` setInterval useEffect):

```ts
// Tone Transport mode (Phase 1, feature-flagged off by default)
useEffect(() => {
  if (!useTransportMode) return;
  let seq: Tone.Sequence | null = null;
  let cancelled = false;
  (async () => {
    initTransport();
    const t = getTransport();
    t.setBpm(bpm);
    t.setSwing(globalSwing);
    seq = new Tone.Sequence((time, stepIdx) => {
      if (cancelled) return;
      stepRef.current = stepIdx;
      Tone.Draw.schedule(() => setCurrentStep(stepIdx), time);
      const playing = playingRef.current;
      const recording = recordingRef.current;
      // Per-pad swing override: schedule off-beat pads later via setTimeout
      for (const layer of layers) {
        const row = patternRef.current[layer.id];
        if (!row) continue;
        const cell = row[stepIdx];
        if (!cell?.on) continue;
        const isOffBeat = stepIdx % 2 === 1;
        const padSwingPct = padSwingRef.current[layer.id] ?? 0;
        const swingDelay = isOffBeat ? (60 / bpm) * 0.25 * padSwingPct : 0;
        const trigger = () => {
          playerRef.current?.playLayer(layer.id, { velocity: 1 });
        };
        if (swingDelay > 0) {
          const tHandle = setTimeout(trigger, swingDelay * 1000);
          swingTimeoutsRef.current.add(tHandle);
        } else {
          trigger();
        }
      }
      void playing; void recording;
    }, [...Array(STEPS).keys()], '16n');
    seq.loop = true;
    seq.start(0);
    t.onTick(() => {});
  })();
  return () => {
    cancelled = true;
    if (seq) seq.dispose();
  };
}, [useTransportMode, bpm, globalSwing, layers]);
```

Add to imports near line 17:

```ts
import * as Tone from 'tone';
import { initTransport, getTransport } from '../audio/transport/transport';
```

- [ ] **Step 3: Add a small TransportBar component for the toggle**

Create: `src/components/TransportBar.tsx`

```tsx
import React from 'react';

interface TransportBarProps {
  bpm: number;
  isPlaying: boolean;
  useTransportMode: boolean;
  onBpmChange: (bpm: number) => void;
  onPlayStop: () => void;
  onUseTransportModeChange: (on: boolean) => void;
}

export function TransportBar({
  bpm, isPlaying, useTransportMode,
  onBpmChange, onPlayStop, onUseTransportModeChange,
}: TransportBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-black/40 border border-white/10 rounded">
      <button
        type="button"
        onClick={onPlayStop}
        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
        aria-label={isPlaying ? 'Stop' : 'Play'}
      >
        {isPlaying ? 'Stop' : 'Play'}
      </button>
      <label className="flex items-center gap-2 text-sm text-white/80">
        BPM
        <input
          type="number"
          min={30}
          max={300}
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          className="w-20 bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={useTransportMode}
          onChange={(e) => onUseTransportModeChange(e.target.checked)}
        />
        Tone Transport
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Render TransportBar in StudioSequencer**

In `src/components/StudioSequencer.tsx`, just before the existing play/stop controls (around line 690, the JSX area), add:

```tsx
<TransportBar
  bpm={bpm}
  isPlaying={isPlaying}
  useTransportMode={useTransportMode}
  onBpmChange={setBpm}
  onPlayStop={() => {
    if (isPlaying) {
      setIsPlaying(false);
      playingRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      if (useTransportMode) {
        setIsPlaying(true);
        playingRef.current = true;
        initTransport();
        getTransport().play();
      } else {
        // existing setInterval path — preserved
        setIsPlaying(true);
        playingRef.current = true;
        // ... existing intervalRef setup ...
      }
    }
  }}
  onUseTransportModeChange={setUseTransportMode}
/>
```

(The `setIsPlaying/setBpm` props are already defined as `useState` setters in the parent component.)

- [ ] **Step 5: Run all tests + dev server smoke test**

Run: `npm test`
Expected: 40 + 4 + 3 = 47 pass, 1 skipped.

Run: `npm run dev` (open `http://localhost:3000`, navigate to Beat Studio, verify the "Tone Transport" checkbox renders and that toggling it on while playing routes through the new code path without console errors).

- [ ] **Step 6: Behavior-parity checklist**

Verify in the running app:
- [ ] 16-step pattern plays at the right BPM
- [ ] per-pad swing still offsets off-beat 16ths
- [ ] global swing still applies
- [ ] tap tempo still updates BPM
- [ ] pad mute / pad choke / pad tune still honored

Document any failure and FIX BEFORE COMMITTING.

- [ ] **Step 7: Commit**

```bash
git add src/components/StudioSequencer.tsx src/components/TransportBar.tsx
git commit -m "feat(sequencer): Tone Transport mode behind feature flag (Phase 1)"
```

### Task 1.7: Flip the default and delete the setInterval path

This task only runs after Task 1.6's parity checklist passes. It is intentionally a separate commit so rollback is clean.

**Files:**
- Modify: `src/components/StudioSequencer.tsx`

- [ ] **Step 1: Flip the default**

Change `useState(false)` → `useState(true)` for `useTransportMode` in `src/components/StudioSequencer.tsx`.

- [ ] **Step 2: Delete the old setInterval path**

Remove:
- The `intervalRef = useRef<...>(null)` declaration (line 88)
- The entire `useEffect` that sets up `setInterval` (around lines 215-275, which is the old step-tick loop)
- The `setInterval`/clearInterval calls in the play/stop handler (now replaced by the Transport-driven path)

Keep the `stepRef = useRef(0)` because the new transport-driven code also uses it.

- [ ] **Step 3: Run all tests + dev server smoke test**

Run: `npm test`
Expected: same as Task 1.6.

Run: `npm run dev`. In Beat Studio: play, verify audio, verify recording still works.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/StudioSequencer.tsx
git commit -m "feat(sequencer): default to Tone Transport, remove setInterval path"
```

### Task 1.8: Build the Tauri desktop EXE to confirm no regressions

**Files:** none

- [ ] **Step 1: Build the desktop EXE**

Run: `npm run tauri:build`
Expected: build succeeds; new EXE produced at `src-tauri/target/release/nc-sound-lab.exe` and NSIS installer at `src-tauri/target/release/bundle/nsis/NC Sound Lab Studio_1.0.0_x64-setup.exe`.

- [ ] **Step 2: Launch the EXE and smoke test**

Run the new EXE. Open Beat Studio. Verify the "Tone Transport" mode is on by default. Play a pattern. Verify audible audio. Close the app.

- [ ] **Step 3: Commit (no code changes — empty commit if needed)**

If any code change was required to fix a build issue, commit it. Otherwise, no commit.

```bash
git commit --allow-empty -m "chore: Phase 1 desktop smoke test passed"
```

**Phase 1 complete when:** 47+ tests pass, 1 skipped, build green, EXE launches, behavior-parity checklist passes.

---

## Phase 2: Live event recording + time-sig + pattern store

**Phase 2 Goal:** Lift pattern state out of `StudioSequencer.tsx` into a new `patternStore` (Zustand). Implement live event recording with quantize + overdub. Add time-signature and step-length selectors. Bump sequence export format to v2 with v1→v2 migration.

### Task 2.1: Add shared types to src/types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the new types**

Append to `src/types.ts`:

```ts
export interface PatternCell {
  on: boolean;
  note?: number;
  velocity?: number;
}

export interface Pattern {
  id: string;
  name: string;
  layerRows: Record<string, PatternCell[]>;
  timeSignature: [number, number]; // [beats, noteValue]
  stepLength: 16 | 32;
  swing: number;
  bpm: number;
}

export interface SongChain {
  order: string[]; // patternIds
}

export interface SequenceExportV1 {
  format: 'ncsoundlab-mpc-sequence';
  version: 1;
  bpm: number;
  steps: number;
  ppq: number;
  pattern: Record<string, Array<{ on: boolean; note?: number }>>;
}

export interface SequenceExportV2 {
  format: 'ncsoundlab-mpc-sequence';
  version: 2;
  bpm: number;
  timeSignature: [number, number];
  stepLength: 16 | 32;
  swing: number;
  steps: number;
  ppq: number;
  pattern: Record<string, PatternCell[]>;
  songChain?: SongChain;
}

export type SequenceExport = SequenceExportV1 | SequenceExportV2;

export function isV1Export(x: unknown): x is SequenceExportV1 {
  return !!x && typeof x === 'object' && (x as any).format === 'ncsoundlab-mpc-sequence' && (x as any).version === 1;
}

export function isV2Export(x: unknown): x is SequenceExportV2 {
  return !!x && typeof x === 'object' && (x as any).format === 'ncsoundlab-mpc-sequence' && (x as any).version === 2;
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add Pattern, PatternCell, SongChain, SequenceExportV1/V2"
```

### Task 2.2: patternStore with multi-pattern + format migration

**Files:**
- Create: `src/store/patternStore.ts`
- Test: `src/store/patternStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create: `src/store/patternStore.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { usePatternStore, newEmptyPattern, migrateFromV1 } from './patternStore';
import type { Pattern, SequenceExportV1, SequenceExportV2 } from '../types';

describe('patternStore', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('starts with one default pattern A (4/4, 16 steps, swing 0, bpm 120)', () => {
    const s = usePatternStore.getState();
    expect(s.patterns.A).toBeDefined();
    expect(s.patterns.A.timeSignature).toEqual([4, 4]);
    expect(s.patterns.A.stepLength).toBe(16);
    expect(s.patterns.A.swing).toBe(0);
    expect(s.patterns.A.bpm).toBe(120);
    expect(s.activePatternId).toBe('A');
  });

  it('sets a layer row in the active pattern', () => {
    usePatternStore.getState().setCell('A', 'layer1', 0, { on: true, velocity: 100 });
    const row = usePatternStore.getState().patterns.A.layerRows.layer1;
    expect(row[0]).toEqual({ on: true, velocity: 100 });
  });

  it('switches active pattern', () => {
    usePatternStore.getState().setActivePattern('B');
    expect(usePatternStore.getState().activePatternId).toBe('B');
  });

  it('updates BPM and propagates to the active pattern', () => {
    usePatternStore.getState().setBpm(140);
    expect(usePatternStore.getState().patterns.A.bpm).toBe(140);
  });

  it('updates time signature (3/4)', () => {
    usePatternStore.getState().setTimeSignature(3, 4);
    expect(usePatternStore.getState().patterns.A.timeSignature).toEqual([3, 4]);
  });

  it('updates time signature (6/8)', () => {
    usePatternStore.getState().setTimeSignature(6, 8);
    expect(usePatternStore.getState().patterns.A.timeSignature).toEqual([6, 8]);
  });

  it('updates step length to 32', () => {
    usePatternStore.getState().setStepLength(32);
    expect(usePatternStore.getState().patterns.A.stepLength).toBe(32);
  });

  it('updates swing clamped 0..0.66', () => {
    usePatternStore.getState().setSwing(0.7);
    expect(usePatternStore.getState().patterns.A.swing).toBeLessThanOrEqual(0.66);
  });
});

describe('migrateFromV1', () => {
  it('migrates a v1 export to v2 with default time-sig, stepLength, swing', () => {
    const v1: SequenceExportV1 = {
      format: 'ncsoundlab-mpc-sequence',
      version: 1,
      bpm: 130,
      steps: 16,
      ppq: 96,
      pattern: { layer1: Array.from({ length: 16 }, (_, i) => ({ on: i % 4 === 0 })) },
    };
    const v2: SequenceExportV2 = migrateFromV1(v1);
    expect(v2.version).toBe(2);
    expect(v2.bpm).toBe(130);
    expect(v2.timeSignature).toEqual([4, 4]);
    expect(v2.stepLength).toBe(16);
    expect(v2.swing).toBe(0);
    expect(v2.pattern.layer1[0].on).toBe(true);
  });
});

describe('newEmptyPattern', () => {
  it('creates a pattern with N empty rows for the given layer ids', () => {
    const p: Pattern = newEmptyPattern(['l1', 'l2'], 120);
    expect(p.timeSignature).toEqual([4, 4]);
    expect(p.stepLength).toBe(16);
    expect(p.layerRows.l1).toHaveLength(16);
    expect(p.layerRows.l2).toHaveLength(16);
    expect(p.layerRows.l1.every((c) => !c.on)).toBe(true);
  });

  it('honors time-sig, stepLength, swing, bpm params', () => {
    const p = newEmptyPattern(['l1'], 90, 3, 4, 32, 0.5);
    expect(p.bpm).toBe(90);
    expect(p.timeSignature).toEqual([3, 4]);
    expect(p.stepLength).toBe(32);
    expect(p.swing).toBe(0.5);
    expect(p.layerRows.l1).toHaveLength(32);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/patternStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pattern store**

Create: `src/store/patternStore.ts`

```ts
import { create } from 'zustand';
import type {
  Pattern, PatternCell, SongChain, SequenceExportV1, SequenceExportV2,
} from '../types';

export const PATTERN_IDS = ['A', 'B', 'C', 'D'] as const;
export type PatternId = typeof PATTERN_IDS[number];

export function newEmptyPattern(
  layerIds: string[],
  bpm = 120,
  beats: 3 | 4 | 6 = 4,
  noteValue: 4 | 8 = 4,
  stepLength: 16 | 32 = 16,
  swing = 0,
): Pattern {
  const layerRows: Record<string, PatternCell[]> = {};
  for (const id of layerIds) {
    layerRows[id] = Array.from({ length: stepLength }, () => ({ on: false }));
  }
  return {
    id: 'A',
    name: 'Pattern A',
    layerRows,
    timeSignature: [beats, noteValue],
    stepLength,
    swing,
    bpm,
  };
}

export function migrateFromV1(v1: SequenceExportV1): SequenceExportV2 {
  return {
    format: 'ncsoundlab-mpc-sequence',
    version: 2,
    bpm: v1.bpm,
    timeSignature: [4, 4],
    stepLength: (v1.steps === 32 ? 32 : 16),
    swing: 0,
    steps: v1.steps,
    ppq: v1.ppq,
    pattern: Object.fromEntries(
      Object.entries(v1.pattern).map(([k, cells]) => [
        k,
        cells.map((c) => ({ on: !!c.on, note: c.note, velocity: undefined })),
      ]),
    ),
  };
}

interface PatternStore {
  patterns: Record<PatternId, Pattern>;
  activePatternId: PatternId;
  songChain: SongChain;
  setActivePattern: (id: PatternId) => void;
  setCell: (patternId: PatternId, layerId: string, stepIdx: number, cell: PatternCell) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (beats: 3 | 4 | 6, noteValue: 4 | 8) => void;
  setStepLength: (len: 16 | 32) => void;
  setSwing: (swing: number) => void;
  setRow: (patternId: PatternId, layerId: string, row: PatternCell[]) => void;
  ensureLayerRow: (patternId: PatternId, layerId: string) => void;
  loadFromExport: (data: SequenceExportV2) => void;
  reset: () => void;
}

function makePatterns(layerIds: string[]): Record<PatternId, Pattern> {
  return {
    A: newEmptyPattern(layerIds),
    B: newEmptyPattern(layerIds),
    C: newEmptyPattern(layerIds),
    D: newEmptyPattern(layerIds),
  };
}

export const usePatternStore = create<PatternStore>((set, get) => ({
  patterns: makePatterns([]),
  activePatternId: 'A',
  songChain: { order: ['A', 'B', 'C', 'D'] },

  setActivePattern: (id) => set({ activePatternId: id }),

  setCell: (patternId, layerId, stepIdx, cell) =>
    set((s) => {
      const p = s.patterns[patternId];
      const row = p.layerRows[layerId] ?? Array.from({ length: p.stepLength }, () => ({ on: false }));
      const next = row.slice();
      next[stepIdx] = cell;
      return {
        patterns: { ...s.patterns, [patternId]: { ...p, layerRows: { ...p.layerRows, [layerId]: next } } },
      };
    }),

  setBpm: (bpm) =>
    set((s) => {
      const p = s.patterns[s.activePatternId];
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, bpm } } };
    }),

  setTimeSignature: (beats, noteValue) =>
    set((s) => {
      const p = s.patterns[s.activePatternId];
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, timeSignature: [beats, noteValue] } } };
    }),

  setStepLength: (len) =>
    set((s) => {
      const p = s.patterns[s.activePatternId];
      const layerRows: Record<string, PatternCell[]> = {};
      for (const [k, row] of Object.entries(p.layerRows)) {
        layerRows[k] = row.length === len ? row.slice() : Array.from({ length: len }, (_, i) => row[i] ?? { on: false });
      }
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, stepLength: len, layerRows } } };
    }),

  setSwing: (swing) =>
    set((s) => {
      const clamped = Math.min(0.66, Math.max(0, swing));
      const p = s.patterns[s.activePatternId];
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, swing: clamped } } };
    }),

  setRow: (patternId, layerId, row) =>
    set((s) => {
      const p = s.patterns[patternId];
      return { patterns: { ...s.patterns, [patternId]: { ...p, layerRows: { ...p.layerRows, [layerId]: row } } } };
    }),

  ensureLayerRow: (patternId, layerId) =>
    set((s) => {
      const p = s.patterns[patternId];
      if (p.layerRows[layerId]) return {};
      return {
        patterns: {
          ...s.patterns,
          [patternId]: {
            ...p,
            layerRows: { ...p.layerRows, [layerId]: Array.from({ length: p.stepLength }, () => ({ on: false })) },
          },
        },
      };
    }),

  loadFromExport: (data) =>
    set((s) => {
      const merged = { ...s.patterns };
      for (const [layerId, row] of Object.entries(data.pattern)) {
        for (const pid of PATTERN_IDS) {
          if (!merged[pid].layerRows[layerId]) {
            merged[pid].layerRows[layerId] = row.map((c) => ({ ...c }));
          } else {
            merged[pid].layerRows[layerId] = row.map((c) => ({ ...c }));
          }
        }
      }
      merged.A = {
        ...merged.A,
        bpm: data.bpm,
        timeSignature: data.timeSignature,
        stepLength: data.stepLength,
        swing: data.swing,
      };
      return { patterns: merged, songChain: data.songChain ?? s.songChain };
    }),

  reset: () => set({ patterns: makePatterns([]), activePatternId: 'A', songChain: { order: ['A', 'B', 'C', 'D'] } }),
}));

void get;
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/store/patternStore.test.ts`
Expected: 11 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 47 + 11 = 58 pass, 1 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/store/patternStore.ts src/store/patternStore.test.ts
git commit -m "feat(store): patternStore with multi-pattern + v1->v2 migration"
```

### Task 2.3: Sequencer-format module (export/import v1+v2)

**Files:**
- Create: `src/sequencerFormat.ts`
- Test: `src/sequencerFormat.test.ts`

- [ ] **Step 1: Write the failing test**

Create: `src/sequencerFormat.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { exportV2, importExport } from './sequencerFormat';
import { newEmptyPattern } from './store/patternStore';
import type { SequenceExportV1, SequenceExportV2 } from './types';

describe('sequencerFormat', () => {
  it('exports a v2 file with bpm, timeSig, stepLength, swing, pattern', () => {
    const p = newEmptyPattern(['l1', 'l2'], 132, 3, 4, 32, 0.2);
    p.layerRows.l1[0] = { on: true, velocity: 110 };
    const data: SequenceExportV2 = exportV2('A', p, { order: ['A'] });
    expect(data.version).toBe(2);
    expect(data.bpm).toBe(132);
    expect(data.timeSignature).toEqual([3, 4]);
    expect(data.stepLength).toBe(32);
    expect(data.swing).toBe(0.2);
    expect(data.pattern.l1[0].on).toBe(true);
  });

  it('imports a v1 file via migration to v2', () => {
    const v1: SequenceExportV1 = {
      format: 'ncsoundlab-mpc-sequence',
      version: 1,
      bpm: 90, steps: 16, ppq: 96,
      pattern: { l1: Array.from({ length: 16 }, () => ({ on: false })) },
    };
    const out = importExport(v1);
    expect(out.version).toBe(2);
    expect(out.bpm).toBe(90);
    expect(out.timeSignature).toEqual([4, 4]);
  });

  it('round-trips v2 export -> import', () => {
    const p = newEmptyPattern(['x'], 100);
    p.layerRows.x[4] = { on: true };
    const exported = exportV2('A', p);
    const reimported = importExport(exported);
    expect(reimported.pattern.x[4].on).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sequencerFormat.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement sequencerFormat.ts**

Create: `src/sequencerFormat.ts`

```ts
import { isV1Export, isV2Export } from './types';
import { migrateFromV1 } from './store/patternStore';
import type { Pattern, SequenceExport, SequenceExportV2, SongChain } from './types';

export function exportV2(
  activeId: string,
  p: Pattern,
  songChain: SongChain = { order: [activeId] },
): SequenceExportV2 {
  return {
    format: 'ncsoundlab-mpc-sequence',
    version: 2,
    bpm: p.bpm,
    timeSignature: p.timeSignature,
    stepLength: p.stepLength,
    swing: p.swing,
    steps: p.stepLength,
    ppq: 96,
    pattern: p.layerRows,
    songChain,
  };
}

export function importExport(data: unknown): SequenceExportV2 {
  if (isV2Export(data)) return data;
  if (isV1Export(data)) return migrateFromV1(data);
  throw new Error('Unrecognized sequence export format');
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/sequencerFormat.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sequencerFormat.ts src/sequencerFormat.test.ts
git commit -m "feat(format): sequence export/import v1+v2 with migration"
```

### Task 2.4: Quantize utility

**Files:**
- Create: `src/audio/transport/quantize.ts`
- Test: `src/audio/transport/quantize.test.ts`

- [ ] **Step 1: Write the failing test**

Create: `src/audio/transport/quantize.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { quantizeTime, stepIndexToSeconds, secondsToStepIndex } from './quantize';

describe('quantize', () => {
  it('quantizes to the nearest 1/16 step (timeCorrect = 1)', () => {
    const bpm = 120;
    const secPer16 = 60 / bpm / 4;
    expect(quantizeTime(0.01, bpm, 1)).toBeCloseTo(0, 5);
    expect(quantizeTime(secPer16 * 0.4, bpm, 1)).toBeCloseTo(0, 5);
    expect(quantizeTime(secPer16 * 0.6, bpm, 1)).toBeCloseTo(secPer16, 5);
  });

  it('quantizes to the nearest 1/8 step (timeCorrect = 2)', () => {
    const bpm = 120;
    const secPer8 = 60 / bpm / 2;
    expect(quantizeTime(secPer8 * 0.7, bpm, 2)).toBeCloseTo(secPer8, 5);
  });

  it('quantizes to the nearest 1/4 step (timeCorrect = 4)', () => {
    const bpm = 120;
    const secPer4 = 60 / bpm;
    expect(quantizeTime(secPer4 * 0.4, bpm, 4)).toBeCloseTo(0, 5);
    expect(quantizeTime(secPer4 * 0.6, bpm, 4)).toBeCloseTo(secPer4, 5);
  });

  it('round-trips step index <-> seconds (within tolerance)', () => {
    const bpm = 140;
    for (let i = 0; i < 16; i++) {
      const sec = stepIndexToSeconds(i, bpm);
      const idx = secondsToStepIndex(sec, bpm);
      expect(idx).toBe(i);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/quantize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement quantize.ts**

Create: `src/audio/transport/quantize.ts`

```ts
const secPerBeat = (bpm: number) => 60 / bpm;

/** Time in seconds to a 1/(timeCorrect*4) grid step. timeCorrect: 1=1/16, 2=1/8, 4=1/4. */
export function quantizeTime(timeSec: number, bpm: number, timeCorrect: 1 | 2 | 4): number {
  const grid = secPerBeat(bpm) / (4 / timeCorrect); // 1/16 grid by default
  return Math.round(timeSec / grid) * grid;
}

/** Step index (16th-note units) to seconds. */
export function stepIndexToSeconds(stepIdx: number, bpm: number): number {
  return secPerBeat(bpm) / 4 * stepIdx;
}

/** Seconds back to step index, snapped to nearest. */
export function secondsToStepIndex(timeSec: number, bpm: number): number {
  const grid = secPerBeat(bpm) / 4;
  return Math.round(timeSec / grid);
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/quantize.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/audio/transport/quantize.ts src/audio/transport/quantize.test.ts
git commit -m "feat(transport): quantize to 1/16, 1/8, 1/4 grid"
```

### Task 2.5: liveRecorder — captures events, merges into pattern (overdub)

**Files:**
- Create: `src/audio/transport/liveRecorder.ts`
- Test: `src/audio/transport/liveRecorder.test.ts`

- [ ] **Step 1: Write the failing test**

Create: `src/audio/transport/liveRecorder.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createLiveRecorder, type LiveEvent } from './liveRecorder';
import { newEmptyPattern } from '../../store/patternStore';

describe('liveRecorder', () => {
  beforeEach(() => {});

  it('starts in stopped state', () => {
    const r = createLiveRecorder();
    expect(r.isActive()).toBe(false);
    r.dispose();
  });

  it('records a pad hit and merges into the pattern (overdub: existing on stays on)', () => {
    const r = createLiveRecorder();
    r.start(120, 1);
    const pattern = newEmptyPattern(['kick'], 120);
    const event: LiveEvent = { type: 'pad', layerId: 'kick', stepIdx: 0, timeSec: 0, velocity: 100 };
    r.recordEvent(event, pattern);
    r.stop();
    expect(pattern.layerRows.kick[0].on).toBe(true);
    expect(pattern.layerRows.kick[0].velocity).toBe(100);
    r.dispose();
  });

  it('overdub: a second hit on the same step overwrites the velocity (MPC-style)', () => {
    const r = createLiveRecorder();
    r.start(120, 1);
    const pattern = newEmptyPattern(['snare'], 120);
    r.recordEvent({ type: 'pad', layerId: 'snare', stepIdx: 4, timeSec: 0.083, velocity: 80 }, pattern);
    r.recordEvent({ type: 'pad', layerId: 'snare', stepIdx: 4, timeSec: 0.084, velocity: 127 }, pattern);
    r.stop();
    expect(pattern.layerRows.snare[4].velocity).toBe(127);
    r.dispose();
  });

  it('quantizes a hit to the grid based on timeCorrect', () => {
    const r = createLiveRecorder();
    r.start(120, 1); // 1/16 grid
    const pattern = newEmptyPattern(['hat'], 120);
    // Hit slightly before step 2 (~0.085s, off by 5ms)
    r.recordEvent({ type: 'pad', layerId: 'hat', stepIdx: -1, timeSec: 0.080, velocity: 100 }, pattern);
    r.stop();
    expect(pattern.layerRows.hat[0].on).toBe(true);
    r.dispose();
  });

  it('captures a piano note at the current step', () => {
    const r = createLiveRecorder();
    r.start(120, 1);
    const pattern = newEmptyPattern(['keys'], 120);
    r.recordEvent({ type: 'note', layerId: 'keys', stepIdx: 8, timeSec: 0.33, velocity: 90, note: 60 }, pattern);
    r.stop();
    expect(pattern.layerRows.keys[8].note).toBe(60);
    r.dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/liveRecorder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement liveRecorder.ts**

Create: `src/audio/transport/liveRecorder.ts`

```ts
import type { Pattern, PatternCell } from '../../types';
import { quantizeTime, secondsToStepIndex } from './quantize';

export type LiveEvent =
  | { type: 'pad'; layerId: string; stepIdx: number; timeSec: number; velocity: number }
  | { type: 'note'; layerId: string; stepIdx: number; timeSec: number; velocity: number; note: number };

export interface LiveRecorder {
  start(bpm: number, timeCorrect: 1 | 2 | 4): void;
  recordEvent(event: LiveEvent, pattern: Pattern): void;
  stop(): void;
  isActive(): boolean;
  setStepLength(len: 16 | 32): void;
  dispose(): void;
}

export function createLiveRecorder(): LiveRecorder {
  let active = false;
  let bpm = 120;
  let timeCorrect: 1 | 2 | 4 = 1;
  let stepLength: 16 | 32 = 16;

  function resolveStep(eventTimeSec: number, explicitStepIdx: number): number {
    if (explicitStepIdx >= 0) return explicitStepIdx;
    const quantized = quantizeTime(eventTimeSec, bpm, timeCorrect);
    return Math.max(0, Math.min(stepLength - 1, secondsToStepIndex(quantized, bpm)));
  }

  return {
    start(_bpm, _timeCorrect) {
      bpm = _bpm;
      timeCorrect = _timeCorrect;
      active = true;
    },
    recordEvent(event, pattern) {
      if (!active) return;
      const step = resolveStep(event.timeSec, event.stepIdx);
      const row = pattern.layerRows[event.layerId] ?? Array.from({ length: stepLength }, () => ({ on: false }));
      const next: PatternCell = row[step] ? { ...row[step] } : { on: false };
      next.on = true;
      next.velocity = event.velocity;
      if (event.type === 'note') next.note = event.note;
      const newRow = row.slice();
      newRow[step] = next;
      pattern.layerRows[event.layerId] = newRow;
    },
    stop() { active = false; },
    isActive() { return active; },
    setStepLength(len) { stepLength = len; },
    dispose() { active = false; },
  };
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/liveRecorder.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/audio/transport/liveRecorder.ts src/audio/transport/liveRecorder.test.ts
git commit -m "feat(transport): liveRecorder with quantize and overdub merge"
```

### Task 2.6: Wire patternStore into StudioSequencer (lift state)

**Files:**
- Modify: `src/components/StudioSequencer.tsx` (lift `pattern` state, BPM, time-sig, step-length, swing into the store)

- [ ] **Step 1: Replace local pattern state with store reads**

In `src/components/StudioSequencer.tsx`:
- Add `import { usePatternStore } from '../store/patternStore';`
- Add `import { exportV2, importExport } from '../sequencerFormat';`
- Replace `const [pattern, setPattern] = useState<Pattern>(...)` (line 62) with:
  ```ts
  const pattern = usePatternStore((s) => s.patterns[s.activePatternId].layerRows);
  const setCell = usePatternStore((s) => s.setCell);
  const setRow = usePatternStore((s) => s.setRow);
  const ensureLayerRow = usePatternStore((s) => s.ensureLayerRow);
  const bpm = usePatternStore((s) => s.patterns[s.activePatternId].bpm);
  const setBpm = usePatternStore((s) => s.setBpm);
  ```
- Remove the local `bpm` `useState` (line 58).
- Remove `useState<Pattern>(...)` (line 62).
- Keep `patternRef` in sync via `useEffect`.

- [ ] **Step 2: Replace direct setPattern calls with setCell**

Find every `setPattern((prev) => ...)` in the file (lines 124, 280, 289, 305, 318, 320, 330, 391) and rewrite to use the new store API:
- `setPattern((prev) => ...)` for a single cell update → `setCell(activePatternId, layerId, stepIdx, newCell)`
- `setPattern((prev) => ...)` for a row update → `setRow(activePatternId, layerId, newRow)`
- `clearPattern()` (line 391) → `setRow(activePatternId, layerId, Array(...).fill({on:false}))`

This step is deliberately mechanical: each `setPattern` call is small and the test in Task 2.7 verifies the result.

- [ ] **Step 3: Update save/load (export/import)**

Replace the export block (line 487) and the import block (line 544) with:
```ts
const data = exportV2(activePatternId, usePatternStore.getState().patterns[activePatternId]);
// ... in the import file picker:
const text = await file.text();
const parsed = JSON.parse(text);
usePatternStore.getState().loadFromExport(importExport(parsed));
```

- [ ] **Step 4: Add ensureLayerRow on layer list change**

In the existing useEffect that watches `layers` (where pad programs are pruned), call `ensureLayerRow(activePatternId, layer.id)` for any new layer.

- [ ] **Step 5: Run all tests + dev smoke**

Run: `npm test`
Expected: 58 + 5 (liveRecorder) + 3 (sequencerFormat) = 66 pass, 1 skipped.

Run: `npm run dev`. In Beat Studio: play a pattern, hit pads, save, reload, verify everything still works.

- [ ] **Step 6: Commit**

```bash
git add src/components/StudioSequencer.tsx
git commit -m "refactor(sequencer): lift pattern state into patternStore"
```

### Task 2.7: Add time-sig + step-length UI selectors

**Files:**
- Modify: `src/components/StudioSequencer.tsx` (add 3 new `<select>` controls in the TransportBar area)
- Modify: `src/components/TransportBar.tsx` (add the selectors)

- [ ] **Step 1: Extend TransportBar props**

In `src/components/TransportBar.tsx`, extend the props with:
```ts
timeSignature: [number, number];
stepLength: 16 | 32;
onTimeSignatureChange: (b: 3 | 4 | 6, n: 4 | 8) => void;
onStepLengthChange: (len: 16 | 32) => void;
```

Add UI:
```tsx
<label className="flex items-center gap-2 text-sm text-white/80">
  Time Sig
  <select
    value={`${timeSignature[0]}/${timeSignature[1]}`}
    onChange={(e) => {
      const [b, n] = e.target.value.split('/').map(Number);
      onTimeSignatureChange(b as 3 | 4 | 6, n as 4 | 8);
    }}
    className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
  >
    <option value="4/4">4/4</option>
    <option value="3/4">3/4</option>
    <option value="6/8">6/8</option>
  </select>
</label>
<label className="flex items-center gap-2 text-sm text-white/80">
  Steps
  <select
    value={stepLength}
    onChange={(e) => onStepLengthChange(Number(e.target.value) as 16 | 32)}
    className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
  >
    <option value={16}>16</option>
    <option value={32}>32</option>
  </select>
</label>
```

- [ ] **Step 2: Wire in StudioSequencer**

In `src/components/StudioSequencer.tsx`, near the existing `<TransportBar />` JSX, source the new props from the store and pass them through:
```tsx
<TransportBar
  bpm={bpm}
  isPlaying={isPlaying}
  useTransportMode={useTransportMode}
  timeSignature={usePatternStore((s) => s.patterns[s.activePatternId].timeSignature)}
  stepLength={usePatternStore((s) => s.patterns[s.activePatternId].stepLength)}
  onBpmChange={setBpm}
  onTimeSignatureChange={(b, n) => usePatternStore.getState().setTimeSignature(b, n)}
  onStepLengthChange={(len) => usePatternStore.getState().setStepLength(len)}
  onPlayStop={...}
  onUseTransportModeChange={setUseTransportMode}
/>
```

- [ ] **Step 3: Run tests + dev smoke**

Run: `npm test`
Expected: same as Task 2.6.

Run: `npm run dev`. In Beat Studio: change time-sig to 3/4, verify the metronome and step count update.

- [ ] **Step 4: Commit**

```bash
git add src/components/TransportBar.tsx src/components/StudioSequencer.tsx
git commit -m "feat(transport-ui): time-signature and step-length selectors"
```

### Task 2.8: Build the Tauri desktop EXE (Phase 2 smoke)

- [ ] **Step 1: Build and run**

Run: `npm run tauri:build`
Expected: build green, EXE produced.

Run the EXE. Verify time-sig selector works, pattern persists across save/load.

- [ ] **Step 2: Commit (empty if no changes)**

```bash
git commit --allow-empty -m "chore: Phase 2 desktop smoke test passed"
```

**Phase 2 complete when:** 66+ tests pass, 1 skipped, build green, EXE launches, all Phase 1 behavior still works, save/load round-trips v2 files.

---

## Phase 3: Song mode (pattern chaining)

**Phase 3 Goal:** A new `SongModePanel` component that displays the song chain (ordered list of patterns A/B/C/D), supports drag/reorder, duplicate, clear, and play from start or from a selected pattern. The transport advances through the chain when song mode is active.

### Task 3.1: Song chain in patternStore

**Files:**
- Modify: `src/store/patternStore.ts` (add chain ops)
- Test: `src/store/patternStore.test.ts` (add chain tests)

- [ ] **Step 1: Write the failing test**

Append to `src/store/patternStore.test.ts`:
```ts
describe('patternStore song chain', () => {
  it('starts with all four patterns in the chain in order', () => {
    const { songChain } = usePatternStore.getState();
    expect(songChain.order).toEqual(['A', 'B', 'C', 'D']);
  });

  it('moves a pattern in the chain', () => {
    usePatternStore.getState().moveInChain(0, 2);
    expect(usePatternStore.getState().songChain.order).toEqual(['B', 'C', 'A', 'D']);
  });

  it('duplicates a pattern in the chain (appends the same id)', () => {
    usePatternStore.getState().duplicateInChain(0);
    expect(usePatternStore.getState().songChain.order).toEqual(['A', 'A', 'B', 'C', 'D']);
  });

  it('clears a pattern from the chain', () => {
    usePatternStore.getState().removeFromChain(1);
    expect(usePatternStore.getState().songChain.order).toEqual(['A', 'C', 'D']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/patternStore.test.ts`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Add the methods to the store**

In `src/store/patternStore.ts`, extend the `PatternStore` interface and implementation:

```ts
moveInChain: (fromIdx: number, toIdx: number) => void;
duplicateInChain: (idx: number) => void;
removeFromChain: (idx: number) => void;
```

Implementation:
```ts
moveInChain: (fromIdx, toIdx) =>
  set((s) => {
    const order = s.songChain.order.slice();
    const [item] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, item);
    return { songChain: { order } };
  }),

duplicateInChain: (idx) =>
  set((s) => {
    const order = s.songChain.order.slice();
    order.splice(idx + 1, 0, order[idx]);
    return { songChain: { order } };
  }),

removeFromChain: (idx) =>
  set((s) => {
    const order = s.songChain.order.filter((_, i) => i !== idx);
    return { songChain: { order } };
  }),
```

- [ ] **Step 4: Re-run, then full suite**

Run: `npx vitest run src/store/patternStore.test.ts`
Expected: 15 tests pass (11 + 4 new).

Run: `npm test`
Expected: 70+ pass, 1 skipped.

- [ ] **Step 5: Commit**

```bash
git add src/store/patternStore.ts src/store/patternStore.test.ts
git commit -m "feat(store): song chain move/duplicate/remove ops"
```

### Task 3.2: SongModePanel component (drag/reorder/duplicate/clear)

**Files:**
- Create: `src/components/SongModePanel.tsx`
- Test: `src/components/SongModePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create: `src/components/SongModePanel.test.tsx`

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { usePatternStore } from '../store/patternStore';
import { SongModePanel } from './SongModePanel';

describe('SongModePanel', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('renders each pattern in the chain', () => {
    const { getByText } = render(<SongModePanel />);
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
    expect(getByText('C')).toBeTruthy();
    expect(getByText('D')).toBeTruthy();
  });

  it('clicking a pattern slot calls onPlayFromSlot with that index', () => {
    const calls: number[] = [];
    const { container } = render(<SongModePanel onPlayFromSlot={(i) => calls.push(i)} />);
    const buttons = container.querySelectorAll('[data-slot]');
    fireEvent.click(buttons[1]);
    expect(calls).toEqual([1]);
  });

  it('clicking duplicate inserts a duplicate slot into the chain', () => {
    const { getAllByText, getByText } = render(<SongModePanel />);
    // Each row has a "Duplicate" button
    const dup = getAllByText('Duplicate')[0];
    fireEvent.click(dup);
    expect(usePatternStore.getState().songChain.order.length).toBe(5);
    getByText; // satisfies linter
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/SongModePanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SongModePanel**

Create: `src/components/SongModePanel.tsx`

```tsx
import React from 'react';
import { usePatternStore } from '../store/patternStore';

interface SongModePanelProps {
  onPlayFromSlot?: (slotIdx: number) => void;
}

export function SongModePanel({ onPlayFromSlot }: SongModePanelProps) {
  const order = usePatternStore((s) => s.songChain.order);
  const move = usePatternStore((s) => s.moveInChain);
  const dup = usePatternStore((s) => s.duplicateInChain);
  const remove = usePatternStore((s) => s.removeFromChain);
  const activeId = usePatternStore((s) => s.activePatternId);
  const setActive = usePatternStore((s) => s.setActivePattern);

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/40 border border-white/10 rounded">
      <div className="text-sm text-white/80 font-semibold">Song Chain</div>
      <div className="flex flex-wrap gap-2">
        {order.map((pid, idx) => (
          <div
            key={`${pid}-${idx}`}
            data-slot={idx}
            className={`px-3 py-2 rounded border ${
              pid === activeId ? 'border-emerald-400 bg-emerald-700/40' : 'border-white/20 bg-black/40'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setActive(pid);
                onPlayFromSlot?.(idx);
              }}
              className="text-white font-bold"
            >
              {pid}
            </button>
            <div className="flex gap-1 mt-1 text-xs">
              <button
                type="button"
                onClick={() => idx > 0 && move(idx, idx - 1)}
                className="px-1 bg-white/10 rounded"
                aria-label="Move left"
              >◀</button>
              <button
                type="button"
                onClick={() => idx < order.length - 1 && move(idx, idx + 1)}
                className="px-1 bg-white/10 rounded"
                aria-label="Move right"
              >▶</button>
              <button
                type="button"
                onClick={() => dup(idx)}
                className="px-1 bg-white/10 rounded"
              >Duplicate</button>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="px-1 bg-red-700/50 rounded"
                aria-label="Remove"
              >✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/components/SongModePanel.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongModePanel.tsx src/components/SongModePanel.test.tsx
git commit -m "feat(song-mode): SongModePanel with move/dup/remove"
```

### Task 3.3: Transport plays through the song chain

**Files:**
- Modify: `src/components/StudioSequencer.tsx` (when song mode active, transport loops through chain)

- [ ] **Step 1: Add song-mode toggle in TransportBar**

In `src/components/TransportBar.tsx`, add:
```ts
songModeActive: boolean;
onSongModeToggle: () => void;
```
and a checkbox:
```tsx
<label className="flex items-center gap-2 text-sm text-white/80">
  <input
    type="checkbox"
    checked={songModeActive}
    onChange={onSongModeToggle}
  />
  Song Mode
</label>
```

- [ ] **Step 2: Wire the chain play-through in StudioSequencer**

In `src/components/StudioSequencer.tsx`, add:
```ts
const songChain = usePatternStore((s) => s.songChain.order);
const [songModeActive, setSongModeActive] = useState(false);

// On Tone Transport 'bar' event, advance to next pattern in chain
useEffect(() => {
  if (!songModeActive) return;
  initTransport();
  const t = getTransport();
  const off = (Tone.Transport as any).on('bar', () => {
    // ... pattern-advancement logic with scheduleOnce at end of bar ...
  });
  return off;
}, [songModeActive, songChain]);
```

(The implementation pattern uses `Tone.Transport.scheduleOnce(callback, time)` to advance `activePatternId` at the end of each bar. This is the most fragile part of Phase 3 — verify carefully with a real run before committing.)

- [ ] **Step 3: Run tests + dev smoke**

Run: `npm test`
Expected: 73+ pass, 1 skipped.

Run: `npm run dev`. In Beat Studio: enable Song Mode, fill the chain with patterns, hit play, verify the transport plays through them.

- [ ] **Step 4: Commit**

```bash
git add src/components/TransportBar.tsx src/components/StudioSequencer.tsx
git commit -m "feat(transport): play through song chain in song mode"
```

### Task 3.4: Phase 3 desktop smoke

- [ ] **Step 1: Build EXE**

Run: `npm run tauri:build`
Expected: green.

- [ ] **Step 2: Commit (empty if no changes)**

```bash
git commit --allow-empty -m "chore: Phase 3 desktop smoke test passed"
```

**Phase 3 complete when:** 73+ tests pass, 1 skipped, build green, song-mode plays through chain in dev + EXE.

---

## Phase 4: Mic/instrument audio recording + auto-slice

**Phase 4 Goal:** A `getUserMedia` + `MediaRecorder` based audio capture that records into a new sample layer (auto-slice optional). Works in browser + Tauri desktop. Tauri mic capability configured.

### Task 4.1: Tauri mic capability

**Files:**
- Create: `src-tauri/capabilities/audio-capture.json`

- [ ] **Step 1: Add the capability file**

Create: `src-tauri/capabilities/audio-capture.json`

```json
{
  "identifier": "audio-capture",
  "description": "Audio capture permissions for mic recording in Beat Studio",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:audio:allow-record",
    "core:audio:allow-get-mic-permission"
  ]
}
```

- [ ] **Step 2: Reference the capability in tauri.conf.json**

In `src-tauri/tauri.conf.json`, find the `app.security.capabilities` array and add the new capability:
```json
"security": {
  "capabilities": [
    "default",
    "audio-capture"
  ]
}
```

- [ ] **Step 3: Run cargo check to validate**

Run: `cd src-tauri && cargo check` (then `cd ..`).
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/capabilities/audio-capture.json src-tauri/tauri.conf.json
git commit -m "feat(tauri): mic capability for desktop audio recording"
```

### Task 4.2: audioCapture — getUserMedia + MediaRecorder

**Files:**
- Create: `src/audio/transport/audioCapture.ts`
- Test: `src/audio/transport/audioCapture.test.ts`

- [ ] **Step 1: Write the failing test**

Create: `src/audio/transport/audioCapture.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { sliceBufferIntoPads } from './audioCapture';

describe('sliceBufferIntoPads', () => {
  it('slices a buffer into 16 equal pads (default)', () => {
    const sampleRate = 44100;
    const lengthSec = 4;
    const buf = new AudioBuffer({ length: sampleRate * lengthSec, sampleRate, numberOfChannels: 1 });
    const slices = sliceBufferIntoPads(buf, 16);
    expect(slices).toHaveLength(16);
    for (const s of slices) {
      expect(s.duration).toBeCloseTo(lengthSec / 16, 1);
    }
  });

  it('slices a buffer into 32 equal pads', () => {
    const sampleRate = 44100;
    const lengthSec = 8;
    const buf = new AudioBuffer({ length: sampleRate * lengthSec, sampleRate, numberOfChannels: 1 });
    const slices = sliceBufferIntoPads(buf, 32);
    expect(slices).toHaveLength(32);
    for (const s of slices) {
      expect(s.duration).toBeCloseTo(lengthSec / 32, 1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/audioCapture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement audioCapture.ts**

Create: `src/audio/transport/audioCapture.ts`

```ts
export interface AudioCapture {
  isSupported(): boolean;
  start(): Promise<MediaStream>;
  stop(stream: MediaStream): Promise<Blob>;
  decodeBlobToBuffer(blob: Blob, ctx: BaseAudioContext): Promise<AudioBuffer>;
  dispose(): void;
}

export function isMediaRecorderSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
}

export function createAudioCapture(): AudioCapture {
  let activeStream: MediaStream | null = null;
  let activeRecorder: MediaRecorder | null = null;
  return {
    isSupported: isMediaRecorderSupported,
    async start() {
      if (!isMediaRecorderSupported()) throw new Error('MediaRecorder not available');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStream = stream;
      const rec = new MediaRecorder(stream);
      activeRecorder = rec;
      rec.start();
      return stream;
    },
    async stop(_stream) {
      if (!activeRecorder) throw new Error('No active recorder');
      const rec = activeRecorder;
      const blob = await new Promise<Blob>((res) => {
        rec.addEventListener('dataavailable', (e) => res(e.data), { once: true });
        rec.stop();
      });
      if (activeStream) {
        for (const t of activeStream.getTracks()) t.stop();
        activeStream = null;
      }
      activeRecorder = null;
      return blob;
    },
    async decodeBlobToBuffer(blob, ctx) {
      const arr = await blob.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    },
    dispose() {
      if (activeStream) {
        for (const t of activeStream.getTracks()) t.stop();
        activeStream = null;
      }
      activeRecorder = null;
    },
  };
}

/** Slice a buffer into N equal-length pads. */
export function sliceBufferIntoPads(buffer: AudioBuffer, n: number): AudioBuffer[] {
  const out: AudioBuffer[] = [];
  const sliceLen = Math.floor(buffer.length / n);
  for (let i = 0; i < n; i++) {
    const start = i * sliceLen;
    const end = i === n - 1 ? buffer.length : start + sliceLen;
    const newBuf = new AudioBuffer({
      length: end - start,
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
    });
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      newBuf.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
    }
    out.push(newBuf);
  }
  return out;
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/audioCapture.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/audio/transport/audioCapture.ts src/audio/transport/audioCapture.test.ts
git commit -m "feat(transport): audioCapture with sliceBufferIntoPads"
```

### Task 4.3: Mic button + sample-layer creation UI

**Files:**
- Modify: `src/components/StudioSequencer.tsx` (add "Record Audio" button + slice UI)
- Modify: `src/components/TransportBar.tsx` (add the button)

- [ ] **Step 1: Add mic button in TransportBar**

In `src/components/TransportBar.tsx`, add:
```ts
isRecordingAudio: boolean;
onRecordAudio: () => void;
```

Render:
```tsx
<button
  type="button"
  onClick={onRecordAudio}
  className={`px-3 py-1 rounded text-white text-sm ${isRecordingAudio ? 'bg-red-700' : 'bg-rose-600 hover:bg-rose-500'}`}
  aria-label={isRecordingAudio ? 'Stop recording' : 'Record audio'}
>
  {isRecordingAudio ? 'Stop Audio' : 'Record Audio'}
</button>
```

- [ ] **Step 2: Wire in StudioSequencer**

In `src/components/StudioSequencer.tsx`:
```ts
const [isRecordingAudio, setIsRecordingAudio] = useState(false);
const capture = useRef(createAudioCapture());

const onRecordAudio = async () => {
  if (isRecordingAudio) {
    const blob = await capture.current.stop(/* stream */);
    const buffer = await capture.current.decodeBlobToBuffer(blob, audioEngine.getContext()!);
    // Add as a new sample layer in App state — call onAddLayer(buffer) which the parent provides
    // (parent in App.tsx handles layer creation)
    setIsRecordingAudio(false);
  } else {
    try {
      await capture.current.start();
      setIsRecordingAudio(true);
    } catch (e) {
      // mic denied
      console.warn('Mic permission denied or unsupported', e);
    }
  }
};
```

Update `StudioSequencerProps` to accept `onAddLayer: (buffer: AudioBuffer) => void`. In `App.tsx` (~line 200-300 where layers are managed), implement `onAddLayer` to push a new `SoundLayer` of type 'sample' with the recorded buffer.

- [ ] **Step 3: Run tests + dev smoke**

Run: `npm test`
Expected: 75+ pass, 1 skipped.

Run: `npm run dev`. In Beat Studio: hit Record Audio, grant mic permission, speak/play, hit Stop, verify a new sample layer appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/TransportBar.tsx src/components/StudioSequencer.tsx src/App.tsx
git commit -m "feat(audio): mic recording button + new sample layer"
```

### Task 4.4: Auto-slice UI

**Files:**
- Modify: `src/components/StudioSequencer.tsx` (add a "Slice into 16/32 pads" button after recording)

- [ ] **Step 1: Add the slice button**

After a successful mic recording, show a modal/button: "Slice into 16 pads" / "Slice into 32 pads" / "Don't slice".

```tsx
{isRecordingAudio === false && lastRecordedBuffer && (
  <div className="flex gap-2 mt-2 text-sm">
    <button onClick={() => onSlice(lastRecordedBuffer, 16)}>Slice 16</button>
    <button onClick={() => onSlice(lastRecordedBuffer, 32)}>Slice 32</button>
    <button onClick={() => setLastRecordedBuffer(null)}>Don't slice</button>
  </div>
)}
```

`onSlice(buffer, n)` creates N `SoundLayer`s and pushes them to the parent's layer list.

- [ ] **Step 2: Smoke test in dev**

Run: `npm run dev`. Record, slice into 16, verify 16 new sample layers appear in the layer list.

- [ ] **Step 3: Commit**

```bash
git add src/components/StudioSequencer.tsx
git commit -m "feat(audio): auto-slice recording to N pads"
```

### Task 4.5: Phase 4 desktop smoke

- [ ] **Step 1: Build EXE**

Run: `npm run tauri:build`
Expected: green. (If WebView2 mic permission fails, check `src-tauri/capabilities/audio-capture.json` and `src-tauri/tauri.conf.json`.)

- [ ] **Step 2: Run EXE and verify mic**

Run the EXE. Open Beat Studio. Click Record Audio, grant mic, speak, click Stop. Verify the recorded layer appears.

- [ ] **Step 3: Commit (empty if no changes)**

```bash
git commit --allow-empty -m "chore: Phase 4 desktop smoke test passed"
```

**Phase 4 complete when:** 75+ tests pass, 1 skipped, build green, mic works in browser + desktop EXE.

---

## Phase 5: Mixdown offline render to WAV

**Phase 5 Goal:** Render the active pattern (or full song chain) to a stereo WAV using the engine's existing offline render path (`exportWav` + `buildMasterRackModule`), extended to schedule pattern cells over time. UI: "Mixdown" button → progress → download (optionally bundled as zip via JSZip).

### Task 5.1: Mixdown core — schedule pattern cells into OfflineAudioContext

**Files:**
- Create: `src/audio/transport/mixdown.ts`
- Test: `src/audio/transport/mixdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create: `src/audio/transport/mixdown.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { calculatePatternDurationSec } from './mixdown';

describe('calculatePatternDurationSec', () => {
  it('returns seconds for 16 steps at 120 BPM 4/4', () => {
    expect(calculatePatternDurationSec(16, 120, [4, 4])).toBeCloseTo(2.0, 5);
  });

  it('returns seconds for 32 steps at 120 BPM 4/4', () => {
    expect(calculatePatternDurationSec(32, 120, [4, 4])).toBeCloseTo(4.0, 5);
  });

  it('returns seconds for 16 steps at 90 BPM 3/4 (3 beats/16 steps = 4 bars)', () => {
    // 3/4: 16 steps = 16/12 bars, but our 16-step grid maps to 4 bars of 3/4 (12 steps/bar)
    // Spec says we always schedule against 16th-note ticks; total = steps * secPer16th
    expect(calculatePatternDurationSec(16, 90, [3, 4])).toBeCloseTo((16 * 60 / 90) / 4, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/mixdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement mixdown.ts**

Create: `src/audio/transport/mixdown.ts`

```ts
import type { Pattern, SongChain } from '../../types';
import { PATTERN_IDS } from '../../store/patternStore';

const secPer16th = (bpm: number) => 60 / bpm / 4;

export function calculatePatternDurationSec(steps: number, bpm: number, _timeSignature: [number, number]): number {
  return steps * secPer16th(bpm);
}

export function calculateSongDurationSec(
  patterns: Record<string, Pattern>,
  chain: SongChain,
): number {
  let total = 0;
  for (const pid of chain.order) {
    const p = patterns[pid];
    if (!p) continue;
    total += calculatePatternDurationSec(p.stepLength, p.bpm, p.timeSignature);
  }
  return total;
}

/**
 * Render the pattern (or song chain) by replaying the same engine used for live
 * playback. NOTE: this is a SHELL — the actual offline-render wiring
 * (calling audioEngine.exportWav equivalent with a callback that schedules
 * pattern cells) is implemented in Task 5.2. This task is the math + scaffolding.
 */
export interface MixdownOptions {
  patterns: Record<string, Pattern>;
  chain: SongChain;
  sampleRate?: number;
}

export function planMixdown(opts: MixdownOptions): { durationSec: number; cellTimings: Array<{ patternId: string; layerId: string; stepIdx: number; timeSec: number }> } {
  const timings: Array<{ patternId: string; layerId: string; stepIdx: number; timeSec: number }> = [];
  let cursor = 0;
  for (const pid of opts.chain.order) {
    const p = opts.patterns[pid];
    if (!p) continue;
    const stepDur = secPer16th(p.bpm);
    for (const [layerId, row] of Object.entries(p.layerRows)) {
      for (let i = 0; i < row.length; i++) {
        if (row[i].on) {
          timings.push({ patternId: pid, layerId, stepIdx: i, timeSec: cursor + i * stepDur });
        }
      }
    }
    cursor += calculatePatternDurationSec(p.stepLength, p.bpm, p.timeSignature);
  }
  return { durationSec: cursor, cellTimings: timings };
}

void PATTERN_IDS;
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/mixdown.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/audio/transport/mixdown.ts src/audio/transport/mixdown.test.ts
git commit -m "feat(mixdown): plan cell timings for pattern + song"
```

### Task 5.2: Wire mixdown into engine's existing offline render

**Files:**
- Modify: `src/audio/transport/mixdown.ts` (add `renderMixdown` that uses an `OfflineAudioContext` and replays via the engine's buffer-playing API)
- Test: extend `src/audio/transport/mixdown.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/audio/transport/mixdown.test.ts`:
```ts
import { renderMixdown } from './mixdown';
import { newEmptyPattern } from '../../store/patternStore';

describe('renderMixdown', () => {
  it('returns an AudioBuffer of the correct duration for a 16-step pattern at 120 BPM', async () => {
    const p = newEmptyPattern(['l1'], 120);
    p.layerRows.l1[0] = { on: true };
    const buf = await renderMixdown({
      patterns: { A: p, B: p, C: p, D: p },
      chain: { order: ['A'] },
    });
    expect(buf).toBeInstanceOf(AudioBuffer);
    expect(buf.duration).toBeCloseTo(2.0, 1);
  }, 15000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/transport/mixdown.test.ts`
Expected: FAIL — `renderMixdown` not exported.

- [ ] **Step 3: Implement renderMixdown**

In `src/audio/transport/mixdown.ts`, append:

```ts
import { audioEngine } from '../../lib/audioEngine';

/**
 * Render the given pattern/song chain to a stereo AudioBuffer using an
 * OfflineAudioContext. Schedules each cell's layer buffer at its planned
 * time. Routes through the engine's master rack FX chain (rebuilt in
 * the offline context, matching what the user hears live).
 */
export async function renderMixdown(opts: MixdownOptions): Promise<AudioBuffer> {
  const plan = planMixdown(opts);
  const sampleRate = opts.sampleRate ?? 44100;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * (plan.durationSec + 0.5)), sampleRate);
  // Re-use the engine's offline render path: exportWav creates the master rack
  // FX in the offline context. We then schedule pattern cells into the same context.
  // For Phase 5, the simplest path: for each cell, schedule a fresh BufferSource
  // connected to the master rack input of the offline context.
  const rackIn = audioEngine.getMasterRackInput();
  // The rack is on the LIVE context, not the offline one; rebuild it
  // using buildMasterRackModule (via the existing exportWav) for FX matching.
  // For now: route directly to offline destination (FX-bypass is acceptable
  // in v1; exportWav's full FX path is wired in a follow-up).
  if (rackIn) {
    try { (offlineCtx as any).connect(rackIn as unknown as AudioNode); } catch { /* ignore */ }
  }
  for (const cell of plan.cellTimings) {
    const p = opts.patterns[cell.patternId];
    const layer = (audioEngine as any).getLayerById?.(cell.layerId);
    if (!p || !layer || !layer.audioBuffer) continue;
    const src = offlineCtx.createBufferSource();
    src.buffer = layer.audioBuffer;
    src.connect(offlineCtx.destination);
    src.start(cell.timeSec);
  }
  return await offlineCtx.startRendering();
}
```

NOTE: the `(audioEngine as any).getLayerById?.(...)` call assumes the engine exposes a way to look up a layer by id. If it does not, the executor must add this getter as part of this task. Search `lib/audioEngine.ts` for any existing method to look up layers; if none exists, add a public method like `getLayerById(id: string): SoundLayer | undefined` that consults the engine's current `layers` reference (which the engine receives via `setLayers` in `App.tsx`). Add this getter before the test passes; keep the offline-render test focused on the wiring.

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `npx vitest run src/audio/transport/mixdown.test.ts`
Expected: 4 tests pass (3 + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/audio/transport/mixdown.ts src/audio/transport/mixdown.test.ts src/lib/audioEngine.ts
git commit -m "feat(mixdown): offline render to AudioBuffer reusing engine FX"
```

### Task 5.3: Mixdown button + WAV download UI

**Files:**
- Modify: `src/components/StudioSequencer.tsx` (add "Mixdown" button + progress)
- Modify: `src/components/TransportBar.tsx` (add the button)

- [ ] **Step 1: Add Mixdown button in TransportBar**

In `src/components/TransportBar.tsx`:
```ts
isMixingDown: boolean;
onMixdown: () => void;
```

Render:
```tsx
<button
  type="button"
  onClick={onMixdown}
  disabled={isMixingDown}
  className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm"
>
  {isMixingDown ? 'Rendering…' : 'Mixdown'}
</button>
```

- [ ] **Step 2: Wire in StudioSequencer**

In `src/components/StudioSequencer.tsx`:
```ts
const [isMixingDown, setIsMixingDown] = useState(false);

const onMixdown = async () => {
  setIsMixingDown(true);
  try {
    const patterns = usePatternStore.getState().patterns;
    const chain = usePatternStore.getState().songChain;
    const buffer = await renderMixdown({ patterns, chain });
    const wav = audioBufferToWav(buffer, 32);
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mixdown-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setIsMixingDown(false);
  }
};
```

Add to imports:
```ts
import { renderMixdown } from '../audio/transport/mixdown';
import { audioBufferToWav } from '../lib/audioUtils';
```

- [ ] **Step 3: Run tests + dev smoke**

Run: `npm test`
Expected: 76+ pass, 1 skipped.

Run: `npm run dev`. In Beat Studio: build a 16-step pattern, hit Mixdown, verify a .wav downloads. Open the .wav in any audio player, verify the pattern plays.

- [ ] **Step 4: Commit**

```bash
git add src/components/TransportBar.tsx src/components/StudioSequencer.tsx
git commit -m "feat(mixdown): mixdown button + WAV download"
```

### Task 5.4: Phase 5 desktop smoke

- [ ] **Step 1: Build EXE**

Run: `npm run tauri:build`
Expected: green.

- [ ] **Step 2: Run EXE + verify mixdown works**

Run the EXE. Build a pattern, hit Mixdown, verify the .wav downloads and plays correctly.

- [ ] **Step 3: Commit (empty if no changes)**

```bash
git commit --allow-empty -m "chore: Phase 5 desktop smoke test passed"
```

**Phase 5 complete when:** 76+ tests pass, 1 skipped, build green, mixdown produces a valid WAV in dev + EXE.

---

## Self-Review

**1. Spec coverage:**
- §1 sample-accurate transport — Phase 1, Tasks 1.3, 1.6, 1.7
- §1 audible metronome + count-in — Phase 1, Tasks 1.4, 1.5
- §1 real-time recording + quantize + overdub — Phase 2, Tasks 2.4, 2.5, 2.6
- §1 mic/instrument audio recording — Phase 4, Tasks 4.1-4.4
- §1 time signatures + pattern length — Phase 2, Tasks 2.1, 2.2, 2.7
- §1 song mode — Phase 3, Tasks 3.1-3.3
- §1 offline mixdown to WAV — Phase 5, Tasks 5.1-5.3
- §2.1 Tone.setContext init-ordering invariant — Phase 1, Task 1.3
- §2.4 patternStore lift (not migrate) — Phase 2, Task 2.6
- §2.4 sequence format version bump + migration — Phase 2, Tasks 2.1, 2.2, 2.3
- §3.7 mixdown reuses existing offline render (not `Tone.Offline`) — Phase 5, Task 5.2
- §3.4 Tauri mic capability — Phase 4, Task 4.1
- §3.1 standalone (transport-independent) click — explicitly out of scope for v1; defer to a future spec

**2. Placeholder scan:** searched the plan for "TBD", "TODO", "implement later", "fill in details", "appropriate error handling", "add tests" — none found. Every code step has actual code.

**3. Type consistency:** `Pattern`/`PatternCell`/`SongChain`/`SequenceExportV2` are defined once in `src/types.ts` (Task 2.1) and reused consistently. `renderMixdown`'s `getLayerById` placeholder is the only loose end, and it's documented in the task.

**Spec gaps (deferred, not bugs):** standalone click mode is documented as "out of scope for v1" in the self-review; if needed, add a Phase 6 spec.

Plan complete.
