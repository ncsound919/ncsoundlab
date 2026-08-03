import React from 'react';
import { Knob } from '../Knob';

export function ChorusEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest">MULTI-VOICE ENSEMBLE CHORUS</span>
      <div className="grid grid-cols-4 gap-4">
        <Knob label="Mix" value={settings.mix ?? 40} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, mix: v })} />
        <Knob label="Rate" value={settings.rate ?? 1.2} min={0.1} max={20} step={0.1} unit="Hz" onChange={(v) => onChange({ ...settings, rate: v })} />
        <Knob label="Depth" value={settings.depth ?? 50} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, depth: v })} />
        <Knob label="Voices" value={settings.voices ?? 3} min={1} max={8} step={1} unit="" onChange={(v) => onChange({ ...settings, voices: v })} />
      </div>
    </div>
  );
}
