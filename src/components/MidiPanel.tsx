/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.3 — MIDI input panel.
 *
 * Enumerates Web MIDI inputs with status lights and routes MIDI note-on/off
 * into the app. Mapping strategy: notes 36..51 map to the 16 pads (36 = pad 1,
 * the MPC/TR convention); notes outside that range go to the melodic note path
 * (scale lock + chord mode apply via PerformanceControls). Velocity from the
 * MIDI message is passed through so recorded cells capture real velocity.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createMidiService, type MidiInputInfo } from '../lib/midiService';
import { Piano } from 'lucide-react';

interface MidiPanelProps {
  padSlots: (string | null)[];
  onTriggerPad: (index: number, velocity?: number) => void;
  onPlayNote: (midi: number, velocity?: number) => void;
  onStopNote: (midi: number) => void;
}

const PAD_MIDI_BASE = 36; // C2 — MPC-style pad 1

export const MidiPanel: React.FC<MidiPanelProps> = ({
  padSlots,
  onTriggerPad,
  onPlayNote,
  onStopNote,
}) => {
  const svcRef = useRef(createMidiService());
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [active, setActive] = useState(false);
  const padSlotsRef = useRef(padSlots);
  padSlotsRef.current = padSlots;

  const handleNoteOn = useCallback(({ note, velocity }: { note: number; velocity: number }) => {
    const v = Math.max(0, Math.min(1, velocity / 127));
    const padIdx = note - PAD_MIDI_BASE;
    if (padIdx >= 0 && padIdx < 16 && padSlotsRef.current[padIdx]) {
      onTriggerPad(padIdx, v);
    } else {
      onPlayNote(note, v);
    }
  }, [onTriggerPad, onPlayNote]);

  const handleNoteOff = useCallback(({ note }: { note: number }) => {
    const padIdx = note - PAD_MIDI_BASE;
    if (!(padIdx >= 0 && padIdx < 16 && padSlotsRef.current[padIdx])) {
      onStopNote(note);
    }
  }, [onStopNote]);

  const toggle = async () => {
    if (active) {
      await svcRef.current.disable();
      setActive(false);
      setInputs([]);
      return;
    }
    const ok = await svcRef.current.enable(handleNoteOn, handleNoteOff, setInputs);
    setActive(ok);
    if (!ok) {
      console.warn('Web MIDI not available or permission denied');
    }
  };

  useEffect(() => {
    return () => {
      svcRef.current.disable().catch(() => {});
    };
  }, []);

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-2" data-midi-panel>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-1.5">
          <Piano size={12} /> MIDI Input
        </span>
        <button
          type="button"
          onClick={toggle}
          className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
            active ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-[#121215] border-[#1e293b] text-slate-300 hover:text-white'
          }`}
        >
          {active ? 'Enabled' : 'Enable'}
        </button>
      </div>

      {inputs.length === 0 && (
        <p className="text-[10px] text-slate-500 font-mono">
          {active ? 'Waiting for a MIDI device…' : 'Enable to scan for MIDI keyboards / controllers.'}
        </p>
      )}
      {inputs.length > 0 && (
        <div className="space-y-1">
          {inputs.map((input) => (
            <div key={input.id} className="flex items-center gap-2 px-2 py-1 rounded border border-white/10 bg-black/30" data-midi-input={input.id}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-[10px] font-bold text-white truncate flex-1">{input.name}</span>
              {input.manufacturer && <span className="text-[9px] text-slate-500">{input.manufacturer}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MidiPanel;
