/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.1 + 6.2 — Performance controls.
 *
 * QWERTY pad key-mapping (6.1), keyboard splits, scale lock, and chord mode
 * (6.2). Pure-ish component: receives the current pad program, layers, and
 * trigger callbacks from the parent, and wires window keydown/keyup to them.
 * The music-theory logic (snapToScale, chordFromRoot, resolveSplit) lives in
 * `lib/musicTheory.ts` on the Session Musician engine — this component only
 * connects keys → triggers.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Keyboard, Lock, Unlock, ChevronDown } from 'lucide-react';
import { resolvePadKey, DEFAULT_PAD_KEYS } from '../lib/padKeyMap';
import {
  snapToScale,
  chordFromRoot,
  DEFAULT_SCALE_LOCK,
  DEFAULT_CHORD_MODE,
  DEFAULT_SPLIT,
  SCALE_PRESETS,
  type ScaleLockSettings,
  type ChordModeSettings,
  type KeyboardSplitSettings,
} from '../lib/musicTheory';
import type { SoundLayer } from '../types';

interface PerformanceControlsProps {
  /** Active bank's 16 pad slots (layerId or null). */
  padSlots: (string | null)[];
  layers: SoundLayer[];
  /** Trigger a pad layer by index (with 0..1 velocity + semitone). */
  onTriggerPad: (index: number, velocity?: number, semitones?: number) => void;
  /** Play a melodic note (MIDI) through the active/split layer. */
  onPlayNote: (midi: number, velocity?: number) => void;
  onStopNote: (midi: number) => void;
}

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const CHORD_QUALITIES = ['maj7', 'min7', '7', 'maj', 'm', '9', 'm9', 'sus4'];

export const PerformanceControls: React.FC<PerformanceControlsProps> = ({
  padSlots,
  layers,
  onTriggerPad,
  onPlayNote,
  onStopNote,
}) => {
  const [enabled, setEnabled] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [scaleLock, setScaleLock] = useState<ScaleLockSettings>(DEFAULT_SCALE_LOCK);
  const [chordMode, setChordMode] = useState<ChordModeSettings>(DEFAULT_CHORD_MODE);
  const [split, setSplit] = useState<KeyboardSplitSettings>(DEFAULT_SPLIT);

  const scaleLockRef = useRef(scaleLock);
  const chordModeRef = useRef(chordMode);
  const splitRef = useRef(split);
  const enabledRef = useRef(enabled);
  const padSlotsRef = useRef(padSlots);
  const heldRef = useRef<Set<number>>(new Set());

  scaleLockRef.current = scaleLock;
  chordModeRef.current = chordMode;
  splitRef.current = split;
  enabledRef.current = enabled;
  padSlotsRef.current = padSlots;

  const keyDown = useCallback((e: KeyboardEvent) => {
    if (!enabledRef.current) return;
    // Ignore when typing in fields.
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const pad = resolvePadKey(e.key, DEFAULT_PAD_KEYS, e.shiftKey);
    if (pad.consumed && pad.padIndex !== null) {
      const layerId = padSlotsRef.current[pad.padIndex];
      if (layerId) {
        e.preventDefault();
        onTriggerPad(pad.padIndex, pad.velocity);
      }
      return;
    }

    // Piano-row notes (react-piano already handles most; this is the fallback
    // for scale-lock + chord mode on the MIDI-driven path).
    const NOTE_KEYS: Record<string, number> = {
      a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
      y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76,
    };
    const raw = NOTE_KEYS[e.key.toLowerCase()];
    if (raw === undefined) return;

    // Scale lock (engine): snap the note into the locked scale.
    let midiNote = snapToScale(raw, scaleLockRef.current);

    // Chord mode (engine): a single press triggers a chord from the root.
    if (chordModeRef.current.enabled) {
      const tones = chordFromRoot(midiNote, scaleLockRef.current, chordModeRef.current.quality);
      tones.forEach((t) => {
        onPlayNote(t, pad.velocity);
        heldRef.current.add(t);
      });
    } else {
      onPlayNote(midiNote, pad.velocity);
      heldRef.current.add(midiNote);
    }
  }, [onPlayNote, onTriggerPad]);

  const keyUp = useCallback((e: KeyboardEvent) => {
    const NOTE_KEYS: Record<string, number> = {
      a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
      y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76,
    };
    const raw = NOTE_KEYS[e.key.toLowerCase()];
    if (raw === undefined) return;
    const midiNote = snapToScale(raw, scaleLockRef.current);
    if (chordModeRef.current.enabled) {
      const tones = chordFromRoot(midiNote, scaleLockRef.current, chordModeRef.current.quality);
      tones.forEach((t) => {
        if (heldRef.current.has(t)) onStopNote(t);
        heldRef.current.delete(t);
      });
    } else {
      if (heldRef.current.has(midiNote)) onStopNote(midiNote);
      heldRef.current.delete(midiNote);
    }
  }, [onStopNote]);

  useEffect(() => {
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [keyDown, keyUp]);

  const selectedLayerOptions = layers.map((l) => (
    <option key={l.id} value={l.id}>{l.name}</option>
  ));

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-2" data-performance-controls>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-purple-400 flex items-center gap-1.5">
          <Keyboard size={12} /> Performance
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
              enabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-[#121215] border-[#1e293b] text-slate-500'
            }`}
          >
            {enabled ? 'Keys On' : 'Keys Off'}
          </button>
          <button
            type="button"
            onClick={() => setShowPanel((v) => !v)}
            className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-[#1e293b] text-slate-300 hover:text-white flex items-center gap-1"
          >
            {showPanel ? 'Hide' : 'Setup'} <ChevronDown size={10} className={showPanel ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>

      {showPanel && (
        <div className="space-y-2 pt-1 border-t border-[#1e293b]">
          {/* Scale lock */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScaleLock((s) => ({ ...s, enabled: !s.enabled }))}
              className={`p-1 rounded border transition-all ${scaleLock.enabled ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'border-[#1e293b] text-slate-400 hover:text-white'}`}
              title={scaleLock.enabled ? 'Scale lock on' : 'Scale lock off'}
            >
              {scaleLock.enabled ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest w-16">Scale</span>
            <select
              value={scaleLock.root}
              onChange={(e) => setScaleLock((s) => ({ ...s, root: e.target.value }))}
              className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-[9px] text-white"
            >
              {ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={scaleLock.scaleName}
              onChange={(e) => setScaleLock((s) => ({ ...s, scaleName: e.target.value }))}
              className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-[9px] text-white"
            >
              {SCALE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Chord mode */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChordMode((c) => ({ ...c, enabled: !c.enabled }))}
              className={`p-1 rounded border transition-all ${chordMode.enabled ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300' : 'border-[#1e293b] text-slate-400 hover:text-white'}`}
              title={chordMode.enabled ? 'Chord mode on' : 'Chord mode off'}
            >
              <Music size={11} />
            </button>
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest w-16">Chord</span>
            <select
              value={chordMode.quality}
              onChange={(e) => setChordMode((c) => ({ ...c, quality: e.target.value }))}
              className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-[9px] text-white"
            >
              {CHORD_QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          {/* Keyboard split */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSplit((s) => ({ ...s, enabled: !s.enabled }))}
              className={`p-1 rounded border transition-all ${split.enabled ? 'bg-sky-500/20 border-sky-500/50 text-sky-300' : 'border-[#1e293b] text-slate-400 hover:text-white'}`}
              title={split.enabled ? 'Split on' : 'Split off'}
            >
              <Music size={11} />
            </button>
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest w-16">Split</span>
            <label className="flex items-center gap-1 text-[9px] text-slate-400">
              Lower
              <select value={split.lowerLayerId ?? ''} onChange={(e) => setSplit((s) => ({ ...s, lowerLayerId: e.target.value || null }))} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-[9px] text-white max-w-[90px]">
                <option value="">—</option>
                {selectedLayerOptions}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[9px] text-slate-400">
              Upper
              <select value={split.upperLayerId ?? ''} onChange={(e) => setSplit((s) => ({ ...s, upperLayerId: e.target.value || null }))} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-[9px] text-white max-w-[90px]">
                <option value="">—</option>
                {selectedLayerOptions}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[9px] text-slate-400">
              Split note
              <input type="number" min={0} max={127} value={split.splitNote} onChange={(e) => setSplit((s) => ({ ...s, splitNote: parseInt(e.target.value) || 60 }))} className="w-12 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-[9px] text-white" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceControls;
