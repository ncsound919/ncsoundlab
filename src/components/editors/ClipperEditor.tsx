import React from 'react';
import { Knob } from '../Knob';

export function ClipperEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-widest">SOFT & HARD PEAK CLIPPER</span>
      <div className="grid grid-cols-4 gap-4">
        <Knob label="Thresh" value={settings.threshold ?? -3} min={-24} max={0} step={0.5} unit="dB" onChange={(v) => onChange({ ...settings, threshold: v })} />
        <Knob label="Ceil" value={settings.ceil ?? -0.1} min={-24} max={0} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, ceil: v })} />
        <Knob label="Softness" value={settings.knee ?? 50} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, knee: v })} />
        <Knob label="Out Gain" value={settings.output ?? 0} min={-12} max={12} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, output: v })} />
      </div>
    </div>
  );
}
