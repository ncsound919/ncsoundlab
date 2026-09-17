/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Studio Sequencer — "Produce" stage.
 * A light step sequencer / drum machine + piano keyboard + step-recording,
 * powered by react-piano (keyboard UI + QWERTY input) and tonal (music theory).
 *
 * Each enabled sound layer is a row in a 16-step pattern:
 *  - Toggling a step triggers the layer (one-shot — drums/samples).
 *  - Recording a piano note into the active row stores a MIDI note on the step
 *    (melodic) and plays it back through the app's own synth via SoundLayerPlayer.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { initTransport, getTransport } from '../audio/transport/transport';
import { TransportBar } from './TransportBar';
import { SongModePanel } from './SongModePanel';
import { ArrangementPanel } from './ArrangementPanel';
import { Piano, KeyboardShortcuts, MidiNumbers } from 'react-piano';
import { Note, Chord } from 'tonal';
import { Save, FolderOpen } from 'lucide-react';
import 'react-piano/dist/styles.css';
import { SoundLayer, PatternCell } from '../types';
import { applySemitoneShift, stepOffsetSeconds } from '../lib/sequencerHelpers';
import { layerColorFor } from '../lib/layerColors';
import { audioEngine } from '../lib/audioEngine';
import { MpcPadBank, PadEntry, type SixteenLevelsMode, type PadPlayMode } from './MpcPadBank';
import { PianoRoll } from './PianoRoll';
import { useSequencerStore, BANK_IDS, BankId } from '../store/sequencerStore';
import { usePatternStore, PATTERN_IDS, type PatternId } from '../store/patternStore';
import { planFromArrangement, cellsAtGlobalStep, totalArrangementSteps } from '../lib/arrangementScheduler';
import { GROOVE_TEMPLATES, applyGroove, humanizeVelocities, clearGrooveOffsets, findGrooveTemplate, type GrooveTemplate } from '../lib/grooveTemplates';
import { exportV2, importExport } from '../sequencerFormat';
import { createAudioCapture, sliceBufferIntoPads } from '../audio/transport/audioCapture';
import { buildCountInBeats } from '../audio/transport/countIn';
import { createMetronome, type Metronome } from '../audio/transport/metronome';
import { renderMixdown } from '../audio/transport/mixdown';
import { SampleBrowser } from './SampleBrowser';
import { TakesRecorder } from './TakesRecorder';
import { ClipLauncher } from './ClipLauncher';
import { patternLoopLengthSec } from '../audio/transport/takesRecorder';
import { PerformanceControls } from './PerformanceControls';
import { TheoryPanel } from './TheoryPanel';
import { RecourseComposerPanel } from './RecourseComposerPanel';
import { setSequencerBridge, clearSequencerBridge } from '../lib/controller/sequencerBridge';
import {
  fetchLibrarySample,
  decodeLibrarySample,
} from '../lib/sampleLibrary';
import { autoSampleSynthLayer } from '../lib/autoSample';
import { applyPadParams } from '../lib/padParams';
import { selectVelocityLayer } from '../lib/velocityLayers';
import {
  snapshotProgram,
  resolveProgram,
  savePadProgram,
  fetchPadPrograms,
  deletePadProgram,
  type StoredPadProgram,
} from '../lib/padPrograms';
import type { TheoryChord } from '../lib/theory/progression';
import { voiceChords, pitchClassOf } from '../lib/musicTheory';

const PPQ = 96;

type StepCell = PatternCell;

interface StudioSequencerProps {
  layers: SoundLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer?: (id: string, updates: Partial<SoundLayer>) => void;
  /**
   * Phase 5.1 — returns the id of the freshly created layer so the producer
   * stage can wire the new sample into a pad/layer immediately. Older call
   * sites ignore the return value (no breaking change).
   */
  onAddLayer?: (buffer: AudioBuffer, name?: string) => string | undefined;
  onAddSlicedLayers?: (buffers: AudioBuffer[]) => void;
  /**
   * Create a synth layer cloned from `source`, transposed by `semitones`, and
   * return its id. Lets the theory panel turn generated chord roots into real
   * pad layers. Optional — pads fall back to a preview when absent.
   */
  onAddSynthLayer?: (source: SoundLayer, name: string, semitones: number) => string | undefined;
}

const FIRST_NOTE = MidiNumbers.fromNote('c3');
const LAST_NOTE = MidiNumbers.fromNote('c5');

const keyboardShortcuts = KeyboardShortcuts.create({
  firstNote: FIRST_NOTE,
  lastNote: LAST_NOTE,
  keyboardConfig: KeyboardShortcuts.HOME_ROW,
});

export function StudioSequencer({ layers, selectedLayerId, onSelectLayer, onUpdateLayer, onAddLayer, onAddSlicedLayers, onAddSynthLayer }: StudioSequencerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeRowId, setActiveRowId] = useState<string | null>(selectedLayerId || layers[0]?.id || null);
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  // Synchronous mirror of `activeNotes` used to suppress react-piano's
  // redundant playNote callbacks (see playMidiNote).
  const activeNotesRef = useRef<number[]>([]);

  // MPC pad state (programs + active bank live in the shared store so the
  // Sound Lab / Synth / Evolution / Chop sections can send sources to pads)
  const programs = useSequencerStore((s) => s.programs);
  const activeBank = useSequencerStore((s) => s.activeBank);
  const setBankProgram = useSequencerStore((s) => s.setBankProgram);
  const setActiveBank = useSequencerStore((s) => s.setActiveBank);
  const prunePrograms = useSequencerStore((s) => s.prunePrograms);
  const activatePatternPrograms = useSequencerStore((s) => s.activatePatternPrograms);
  const setPatternProgramSlot = useSequencerStore((s) => s.setPatternProgramSlot);

  // Pattern state lifted into patternStore (Phase 2). The store's
  // layerRows is Record<layerId, PatternCell[]> — structurally compatible
  // with the legacy local `Pattern` type, so all read sites work unchanged.
  const pattern = usePatternStore((s) => s.patterns[s.activePatternId].layerRows);
  const activePatternId = usePatternStore((s) => s.activePatternId);
  const patternBpm = usePatternStore((s) => s.patterns[s.activePatternId].bpm);
  const patternTimeSignature = usePatternStore((s) => s.patterns[s.activePatternId].timeSignature);
  const patternStepLength = usePatternStore((s) => s.patterns[s.activePatternId].stepLength);
  const setTimeSignature = usePatternStore((s) => s.setTimeSignature);
  const setStepLength = usePatternStore((s) => s.setStepLength);
  const setRow = usePatternStore((s) => s.setRow);
  const ensureLayerRow = usePatternStore((s) => s.ensureLayerRow);
  const storeSetBpm = usePatternStore((s) => s.setBpm);
  const loadFromExport = usePatternStore((s) => s.loadFromExport);
  const arrangement = usePatternStore((s) => s.arrangement);

  // BPM lives in patternStore; keep the local names the rest of this file
  // already uses (`bpm` / `setBpm`) pointing at the store so call sites
  // (tap tempo, transport sync, tick math) are unchanged.
  const bpm = patternBpm;
  const setBpm = storeSetBpm;

  const [padSwing, setPadSwing] = useState<Record<string, number>>({});
  const [padPocket, setPadPocket] = useState<Record<string, number>>({}); // per-piece ms bias (PocketLab-style)
  const [padTune, setPadTune] = useState<Record<string, number>>({});
  const [padChoke, setPadChoke] = useState<Record<string, number>>({});
  const [padMuted, setPadMuted] = useState<Record<string, boolean>>({});
  const [padLevel, setPadLevel] = useState<Record<string, number>>({}); // per-pad output level multiplier (0..1.5)
  const [padFilter, setPadFilter] = useState<Record<string, number>>({}); // per-pad low-pass Hz (20000 = off)
  const [padSendReverb, setPadSendReverb] = useState<Record<string, number>>({});
  const [padSendDelay, setPadSendDelay] = useState<Record<string, number>>({});
  const [padVoices, setPadVoices] = useState<Record<string, number>>({}); // 0 = unlimited
  const [padMode, setPadMode] = useState<Record<string, PadPlayMode>>({});
  const [selectedPad, setSelectedPad] = useState<number>(0);
  const [sixteenLevels, setSixteenLevels] = useState(false);
  const [sixteenLevelsMode, setSixteenLevelsMode] = useState<SixteenLevelsMode>('velocity');
  const [globalSwing, setGlobalSwing] = useState(0);
  const [fullLevel, setFullLevel] = useState(false);
  const [velocityCurve, setVelocityCurve] = useState<'linear' | 'exponential' | 'log'>('linear');
  const [noteRepeat, setNoteRepeat] = useState({ active: false, division: 4 });
  const [timeCorrect, setTimeCorrect] = useState(1); // 1=1/16, 2=1/8, 4=1/4 record snap
  const [view, setView] = useState<'grid' | 'piano'>('grid');
  /** Count-in beats before the transport rolls when step-record is armed. */
  const [countInBeats, setCountInBeats] = useState(4);
  const [isCountingIn, setIsCountingIn] = useState(false);
  // Named program presets (Dexie-persisted, resolved by layer name on load).
  const [padPresets, setPadPresets] = useState<StoredPadProgram[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetId, setPresetId] = useState('');
  const [presetStatus, setPresetStatus] = useState('');

  // Tone Transport mode (Phase 1). On by default after parity verification.
  // The setInterval path is retained as a fallback — the TransportBar checkbox
  // lets users switch back if Tone audio misbehaves in a given environment.
  const [useTransportMode, setUseTransportMode] = useState(true);
  const [songModeActive, setSongModeActive] = useState(false);
  /**
   * Clip-accurate live arrangement mode. When song mode is on and an
   * arrangement with clips exists, the single-pattern Tone.Sequence is replaced
   * by a global 16th-step scheduler that honours sub-bar clip starts, loops and
   * overlapping clips (the same plan the offline renderer uses).
   */
  const arrangementLive = songModeActive && (arrangement?.clips?.length ?? 0) > 0;
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [lastRecordedBuffer, setLastRecordedBuffer] = useState<AudioBuffer | null>(null);
  const audioCaptureRef = useRef<ReturnType<typeof createAudioCapture> | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const playingRef = useRef(false);
  const recordingRef = useRef(false);
  const activeRowRef = useRef<string | null>(null);
  const patternRef = useRef(pattern);
  const stepLengthRef = useRef<16 | 32>(patternStepLength);
  const padSwingRef = useRef(padSwing);
  const padPocketRef = useRef(padPocket);
  const padTuneRef = useRef(padTune);
  const padLevelRef = useRef(padLevel);
  const padFilterRef = useRef(padFilter);
  const padSendReverbRef = useRef(padSendReverb);
  const padSendDelayRef = useRef(padSendDelay);
  const padVoicesRef = useRef(padVoices);
  const padChokeRef = useRef(padChoke);
  const swingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const tickRef = useRef<() => void>(() => {});
  const timeCorrectRef = useRef(timeCorrect);
  const tapTimesRef = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importKindRef = useRef<'prgm' | 'seq'>('prgm');
  const metronomeRef = useRef<Metronome | null>(null);
  const countInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Global 16th-step cursor for the clip-accurate arrangement scheduler. */
  const arrangementStepRef = useRef(0);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { stepLengthRef.current = patternStepLength; }, [patternStepLength]);
  useEffect(() => { padSwingRef.current = padSwing; }, [padSwing]);
  useEffect(() => { padPocketRef.current = padPocket; }, [padPocket]);
  useEffect(() => { padTuneRef.current = padTune; }, [padTune]);
  useEffect(() => { padLevelRef.current = padLevel; }, [padLevel]);
  useEffect(() => { padFilterRef.current = padFilter; }, [padFilter]);
  useEffect(() => { padSendReverbRef.current = padSendReverb; }, [padSendReverb]);
  useEffect(() => { padSendDelayRef.current = padSendDelay; }, [padSendDelay]);
  useEffect(() => { padVoicesRef.current = padVoices; }, [padVoices]);
  useEffect(() => { padChokeRef.current = padChoke; }, [padChoke]);
  useEffect(() => { timeCorrectRef.current = timeCorrect; }, [timeCorrect]);
  useEffect(() => { activeRowRef.current = activeRowId; }, [activeRowId]);
  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { recordingRef.current = isRecording; }, [isRecording]);

  // Keep the active row in sync with layer selection
  useEffect(() => {
    if (selectedLayerId && layers.some((l) => l.id === selectedLayerId)) {
      setActiveRowId(selectedLayerId);
    }
  }, [selectedLayerId, layers]);

  // Ensure every current layer has a row in the patternStore, auto-map pads,
  // and fall back the active row to the first enabled layer when it was removed.
  useEffect(() => {
    const ids = new Set(layers.map((l) => l.id));
    for (const layer of layers) {
      ensureLayerRow(activePatternId, layer.id);
    }
    setPadSwing((prev) => {
      const pruned: Record<string, number> = {};
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (ids.has(id)) pruned[id] = prev[id];
        else changed = true;
      }
      return changed ? pruned : prev;
    });
    setPadTune((prev) => {
      const pruned: Record<string, number> = {};
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (ids.has(id)) pruned[id] = prev[id];
        else changed = true;
      }
      return changed ? pruned : prev;
    });
    setPadChoke((prev) => {
      const pruned: Record<string, number> = {};
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (ids.has(id)) pruned[id] = prev[id];
        else changed = true;
      }
      return changed ? pruned : prev;
    });
    setPadMuted((prev) => {
      const pruned: Record<string, boolean> = {};
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (ids.has(id)) pruned[id] = prev[id];
        else changed = true;
      }
      return changed ? pruned : prev;
    });
    setPadLevel((prev) => {
      const pruned: Record<string, number> = {};
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (ids.has(id)) pruned[id] = prev[id];
        else changed = true;
      }
      return changed ? pruned : prev;
    });
    const pruneNumberMap = (setter: React.Dispatch<React.SetStateAction<Record<string, number>>>) =>
      setter((prev) => {
        const pruned: Record<string, number> = {};
        let changed = false;
        for (const id of Object.keys(prev)) {
          if (ids.has(id)) pruned[id] = prev[id];
          else changed = true;
        }
        return changed ? pruned : prev;
      });
    pruneNumberMap(setPadFilter);
    pruneNumberMap(setPadSendReverb);
    pruneNumberMap(setPadSendDelay);
    pruneNumberMap(setPadVoices);
    setPadMode((prev) => {
      const pruned: Record<string, PadPlayMode> = {};
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (ids.has(id)) pruned[id] = prev[id];
        else changed = true;
      }
      return changed ? pruned : prev;
    });
    setActiveRowId((prev) => {
      if (prev && ids.has(prev)) return prev;
      return layers.find((l) => l.enabled)?.id || null;
    });
    // Remove deleted layers from any pad program
    prunePrograms(ids);
  }, [layers, prunePrograms]);

  // On first open (all programs empty), auto-fill bank A from the enabled layers.
  useEffect(() => {
    const store = useSequencerStore.getState();
    const isEmpty = BANK_IDS.every((b) => store.programs[b].every((slot) => slot === null));
    if (isEmpty) {
      const first16 = layers.filter((l) => l.enabled).slice(0, 16).map((l) => l.id);
      // Write into the active pattern's program (not just the flat view):
      // `activatePatternPrograms` runs right after and would otherwise reload
      // the empty per-pattern map over the top of this fill.
      if (first16.length) store.setPatternProgram(usePatternStore.getState().activePatternId, 'A', first16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 6.1 — pads follow the active pattern: when the pattern changes, load
  // that pattern's pad program into the flat view so the pad bank swaps live.
  useEffect(() => {
    activatePatternPrograms(activePatternId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatternId]);

  // Interconnectivity: selecting a layer anywhere jumps to the program (bank)
  // and pad that contains it, so the MPC highlights what you're editing.
  useEffect(() => {
    if (!selectedLayerId) return;
    const bank = BANK_IDS.find((b) => programs[b].includes(selectedLayerId));
    if (bank && bank !== activeBank) {
      setActiveBank(bank);
      setSelectedPad(programs[bank].findIndex((id) => id === selectedLayerId));
    }
  }, [selectedLayerId, programs, activeBank, setActiveBank]);

  // Respect the mixer's mute/solo state when sequencing
  const isLayerAudible = useCallback((layer: SoundLayer) => {
    if (!layer.enabled || layer.muted === true) return false;
    const anySolo = layers.some((l) => l.soloed === true);
    return !anySolo || layer.soloed === true;
  }, [layers]);

  const triggerStep = useCallback((layerId: string, cell: StepCell, when?: number) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || !isLayerAudible(layer)) return;
    // Shared per-pad processing: choke group, tune, level and pad filter/sends
    // apply the same way to melodic and drum steps.
    const choke = padChokeRef.current[layerId] || 0;
    const chokeKey = choke > 0 ? `choke:${choke}` : undefined;
    const velocity = typeof cell.velocity === 'number' ? Math.max(0, Math.min(1, cell.velocity / 127)) : 1;
    const tune = padTuneRef.current[layerId] || 0;
    const level = padLevelRef.current[layerId] ?? 1;
    const maxVoices = padVoicesRef.current[layerId] ?? 0;
    // Keygroup velocity layers: a soft step can sound a different sample than a
    // hard one (the recorded cell velocity drives the selection).
    const padSource = selectVelocityLayer(layer, velocity);
    const padParams = applyPadParams(padSource, {
      filter: padFilterRef.current,
      sendReverb: padSendReverbRef.current,
      sendDelay: padSendDelayRef.current,
    });
    const levelGain = (padParams.gain || 1) * velocity * level;

    // Melodic / chord cell: a single `note` or a voiced `notes` array. Both go
    // through `audioEngine.triggerLayer` with `note`, so they hear the layer's
    // full sound-design chain (not the stripped filter+envelope path). Pad
    // tune is folded into the note (works for both synth frequency and sample
    // playbackRate); each note is gated to the cell's duration.
    const notes = cell.notes && cell.notes.length > 0 ? cell.notes : cell.note !== undefined ? [cell.note] : [];
    if (notes.length > 0) {
      const melodicLayer = { ...padParams, gain: levelGain };
      const durationSteps = typeof cell.duration === 'number' && cell.duration > 0 ? cell.duration : 1;
      const noteDurSeconds = (durationSteps * (60000 / bpm)) / 4 / 1000;
      for (const note of notes) {
        audioEngine.triggerLayer(melodicLayer, noteDurSeconds, chokeKey, when, {
          maxVoices,
          note: note + tune,
          respectDuration: true,
        });
      }
      return;
    }

    // Drum/sample one-shot. Explicit cell duration gates the sample; otherwise
    // the engine plays the full buffer/crop. Velocity, choke and per-pad tune
    // are honoured so pattern dynamics are audible on drum rows.
    const hasGate = typeof cell.duration === 'number' && cell.duration > 0;
    const gateSeconds = hasGate ? (cell.duration! * (60000 / bpm)) / 4 / 1000 : undefined;
    audioEngine.triggerLayer(applySemitoneShift({ ...padParams, gain: levelGain }, tune), gateSeconds, chokeKey, when, {
      maxVoices,
      respectDuration: hasGate,
    });
  }, [layers, isLayerAudible, bpm]);

  const tick = useCallback(() => {
    const stepLen = stepLengthRef.current;
    const step = (stepRef.current + 1) % stepLen;
    stepRef.current = step;
    setCurrentStep(step);
    const p = patternRef.current;
    const stepMs = (60000 / bpm) / 4; // 16th-note duration
    for (const [layerId, cells] of Object.entries(p)) {
      const cell = cells[step];
      if (cell && cell.on) {
        // Probability: if cell.probability < 1, roll the dice and skip this hit.
        const probability = cell.probability ?? 1;
        if (probability < 1 && Math.random() > probability) continue;
        // MPC per-pad swing: delay off-beat 16ths (odd steps) by the pad's swing %.
        // Phase 1.4 groove offsets stack on top of MPC swing: cell.offset is a
        // fractional shift of the 16th-note (positive = laid-back, negative
        // = pushed). The two combine so per-pad swing and per-pattern groove
        // can be authored independently.
        const swing = padSwingRef.current[layerId] || 0;
        const pocketMs = padPocketRef.current[layerId] || 0;
        const offsetSec = stepOffsetSeconds({
          stepMs,
          stepIndex: step,
          swingPercent: swing,
          cellOffset: cell.offset ?? 0,
          pocketMs,
        });
        // Schedule on the audio clock when possible so the setInterval fallback
        // still gets sample-accurate swing (the interval only advances the step
        // counter; the note lands at currentTime + offset). Negative (pushed)
        // offsets clamp to the step time inside the helper.
        if (offsetSec > 0) {
          const ctx = audioEngine.getContext();
          if (ctx) {
            triggerStep(layerId, cell, ctx.currentTime + offsetSec);
          } else {
            const t = setTimeout(() => {
              swingTimeoutsRef.current.delete(t);
              triggerStep(layerId, cell);
            }, offsetSec * 1000);
            swingTimeoutsRef.current.add(t);
          }
        } else {
          triggerStep(layerId, cell);
        }
      }
    }
  }, [triggerStep, bpm]);

  useEffect(() => { tickRef.current = tick; }, [tick]);
  const triggerStepRef = useRef<(layerId: string, cell: StepCell, when?: number) => void>(() => {});
  useEffect(() => { triggerStepRef.current = triggerStep; }, [triggerStep]);

  // Start the pattern clock immediately (Tone Transport with a setInterval
  // fallback). Split out of togglePlay so the count-in path can defer it.
  const startTransportNow = () => {
    if (useTransportMode) {
      try {
        initTransport();
        getTransport().setBpm(bpm);
        getTransport().setSwing(globalSwing);
        getTransport().play();
        return;
      } catch (e) {
        console.warn('Transport start failed, falling back to setInterval', e);
      }
    }
    intervalRef.current = setInterval(() => tickRef.current(), (60000 / bpm) / 4);
  };

  // Play with an MPC-style count-in when step-record is armed: schedule
  // `countInBeats` metronome clicks on the audio clock, then roll the
  // transport. Falls back to an immediate start when the metronome or the
  // audio clock is unavailable.
  const beginPlay = () => {
    setIsPlaying(true);
    stepRef.current = -1;
    if (isRecording && countInBeats > 0) {
      try {
        const ctx = audioEngine.getContext();
        if (!ctx) throw new Error('AudioContext unavailable for count-in');
        if (ctx.state === 'suspended') void ctx.resume();
        if (!metronomeRef.current) metronomeRef.current = createMetronome();
        const metro = metronomeRef.current;
        const beatsPerBar = patternTimeSignature[0] ?? 4;
        const beats = buildCountInBeats(countInBeats, bpm);
        const t0 = ctx.currentTime + 0.06;
        beats.forEach((b) => {
          metro.scheduleAtBeat(b.index % beatsPerBar, Math.floor(b.index / beatsPerBar), beatsPerBar, t0 + b.timeSec);
        });
        const delayMs = (beats.length * 60) / bpm * 1000;
        setIsCountingIn(true);
        countInTimerRef.current = setTimeout(() => {
          countInTimerRef.current = null;
          setIsCountingIn(false);
          startTransportNow();
        }, delayMs);
        return;
      } catch (e) {
        console.warn('Count-in failed, starting immediately', e);
        setIsCountingIn(false);
      }
    }
    startTransportNow();
  };

  const togglePlay = () => {
    if (isPlaying) {
      // Cancel a pending count-in so a stopped transport never starts late.
      if (countInTimerRef.current) {
        clearTimeout(countInTimerRef.current);
        countInTimerRef.current = null;
      }
      setIsCountingIn(false);
      if (useTransportMode) {
        try { getTransport().stop(); } catch { /* not initialized */ }
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      // Cancel any pending swing-offset triggers so nothing fires after stop
      swingTimeoutsRef.current.forEach(clearTimeout);
      swingTimeoutsRef.current.clear();
      setIsPlaying(false);
    } else {
      beginPlay();
    }
  };

  // Restart the interval when BPM changes while playing (tick is read via a ref
  // so layer edits don't restart the clock). Drop pending swing-offset triggers
  // since their timing is now stale.
  useEffect(() => {
    if (isPlaying && intervalRef.current) {
      clearInterval(intervalRef.current);
      swingTimeoutsRef.current.forEach(clearTimeout);
      swingTimeoutsRef.current.clear();
      intervalRef.current = setInterval(() => tickRef.current(), (60000 / bpm) / 4);
    }
  }, [bpm, isPlaying]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      swingTimeoutsRef.current.forEach(clearTimeout);
      swingTimeoutsRef.current.clear();
      if (countInTimerRef.current) clearTimeout(countInTimerRef.current);
      metronomeRef.current?.dispose();
      metronomeRef.current = null;
      // Release an in-progress mic recording when the tab unmounts, otherwise
      // the MediaRecorder / getUserMedia stream stays alive (browser mic
      // indicator on) indefinitely.
      audioCaptureRef.current?.dispose();
      audioCaptureRef.current = null;
    };
  }, []);

  // Tone Transport mode: when enabled, the per-step tick is driven by
  // Tone.Transport instead of setInterval. We re-use the existing tick()
  // function (via tickRef) so all per-step behavior (swing, mute, choke,
  // recording) is preserved.
  useEffect(() => {
    if (!useTransportMode || arrangementLive) return;
    let seq: Tone.Sequence | null = null;
    let cancelled = false;
    try {
      initTransport();
      const t = getTransport();
      t.setBpm(bpm);
      t.setSwing(globalSwing);
      seq = new Tone.Sequence((time, stepIdx) => {
        if (cancelled) return;
        stepRef.current = stepIdx;
        Tone.Draw.schedule(() => setCurrentStep(stepIdx), time);
        // Sample-accurate triggering: `time` is the Web Audio clock time this
        // step lands on. We schedule every note at `time + offset` on the
        // audio clock (NOT via setTimeout — a JS-clock offset is jittery and
        // drifts under main-thread load; see web.dev "A tale of two clocks").
        const p = patternRef.current;
        const stepMs = (60000 / bpm) / 4;
        for (const [layerId, cells] of Object.entries(p)) {
          const cell = cells[stepIdx];
          if (cell && cell.on) {
            const probability = cell.probability ?? 1;
            if (probability < 1 && Math.random() > probability) continue;
            const swing = padSwingRef.current[layerId] || 0;
            const pocketMs = padPocketRef.current[layerId] || 0;
            const offsetSec = stepOffsetSeconds({
              stepMs,
              stepIndex: stepIdx,
              swingPercent: swing,
              cellOffset: cell.offset ?? 0,
              pocketMs,
            });
            // Negative (pushed) offsets clamp to 0 inside the helper, so the
            // note always lands at or after the step's audio time.
            const triggerTime = time + offsetSec;
            triggerStepRef.current(layerId, cell, triggerTime);
          }
        }
      }, [...Array(stepLengthRef.current).keys()], '16n');
      seq.loop = true;
      seq.start(0);
    } catch (e) {
      // Tone failed to init (e.g. test env or no AudioContext) — silently
      // fall back. The user can flip the flag off to recover.
      console.warn('Tone Transport init failed, falling back to setInterval', e);
    }
    return () => {
      cancelled = true;
      if (seq) seq.dispose();
    };
    // Rebuild the sequence when the step count changes — the Tone.Sequence
    // callback array is fixed at construction, so without this dep a 16→32
    // step change (Steps selector in the TransportBar) keeps playing the
    // stale 16 steps while the setInterval path already honours the new
    // length. Transport stop on unmount/mode-off is handled separately below
    // so a length change mid-play doesn't yank the clock.
  }, [useTransportMode, patternStepLength, arrangementLive]);

  // Clip-accurate live arrangement scheduler. Replaces the single-pattern
  // Tone.Sequence (gated above via `arrangementLive`) with a global 16th-step
  // clock: each step resolves EVERY active clip (sub-bar starts, loops and
  // overlaps included) and triggers those cells through the same
  // `triggerStep` path, so swing/pocket/probability/velocity all still apply.
  useEffect(() => {
    if (!useTransportMode || !arrangementLive) return;
    let scheduledId: number | null = null;
    let cancelled = false;
    try {
      initTransport();
      arrangementStepRef.current = 0;
      scheduledId = Tone.Transport.scheduleRepeat((time) => {
        if (cancelled) return;
        const st = usePatternStore.getState();
        const total = totalArrangementSteps(st.arrangement, st.patterns);
        if (total <= 0) return;
        const step = arrangementStepRef.current % total;
        const beat = step * 0.25;
        const stepMs = (60000 / (st.getBpmAtBeat(beat) || bpm)) / 4;
        const entries = cellsAtGlobalStep(st.arrangement, st.patterns, step);
        for (const entry of entries) {
          const probability = entry.cell.probability ?? 1;
          if (probability < 1 && Math.random() > probability) continue;
          const swing = padSwingRef.current[entry.layerId] || 0;
          const pocketMs = padPocketRef.current[entry.layerId] || 0;
          const offsetSec = stepOffsetSeconds({
            stepMs,
            stepIndex: entry.stepIdx,
            swingPercent: swing,
            cellOffset: entry.cell.offset ?? 0,
            pocketMs,
          });
          triggerStepRef.current(entry.layerId, entry.cell, time + offsetSec);
        }
        Tone.Draw.schedule(() => setCurrentStep(step), time);
        arrangementStepRef.current = (step + 1) % total;
      }, '16n');
    } catch (e) {
      console.warn('Arrangement scheduling failed', e);
    }
    return () => {
      cancelled = true;
      if (scheduledId !== null) {
        try { Tone.Transport.clear(scheduledId); } catch { /* ignore */ }
      }
    };
  }, [useTransportMode, arrangementLive, bpm]);

  // Stop the Tone transport when Tone mode is turned off or the component
  // unmounts, otherwise a disabled/beta path could leave Tone.Transport
  // advancing silently (the seq cleanup above no longer stops it, so it can
  // rebuild on step-length changes without interrupting playback).
  useEffect(() => {
    return () => {
      if (playingRef.current) {
        try { getTransport().stop(); } catch { /* ignore */ }
      }
    };
  }, [useTransportMode]);

  // Keep Tone Transport BPM/swing in sync with the controls.
  useEffect(() => {
    if (!useTransportMode) return;
    try {
      const t = getTransport();
      t.setBpm(bpm);
      t.setSwing(globalSwing);
    } catch { /* transport not initialized yet */ }
  }, [bpm, globalSwing, useTransportMode]);

  // Song mode: every bar boundary, advance the active pattern to the next
  // pattern in the chain. The Tone.Sequence reads patternRef.current, which
  // tracks the active pattern, so the next bar plays the new pattern.
  useEffect(() => {
    if (!useTransportMode || !songModeActive) return;
    let scheduledId: number | null = null;
    let cancelled = false;
    let cursor = usePatternStore.getState().songChain.order.indexOf(usePatternStore.getState().activePatternId);
    if (cursor < 0) cursor = 0;
    // A pattern can be 16 or 32 steps (1 or 2 bars). Only advance the chain
    // once its full length has elapsed, otherwise 32-step patterns get cut in
    // half every bar.
    let barsInPattern = 0;
    let barIndex = 0;
    try {
      initTransport();
      scheduledId = Tone.Transport.scheduleRepeat((time) => {
        if (cancelled) return;
        const st = usePatternStore.getState();
        const chain = st.songChain.order;
        if (chain.length === 0) return;
        const current = st.patterns[chain[cursor] as 'A' | 'B' | 'C' | 'D'];
        const barsPerPattern = current ? Math.max(1, Math.round(current.stepLength / 16)) : 1;
        barsInPattern += 1;
        if (barsInPattern < barsPerPattern) { barIndex += 1; return; }
        barsInPattern = 0;
        barIndex += 1;
        cursor = (cursor + 1) % chain.length;
        const next = chain[cursor];
        st.setActivePattern(next as 'A' | 'B' | 'C' | 'D');
        // Re-apply the pattern's BPM at this bar, honouring any arrangement
        // tempo map (falls back to the pattern's own BPM when there is none).
        const np = st.patterns[next as 'A' | 'B' | 'C' | 'D'];
        const mapped = st.getBpmAtBeat(barIndex * 4);
        getTransport().setBpm(mapped || np?.bpm || 120);
        void time;
      }, '1m');
    } catch (e) {
      console.warn('Song mode scheduling failed', e);
    }
    return () => {
      cancelled = true;
      if (scheduledId !== null) {
        try { Tone.Transport.clear(scheduledId); } catch { /* ignore */ }
      }
    };
  }, [useTransportMode, songModeActive]);

  // Recourse bridge: start playback on request. Enables transport + song mode so
  // the loaded piece plays through its chain. (Web Audio still needs a prior
  // user gesture on this page before audio is audible.)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onRecoursePlay = () => {
      setUseTransportMode(true);
      setSongModeActive(true);
      if (!isPlaying) togglePlay();
    };
    window.addEventListener('recourse:play', onRecoursePlay);
    return () => window.removeEventListener('recourse:play', onRecoursePlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Arrangement drives song mode (Phase 2.3): when an Arrangement with clips is
  // present and song mode is on, flatten it into the song chain so the existing
  // per-bar engine plays the arrangement (honoring clip order/loops/muted). The
  // recursion loop stays on the existing chain engine — no new transport code.
  useEffect(() => {
    if (!songModeActive) return;
    const st = usePatternStore.getState();
    const arrangement = st.arrangement;
    if (!arrangement || !arrangement.clips || arrangement.clips.length === 0) return;
    const plan = planFromArrangement(arrangement, st.patterns);
    if (plan.bars > 0) {
      usePatternStore.setState({ songChain: { order: plan.order as unknown as string[] } });
    }
  }, [songModeActive]);

  const toggleCell = (layerId: string, idx: number) => {
    const row = pattern[layerId] || Array.from({ length: stepLengthRef.current }, () => ({ on: false }));
    // Preserve every field (note, notes, velocity, duration, probability,
    // offset) — toggling a step off and on again must not silently strip the
    // cell down to `{ on, note }`.
    const next = row.map((c, i) => (i === idx ? { ...c, on: !c.on } : c));
    setRow(activePatternId, layerId, next);
  };

  // Piano-roll edit: set/clear a melodic note at (step, pitch) on a layer row.
  const toggleNote = useCallback((layerId: string, step: number, pitch: number) => {
    const row = usePatternStore.getState().patterns[usePatternStore.getState().activePatternId].layerRows[layerId]
      || Array.from({ length: stepLengthRef.current }, () => ({ on: false }));
    const next = row.map((c, i) => {
      if (i !== step) return c;
      // Re-toggling the same pitch clears it; otherwise set the note while
      // keeping any velocity/duration the cell already carried.
      return c.on && c.note === pitch
        ? { ...c, on: false, note: undefined, notes: undefined }
        : { ...c, on: true, note: pitch, notes: undefined };
    });
    setRow(activePatternId, layerId, next);
  }, [activePatternId, setRow]);

  const recordNote = useCallback((midi: number, velocity?: number) => {
    const rowId = activeRowRef.current;
    if (!rowId) return;
    const pid = usePatternStore.getState().activePatternId;
    // MPC Time Correct: snap the recorded step to the resolution grid
    const res = timeCorrectRef.current || 1;
    const rawStep = playingRef.current ? stepRef.current : 0;
    const stepLen = stepLengthRef.current;
    const step = Math.max(0, Math.min(stepLen - 1, Math.round(rawStep / res) * res));
    const row = usePatternStore.getState().patterns[pid].layerRows[rowId]
      || Array.from({ length: stepLen }, () => ({ on: false }));
      const cellUpdate: PatternCell = { on: true, note: midi };
      if (typeof velocity === 'number') {
        // Velocity arrives in 0..1 (pads/MIDI/keys); store the 0..127 cell value.
        cellUpdate.velocity = Math.max(0, Math.min(127, Math.round(velocity * 127)));
      }
      const next = row.map((c, i) => (i === step ? { ...c, ...cellUpdate } : c));
      setRow(pid, rowId, next);
    }, [setRow]);

  // Pad-to-step: real pad hits while REC + playing write a drum trigger into
  // the hit layer's row at the current step (Time Correct snapped). The pad's
  // live velocity (0..127, derived from pointer Y in MpcPadBank) is captured
  // onto the cell so playback can scale the trigger loudness.
  const recordPadHit = useCallback((layerId: string, velocity?: number) => {
    if (!recordingRef.current || !playingRef.current) return;
    const pid = usePatternStore.getState().activePatternId;
    const res = timeCorrectRef.current || 1;
    const rawStep = stepRef.current;
    const stepLen = stepLengthRef.current;
    const step = Math.max(0, Math.min(stepLen - 1, Math.round(rawStep / res) * res));
    const row = usePatternStore.getState().patterns[pid].layerRows[layerId]
      || Array.from({ length: stepLen }, () => ({ on: false }));
    const cellUpdate: PatternCell = { on: true };
    if (typeof velocity === 'number') {
      // Pad velocity arrives in 0..1; store the 0..127 cell value so the
      // pattern's drum row actually plays back the recorded dynamics.
      cellUpdate.velocity = Math.max(0, Math.min(127, Math.round(velocity * 127)));
    }
    const next = row.map((c, i) => (i === step ? { ...c, ...cellUpdate } : c));
    setRow(pid, layerId, next);
  }, [setRow]);

  // MPC Time Correct quantize: snap every active step to the resolution grid.
  const quantizePattern = useCallback(() => {
    const res = Math.max(1, timeCorrect || 1);
    const pid = usePatternStore.getState().activePatternId;
    const prev = usePatternStore.getState().patterns[pid].layerRows;
    const stepLen = stepLengthRef.current;
    const next: Record<string, StepCell[]> = {};
    for (const id of Object.keys(prev)) {
      const cells = prev[id];
      const snapped = new Map<number, StepCell>();
      cells.forEach((c, i) => {
        if (!c.on) return;
        const s = Math.min(stepLen - 1, Math.max(0, Math.round(i / res) * res));
        if (!snapped.has(s)) snapped.set(s, c);
      });
      const row: StepCell[] = Array.from({ length: stepLen }, () => ({ on: false }));
      // Keep the full cell (velocity/duration/probability/offset/notes) — only
      // the step position is quantized.
      snapped.forEach((c, i) => { row[i] = { ...c, on: true }; });
      next[id] = row;
    }
    for (const id of Object.keys(next)) {
      setRow(pid, id, next[id]);
    }
  }, [timeCorrect, setRow]);

  // Tap tempo (reset the buffer if the gap is stale so old taps don't skew BPM)
  const tapTempo = useCallback(() => {
    const now = performance.now();
    const times = tapTimesRef.current;
    const last = times[times.length - 1];
    if (last !== undefined && now - last > 2000) {
      tapTimesRef.current = [now];
      return;
    }
    times.push(now);
    if (times.length > 4) times.shift();
    if (times.length >= 2) {
      const avgMs = (times[times.length - 1] - times[0]) / (times.length - 1);
      setBpm(Math.max(60, Math.min(200, Math.round(60000 / avgMs))));
    }
  }, []);

  // MPC pad trigger with per-pad tune / 16-levels semitone offset, velocity
  // (0..1), and choke group. Does not stop other layers unless they share a
  // choke group; respects the mixer's mute/solo state. Declared before
  // `playMidiNote` (keygroup playback reuses it) to avoid a TDZ read.
  const triggerLayerWithSemitone = useCallback((layerId: string, semitones: number, velocity = 1, chokeKey?: string, when?: number) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || !isLayerAudible(layer)) return;
    const level = padLevel[layerId] ?? 1;
    // Keygroup velocity layers: pick the sample for this hit's velocity.
    const velSelected = selectVelocityLayer(layer, velocity);
    const withPads = applyPadParams(velSelected, {
      filter: padFilter,
      sendReverb: padSendReverb,
      sendDelay: padSendDelay,
    });
    const base: SoundLayer = {
      ...withPads,
      gain: Math.max(0.02, (withPads.gain || 1) * velocity * level),
    };
    const shifted = applySemitoneShift(base, semitones);
    audioEngine.triggerLayer(shifted, undefined, chokeKey, when, { maxVoices: padVoices[layerId] ?? 0 });
  }, [layers, isLayerAudible, padLevel, padFilter, padSendReverb, padSendDelay, padVoices]);

  const playMidiNote = useCallback((midi: number, velocity?: number) => {
    // react-piano's ControlledPiano re-calls `playNote` for every note that
    // newly appears in the `activeNotes` prop, so without this guard each note
    // would sound twice (once at the real velocity here, once at full velocity
    // from the redundant callback). The ref mirrors `activeNotes` synchronously.
    if (activeNotesRef.current.includes(midi)) return;
    const rowId = activeRowRef.current;
    const layer = layers.find((l) => l.id === rowId);
    if (!layer || !isLayerAudible(layer)) return;
    // All onPlayNote callers (PerformanceControls keyboard pads, the MIDI
    // controller panel, react-piano) pass velocity in 0..1. Normalize here ONCE
    // — the old `velocity / 127` double-normalized a 0..1 value to ~0.008.
    const v01 = typeof velocity === 'number' ? Math.max(0, Math.min(1, velocity)) : 1;
    // Chromatic playback through the full FX chain: the layer is transposed to
    // the pressed note (rooted at C4) and run through `triggerLayer`'s complete
    // sound-design graph. Pad params + tune + voice limit apply the same as a
    // pad hit, so the keyboard and the pattern grid sound identical.
    // Keygroup velocity layers still pick the sample for this hit's velocity.
    const velSelected = selectVelocityLayer(layer, v01);
    const tune = padTune[layer.id] || 0;
    const level = padLevel[layer.id] ?? 1;
    const withPads = applyPadParams(velSelected, {
      filter: padFilter,
      sendReverb: padSendReverb,
      sendDelay: padSendDelay,
    });
    audioEngine.triggerLayer(
      { ...withPads, gain: Math.max(0.02, (withPads.gain || 1) * v01 * level) },
      0.6,
      undefined,
      undefined,
      { maxVoices: padVoices[layer.id] ?? 0, note: midi + tune, respectDuration: true }
    );
    activeNotesRef.current = [...activeNotesRef.current, midi];
    setActiveNotes((prev) => (prev.includes(midi) ? prev : [...prev, midi]));
    if (recordingRef.current && playingRef.current) {
      recordNote(midi, velocity);
    }
  }, [layers, recordNote, isLayerAudible, padTune, padLevel, padFilter, padSendReverb, padSendDelay, padVoices]);

  const stopMidiNote = useCallback((midi: number) => {
    activeNotesRef.current = activeNotesRef.current.filter((n) => n !== midi);
    setActiveNotes((prev) => prev.filter((n) => n !== midi));
  }, []);

  const handlePlayNoteInput = useCallback((midi: number, velocity?: number) => {
    // Fires only on real user input (mouse/touch/QWERTY) — used for recording.
    if (recordingRef.current && playingRef.current) {
      recordNote(midi, velocity);
    }
  }, [recordNote]);

  const clearPattern = () => {
    const pid = usePatternStore.getState().activePatternId;
    usePatternStore.getState().clearPatternCells(pid);
  };

  // Phase 1.3 — duplicate the active pattern into another A/B/C/D slot.
  // Defaults to the next slot, wraps from D → A.
  const duplicatePatternInto = (dstId?: PatternId) => {
    const ids = PATTERN_IDS;
    const state = usePatternStore.getState();
    const src = state.activePatternId;
    const idx = ids.indexOf(src);
    const dst = dstId ?? ids[(idx + 1) % ids.length];
    state.copyPatternInto(src, dst);
    state.setActivePattern(dst);
  };

  const setSwing = useCallback((layerId: string, swing: number) => {
    setPadSwing((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(75, swing)) }));
  }, []);

  // PocketLab-style per-piece pocket: early/late bias in ms (-40..+40).
  const setPocket = useCallback((layerId: string, pocketMs: number) => {
    setPadPocket((prev) => ({ ...prev, [layerId]: Math.max(-40, Math.min(40, pocketMs)) }));
  }, []);

  const setTune = useCallback((layerId: string, tune: number) => {
    setPadTune((prev) => ({ ...prev, [layerId]: Math.max(-24, Math.min(24, tune)) }));
  }, []);

  const setChoke = useCallback((layerId: string, group: number) => {
    setPadChoke((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(4, group)) }));
  }, []);

  const setLevel = useCallback((layerId: string, level: number) => {
    setPadLevel((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(1.5, level)) }));
  }, []);

  const setFilter = useCallback((layerId: string, hz: number) => {
    setPadFilter((prev) => ({ ...prev, [layerId]: Math.max(200, Math.min(20000, hz)) }));
  }, []);

  const setSendReverb = useCallback((layerId: string, amount: number) => {
    setPadSendReverb((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(1, amount)) }));
  }, []);

  const setSendDelay = useCallback((layerId: string, amount: number) => {
    setPadSendDelay((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(1, amount)) }));
  }, []);

  const setVoices = useCallback((layerId: string, voices: number) => {
    setPadVoices((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(16, Math.round(voices))) }));
  }, []);

  const setPadPlayMode = useCallback((layerId: string, mode: PadPlayMode) => {
    setPadMode((prev) => ({ ...prev, [layerId]: mode }));
  }, []);

  // Gate/toggle release: fade-stop this layer's live voices.
  const releasePad = useCallback((layerId: string) => {
    audioEngine.stopLayerVoices(layerId);
  }, []);

  const togglePadMute = useCallback((layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    const next = !(layer?.muted === true);
    // Keep the pad-bank mute state and the layer mute flag in sync: the pads
    // read `padMuted` (tiles, button label, live-hit gate) while the
    // sequencer/mixer read `layer.muted`. Updating only one left mute
    // half-applied (sequence muted, pads still firing, UI stale).
    setPadMuted((prev) => ({ ...prev, [layerId]: next }));
    if (onUpdateLayer) onUpdateLayer(layerId, { muted: next });
  }, [layers, onUpdateLayer]);

  const handleBankChange = useCallback((bank: BankId) => {
    setActiveBank(bank);
    setSelectedPad(0);
  }, [setActiveBank]);

  // Active bank's 16 slots resolved to layer info (null = empty pad)
  const entries: (PadEntry | null)[] = programs[activeBank].map((layerId) => {    if (!layerId) return null;
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || !layer.enabled) return null;
    return { layerId, name: layer.name, type: layer.type, color: layerColorFor(layer, layers.indexOf(layer)) };
  });

  const setProgramSlot = useCallback((index: number, layerId: string | null) => {
    // Phase 6.1 — write into the per-pattern program (pads follow the pattern).
    setPatternProgramSlot(activePatternId, activeBank, index, layerId);
  }, [activePatternId, activeBank, setPatternProgramSlot]);

  const clearPad = useCallback((index: number) => {
    setProgramSlot(index, null);
  }, [setProgramSlot]);

  const assignActiveLayerToPad = useCallback((index: number) => {
    if (selectedLayerId && layers.some((l) => l.id === selectedLayerId)) {
      setProgramSlot(index, selectedLayerId);
    }
  }, [selectedLayerId, layers, setProgramSlot]);

  // Pad copy/paste/swap within the active bank's program. Slots reference
  // layers, so per-pad params (which are keyed by layer) travel with the copy
  // automatically.
  const copyPad = useCallback((from: number, to: number) => {
    if (from === to) return;
    const src = programs[activeBank]?.[from] ?? null;
    setProgramSlot(to, src);
    setSelectedPad(to);
  }, [programs, activeBank, setProgramSlot]);

  const swapPads = useCallback((a: number, b: number) => {
    if (a === b) return;
    const prog = programs[activeBank] ?? [];
    const tmp = prog[a] ?? null;
    setProgramSlot(a, prog[b] ?? null);
    setProgramSlot(b, tmp);
    setSelectedPad(b);
  }, [programs, activeBank, setProgramSlot]);

  // ----- Named program presets (persisted by layer name, resolved on load) -----

  const refreshPadPresets = useCallback(async () => {
    setPadPresets(await fetchPadPrograms());
  }, []);

  useEffect(() => {
    void refreshPadPresets();
  }, [refreshPadPresets]);

  const saveCurrentAsPreset = useCallback(async () => {
    const body = snapshotProgram(presetName || `Program ${padPresets.length + 1}`, {
      banks: programs,
      swing: padSwing,
      pocket: padPocket,
      tune: padTune,
      choke: padChoke,
      muted: padMuted,
      level: padLevel,
      filter: padFilter,
      sendReverb: padSendReverb,
      sendDelay: padSendDelay,
      voices: padVoices,
      mode: padMode,
      sixteenLevels,
      sixteenLevelsMode,
      globalSwing,
      fullLevel,
      velocityCurve,
      timeCorrect,
    }, layers);
    await savePadProgram(body);
    setPresetName('');
    setPresetStatus(`Saved "${body.name}"`);
    await refreshPadPresets();
  }, [presetName, padPresets.length, programs, padSwing, padPocket, padTune, padChoke, padMuted, padLevel, padFilter, padSendReverb, padSendDelay, padVoices, padMode, sixteenLevels, sixteenLevelsMode, globalSwing, fullLevel, velocityCurve, timeCorrect, layers, refreshPadPresets]);

  const loadPreset = useCallback(async (id: string) => {
    const stored = padPresets.find((p) => p.id === id);
    if (!stored) return;
    const resolved = resolveProgram(stored, layers);
    const store = useSequencerStore.getState();
    const pid = usePatternStore.getState().activePatternId;
    for (const bank of BANK_IDS) store.setPatternProgram(pid, bank, resolved.banks[bank]);
    setPadSwing(resolved.swing);
    setPadPocket(resolved.pocket);
    setPadTune(resolved.tune);
    setPadChoke(resolved.choke);
    setPadLevel(resolved.level);
    setPadFilter(resolved.filter);
    setPadSendReverb(resolved.sendReverb);
    setPadSendDelay(resolved.sendDelay);
    setPadVoices(resolved.voices);
    setPadMode(resolved.mode);
    setGlobalSwing(resolved.globalSwing);
    setSixteenLevels(resolved.sixteenLevels);
    setSixteenLevelsMode(resolved.sixteenLevelsMode);
    setFullLevel(resolved.fullLevel);
    setVelocityCurve(resolved.velocityCurve);
    setTimeCorrect(resolved.timeCorrect);
    // Mutes live on the layers too — sync both, like togglePadMute does.
    setPadMuted(resolved.muted);
    if (onUpdateLayer) {
      for (const [layerId, muted] of Object.entries(resolved.muted)) {
        onUpdateLayer(layerId, { muted });
      }
    }
    setSelectedPad(0);
    setPresetStatus(
      resolved.missing.length > 0
        ? `"${stored.name}" loaded · missing: ${resolved.missing.join(', ')}`
        : `"${stored.name}" loaded`
    );
  }, [padPresets, layers, onUpdateLayer]);

  const deletePreset = useCallback(async (id: string) => {
    await deletePadProgram(id);
    setPresetStatus('');
    await refreshPadPresets();
  }, [refreshPadPresets]);

  // ----- Library usage tracking (powers SampleBrowser "purge unused") -----

  const [usedLibraryIds, setUsedLibraryIds] = useState<string[]>([]);
  const markLibraryUsed = useCallback((id: string) => {
    setUsedLibraryIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  // ----- Synth auto-sampler (MPC-style: one patch → 16 pitched one-shots) -----

  const [isAutoSampling, setIsAutoSampling] = useState(false);
  const autoSampleActiveSynth = useCallback(async () => {
    const rowId = activeRowRef.current;
    const layer = layers.find((l) => l.id === rowId);
    if (!layer || layer.type !== 'synth' || !onAddLayer) return;
    setIsAutoSampling(true);
    try {
      // exportWav renders the full chain, so what you hear is what you sample.
      const notes = await autoSampleSynthLayer(layer, (pitched, dur) => audioEngine.exportWav([pitched], dur));
      const ids: string[] = [];
      for (const n of notes) {
        const id = onAddLayer(n.buffer, n.name);
        if (id) ids.push(id);
      }
      if (ids.length) {
        // Write into the active pattern's program (pads follow the pattern).
        const store = useSequencerStore.getState();
        const pid = usePatternStore.getState().activePatternId;
        store.setPatternProgram(pid, 'B', ids);
        store.setActiveBank('B');
        setSelectedPad(0);
        // Keep the bank-follow effect on Program B: it snaps back to whatever
        // bank holds the selected layer.
        if (onSelectLayer && ids[0]) onSelectLayer(ids[0]);
      }
    } catch (e) {
      console.warn('Auto-sample failed', e);
    } finally {
      setIsAutoSampling(false);
    }
  }, [layers, onAddLayer, onSelectLayer]);

  // --- MPC program (.prgm) / sequence (.seq) import-export ---
  const downloadFile = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Defer revoke so the browser finishes the download
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportProgram = () => {
    const data = {
      format: 'ncsoundlab-mpc-program',
      version: 4,
      ppq: PPQ,
      globalSwing,
      sixteenLevels,
      sixteenLevelsMode,
      timeCorrect,
      programs,
      swing: padSwing,
      tune: padTune,
      choke: padChoke,
      level: padLevel,
      filter: padFilter,
      sendReverb: padSendReverb,
      sendDelay: padSendDelay,
      voices: padVoices,
      mode: padMode,
    };
    downloadFile(JSON.stringify(data, null, 2), 'mpc-program.prgm');
  };

  const exportSequence = () => {
    const pid = usePatternStore.getState().activePatternId;
    const patternObj = usePatternStore.getState().patterns[pid];
    const songChain = usePatternStore.getState().songChain;
    const data = exportV2(pid, patternObj, songChain);
    downloadFile(JSON.stringify(data, null, 2), 'mpc-sequence.seq');
  };

  const openImport = (kind: 'prgm' | 'seq') => {
    importKindRef.current = kind;
    fileInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (importKindRef.current === 'prgm') {
          const loadedSwing: Record<string, number> = {};
          const loadedTune: Record<string, number> = {};
          const loadedChoke: Record<string, number> = {};
          const loadedLevel: Record<string, number> = {};
          const loadedFilter: Record<string, number> = {};
          const loadedSendReverb: Record<string, number> = {};
          const loadedSendDelay: Record<string, number> = {};
          const loadedVoices: Record<string, number> = {};
          const loadedMode: Record<string, PadPlayMode> = {};
          // v4: programs are per-bank arrays of layerId (older v3 files had flat `pads`)
          if (data.programs && typeof data.programs === 'object') {
            for (const bank of BANK_IDS) {
              if (Array.isArray(data.programs[bank])) {
                setBankProgram(bank, data.programs[bank].filter((id: any) => typeof id === 'string'));
              }
            }
          } else if (Array.isArray(data.pads)) {
            (data.pads as any[]).forEach((pd: any, idx: number) => {
              const layer = layers.find((l) => l.id === pd.layerId || l.name === pd.name);
              if (layer) setProgramSlot(idx, layer.id);
            });
          }
          // per-layer swing/tune/choke
          for (const [id, v] of Object.entries(data.swing || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedSwing[id] = v;
          }
          for (const [id, v] of Object.entries(data.tune || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedTune[id] = v;
          }
          for (const [id, v] of Object.entries(data.choke || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedChoke[id] = v;
          }
          for (const [id, v] of Object.entries(data.level || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedLevel[id] = Math.max(0, Math.min(1.5, v));
          }
          for (const [id, v] of Object.entries(data.filter || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedFilter[id] = Math.max(200, Math.min(20000, v));
          }
          for (const [id, v] of Object.entries(data.sendReverb || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedSendReverb[id] = Math.max(0, Math.min(1, v));
          }
          for (const [id, v] of Object.entries(data.sendDelay || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedSendDelay[id] = Math.max(0, Math.min(1, v));
          }
          for (const [id, v] of Object.entries(data.voices || {})) {
            if (layers.some((l) => l.id === id) && typeof v === 'number') loadedVoices[id] = Math.max(0, Math.min(16, v));
          }
          for (const [id, v] of Object.entries(data.mode || {})) {
            if (layers.some((l) => l.id === id) && (v === 'oneshot' || v === 'gate' || v === 'toggle')) loadedMode[id] = v;
          }
          setPadSwing(loadedSwing);
          setPadTune(loadedTune);
          setPadChoke(loadedChoke);
          setPadLevel(loadedLevel);
          setPadFilter(loadedFilter);
          setPadSendReverb(loadedSendReverb);
          setPadSendDelay(loadedSendDelay);
          setPadVoices(loadedVoices);
          setPadMode(loadedMode);
          setSelectedPad(0);
          if (typeof data.globalSwing === 'number') setGlobalSwing(data.globalSwing);
          if (typeof data.sixteenLevels === 'boolean') setSixteenLevels(data.sixteenLevels);
          if (data.sixteenLevelsMode === 'velocity' || data.sixteenLevelsMode === 'tune') setSixteenLevelsMode(data.sixteenLevelsMode);
          if (typeof data.timeCorrect === 'number') setTimeCorrect(data.timeCorrect);
        } else if (importKindRef.current === 'seq') {
          try {
            const v2 = importExport(data);
            loadFromExport(v2);
            if (typeof v2.bpm === 'number') setBpm(v2.bpm);
          } catch {
            console.warn('Unrecognized sequence export format');
          }
        }
      } catch (err) {
        console.warn('MPC file import notice:', err);
      }
    };
    reader.onerror = () => {
      console.warn('MPC file read failed');
    };
    reader.readAsText(file);
  };

  // Mic / instrument audio recording via getUserMedia + MediaRecorder.
  const onRecordAudio = async () => {
    if (isRecordingAudio) {
      if (!audioCaptureRef.current) return;
      try {
        const blob = await audioCaptureRef.current.stop();
        const ctx = audioEngine.getContext();
        if (!ctx) throw new Error('AudioContext unavailable');
        const buffer = await audioCaptureRef.current.decodeBlobToBuffer(blob, ctx);
        setLastRecordedBuffer(buffer);
        if (onAddLayer) onAddLayer(buffer, 'Mic Take');
      } catch (e) {
        console.warn('Audio recording stop failed', e);
      }
      setIsRecordingAudio(false);
    } else {
      if (!audioCaptureRef.current) audioCaptureRef.current = createAudioCapture();
      try {
        await audioCaptureRef.current.start();
        setIsRecordingAudio(true);
      } catch (e) {
        console.warn('Mic permission denied or unsupported', e);
      }
    }
  };

  // Auto-slice the last recorded take across N pads.
  const onSlice = (buffer: AudioBuffer, n: number) => {
    const slices = sliceBufferIntoPads(buffer, n);
    if (onAddSlicedLayers) onAddSlicedLayers(slices);
    setLastRecordedBuffer(null);
  };

  const mixdownState = useState(false);
  const [isMixingDown] = mixdownState;
  const onMixdown = async () => {
    mixdownState[1](true);
    try {
      const patterns = usePatternStore.getState().patterns;
      const songChain = usePatternStore.getState().songChain;
      const buffer = await renderMixdown({ patterns, chain: songChain, layers });
      const { audioBufferToWav } = await import('../lib/audioUtils');
      const wav = audioBufferToWav(buffer);
      const url = URL.createObjectURL(wav);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mixdown-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Mixdown failed', e);
    } finally {
      mixdownState[1](false);
    }
  };

  // Live chord label for the notes currently held on the piano (tonal)
  const chordLabel = useCallback(() => {
    const pcs = activeNotes
      .map((n) => Note.fromMidi(n).replace(/\d/g, ''))
      .filter((n) => n && n !== '');
    if (pcs.length === 0) return '';
    const detected = Chord.detect(pcs);
    return detected[0] || pcs.join(' ');
  }, [activeNotes]);

  const trackCount = layers.filter((l) => l.enabled).length;
  const activeRowLayer = layers.find((l) => l.id === activeRowId) ?? null;

  // Voice a generated progression into the active pattern row. `TheoryChord`
  // durations are in BEATS (a bar = 4 beats); a pattern step is a 16th, so a
  // chord occupies `duration * 4` steps. Each chord is written as a real
  // voice-led chord (`notes`), not a bare root, so the DAW plays what the
  // theory engine generates. Chords that overflow the pattern are dropped
  // (the step grid is 1-2 bars — generate a shorter progression to fill it).
  const applyProgressionToPattern = useCallback((chords: TheoryChord[]) => {
    const rowId = activeRowRef.current;
    if (!rowId) return;
    const store = usePatternStore.getState();
    const pid = store.activePatternId;
    const p = store.patterns[pid];
    const stepLength = p.stepLength;
    const row = (p.layerRows[rowId] ?? Array.from({ length: stepLength }, () => ({ on: false }))).slice();
    const voicings = voiceChords(chords.map((c) => ({ root: c.root, type: c.type })), 4);
    let step = 0;
    chords.forEach((ch, i) => {
      if (step >= stepLength) return;
      const steps = Math.max(1, Math.round(ch.duration * 4)); // beats -> 16th steps
      const dur = Math.max(1, Math.min(steps, stepLength - step));
      const voicing = voicings[i];
      const notes = voicing && voicing.notes.length > 0 ? voicing.notes : [60 + pitchClassOf(ch.root)];
      row[step] = { on: true, notes, velocity: 100, duration: dur };
      step += steps;
    });
    store.setRow(pid, rowId, row);
  }, []);

  const humanizePattern = useCallback(() => {
    const state = usePatternStore.getState();
    const p = state.patterns[state.activePatternId];
    usePatternStore.setState({ patterns: { ...state.patterns, [state.activePatternId]: humanizeVelocities(p, 0.2) } });
  }, []);

  const applyGrooveTemplate = useCallback((tpl: GrooveTemplate) => {
    const state = usePatternStore.getState();
    const p = state.patterns[state.activePatternId];
    usePatternStore.setState({ patterns: { ...state.patterns, [state.activePatternId]: applyGroove(p, tpl) } });
  }, []);

  // ---------------------------------------------------------------------------
  // Phase 8 — sequencer bridge. The controller engine lives at App level
  // (ControllerHost) so MIDI survives tab switches; it drives Beat Studio
  // through this bridge while mounted. Re-registered every render so the
  // closures stay fresh; cleared on unmount.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setSequencerBridge({
      getPadTune: () => padTune,
      getPadChoke: () => padChoke,
      triggerLayer: triggerLayerWithSemitone,
      playNote: (midi, v) => playMidiNote(midi, v),
      stopNote: (midi) => stopMidiNote(midi),
      getIsPlaying: () => isPlaying,
      togglePlay,
      toggleRecord: () => setIsRecording((r) => !r),
      tapTempo,
      setSwing: (v) => setGlobalSwing(Math.max(0, Math.min(75, Math.round(v)))),
      getSelectedPad: () => selectedPad,
      clearPad,
      assignPad: assignActiveLayerToPad,
      clearPattern,
      quantizePattern,
      humanizePattern,
      applyGroove: applyGrooveTemplate,
      applyProgressionToPattern,
    });
    return () => {
      clearSequencerBridge();
    };
  });

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" data-beat-studio>
      {/* ── DAW TRANSPORT (single, sticky) ── */}
      <div className="sticky top-0 z-30 bg-[#0b0b0d]/95 backdrop-blur border-b border-[#1e293b] px-3 pt-3 pb-2 space-y-2">
        <TransportBar
          bpm={bpm}
          isPlaying={isPlaying}
          useTransportMode={useTransportMode}
          timeSignature={patternTimeSignature}
          stepLength={patternStepLength}
          songModeActive={songModeActive}
          isRecordingAudio={isRecordingAudio}
          isMixingDown={isMixingDown}
          onBpmChange={setBpm}
          onPlayStop={togglePlay}
          onUseTransportModeChange={setUseTransportMode}
          onTimeSignatureChange={setTimeSignature}
          onStepLengthChange={setStepLength}
          onSongModeToggle={() => setSongModeActive((v) => !v)}
          onRecordAudio={onRecordAudio}
          onMixdown={onMixdown}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={tapTempo} title="Tap to set tempo" className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-blue-400 hover:text-white transition-all">Tap Tempo</button>
            <button
              type="button"
              onClick={() => setIsRecording((r) => !r)}
              title="Step-record pad/piano hits into the active pattern"
              className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
                isRecording ? 'bg-red-600 text-white border-red-400' : 'bg-[#121215] border-[#1e293b] text-slate-300 hover:text-red-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-red-500'}`} />
              {isRecording ? 'Recording' : 'Record'}
            </button>
            <label className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-slate-300 flex items-center gap-1.5" title="Count-in before the transport rolls when step-record is armed (MPC-style)">
              Count-in
              <select
                value={countInBeats}
                onChange={(e) => setCountInBeats(parseInt(e.target.value))}
                className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
                aria-label="Count-in beats"
              >
                <option value={0}>Off</option>
                <option value={1}>1 beat</option>
                <option value={2}>2 beats</option>
                <option value={4}>1 bar</option>
              </select>
            </label>
            <button type="button" onClick={clearPattern} className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white transition-all">Clear Pattern</button>
            <button type="button" onClick={() => openImport('prgm')} title="Load an MPC program (.prgm)" className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-blue-400 hover:text-white transition-all flex items-center gap-1"><FolderOpen size={11} /> Load Pgm</button>
            <button type="button" onClick={() => openImport('seq')} title="Load an MPC sequence (.seq)" className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-blue-400 hover:text-white transition-all flex items-center gap-1"><FolderOpen size={11} /> Load Seq</button>
            <button type="button" onClick={exportProgram} title="Export MPC program (.prgm)" className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-emerald-400 hover:text-white transition-all flex items-center gap-1"><Save size={11} /> Save Pgm</button>
            <button type="button" onClick={exportSequence} title="Export MPC sequence (.seq)" className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-emerald-400 hover:text-white transition-all flex items-center gap-1"><Save size={11} /> Save Seq</button>
            <span className="mx-1 h-5 w-px bg-[#1e293b]" />
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              aria-label="Preset name"
              className="w-24 px-2 py-1.5 rounded-lg text-[9px] font-mono bg-[#121215] border border-[#1e293b] text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <button type="button" onClick={() => void saveCurrentAsPreset()} title="Save the current pad program as a named preset" className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-purple-400 hover:text-white transition-all">Save Preset</button>
            <select
              value={presetId}
              onChange={(e) => { setPresetId(e.target.value); if (e.target.value) void loadPreset(e.target.value); }}
              aria-label="Load pad preset"
              className="px-2 py-1.5 rounded-lg text-[9px] font-mono bg-[#121215] border border-[#1e293b] text-slate-300 focus:outline-none cursor-pointer max-w-[130px]"
            >
              <option value="">Presets…</option>
              {padPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" onClick={() => { if (presetId) { void deletePreset(presetId); setPresetId(''); } }} disabled={!presetId} title="Delete the selected preset" className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-red-400 transition-all disabled:opacity-30">Del</button>
            <input ref={fileInputRef} type="file" accept=".prgm,.seq,.json,application/json" className="hidden" onChange={handleImportFile} />
          </div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {isCountingIn ? 'Count-in… · ' : ''}{presetStatus ? `${presetStatus} · ` : ''}{trackCount} tracks · step {String(currentStep + 1).padStart(2, '0')}/16
            </span>
        </div>
      </div>

      {/* ── WORKSPACE: arrangement/pattern + controller rail ── */}
      <div className="p-3 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-3 items-start">
        {/* Arrangement + pattern (main pane) */}
        <div className="space-y-3 min-w-0">
          {songModeActive && (
            <SongModePanel
              onPlayFromSlot={() => {
                // SongModePanel has already made the clicked slot the active
                // pattern; start the transport from it.
                if (!isPlaying) {
                  setUseTransportMode(true);
                  setSongModeActive(true);
                  togglePlay();
                }
              }}
            />
          )}
          <ArrangementPanel />
      {/* Phase 5.4 — loop recording + takes browser (count-in, metronome, punch-in/out) */}
      <TakesRecorder
        bpm={bpm}
        // One sequencer loop = stepLength 16th-notes = stepLength/4 beats.
        // (The old inline `((stepLength/4)*4)*(60/bpm)` evaluated to stepLength
        // beats — 16 beats = 4 bars for a 16-step pattern — so every recorded
        // take was 4x the pattern loop and never aligned.)
        loopLengthSec={patternLoopLengthSec(patternStepLength, bpm)}
        onAddLayer={(buffer, name) => onAddLayer ? (onAddLayer(buffer, name) ?? undefined) : undefined}
        onSlice={(buffer, n) => onSlice(buffer, n)}
      />
      {/* Phase 6.4 — tempo-matched audio clip launcher (offline render, launch quantize) */}
      <ClipLauncher bpm={bpm} stepLength={patternStepLength} />
      {/* Phase 6.1 + 6.2 — performance controls (QWERTY pads, scale lock, chord mode, splits) */}
      <PerformanceControls
        padSlots={programs[activeBank]}
        layers={layers}
        onTriggerPad={(index, velocity) => {
          const layerId = programs[activeBank][index];
          if (!layerId) return;
          const semitones = padTune[layerId] || 0;
          const choke = padChoke[layerId] || 0;
          triggerLayerWithSemitone(layerId, semitones, velocity ?? 1, choke > 0 ? `choke:${choke}` : undefined);
        }}
        onPlayNote={(midi, velocity) => playMidiNote(midi, velocity ?? 1)}
        onStopNote={(midi) => stopMidiNote(midi)}
      />
      {/* Phase 6.5 — theory assistant (progression + voicings from the engine) */}
      <TheoryPanel
        onPlayNote={(midi, velocity) => playMidiNote(midi, velocity ?? 1)}
        onStopNote={(midi) => stopMidiNote(midi)}
        onSendToPads={(roots) => {
          // Real assignment: build one synth layer per chord root (cloned from
          // the active layer, tuned to that root) and place them on pads
          // 0..N-1 of the active bank. Falls back to a root preview if the host
          // doesn't provide `onAddSynthLayer`.
          const rowId = activeRowRef.current;
          const source = layers.find((l) => l.id === rowId) ?? layers.find((l) => l.type === 'synth');
          if (!source) return;
          const pcOf: Record<string, number> = {
            C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
          };
          if (!onAddSynthLayer) {
            // Preview fallback: sound each root briefly so the button still does
            // something useful in hosts without layer creation.
            roots.forEach((root) => {
              audioEngine.triggerLayer(source, 0.5, undefined, undefined, {
                note: 60 + (pcOf[root] ?? 0),
                respectDuration: true,
              });
            });
            return;
          }
          roots.slice(0, 16).forEach((root, i) => {
            const id = onAddSynthLayer(source, `${root} Pad`, pcOf[root] ?? 0);
            if (id) setProgramSlot(i, id);
          });
        }}
        onApplyToPattern={(chords) => {
          applyProgressionToPattern(chords);
        }}
      />

      {!isRecordingAudio && lastRecordedBuffer && (
        <div className="flex gap-2 mt-2 text-sm">
          <span className="text-white/70 self-center">Slice take:</span>
          <button
            type="button"
            onClick={() => onSlice(lastRecordedBuffer, 16)}
            className="px-3 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white"
          >
            Slice 16
          </button>
          <button
            type="button"
            onClick={() => onSlice(lastRecordedBuffer, 32)}
            className="px-3 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white"
          >
            Slice 32
          </button>
          <button
            type="button"
            onClick={() => setLastRecordedBuffer(null)}
            className="px-3 py-1 rounded bg-white/10 text-white/70"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* The second transport bar was merged into the sticky DAW transport above. */}

      {/* Step sequencer grid / piano roll */}
      <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl overflow-hidden">
        <div className="border-b border-[#1e293b] bg-black px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {(['grid', 'piano'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                  view === v ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300' : 'bg-[#121215] border border-[#1e293b] text-slate-500 hover:text-white'
                }`}
              >
                {v === 'grid' ? 'Step Grid' : 'Piano Roll'}
              </button>
            ))}
          </div>
          <span className="text-[9px] font-mono text-slate-500">{view === 'grid' ? 'Click a row to make it the active track' : 'Click cells to add notes to the active track'}</span>
        </div>
        {/* Phase 1.3 — pattern editing toolbar */}
        <div className="flex items-center gap-1 px-2.5 pb-2 flex-wrap" role="toolbar" aria-label="Pattern editing">
          <button
            type="button"
            onClick={() => duplicatePatternInto()}
            title="Duplicate active pattern into next slot (A→B→C→D→A)"
            className="px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] rounded text-slate-200 hover:text-yellow-400 transition-colors"
          >
            Duplicate Pattern
          </button>
          <button
            type="button"
            onClick={() => {
              const pid = usePatternStore.getState().activePatternId;
              usePatternStore.getState().copyCells(pid, activeRowId ?? undefined);
            }}
            disabled={!activeRowId && Object.keys(usePatternStore.getState().patterns[usePatternStore.getState().activePatternId].layerRows).length === 0}
            title="Copy cells of the active row to the clipboard"
            className="px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] rounded text-slate-200 hover:text-yellow-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Copy Row
          </button>
          <button
            type="button"
            onClick={() => {
              const pid = usePatternStore.getState().activePatternId;
              usePatternStore.getState().pasteCells(pid, activeRowId ?? undefined);
            }}
            disabled={usePatternStore.getState().clipboard === null}
            title="Paste clipboard cells into the active row"
            className="px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] rounded text-slate-200 hover:text-yellow-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Paste Row
          </button>
          <button
            type="button"
            onClick={clearPattern}
            title="Clear all cells in the active pattern"
            className="px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-red-950/30 hover:bg-red-900/50 border border-red-900/40 rounded text-red-300 hover:text-red-200 transition-colors"
          >
            Clear Pattern
          </button>
          {/* Phase 1.4 — groove + humanize controls */}
          <select
            aria-label="Apply groove template"
            title="Apply groove template (MPC swing, boom bap, funk, ...)"
            defaultValue="straight"
            onChange={(e) => {
              const tpl = findGrooveTemplate(e.target.value);
              if (!tpl) return;
              const state = usePatternStore.getState();
              const p = state.patterns[state.activePatternId];
              const next = applyGroove(p, tpl);
              usePatternStore.setState({
                patterns: { ...state.patterns, [state.activePatternId]: next },
              });
              e.target.value = 'straight'; // reset selector
            }}
            className="px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] border border-[#1e293b] rounded text-slate-200 hover:border-yellow-400 transition-colors"
          >
            {GROOVE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const state = usePatternStore.getState();
              const p = state.patterns[state.activePatternId];
              const next = humanizeVelocities(p, 0.2);
              usePatternStore.setState({
                patterns: { ...state.patterns, [state.activePatternId]: next },
              });
            }}
            title="Randomize velocities ±20% across all cells"
            className="px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] rounded text-slate-200 hover:text-yellow-400 transition-colors"
          >
            Humanize
          </button>
          <button
            type="button"
            onClick={() => {
              const state = usePatternStore.getState();
              const p = state.patterns[state.activePatternId];
              const next = clearGrooveOffsets(p);
              usePatternStore.setState({
                patterns: { ...state.patterns, [state.activePatternId]: next },
              });
            }}
            title="Remove groove offsets from all cells"
            className="px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] rounded text-slate-200 hover:text-yellow-400 transition-colors"
          >
            Reset Swing
          </button>
        </div>
        {view === 'grid' ? (
        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[620px] p-2.5 space-y-1">
            {/* Step headers */}
            <div className="flex items-center gap-1 pl-24">
              {Array.from({ length: patternStepLength }, (_, i) => (
                <div
                  key={i}
                  className={`flex-1 text-center text-[8px] font-mono font-bold py-0.5 rounded ${
                    i === currentStep ? 'text-yellow-400' : 'text-slate-600'
                  }`}
                >
                  {i % 4 === 0 ? String(i / 4 + 1) : ''}
                </div>
              ))}
            </div>

            {layers.filter((l) => l.enabled).map((layer) => {
              const row = pattern[layer.id] || Array.from({ length: patternStepLength }, () => ({ on: false }));
              const isActive = activeRowId === layer.id;
              return (
                <div key={layer.id} className="flex items-center gap-1">
                  <button
                    onClick={() => onSelectLayer(layer.id)}
                    className={`w-24 shrink-0 text-left px-2 py-1.5 rounded-md border transition-all truncate ${
                      isActive
                        ? 'bg-[#0f172a] border-yellow-400/70 text-white'
                        : 'bg-black border-[#1e293b] text-slate-400 hover:text-white'
                    }`}
                    title={`${layer.name} — click to make active`}
                  >
                    <span className="text-[8px] font-black uppercase tracking-wider truncate block">{layer.name}</span>
                    <span className="text-[8px] font-mono text-slate-500">{layer.type === 'synth' ? 'SYNTH' : 'SAMPLE'}</span>
                  </button>
                  <div className="flex flex-1 gap-1">
                    {row.map((cell, i) => {
                      const isBeat = i % 4 === 0;
                      const lit = cell.on && i === currentStep;
                      return (
                        <button
                          key={i}
                          onClick={() => toggleCell(layer.id, i)}
                          className={`flex-1 h-7 rounded border transition-all ${
                            cell.on
                              ? lit
                                ? 'bg-yellow-400 border-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                                : cell.note !== undefined
                                  ? 'bg-sky-500/70 border-sky-400'
                                  : isActive
                                    ? 'bg-blue-500/70 border-blue-400'
                                    : 'bg-emerald-500/70 border-emerald-400'
                              : isBeat
                                ? 'bg-[#121215] border-[#2a2a30] hover:border-blue-500'
                                : 'bg-[#0a0a0c] border-[#1a1a20] hover:border-slate-600'
                          }`}
                          title={cell.note !== undefined ? `Note ${Note.fromMidi(cell.note)}` : 'Trigger'}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        ) : (
          <div className="p-2.5">
            <PianoRoll
              layers={layers}
              pattern={pattern}
              currentStep={currentStep}
              activeLayerId={activeRowId}
              onToggleNote={toggleNote}
              stepLength={patternStepLength}
            />
          </div>
        )}
      </div>

      {/* Phase 5.1 — Sample Browser + MPC drum pads (side-by-side) */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
        <div className="md:h-[420px]">
          <SampleBrowser
            onUseSample={(sample, buffer) => {
              if (!onAddLayer) return;
              markLibraryUsed(sample.id);
              const newId = onAddLayer(buffer, sample.name);
              if (newId && onSelectLayer) onSelectLayer(newId);
            }}
            usedSampleIds={usedLibraryIds}
          />
        </div>
        <MpcPadBank
          entries={entries}
          activeBank={activeBank}
          onBankChange={handleBankChange}
          selectedPad={selectedPad}
          onSelectPad={(pad) => {
            setSelectedPad(pad);
            const entry = entries[pad];
            if (entry && onSelectLayer) onSelectLayer(entry.layerId);
          }}
          focusedLayerId={selectedLayerId}
        padSwing={padSwing}
        padPocket={padPocket}
        padTune={padTune}
        padLevel={padLevel}
        padFilter={padFilter}
        padSendReverb={padSendReverb}
        padSendDelay={padSendDelay}
        padVoices={padVoices}
        padMode={padMode}
          padChoke={padChoke}
          padMuted={padMuted}
          bpm={bpm}
          noteRepeat={noteRepeat}
          sixteenLevels={sixteenLevels}
          sixteenLevelsMode={sixteenLevelsMode}
          globalSwing={globalSwing}
          fullLevel={fullLevel}
          velocityCurve={velocityCurve}
          timeCorrect={timeCorrect}
          onSetSwing={setSwing}
          onSetPocket={setPocket}
          onSetTune={setTune}
          onSetLevel={setLevel}
          onSetFilter={setFilter}
          onSetSendReverb={setSendReverb}
          onSetSendDelay={setSendDelay}
          onSetVoices={setVoices}
          onSetMode={setPadPlayMode}
          onPadRelease={releasePad}
          onSetChoke={setChoke}
          onTogglePadMute={togglePadMute}
          onClearPad={clearPad}
          onAssignActiveLayer={assignActiveLayerToPad}
          onCopyPad={copyPad}
          onSwapPads={swapPads}
          onSetGlobalSwing={setGlobalSwing}
          onTriggerPad={(layerId, semitones, velocity, when) => {
            const choke = padChoke[layerId] || 0;
            triggerLayerWithSemitone(layerId, semitones, velocity ?? 1, choke > 0 ? `choke:${choke}` : undefined, when);
          }}
          getAudioTime={() => {
            const ctx = audioEngine.getContext();
            return ctx ? ctx.currentTime : performance.now() / 1000;
          }}
          onPadInput={(layerId, velocity) => recordPadHit(layerId, velocity)}
          onNoteRepeatChange={setNoteRepeat}
          onSixteenLevelsChange={setSixteenLevels}
          onSixteenLevelsModeChange={setSixteenLevelsMode}
          onFullLevelChange={setFullLevel}
          onVelocityCurveChange={setVelocityCurve}
          onSetTimeCorrect={setTimeCorrect}
          onQuantize={quantizePattern}
          onPadDrop={async (sampleId, padIndex) => {
            if (!onAddLayer) return;
            try {
              const ctx = audioEngine.getContext();
              if (!ctx) return;
              const row = await fetchLibrarySample(sampleId);
              if (!row) return;
              const buffer = await decodeLibrarySample(ctx, row);
              const newId = onAddLayer(buffer, row.name);
              if (newId) {
                markLibraryUsed(sampleId);
                setProgramSlot(padIndex, newId);
                if (onSelectLayer) onSelectLayer(newId);
              }
            } catch (err) {
              console.warn('Failed to assign library sample to pad', err);
            }
          }}
        />
      </div>

      {/* Piano keyboard + chord readout */}
      <div className="bg-[#0f0f12] border border-[#1e293b] rounded-2xl overflow-hidden">
        <div className="border-b border-[#1e293b] bg-black px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest text-white">
            Piano & Record
            <span className="ml-2 font-mono text-slate-500 normal-case tracking-normal">
              plays the active track · HOME ROW keys (A S D F G H J K L)
            </span>
          </span>
          <span className="text-[10px] font-mono font-bold text-yellow-400">
            {chordLabel() || 'No notes held'}
          </span>
          {activeRowLayer?.type === 'synth' && (
            <button
              type="button"
              onClick={() => void autoSampleActiveSynth()}
              disabled={isAutoSampling}
              title="Render this synth at 16 pitches (C2–D#3) into one-shot layers on Program B"
              className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-fuchsia-400 hover:text-white transition-all disabled:opacity-40"
            >
              {isAutoSampling ? 'Sampling…' : 'Auto-sample → Pads'}
            </button>
          )}
        </div>
        <div className="p-4 bg-black/40">
          <Piano
            noteRange={{ first: FIRST_NOTE, last: LAST_NOTE }}
            playNote={playMidiNote}
            stopNote={stopMidiNote}
            onPlayNoteInput={handlePlayNoteInput}
            activeNotes={activeNotes}
            width={900}
            keyboardShortcuts={keyboardShortcuts}
          />
          {!selectedLayerId && (
            <p className="text-[10px] text-slate-500 font-mono mt-2">
              Select a synth layer (in Sound Lab) to play its notes on the piano.
            </p>
          )}
        </div>
      </div>

        </div>{/* /main pane */}

        {/* ── CONTROLLER RAIL (right, sticky) ── */}
        <aside
          className="space-y-3 min-w-0 xl:sticky xl:top-[100px] xl:max-h-[calc(100vh-118px)] xl:overflow-y-auto custom-scrollbar xl:pr-1"
          data-controller-rail
        >
          <RecourseComposerPanel onApplyProgression={applyProgressionToPattern} />
        </aside>
      </div>{/* /workspace grid */}
    </div>
  );
}
