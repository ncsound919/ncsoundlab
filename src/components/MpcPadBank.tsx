/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MPC-style 16-pad drum bank. Each bank (A/B/C/D) is its own 16-slot program
 * referencing sound layers by id. Supports 16-levels, full level, velocity
 * curves, per-pad swing/tune/choke/mute, global swing, note repeat, time
 * correct, and pad assign/clear. Wired into the same pattern/transport as the
 * step sequencer.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { BankId, BANK_IDS } from '../store/sequencerStore';
import { SAMPLE_DRAG_MIME } from './SampleBrowser';

export interface PadEntry {
  layerId: string;
  name: string;
  type: string;
}

export type VelocityCurve = 'linear' | 'exponential' | 'log';

interface MpcPadBankProps {
  entries: (PadEntry | null)[]; // active bank's 16 slots
  activeBank: BankId;
  onBankChange: (bank: BankId) => void;
  selectedPad: number;
  onSelectPad: (pad: number) => void;
  focusedLayerId?: string | null;
  padSwing: Record<string, number>;
  /** Per-piece early/late bias in ms (PocketLab-style). */
  padPocket: Record<string, number>;
  padTune: Record<string, number>;
  padChoke: Record<string, number>;
  padMuted: Record<string, boolean>;
  bpm: number;
  noteRepeat: { active: boolean; division: number };
  sixteenLevels: boolean;
  globalSwing: number;
  fullLevel: boolean;
  velocityCurve: VelocityCurve;
  timeCorrect: number;
  onSetSwing: (layerId: string, swing: number) => void;
  /** Per-piece pocket setter (ms, -40..+40). */
  onSetPocket: (layerId: string, pocketMs: number) => void;
  onSetTune: (layerId: string, tune: number) => void;
  onSetChoke: (layerId: string, group: number) => void;
  onTogglePadMute: (layerId: string) => void;
  onClearPad: (index: number) => void;
  onAssignActiveLayer: (index: number) => void;
  onSetGlobalSwing: (swing: number) => void;
  onTriggerPad: (layerId: string, semitones: number, velocity?: number) => void;
  onPadInput?: (layerId: string, velocity?: number) => void;
  onNoteRepeatChange: (nr: { active: boolean; division: number }) => void;
  onSixteenLevelsChange: (enabled: boolean) => void;
  onFullLevelChange: (enabled: boolean) => void;
  onVelocityCurveChange: (curve: VelocityCurve) => void;
  onSetTimeCorrect: (res: number) => void;
  onQuantize: () => void;
  /**
   * Phase 5.1 — drop a library sample onto a pad. The sample id is decoded by
   * the parent (via `decodeLibrarySample`) and assigned to the pad's slot.
   */
  onPadDrop?: (sampleId: string, padIndex: number) => void;
}

const DIVISIONS = [
  { label: '1/4', value: 1 },
  { label: '1/8', value: 2 },
  { label: '1/16', value: 4 },
  { label: '1/32', value: 8 },
  { label: '1/64', value: 16 },
];

const PAD_COLORS = [
  'from-blue-600/40 to-blue-900/40 border-blue-500/50',
  'from-cyan-600/40 to-cyan-900/40 border-cyan-500/50',
  'from-emerald-600/40 to-emerald-900/40 border-emerald-500/50',
  'from-lime-600/40 to-lime-900/40 border-lime-500/50',
  'from-yellow-600/40 to-yellow-900/40 border-yellow-500/50',
  'from-amber-600/40 to-amber-900/40 border-amber-500/50',
  'from-orange-600/40 to-orange-900/40 border-orange-500/50',
  'from-red-600/40 to-red-900/40 border-red-500/50',
  'from-rose-600/40 to-rose-900/40 border-rose-500/50',
  'from-fuchsia-600/40 to-fuchsia-900/40 border-fuchsia-500/50',
  'from-purple-600/40 to-purple-900/40 border-purple-500/50',
  'from-violet-600/40 to-violet-900/40 border-violet-500/50',
  'from-indigo-600/40 to-indigo-900/40 border-indigo-500/50',
  'from-sky-600/40 to-sky-900/40 border-sky-500/50',
  'from-teal-600/40 to-teal-900/40 border-teal-500/50',
  'from-pink-600/40 to-pink-900/40 border-pink-500/50',
];

// Per-program accent (each bank is a distinct program)
const BANK_ACCENT: Record<BankId, { tab: string; ring: string }> = {
  A: { tab: 'bg-blue-600/20 border-blue-500 text-blue-300', ring: 'ring-blue-400 shadow-[0_0_18px_rgba(59,130,246,0.4)]' },
  B: { tab: 'bg-rose-600/20 border-rose-500 text-rose-300', ring: 'ring-rose-400 shadow-[0_0_18px_rgba(244,63,94,0.4)]' },
  C: { tab: 'bg-teal-600/20 border-teal-500 text-teal-300', ring: 'ring-teal-400 shadow-[0_0_18px_rgba(45,212,191,0.4)]' },
  D: { tab: 'bg-fuchsia-600/20 border-fuchsia-500 text-fuchsia-300', ring: 'ring-fuchsia-400 shadow-[0_0_18px_rgba(232,121,249,0.4)]' },
};

/**
 * MPC pad velocity from pointer height fraction (0 = top, 1 = bottom).
 * Full level short-circuits to 1; otherwise the curve maps the height with a
 * 0.1 floor so pads are never dead-quiet at the bottom edge.
 */
export function padVelocityFor(y01: number, curve: VelocityCurve, fullLevel: boolean): number {
  if (fullLevel) return 1;
  const t = Math.max(0, Math.min(1, 1 - y01)); // top (0) = loud
  if (curve === 'exponential') return Math.max(0.1, t * t);
  if (curve === 'log') return Math.max(0.1, Math.sqrt(t));
  return Math.max(0.1, t);
}

/** Note-repeat interval in ms for a BPM and a per-quarter-note division. */
export function noteRepeatIntervalMs(bpm: number, divisionsPerQuarter: number): number {
  return (60000 / bpm) / divisionsPerQuarter;
}

export function MpcPadBank({
  entries,
  activeBank,
  onBankChange,
  selectedPad,
  onSelectPad,
  focusedLayerId,
  padSwing,
  padPocket,
  padTune,
  padChoke,
  padMuted,
  bpm,
  noteRepeat,
  sixteenLevels,
  globalSwing,
  fullLevel,
  velocityCurve,
  timeCorrect,
  onSetSwing,
  onSetPocket,
  onSetTune,
  onSetChoke,
  onTogglePadMute,
  onClearPad,
  onAssignActiveLayer,
  onSetGlobalSwing,
  onTriggerPad,
  onPadInput,
  onNoteRepeatChange,
  onSixteenLevelsChange,
  onFullLevelChange,
  onVelocityCurveChange,
  onSetTimeCorrect,
  onQuantize,
  onPadDrop,
}: MpcPadBankProps) {
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatTargetRef = useRef<{ layerId: string; semitones: number } | null>(null);

  const stopRepeat = useCallback(() => {
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);

  useEffect(() => stopRepeat, [stopRepeat]);

  const startRepeat = useCallback((layerId: string, semitones: number) => {
    stopRepeat();
    if (!noteRepeat.active) return;
    repeatTargetRef.current = { layerId, semitones };
    const divisionsPerQuarter = noteRepeat.division;
    const intervalMs = noteRepeatIntervalMs(bpm, divisionsPerQuarter);
    repeatRef.current = setInterval(() => onTriggerPad(layerId, semitones, 1), intervalMs);
  }, [bpm, noteRepeat.active, noteRepeat.division, onTriggerPad, stopRepeat]);

  // Re-tempo an active repeat when the BPM or division changes — otherwise the
  // running setInterval keeps the rate captured at press time (stale groove).
  useEffect(() => {
    if (noteRepeat.active && repeatTargetRef.current) {
      const { layerId, semitones } = repeatTargetRef.current;
      startRepeat(layerId, semitones);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, noteRepeat.division]);

  const activeEntry = entries[selectedPad] || undefined;
  const selectedSwing = activeEntry ? Math.round(padSwing[activeEntry.layerId] ?? globalSwing) : 0;
  const selectedPocket = activeEntry ? Math.round(padPocket[activeEntry.layerId] || 0) : 0;
  const selectedTune = activeEntry ? Math.round(padTune[activeEntry.layerId] || 0) : 0;
  const selectedChoke = activeEntry ? (padChoke[activeEntry.layerId] || 0) : 0;
  const selectedMuted = activeEntry ? !!padMuted[activeEntry.layerId] : false;

  const velocityFor = (y: number) => padVelocityFor(y, velocityCurve, fullLevel);

  const handlePadDown = (entry: PadEntry | undefined, level: number, gridIdx: number, e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectPad(gridIdx);
    if (!entry || padMuted[entry.layerId]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    onTriggerPad(entry.layerId, level, velocityFor(y));
    onPadInput?.(entry.layerId, velocityFor(y));
    startRepeat(entry.layerId, level);
  };

  const handlePadUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopRepeat();
  };

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-2xl overflow-hidden">
      <div className="border-b border-[#1e293b] bg-black px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-white">MPC Drum Pads</span>
        <span className="text-[9px] font-mono text-slate-500">16 pads · 4 programs · swing · tune · choke · note repeat · 16 levels</span>
      </div>

      <div className="p-3 grid grid-cols-1 lg:grid-cols-[1fr_230px] gap-3">
        {/* 4x4 pad grid */}
        <div className="space-y-2 max-w-[640px]">
          <div className="flex items-center gap-1">
            {BANK_IDS.map((label) => (
              <button
                key={label}
                onClick={() => onBankChange(label)}
                className={`w-7 h-7 rounded-md text-[10px] font-mono font-black border transition-all ${
                  activeBank === label ? BANK_ACCENT[label].tab : 'bg-[#121215] border-[#1e293b] text-slate-500 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
            <span className={`ml-2 text-[9px] font-mono uppercase ${BANK_ACCENT[activeBank].tab.split(' ')[2] || 'text-slate-600'}`}>Program {activeBank}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {entries.map((entry, gridIdx) => {
              const isSelected = selectedPad === gridIdx;
              const level = sixteenLevels ? gridIdx : entry ? (padTune[entry.layerId] || 0) : 0;
              const shown = sixteenLevels ? activeEntry : entry;
              const muted = entry ? !!padMuted[entry.layerId] : false;
              if (!shown) {
                return (
                  <button
                    key={gridIdx}
                    onPointerDown={(e) => { e.preventDefault(); handlePadDown(undefined, 0, gridIdx, e); }}
                    onPointerUp={handlePadUp}
                    onPointerLeave={stopRepeat}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes(SAMPLE_DRAG_MIME)) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }
                    }}
                    onDrop={(e) => {
                      const sampleId = e.dataTransfer.getData(SAMPLE_DRAG_MIME);
                      if (sampleId && onPadDrop) {
                        e.preventDefault();
                        onPadDrop(sampleId, gridIdx);
                      }
                    }}
                    className={`aspect-[4/3] rounded-lg border flex flex-col items-center justify-center transition-all select-none touch-none ${
                      isSelected ? 'border-yellow-400/70 bg-[#0f172a]/30' : 'border-[#1a1a22] bg-black/40 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-[9px] font-mono font-bold text-slate-700">{String(gridIdx + 1).padStart(2, '0')}</span>
                  </button>
                );
              }
              const swing = Math.round(padSwing[shown.layerId] ?? globalSwing);
              const isFocused = focusedLayerId != null && shown.layerId === focusedLayerId;
              return (
                <button
                  key={gridIdx}
                  onPointerDown={(e) => { e.preventDefault(); handlePadDown(shown, level, gridIdx, e); }}
                  onPointerUp={handlePadUp}
                  onPointerLeave={stopRepeat}
                  onPointerCancel={handlePadUp}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(SAMPLE_DRAG_MIME)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }
                  }}
                  onDrop={(e) => {
                    const sampleId = e.dataTransfer.getData(SAMPLE_DRAG_MIME);
                    if (sampleId && onPadDrop) {
                      e.preventDefault();
                      onPadDrop(sampleId, gridIdx);
                    }
                  }}
                  className={`aspect-[4/3] rounded-lg bg-gradient-to-br border px-1.5 py-1 flex flex-col justify-between transition-all cursor-pointer select-none touch-none ${
                    isSelected
                      ? `${PAD_COLORS[gridIdx % 16]} ring-2 ${BANK_ACCENT[activeBank].ring}`
                      : `${PAD_COLORS[gridIdx % 16]} hover:brightness-125 active:scale-95`
                  } ${muted ? 'opacity-45' : ''} ${isFocused ? 'outline outline-2 outline-offset-1 outline-white/60' : ''}`}
                  title={`${shown.name}${muted ? ' (muted)' : ''}${isFocused ? ' — active layer' : ''}${sixteenLevels ? ` · level +${gridIdx}` : level !== 0 ? ` · ${level >= 0 ? '+' : ''}${level} st` : ''}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-[8px] font-mono font-bold text-white/70">{String(gridIdx + 1).padStart(2, '0')}</span>
                    {isFocused && <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" />}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-white truncate">{shown.name}</span>
                    <span className="block text-[8px] font-mono text-white/60 uppercase">
                      {muted ? 'MUTED' : sixteenLevels ? `+${gridIdx} LVL` : `${shown.type} · S ${swing}%`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* MPC control strip */}
        <div className="space-y-2.5 bg-[#0a0a0c] border border-[#1e293b] rounded-xl p-2.5">
          <div>
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1">Pad {String(selectedPad + 1).padStart(2, '0')}</div>
            <div className="text-[11px] font-black uppercase text-yellow-400 truncate">{activeEntry?.name || 'Empty pad'}</div>
          </div>

          {/* Pad actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => activeEntry && onTogglePadMute(activeEntry.layerId)}
              disabled={!activeEntry}
              className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 ${
                selectedMuted
                  ? 'bg-red-500/20 border-red-500/50 text-red-400'
                  : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
              }`}
            >
              {selectedMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={() => onClearPad(selectedPad)}
              className="py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white hover:border-red-500/50 transition-all"
            >
              Clear Pad
            </button>
            <button
              onClick={() => onAssignActiveLayer(selectedPad)}
              className="col-span-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-emerald-400 hover:text-white hover:border-emerald-500/50 transition-all"
              title="Put the currently selected layer on this pad"
            >
              Set Pad ← Active Layer
            </button>
          </div>

          {/* 16 Levels */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">16 Levels</span>
            <button
              onClick={() => onSixteenLevelsChange(!sixteenLevels)}
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
                sixteenLevels
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                  : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
              }`}
            >
              {sixteenLevels ? 'On' : 'Off'}
            </button>
          </div>

          {/* Full level + velocity curve */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Full Level</span>
              <button
                onClick={() => onFullLevelChange(!fullLevel)}
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
                  fullLevel ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
                }`}
              >
                {fullLevel ? 'On' : 'Off'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Velocity</span>
              <select
                value={velocityCurve}
                onChange={(e) => onVelocityCurveChange(e.target.value as VelocityCurve)}
                className="bg-[#121215] border border-[#1e293b] rounded px-2 py-1 text-[9px] font-mono text-white focus:outline-none cursor-pointer"
              >
                <option value="linear">Linear</option>
                <option value="exponential">Exponential</option>
                <option value="log">Logarithmic</option>
              </select>
            </div>
          </div>

          {/* Per-pad swing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Pad Swing</span>
              <span className="text-[11px] font-mono font-black text-emerald-400">{selectedSwing}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="75"
              step="1"
              value={selectedSwing}
              disabled={!activeEntry}
              onChange={(e) => activeEntry && onSetSwing(activeEntry.layerId, parseInt(e.target.value))}
              className="w-full accent-emerald-400 h-1.5 rounded-lg cursor-pointer disabled:opacity-30"
              aria-label="Per-pad swing"
            />
          </div>

          {/* Per-piece pocket (PocketLab-style early/late bias in ms) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Pocket</span>
              <span className="text-[11px] font-mono font-black text-indigo-400">{selectedPocket >= 0 ? '+' : ''}{selectedPocket}ms</span>
            </div>
            <input
              type="range"
              min="-40"
              max="40"
              step="1"
              value={selectedPocket}
              disabled={!activeEntry}
              onChange={(e) => activeEntry && onSetPocket(activeEntry.layerId, parseInt(e.target.value))}
              className="w-full accent-indigo-400 h-1.5 rounded-lg cursor-pointer disabled:opacity-30"
              aria-label="Per-pad pocket"
            />
            <div className="flex justify-between text-[7px] font-mono text-slate-600 uppercase">
              <span>Early</span>
              <span>Laid Back</span>
            </div>
          </div>

          {/* Per-pad tune */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Pad Tune</span>
              <span className="text-[11px] font-mono font-black text-sky-400">{selectedTune >= 0 ? '+' : ''}{selectedTune}st</span>
            </div>
            <input
              type="range"
              min="-24"
              max="24"
              step="1"
              value={selectedTune}
              disabled={!activeEntry}
              onChange={(e) => activeEntry && onSetTune(activeEntry.layerId, parseInt(e.target.value))}
              className="w-full accent-sky-400 h-1.5 rounded-lg cursor-pointer disabled:opacity-30"
              aria-label="Per-pad tune (semitones)"
            />
          </div>

          {/* Per-pad choke group */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Choke Group</span>
              <span className="text-[11px] font-mono font-black text-fuchsia-400">{selectedChoke === 0 ? '—' : `G${selectedChoke}`}</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[0, 1, 2, 3, 4].map((g) => (
                <button
                  key={g}
                  onClick={() => activeEntry && onSetChoke(activeEntry.layerId, g)}
                  disabled={!activeEntry}
                  className={`py-1 rounded text-[9px] font-mono font-bold transition-all disabled:opacity-30 ${
                    selectedChoke === g ? 'bg-fuchsia-500/20 border border-fuchsia-500/50 text-fuchsia-400' : 'bg-[#121215] border border-[#1e293b] text-slate-500 hover:text-white'
                  }`}
                >
                  {g === 0 ? '—' : g}
                </button>
              ))}
            </div>
          </div>

          {/* Global swing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Global Swing</span>
              <span className="text-[11px] font-mono font-black text-emerald-400">{globalSwing}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="75"
              step="1"
              value={globalSwing}
              onChange={(e) => onSetGlobalSwing(parseInt(e.target.value))}
              className="w-full accent-emerald-400 h-1.5 rounded-lg cursor-pointer"
              aria-label="Global swing"
            />
          </div>

          {/* Note repeat */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Note Repeat</span>
              <button
                onClick={() => onNoteRepeatChange({ active: !noteRepeat.active, division: noteRepeat.division })}
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
                  noteRepeat.active ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
                }`}
              >
                {noteRepeat.active ? 'On' : 'Off'}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {DIVISIONS.map((d) => (
                <button
                  key={d.label}
                  onClick={() => onNoteRepeatChange({ active: noteRepeat.active, division: d.value })}
                  className={`py-1 rounded text-[9px] font-mono font-bold transition-all ${
                    noteRepeat.division === d.value ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400' : 'bg-[#121215] border border-[#1e293b] text-slate-500 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[8px] font-mono text-slate-600">Hold a pad while ON to retrigger at the note value.</p>
          </div>

          {/* Time Correct */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Time Correct</span>
              <span className="text-[11px] font-mono font-black text-cyan-400">1/{16 / timeCorrect}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[{ label: '1/16', value: 1 }, { label: '1/8', value: 2 }, { label: '1/4', value: 4 }, { label: '1/2', value: 8 }].map((tc) => (
                <button
                  key={tc.label}
                  onClick={() => onSetTimeCorrect(tc.value)}
                  className={`py-1 rounded text-[9px] font-mono font-bold transition-all ${
                    timeCorrect === tc.value ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400' : 'bg-[#121215] border border-[#1e293b] text-slate-500 hover:text-white'
                  }`}
                >
                  {tc.label}
                </button>
              ))}
            </div>
            <button
              onClick={onQuantize}
              className="w-full py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-cyan-300 hover:text-white hover:border-cyan-500/50 transition-all"
            >
              Quantize Pattern
            </button>
          </div>

          <div className="text-[9px] font-mono text-slate-600 border-t border-[#1e293b] pt-2">
            PPQ <span className="text-blue-400 font-bold">96</span> · per-pad settings follow the sequencer clock
          </div>
        </div>
      </div>
    </div>
  );
}
