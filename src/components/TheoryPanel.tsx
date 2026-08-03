/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.5 — Theory Assistant.
 *
 * A songwriting helper in the Producer stage built on the Session Musician
 * music-theory engine: pick a key/scale/mode, generate a deterministic chord
 * progression, see it as roman-style chord symbols, voice it with smooth
 * voice leading, then preview it or send the roots to the pads.
 */

import React, { useState } from 'react';
import { Sparkles, Play, Drum, RefreshCw, PenLine } from 'lucide-react';
import {
  makeProgression,
  voiceChords,
  progressionChords,
  type ScaleLockSettings,
  DEFAULT_SCALE_LOCK,
} from '../lib/musicTheory';
import type { TheoryChord } from '../lib/theory/progression';
import { midiToNoteName, noteName } from '../lib/theory/pitch';

interface TheoryPanelProps {
  onPlayNote: (midi: number, velocity?: number) => void;
  onStopNote: (midi: number) => void;
  onSendToPads?: (roots: string[]) => void;
  /** Write the voiced progression into the active pattern row as melodic notes. */
  onApplyToPattern?: (chords: Array<{ root: string; type: string }>) => void;
}

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SCALES = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic minor', 'melodic minor'] as const;
const MODES = ['functional', 'section'] as const;
const COMPLEXITY = [0, 1, 2] as const;

const CHORD_GLYPH: Record<string, string> = {
  maj: '', maj7: 'maj7', maj9: 'maj9', min7: 'm7', m7: 'm7', m9: 'm9',
  '7': '7', '9': '9', m7b5: 'm7♭5', dim: '°', m: 'm',
};

export const TheoryPanel: React.FC<TheoryPanelProps> = ({ onPlayNote, onStopNote, onSendToPads, onApplyToPattern }) => {
  const [key, setKey] = useState('C');
  const [scale, setScale] = useState<(typeof SCALES)[number]>('major');
  const [mode, setMode] = useState<(typeof MODES)[number]>('functional');
  const [complexity, setComplexity] = useState<(typeof COMPLEXITY)[number]>(1);
  const [bars, setBars] = useState(8);
  const [prog, setProg] = useState<TheoryChord[]>([]);
  const [seed, setSeed] = useState(42);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const activeSourcesRef = React.useRef<AudioBufferSourceNode[]>([]);

  const generate = () => {
    const next = makeProgression(key, {
      scaleType: scale,
      bars,
      mode,
      complexity,
      seed,
    });
    setProg(next);
  };

  const previewChord = (idx: number) => {
    if (!prog[idx]) return;
    // Stop any playing source first.
    activeSourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    activeSourcesRef.current = [];
    const voicings = voiceChords(progressionChords(prog.slice(0, idx + 1)), 4);
    const voicing = voicings[voicings.length - 1];
    if (!voicing) return;
    // Play each note of the voicing via the melodic note path (scale-aware).
    voicing.notes.forEach((n) => onPlayNote(n, 0.8));
    setPlayingIdx(idx);
    // Stop after ~1.5s.
    window.setTimeout(() => {
      voicing.notes.forEach((n) => onStopNote(n));
      activeSourcesRef.current = [];
      setPlayingIdx(null);
    }, 1500);
  };

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-2" data-theory-panel>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
          <Sparkles size={12} /> Theory Assistant
        </span>
        <button
          type="button"
          onClick={generate}
          className="px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1"
        >
          <RefreshCw size={10} /> Generate
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[9px]">
        <select value={key} onChange={(e) => setKey(e.target.value)} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
          {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={scale} onChange={(e) => setScale(e.target.value as typeof scale)} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
          {SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="flex items-center gap-1 text-slate-400">
          Bars
          <input type="number" min={2} max={16} value={bars} onChange={(e) => setBars(parseInt(e.target.value) || 8)} className="w-12 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
        </label>
        <select value={complexity} onChange={(e) => setComplexity(parseInt(e.target.value) as typeof complexity)} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
          <option value={0}>Triads</option>
          <option value={1}>7ths</option>
          <option value={2}>Extensions</option>
        </select>
        <label className="flex items-center gap-1 text-slate-400">
          Seed
          <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value) || 0)} className="w-14 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
        </label>
      </div>

      {prog.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-[#1e293b]">
          <div className="flex flex-wrap gap-1">
            {prog.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => previewChord(i)}
                className={`px-2 py-1 rounded border text-[10px] font-mono font-bold transition-all ${
                  playingIdx === i ? 'bg-amber-500 text-black border-amber-400' : 'border-white/10 bg-black/30 text-slate-200 hover:border-amber-400/60'
                }`}
                title={`Preview ${c.root}${CHORD_GLYPH[c.type] ?? c.type} (${c.duration}b)`}
              >
                {c.root}{CHORD_GLYPH[c.type] ?? c.type}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[9px] font-mono text-slate-500">
              {prog.reduce((s, c) => s + c.duration, 0)} beats · {prog.length} chords · seed {seed}
            </span>
            {onApplyToPattern && (
              <button
                type="button"
                onClick={() => onApplyToPattern(progressionChords(prog))}
                className="px-2 py-0.5 rounded border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[9px] font-black uppercase flex items-center gap-1"
                title="Voice the progression into the active pattern row"
              >
                <PenLine size={10} /> Apply to Pattern
              </button>
            )}
            {onSendToPads && (
              <button
                type="button"
                onClick={() => onSendToPads(prog.map((c) => c.root))}
                className="px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-[9px] font-black uppercase flex items-center gap-1"
              >
                <Drum size={10} /> Roots → Pads
              </button>
            )}
          </div>
        </div>
      )}

      {prog.length === 0 && (
        <p className="text-[10px] text-slate-500 font-mono">
          Pick a key/scale and hit Generate for a deterministic progression.
        </p>
      )}
    </div>
  );
};

export default TheoryPanel;
