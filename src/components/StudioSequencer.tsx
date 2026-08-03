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
import { Piano, KeyboardShortcuts, MidiNumbers } from 'react-piano';
import { Note, Chord } from 'tonal';
import { Play, Square, Save, FolderOpen } from 'lucide-react';
import 'react-piano/dist/styles.css';
import { SoundLayer } from '../types';
import { audioEngine } from '../lib/audioEngine';
import { SoundLayerPlayer } from '../audio/SoundLayerPlayer';
import { MpcPadBank, PadEntry } from './MpcPadBank';
import { PianoRoll } from './PianoRoll';
import { useSequencerStore, BANK_IDS, BankId } from '../store/sequencerStore';
import { usePatternStore } from '../store/patternStore';
import { exportV2, importExport } from '../sequencerFormat';
import { createAudioCapture, sliceBufferIntoPads } from '../audio/transport/audioCapture';
import { renderMixdown } from '../audio/transport/mixdown';

const STEPS = 16;
const PPQ = 96;

type StepCell = { on: boolean; note?: number };

interface StudioSequencerProps {
  layers: SoundLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer?: (id: string, updates: Partial<SoundLayer>) => void;
  onAddLayer?: (buffer: AudioBuffer, name?: string) => void;
  onAddSlicedLayers?: (buffers: AudioBuffer[]) => void;
}

const FIRST_NOTE = MidiNumbers.fromNote('c3');
const LAST_NOTE = MidiNumbers.fromNote('c5');

const keyboardShortcuts = KeyboardShortcuts.create({
  firstNote: FIRST_NOTE,
  lastNote: LAST_NOTE,
  keyboardConfig: KeyboardShortcuts.HOME_ROW,
});

export function StudioSequencer({ layers, selectedLayerId, onSelectLayer, onUpdateLayer, onAddLayer, onAddSlicedLayers }: StudioSequencerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeRowId, setActiveRowId] = useState<string | null>(selectedLayerId || layers[0]?.id || null);
  const [activeNotes, setActiveNotes] = useState<number[]>([]);

  // MPC pad state (programs + active bank live in the shared store so the
  // Sound Lab / Synth / Evolution / Chop sections can send sources to pads)
  const programs = useSequencerStore((s) => s.programs);
  const activeBank = useSequencerStore((s) => s.activeBank);
  const setBankProgram = useSequencerStore((s) => s.setBankProgram);
  const setActiveBank = useSequencerStore((s) => s.setActiveBank);
  const prunePrograms = useSequencerStore((s) => s.prunePrograms);

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
  const songChain = usePatternStore((s) => s.songChain.order);
  const setRow = usePatternStore((s) => s.setRow);
  const ensureLayerRow = usePatternStore((s) => s.ensureLayerRow);
  const storeSetBpm = usePatternStore((s) => s.setBpm);
  const loadFromExport = usePatternStore((s) => s.loadFromExport);
  const setActivePattern = usePatternStore((s) => s.setActivePattern);

  // BPM lives in patternStore; keep the local names the rest of this file
  // already uses (`bpm` / `setBpm`) pointing at the store so call sites
  // (tap tempo, transport sync, tick math) are unchanged.
  const bpm = patternBpm;
  const setBpm = storeSetBpm;

  const [padSwing, setPadSwing] = useState<Record<string, number>>({});
  const [padTune, setPadTune] = useState<Record<string, number>>({});
  const [padChoke, setPadChoke] = useState<Record<string, number>>({});
  const [padMuted, setPadMuted] = useState<Record<string, boolean>>({});
  const [selectedPad, setSelectedPad] = useState<number>(0);
  const [sixteenLevels, setSixteenLevels] = useState(false);
  const [globalSwing, setGlobalSwing] = useState(0);
  const [fullLevel, setFullLevel] = useState(false);
  const [velocityCurve, setVelocityCurve] = useState<'linear' | 'exponential' | 'log'>('linear');
  const [noteRepeat, setNoteRepeat] = useState({ active: false, division: 4 });
  const [timeCorrect, setTimeCorrect] = useState(1); // 1=1/16, 2=1/8, 4=1/4 record snap
  const [view, setView] = useState<'grid' | 'piano'>('grid');

  // Tone Transport mode (Phase 1). On by default after parity verification.
  // The setInterval path is retained as a fallback — the TransportBar checkbox
  // lets users switch back if Tone audio misbehaves in a given environment.
  const [useTransportMode, setUseTransportMode] = useState(true);
  const [songModeActive, setSongModeActive] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [lastRecordedBuffer, setLastRecordedBuffer] = useState<AudioBuffer | null>(null);
  const audioCaptureRef = useRef<ReturnType<typeof createAudioCapture> | null>(null);

  const playerRef = useRef<SoundLayerPlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const playingRef = useRef(false);
  const recordingRef = useRef(false);
  const activeRowRef = useRef<string | null>(null);
  const patternRef = useRef(pattern);
  const padSwingRef = useRef(padSwing);
  const padChokeRef = useRef(padChoke);
  const swingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const tickRef = useRef<() => void>(() => {});
  const timeCorrectRef = useRef(timeCorrect);
  const tapTimesRef = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importKindRef = useRef<'prgm' | 'seq'>('prgm');

  if (!playerRef.current) playerRef.current = new SoundLayerPlayer();

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { padSwingRef.current = padSwing; }, [padSwing]);
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
    setActiveRowId((prev) => {
      if (prev && ids.has(prev)) return prev;
      return layers.find((l) => l.enabled)?.id || null;
    });
    // Remove deleted layers from any pad program
    prunePrograms(ids);
  }, [layers, prunePrograms]);

  // On first open (all programs empty), auto-fill bank A from the enabled layers.
  useEffect(() => {
    const isEmpty = BANK_IDS.every((b) => programs[b].every((slot) => slot === null));
    if (isEmpty) {
      const first16 = layers.filter((l) => l.enabled).slice(0, 16).map((l) => l.id);
      if (first16.length) setBankProgram('A', first16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const triggerStep = useCallback((layerId: string, cell: StepCell) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || !isLayerAudible(layer)) return;
    if (cell.note !== undefined && playerRef.current) {
      playerRef.current.playNote(layer, cell.note, 0.5);
    } else {
      // Step-triggered layers honour MPC choke groups too, so open/closed
      // hi-hat style rows cut each other consistently with the pads.
      const choke = padChokeRef.current[layerId] || 0;
      audioEngine.triggerLayer(layer, undefined, choke > 0 ? `choke:${choke}` : undefined);
    }
  }, [layers, isLayerAudible]);

  const tick = useCallback(() => {
    const step = (stepRef.current + 1) % STEPS;
    stepRef.current = step;
    setCurrentStep(step);
    const p = patternRef.current;
    const stepMs = (60000 / bpm) / 4; // 16th-note duration
    for (const [layerId, cells] of Object.entries(p)) {
      const cell = cells[step];
      if (cell && cell.on) {
        // MPC per-pad swing: delay off-beat 16ths (odd steps) by the pad's swing %
        const swing = padSwingRef.current[layerId] || 0;
        const offBeat = step % 2 === 1;
        const delay = offBeat && swing > 0 ? (swing / 100) * stepMs : 0;
        if (delay > 0) {
          const t = setTimeout(() => {
            swingTimeoutsRef.current.delete(t);
            triggerStep(layerId, cell);
          }, delay);
          swingTimeoutsRef.current.add(t);
        } else {
          triggerStep(layerId, cell);
        }
      }
    }
  }, [triggerStep, bpm]);

  useEffect(() => { tickRef.current = tick; }, [tick]);
  const triggerStepRef = useRef<(layerId: string, cell: StepCell) => void>(() => {});
  useEffect(() => { triggerStepRef.current = triggerStep; }, [triggerStep]);

  const togglePlay = () => {
    if (isPlaying) {
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
      if (useTransportMode) {
        try {
          initTransport();
          getTransport().setBpm(bpm);
          getTransport().setSwing(globalSwing);
          getTransport().play();
          setIsPlaying(true);
          stepRef.current = -1;
          return;
        } catch (e) {
          console.warn('Transport start failed, falling back to setInterval', e);
        }
      }
      setIsPlaying(true);
      stepRef.current = -1;
      intervalRef.current = setInterval(() => tickRef.current(), (60000 / bpm) / 4);
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
    };
  }, []);

  // Tone Transport mode: when enabled, the per-step tick is driven by
  // Tone.Transport instead of setInterval. We re-use the existing tick()
  // function (via tickRef) so all per-step behavior (swing, mute, choke,
  // recording) is preserved.
  useEffect(() => {
    if (!useTransportMode) return;
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
        // Trigger the same per-step logic the setInterval path uses.
        // We do this off the audio thread by reading the pattern via the
        // ref. The transport's `time` is the Web Audio context time, but
        // since `tick()` is sample-accurate at bpm/4 anyway we just
        // invoke it immediately — the swing offsets already use setTimeout
        // for the late beats.
        const p = patternRef.current;
        const stepMs = (60000 / bpm) / 4;
        for (const [layerId, cells] of Object.entries(p)) {
          const cell = cells[stepIdx];
          if (cell && cell.on) {
            const swing = padSwingRef.current[layerId] || 0;
            const offBeat = stepIdx % 2 === 1;
            const delay = offBeat && swing > 0 ? (swing / 100) * stepMs : 0;
            if (delay > 0) {
              const to = setTimeout(() => {
                swingTimeoutsRef.current.delete(to);
                triggerStepRef.current(layerId, cell);
              }, delay);
              swingTimeoutsRef.current.add(to);
            } else {
              triggerStepRef.current(layerId, cell);
            }
          }
        }
        void time;
      }, [...Array(STEPS).keys()], '16n');
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
      if (isPlaying) {
        try { getTransport().stop(); } catch { /* ignore */ }
      }
    };
  }, [useTransportMode]); // intentionally narrow deps — bpm/swing reset is handled elsewhere

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
    try {
      initTransport();
      const t = getTransport();
      scheduledId = Tone.Transport.scheduleRepeat((time) => {
        if (cancelled) return;
        const chain = usePatternStore.getState().songChain.order;
        if (chain.length === 0) return;
        cursor = (cursor + 1) % chain.length;
        const next = chain[cursor];
        usePatternStore.getState().setActivePattern(next as 'A' | 'B' | 'C' | 'D');
        // Re-apply the new pattern's BPM to the transport at this bar.
        const np = usePatternStore.getState().patterns[next as 'A' | 'B' | 'C' | 'D'];
        if (np) getTransport().setBpm(np.bpm);
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

  const toggleCell = (layerId: string, idx: number) => {
    const row = pattern[layerId] || Array.from({ length: STEPS }, () => ({ on: false }));
    const next = row.map((c, i) => (i === idx ? { on: !c.on, note: c.note } : c));
    setRow(activePatternId, layerId, next);
  };

  // Piano-roll edit: set/clear a melodic note at (step, pitch) on a layer row.
  const toggleNote = useCallback((layerId: string, step: number, pitch: number) => {
    const row = usePatternStore.getState().patterns[usePatternStore.getState().activePatternId].layerRows[layerId]
      || Array.from({ length: STEPS }, () => ({ on: false }));
    const next = row.map((c, i) => {
      if (i !== step) return c;
      return c.on && c.note === pitch ? { on: false } : { on: true, note: pitch };
    });
    setRow(activePatternId, layerId, next);
  }, [activePatternId, setRow]);

  const recordNote = useCallback((midi: number) => {
    const rowId = activeRowRef.current;
    if (!rowId) return;
    const pid = usePatternStore.getState().activePatternId;
    // MPC Time Correct: snap the recorded step to the resolution grid
    const res = timeCorrectRef.current || 1;
    const rawStep = playingRef.current ? stepRef.current : 0;
    const step = Math.max(0, Math.min(STEPS - 1, Math.round(rawStep / res) * res));
    const row = usePatternStore.getState().patterns[pid].layerRows[rowId]
      || Array.from({ length: STEPS }, () => ({ on: false }));
    const next = row.map((c, i) => (i === step ? { on: true, note: midi } : c));
    setRow(pid, rowId, next);
  }, [setRow]);

  // Pad-to-step: real pad hits while REC + playing write a drum trigger into
  // the hit layer's row at the current step (Time Correct snapped).
  const recordPadHit = useCallback((layerId: string) => {
    if (!recordingRef.current || !playingRef.current) return;
    const pid = usePatternStore.getState().activePatternId;
    const res = timeCorrectRef.current || 1;
    const rawStep = stepRef.current;
    const step = Math.max(0, Math.min(STEPS - 1, Math.round(rawStep / res) * res));
    const row = usePatternStore.getState().patterns[pid].layerRows[layerId]
      || Array.from({ length: STEPS }, () => ({ on: false }));
    const next = row.map((c, i) => (i === step ? { on: true, note: undefined } : c));
    setRow(pid, layerId, next);
  }, [setRow]);

  // MPC Time Correct quantize: snap every active step to the resolution grid.
  const quantizePattern = useCallback(() => {
    const res = Math.max(1, timeCorrect || 1);
    const pid = usePatternStore.getState().activePatternId;
    const prev = usePatternStore.getState().patterns[pid].layerRows;
    const next: Record<string, StepCell[]> = {};
    for (const id of Object.keys(prev)) {
      const cells = prev[id];
      const snapped = new Map<number, StepCell>();
      cells.forEach((c, i) => {
        if (!c.on) return;
        const s = Math.min(STEPS - 1, Math.max(0, Math.round(i / res) * res));
        if (!snapped.has(s)) snapped.set(s, c);
      });
      const row: StepCell[] = Array.from({ length: STEPS }, () => ({ on: false }));
      snapped.forEach((c, i) => { row[i] = { on: true, note: c.note }; });
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

  const playMidiNote = useCallback((midi: number) => {
    const rowId = activeRowRef.current;
    const layer = layers.find((l) => l.id === rowId);
    if (!layer || !isLayerAudible(layer)) return;
    if (layer.type === 'synth' && playerRef.current) {
      playerRef.current.playNote(layer, midi, 0.6);
    } else {
      audioEngine.triggerLayer(layer);
    }
    setActiveNotes((prev) => (prev.includes(midi) ? prev : [...prev, midi]));
    if (recordingRef.current && playingRef.current) {
      recordNote(midi);
    }
  }, [layers, recordNote, isLayerAudible]);

  const stopMidiNote = useCallback((midi: number) => {
    setActiveNotes((prev) => prev.filter((n) => n !== midi));
  }, []);

  const handlePlayNoteInput = useCallback((midi: number) => {
    // Fires only on real user input (mouse/touch/QWERTY) — used for recording.
    if (recordingRef.current && playingRef.current) {
      recordNote(midi);
    }
  }, [recordNote]);

  const clearPattern = () => {
    const pid = usePatternStore.getState().activePatternId;
    for (const layer of layers) {
      setRow(pid, layer.id, Array.from({ length: STEPS }, () => ({ on: false })));
    }
  };

  // MPC pad trigger with per-pad tune / 16-levels semitone offset, velocity
  // (0..1), and choke group. Does not stop other layers unless they share a
  // choke group; respects the mixer's mute/solo state.
  const triggerLayerWithSemitone = useCallback((layerId: string, semitones: number, velocity = 1, chokeKey?: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || !isLayerAudible(layer)) return;
    const base: SoundLayer = {
      ...layer,
      gain: Math.max(0.02, (layer.gain || 1) * velocity),
    };
    const shifted: SoundLayer = semitones
      ? layer.type === 'synth'
        ? { ...base, synth: { ...base.synth, frequency: (base.synth?.frequency || 440) * Math.pow(2, semitones / 12) } }
        : { ...base, pitch: (base.pitch || 0) + semitones }
      : base;
    audioEngine.triggerLayer(shifted, undefined, chokeKey);
  }, [layers, isLayerAudible]);

  const setSwing = useCallback((layerId: string, swing: number) => {
    setPadSwing((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(75, swing)) }));
  }, []);

  const setTune = useCallback((layerId: string, tune: number) => {
    setPadTune((prev) => ({ ...prev, [layerId]: Math.max(-24, Math.min(24, tune)) }));
  }, []);

  const setChoke = useCallback((layerId: string, group: number) => {
    setPadChoke((prev) => ({ ...prev, [layerId]: Math.max(0, Math.min(4, group)) }));
  }, []);

  const togglePadMute = useCallback((layerId: string) => {
    if (!onUpdateLayer) return;
    const layer = layers.find((l) => l.id === layerId);
    onUpdateLayer(layerId, { muted: !(layer?.muted === true) });
  }, [layers, onUpdateLayer]);

  const handleBankChange = useCallback((bank: BankId) => {
    setActiveBank(bank);
    setSelectedPad(0);
  }, [setActiveBank]);

  // Active bank's 16 slots resolved to layer info (null = empty pad)
  const entries: (PadEntry | null)[] = programs[activeBank].map((layerId) => {
    if (!layerId) return null;
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || !layer.enabled) return null;
    return { layerId, name: layer.name, type: layer.type };
  });

  const setProgramSlot = useCallback((index: number, layerId: string | null) => {
    const prog = programs[activeBank].slice();
    prog[index] = layerId;
    setBankProgram(activeBank, prog);
  }, [programs, activeBank, setBankProgram]);

  const clearPad = useCallback((index: number) => {
    setProgramSlot(index, null);
  }, [setProgramSlot]);

  const assignActiveLayerToPad = useCallback((index: number) => {
    if (selectedLayerId && layers.some((l) => l.id === selectedLayerId)) {
      setProgramSlot(index, selectedLayerId);
    }
  }, [selectedLayerId, layers, setProgramSlot]);

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
      timeCorrect,
      programs,
      swing: padSwing,
      tune: padTune,
      choke: padChoke,
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
          setPadSwing(loadedSwing);
          setPadTune(loadedTune);
          setPadChoke(loadedChoke);
          setSelectedPad(0);
          if (typeof data.globalSwing === 'number') setGlobalSwing(data.globalSwing);
          if (typeof data.sixteenLevels === 'boolean') setSixteenLevels(data.sixteenLevels);
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

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-3">
      {/* Tone Transport bar (Phase 1, feature-flagged) */}
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
      {songModeActive && <SongModePanel onPlayFromSlot={() => { /* song starts from slot via transport */ }} />}
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
      {/* Transport bar */}
      <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              isPlaying
                ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black'
            }`}
          >
            {isPlaying ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {isPlaying ? 'Stop' : 'Play Pattern'}
          </button>
          <button
            onClick={() => setIsRecording((r) => !r)}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
              isRecording
                ? 'bg-red-600 text-white border-red-400 shadow-[0_0_14px_rgba(239,68,68,0.5)]'
                : 'bg-[#121215] border-[#1e293b] text-slate-300 hover:text-red-400'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-red-500'}`} />
            {isRecording ? 'Recording' : 'Record'}
          </button>
          <button
            onClick={clearPattern}
            className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white transition-all"
          >
            Clear Pattern
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => openImport('prgm')}
              className="px-2.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-blue-400 hover:text-white transition-all flex items-center gap-1"
              title="Load an MPC program (.prgm)"
            >
              <FolderOpen size={11} /> Load Pgm
            </button>
            <button
              onClick={() => openImport('seq')}
              className="px-2.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-blue-400 hover:text-white transition-all flex items-center gap-1"
              title="Load an MPC sequence (.seq)"
            >
              <FolderOpen size={11} /> Load Seq
            </button>
            <button
              onClick={exportProgram}
              className="px-2.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-emerald-400 hover:text-white transition-all flex items-center gap-1"
              title="Export MPC program (.prgm)"
            >
              <Save size={11} /> Save Pgm
            </button>
            <button
              onClick={exportSequence}
              className="px-2.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-emerald-400 hover:text-white transition-all flex items-center gap-1"
              title="Export MPC sequence (.seq)"
            >
              <Save size={11} /> Save Seq
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".prgm,.seq,.json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">BPM</span>
            <input
              type="range"
              min="60"
              max="200"
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value))}
              className="w-32 accent-blue-400 h-1.5 rounded-lg cursor-pointer"
              aria-label="Tempo (BPM)"
            />
            <span className="text-sm font-mono font-black text-yellow-400 w-10">{bpm}</span>
            <button
              onClick={tapTempo}
              className="px-2.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-blue-400 hover:text-white transition-all"
              title="Tap to set tempo"
            >
              Tap
            </button>
          </div>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            {trackCount} tracks · step {String(currentStep + 1).padStart(2, '0')}/16
          </span>
        </div>
      </div>

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
        {view === 'grid' ? (
        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[620px] p-2.5 space-y-1">
            {/* Step headers */}
            <div className="flex items-center gap-1 pl-24">
              {Array.from({ length: STEPS }, (_, i) => (
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
              const row = pattern[layer.id] || Array.from({ length: STEPS }, () => ({ on: false }));
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
            />
          </div>
        )}
      </div>

      {/* MPC drum pads — wired into the same pattern/transport */}
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
        padTune={padTune}
        padChoke={padChoke}
        padMuted={padMuted}
        bpm={bpm}
        noteRepeat={noteRepeat}
        sixteenLevels={sixteenLevels}
        globalSwing={globalSwing}
        fullLevel={fullLevel}
        velocityCurve={velocityCurve}
        timeCorrect={timeCorrect}
        onSetSwing={setSwing}
        onSetTune={setTune}
        onSetChoke={setChoke}
        onTogglePadMute={togglePadMute}
        onClearPad={clearPad}
        onAssignActiveLayer={assignActiveLayerToPad}
        onSetGlobalSwing={setGlobalSwing}
        onTriggerPad={(layerId, semitones, velocity) => {
          const choke = padChoke[layerId] || 0;
          triggerLayerWithSemitone(layerId, semitones, velocity || 1, choke > 0 ? `choke:${choke}` : undefined);
        }}
        onPadInput={(layerId) => recordPadHit(layerId)}
        onNoteRepeatChange={setNoteRepeat}
        onSixteenLevelsChange={setSixteenLevels}
        onFullLevelChange={setFullLevel}
        onVelocityCurveChange={setVelocityCurve}
        onSetTimeCorrect={setTimeCorrect}
        onQuantize={quantizePattern}
      />

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
    </div>
  );
}
