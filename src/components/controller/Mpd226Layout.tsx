/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visual controller layout — clickable rendering of the connected hardware.
 *
 * The shape comes from a `ControllerSurface` descriptor, so an MPD226 shows
 * pads + knobs + faders + switches + transport while an MPD218 (or any unknown
 * controller) shows only the controls it actually has.
 *
 * In learn mode, every control is a touch target: click a pad/knob/fader on
 * screen, then move it on the device to bind it.
 */

import React from 'react';
import {
  CONTROL_BANK_LABELS,
  FADER_LABELS,
  KNOB_LABELS,
  PAD_BANK_LABELS,
  SWITCH_LABELS,
} from '../../lib/controller/defaultMpd226';
import { controlKey, describeMessage } from '../../lib/controller/mapping';
import { describeAction } from '../../lib/controller/actions';
import { chordPadAt, noteLabel } from '../../lib/controller/chordPads';
import { SURFACES, type ControllerSurface } from '../../lib/controller/surface';
import { useControllerStore } from '../../store/controllerStore';
import type { ControllerBinding, ControllerProfile } from '../../lib/controller/types';

interface Mpd226LayoutProps {
  profile: ControllerProfile;
  surface?: ControllerSurface;
  padPage: number;
  controlPage: number;
  selected: string | null;
  learnTarget: string | null;
  learnMode?: boolean;
  /**
   * Resolve the effective (screen-remapped) binding used for a control's label.
   * Defaults to the raw profile binding. Pass the section resolver so the
   * on-screen labels always match what the hardware is actually driving.
   */
  resolve?: (controlKey: string, binding: ControllerBinding) => ControllerBinding;
  onSelect: (key: string) => void;
  onStartLearn: (key: string) => void;
  onPadPageChange: (page: number) => void;
  onControlPageChange: (page: number) => void;
}

const PAD_COLORS = [
  'border-blue-500/50', 'border-cyan-500/50', 'border-emerald-500/50', 'border-lime-500/50',
  'border-yellow-500/50', 'border-amber-500/50', 'border-orange-500/50', 'border-red-500/50',
  'border-rose-500/50', 'border-fuchsia-500/50', 'border-purple-500/50', 'border-violet-500/50',
  'border-indigo-500/50', 'border-sky-500/50', 'border-teal-500/50', 'border-pink-500/50',
];

/**
 * Hardware orientation: the bottom-left pad is pad 1 (note 36 in the MPC
 * convention) and notes ascend upward, so the visual grid renders its rows
 * top→bottom as indices 12–15 / 8–11 / 4–7 / 0–3.
 */
const PAD_GRID_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];

const Control: React.FC<{
  id: string;
  label: string;
  sub?: string;
  selected: boolean;
  learning: boolean;
  learnMode: boolean;
  onSelect: (key: string) => void;
  onStartLearn: (key: string) => void;
  className?: string;
}> = ({ id, label, sub, selected, learning, learnMode, onSelect, onStartLearn, className = '' }) => (
  <div className="relative">
    <button
      type="button"
      onClick={() => onSelect(id)}
      data-control={id}
      className={`w-full rounded-lg border px-1 py-2 text-left transition-all ${
        selected
          ? 'border-yellow-400 bg-[#0f172a] ring-2 ring-yellow-400/60'
          : learning
            ? 'border-fuchsia-400 bg-fuchsia-950/30 animate-pulse'
            : learnMode
              ? 'border-fuchsia-500/50 bg-black/40 hover:border-fuchsia-300'
              : 'border-[#1e293b] bg-black/40 hover:border-slate-500'
      } ${className}`}
    >
      <span className="block text-[9px] font-mono font-black text-white/80 uppercase truncate">{label}</span>
      <span className="block text-[8px] font-mono text-slate-500 truncate">{sub}</span>
    </button>
    <button
      type="button"
      title="MIDI-learn this control"
      onClick={(e) => { e.stopPropagation(); onStartLearn(id); }}
      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border text-[8px] font-black leading-none flex items-center justify-center ${
        learning ? 'bg-fuchsia-500 border-fuchsia-300 text-black animate-pulse' : 'bg-[#121215] border-[#334155] text-slate-400 hover:text-fuchsia-300 hover:border-fuchsia-400'
      }`}
    >
      L
    </button>
  </div>
);

export const Mpd226Layout: React.FC<Mpd226LayoutProps> = ({
  profile,
  surface = SURFACES.mpd226,
  padPage,
  controlPage,
  selected,
  learnTarget,
  learnMode = false,
  resolve,
  onSelect,
  onStartLearn,
  onPadPageChange,
  onControlPageChange,
}) => {
  const chord = useControllerStore((s) => s.chord);
  const bank = ['A', 'B', 'C', 'D'][padPage] ?? 'A';

  /** The section-resolved binding for a control (falls back to the profile). */
  const effectiveBinding = (key: string): ControllerBinding | undefined => {
    const b = profile.bindings[key];
    if (!b) return undefined;
    return resolve ? resolve(key, b) : b;
  };

  const subFor = (key: string): string => {
    const b = effectiveBinding(key);
    if (!b) return 'unbound — tap to learn';
    if (!b.enabled) return 'off';
    // Show what the control does on this screen, then its hardware signature.
    const label = b.action ? describeAction(b.action).label : 'no action';
    return `${label} · ${describeMessage(b)}`;
  };

  const padSub = (index: number): string => {
    const b = effectiveBinding(controlKey('pad', padPage, index));
    if (!b) return 'unbound';
    if (!b.enabled) return 'off';
    if (b.action.startsWith('chord:degree')) return `Chord ${chordPadAt(chord, index).root}`;
    if (b.action.startsWith('sample:pad')) return `Smp ${index + 1} · ±${Math.abs(index - 8)}st`;
    if (b.action.startsWith('section:pad:')) return describeAction(b.action).label.replace('Section · ', '');
    return b.action.replace('pad:', '');
  };

  const knobCount = Math.min(surface.knobs, KNOB_LABELS.length);
  const faderCount = Math.min(surface.faders, FADER_LABELS.length);
  const switchCount = Math.min(surface.switches, SWITCH_LABELS.length);
  const hasControls = knobCount + faderCount + switchCount > 0;

  return (
    <div className="space-y-3" data-mpd226-layout data-surface={surface.skin}>
      {/* Knobs / faders / switches */}
      {hasControls && (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mr-1">Knobs · Faders · Switches</span>
            {Array.from({ length: surface.controlBanks }, (_, page) => (
              <button
                key={page}
                type="button"
                onClick={() => onControlPageChange(page)}
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
                  controlPage === page ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-[#121215] border-[#1e293b] text-slate-500 hover:text-white'
                }`}
              >
                {page + 1}
              </button>
            ))}
            <span className="text-[9px] font-mono text-slate-500">{CONTROL_BANK_LABELS[controlPage]}</span>
          </div>
          <div className={`grid gap-3 ${[knobCount > 0, faderCount > 0, switchCount > 0].filter(Boolean).length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {knobCount > 0 && (
              <div>
                <div className="text-[8px] font-mono uppercase text-slate-600 mb-1">Knobs</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: knobCount }, (_, i) => {
                    const key = controlKey('knob', controlPage, i);
                    return (
                      <Control key={key} id={key} label={KNOB_LABELS[i]} sub={subFor(key)}
                        selected={selected === key} learning={learnTarget === key} learnMode={learnMode}
                        onSelect={onSelect} onStartLearn={onStartLearn} className="!rounded-full !py-3 text-center" />
                    );
                  })}
                </div>
              </div>
            )}
            {faderCount > 0 && (
              <div>
                <div className="text-[8px] font-mono uppercase text-slate-600 mb-1">Faders</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: faderCount }, (_, i) => {
                    const key = controlKey('fader', controlPage, i);
                    return (
                      <Control key={key} id={key} label={FADER_LABELS[i]} sub={subFor(key)}
                        selected={selected === key} learning={learnTarget === key} learnMode={learnMode}
                        onSelect={onSelect} onStartLearn={onStartLearn} className="!py-4" />
                    );
                  })}
                </div>
              </div>
            )}
            {switchCount > 0 && (
              <div>
                <div className="text-[8px] font-mono uppercase text-slate-600 mb-1">Switches</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: switchCount }, (_, i) => {
                    const key = controlKey('switch', controlPage, i);
                    return (
                      <Control key={key} id={key} label={SWITCH_LABELS[i]} sub={subFor(key)}
                        selected={selected === key} learning={learnTarget === key} learnMode={learnMode}
                        onSelect={onSelect} onStartLearn={onStartLearn} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pads */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mr-1">Pads</span>
          {Array.from({ length: surface.padBanks }, (_, page) => (
            <button
              key={page}
              type="button"
              onClick={() => onPadPageChange(page)}
              className={`w-7 h-7 rounded-md text-[10px] font-mono font-black border transition-all ${
                padPage === page ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-[#121215] border-[#1e293b] text-slate-500 hover:text-white'
              }`}
            >
              {['A', 'B', 'C', 'D'][page]}
            </button>
          ))}
          <span className="text-[9px] font-mono text-slate-500">{PAD_BANK_LABELS[padPage]}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 max-w-[420px]">
          {PAD_GRID_ORDER.map((i) => {
            const key = controlKey('pad', padPage, i);
            const binding = effectiveBinding(key);
            const isChord = binding?.action.startsWith('chord');
            const chordPad = isChord ? chordPadAt(chord, i) : null;
            return (
              <div key={key} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  data-control={key}
                  className={`aspect-[4/3] w-full rounded-lg border bg-gradient-to-br from-white/5 to-black/40 px-1.5 py-1 flex flex-col justify-between transition-all ${
                    selected === key
                      ? 'ring-2 ring-yellow-400 border-yellow-400'
                      : learnTarget === key
                        ? 'ring-2 ring-fuchsia-400 border-fuchsia-400 animate-pulse'
                        : learnMode
                          ? 'border-fuchsia-500/60 hover:brightness-125'
                          : PAD_COLORS[i % 16]
                  }`}
                >
                  <span className="text-[8px] font-mono font-bold text-white/60">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[9px] font-black uppercase text-white truncate">
                    {chordPad ? `${chordPad.root}${chordPad.quality}` : `${bank}${i + 1}`}
                  </span>
                  <span className="text-[8px] font-mono text-white/50 truncate">
                    {chordPad ? noteLabel(chordPad.notes[0]) : padSub(i)}
                  </span>
                </button>
                <button
                  type="button"
                  title="MIDI-learn this pad"
                  onClick={(e) => { e.stopPropagation(); onStartLearn(key); }}
                  className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border text-[8px] font-black leading-none flex items-center justify-center ${
                    learnTarget === key ? 'bg-fuchsia-500 border-fuchsia-300 text-black animate-pulse' : 'bg-[#121215] border-[#334155] text-slate-400 hover:text-fuchsia-300 hover:border-fuchsia-400'
                  }`}
                >
                  L
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transport */}
      {surface.transport.length > 0 && (
        <div className="space-y-2">
          <div className="text-[8px] font-mono uppercase text-slate-600">Transport</div>
          <div className="grid grid-cols-4 gap-1.5 max-w-[420px]">
            {surface.transport.map((name) => {
              const key = controlKey('transport', 0, name);
              return (
                <Control key={key} id={key} label={name} sub={subFor(key)}
                  selected={selected === key} learning={learnTarget === key} learnMode={learnMode}
                  onSelect={onSelect} onStartLearn={onStartLearn} className="text-center" />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Mpd226Layout;
