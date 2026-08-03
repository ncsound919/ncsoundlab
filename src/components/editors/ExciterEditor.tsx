import React from 'react';
import { Knob } from '../Knob';

export function ExciterEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">HARMONIC EXCITER & AURAL CLARITY</span>
      <div className="grid grid-cols-4 gap-4">
        <Knob label="Amount" value={settings.amount ?? 35} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, amount: v })} />
        <Knob label="Freq" value={settings.freq ?? 4000} min={1000} max={12000} step={100} unit="Hz" onChange={(v) => onChange({ ...settings, freq: v })} />
        <Knob label="Harmonics" value={settings.harmonics ?? 2} min={1} max={5} step={1} unit="" onChange={(v) => onChange({ ...settings, harmonics: v })} />
        <Knob label="Mix" value={settings.mix ?? 50} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, mix: v })} />
      </div>
    </div>
  );
}
