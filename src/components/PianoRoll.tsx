/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lightweight SVG piano roll for the Beat Studio. Shows each enabled layer's
 * notes across the 16-step pattern with a live playhead, and doubles as an
 * edit screen: click a cell to add/remove a melodic note on the active layer.
 * Shares the same pattern as the step grid, so the two views stay in sync.
 */

import React, { useMemo } from 'react';
import { Note } from 'tonal';
import { SoundLayer } from '../types';

const DEFAULT_STEPS = 16;
const ROW_H = 16;
const LOW_PITCH = 36; // C2
const HIGH_PITCH = 84; // C6
const PITCHES = HIGH_PITCH - LOW_PITCH + 1;

const PAD_COLORS = [
  'bg-blue-500/70',
  'bg-cyan-500/70',
  'bg-emerald-500/70',
  'bg-lime-500/70',
  'bg-yellow-500/70',
  'bg-amber-500/70',
  'bg-orange-500/70',
  'bg-red-500/70',
  'bg-rose-500/70',
  'bg-fuchsia-500/70',
  'bg-purple-500/70',
  'bg-violet-500/70',
  'bg-indigo-500/70',
  'bg-sky-500/70',
  'bg-teal-500/70',
  'bg-pink-500/70',
];

// Fixed drum-style pitch per row used when a cell has no explicit MIDI note.
const ROW_PITCHES = [36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62];

const resolveCellPitch = (rowIdx: number, note?: number): number =>
  note !== undefined && note >= LOW_PITCH && note <= HIGH_PITCH ? note : ROW_PITCHES[rowIdx % ROW_PITCHES.length];

export type Pattern = Record<string, { on: boolean; note?: number }[]>;

interface PianoRollProps {
  layers: SoundLayer[];
  pattern: Pattern;
  currentStep: number;
  activeLayerId: string | null;
  onToggleNote: (layerId: string, step: number, pitch: number) => void;
  stepLength?: 16 | 32;
}

export function PianoRoll({ layers, pattern, currentStep, activeLayerId, onToggleNote, stepLength = DEFAULT_STEPS }: PianoRollProps) {
  const steps = stepLength;
  const enabled = layers.filter((l) => l.enabled);

  // A cell's pitch: the stored midi note, else a fixed drum pitch per row.
  const cellPitch = (_layer: SoundLayer, rowIdx: number, note?: number) =>
    resolveCellPitch(rowIdx, note);

  const notes = useMemo(() => {
    const out: { layerId: string; step: number; pitch: number; color: string }[] = [];
    enabled.forEach((layer, rowIdx) => {
      const row = pattern[layer.id] || [];
      row.forEach((cell, step) => {
        if (cell?.on) {
          out.push({ layerId: layer.id, step, pitch: cellPitch(layer, rowIdx, cell.note), color: PAD_COLORS[rowIdx % 16] });
        }
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pattern]);

  const height = PITCHES * ROW_H;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeLayerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(steps - 1, Math.floor(((e.clientX - rect.left) / rect.width) * steps)));
    const y = e.clientY - rect.top;
    const pitch = HIGH_PITCH - Math.floor(y / ROW_H);
    if (pitch < LOW_PITCH || pitch > HIGH_PITCH) return;
    onToggleNote(activeLayerId, x, pitch);
  };

  return (
    <div className="flex gap-1.5 select-none">
      {/* Row labels */}
      <div className="w-24 shrink-0 space-y-1">
        {enabled.map((layer, i) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              className={`flex items-center justify-between px-1.5 text-[8px] font-mono truncate rounded ${isActive ? 'bg-[#0f172a] text-yellow-300' : 'text-slate-500'}`}
              style={{ height: ROW_H }}
            >
              <span className="truncate uppercase font-black">{layer.name}</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: PAD_COLORS[i % 16].replace('/70', '') }} />
            </div>
          );
        })}
      </div>

      {/* Grid + notes */}
      <div className="flex-1 min-w-0">
        {/* Step header */}
        <div className="flex gap-px mb-0.5">
          {Array.from({ length: steps }, (_, i) => (
            <div
              key={i}
              className={`flex-1 text-center text-[8px] font-mono font-bold ${i === currentStep ? 'text-yellow-400' : 'text-slate-600'}`}
            >
              {i % 4 === 0 ? String(i / 4 + 1) : ''}
            </div>
          ))}
        </div>

        {/* Pitches grid (rows) with piano-roll notes and playhead */}
        <div
          className="relative rounded-lg overflow-hidden bg-black/50 border border-[#1e293b] cursor-crosshair"
          style={{ height }}
          onClick={handleClick}
        >
          {/* Pitch row bands + note names */}
          {Array.from({ length: PITCHES }, (_, i) => {
            const pitch = HIGH_PITCH - i;
            const isBlackKey = [1, 3, 6, 8, 10].includes(pitch % 12);
            return (
              <div
                key={pitch}
                className={`absolute left-0 right-0 border-t border-[#12121a] ${isBlackKey ? 'bg-[#0d0d12]' : 'bg-[#0a0a0e]'}`}
                style={{ top: i * ROW_H, height: ROW_H }}
              >
                <span className="absolute right-1 top-0 text-[7px] font-mono text-slate-600">
                  {Note.fromMidi(pitch).replace(/\d/, '')}
                </span>
              </div>
            );
          })}

          {/* Notes */}
          {notes.map((n, i) => (
            <div
              key={i}
              className={`absolute rounded-sm ${n.color} ${
                n.step === currentStep ? 'ring-2 ring-white shadow-[0_0_8px_rgba(255,255,255,0.5)]' : ''
              }`}
              style={{
                left: `${(n.step / steps) * 100}%`,
                top: (HIGH_PITCH - n.pitch) * ROW_H + 2,
                width: `${100 / steps}%`,
                height: ROW_H - 4,
              }}
            />
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)] pointer-events-none"
            style={{ left: `${((currentStep + 0.5) / steps) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
