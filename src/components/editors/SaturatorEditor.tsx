import React from 'react';
import { Knob } from '../Knob';

export function SaturatorEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-orange-500 uppercase tracking-widest">HARMONIC DRIVE & TUBE WARMTH</span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Knob label="Drive" value={settings.drive ?? 12} min={0} max={48} step={0.5} unit="dB" onChange={(v) => onChange({ ...settings, drive: v })} />
        <Knob label="Mix" value={settings.mix ?? 100} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, mix: v })} />
        <Knob label="Tone" value={settings.tone ?? 50} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, tone: v })} />
        <Knob label="Output" value={settings.output ?? 0} min={-18} max={18} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, output: v })} />
      </div>
      <div className="pt-2 border-t border-[#1F1F24]">
        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-3">Harmonic Generation</span>
        <div className="grid grid-cols-2 gap-4 max-w-[50%]">
          <Knob label="2nd Order" value={settings.harmonic2nd ?? 0} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, harmonic2nd: v })} />
          <Knob label="3rd Order" value={settings.harmonic3rd ?? 0} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, harmonic3rd: v })} />
        </div>
      </div>
    </div>
  );
}
