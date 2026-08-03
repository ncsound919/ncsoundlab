import React from 'react';
import { Knob } from '../Knob';

export function LimiterEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-rose-500 uppercase tracking-widest">BRICKWALL MASTERING LIMITER</span>
      <div className="grid grid-cols-4 gap-4">
        <Knob label="Thresh" value={settings.threshold ?? -1} min={-60} max={0} step={0.5} unit="dB" onChange={(v) => onChange({ ...settings, threshold: v })} />
        <Knob label="Release" value={settings.release ?? 100} min={10} max={500} step={1} unit="ms" onChange={(v) => onChange({ ...settings, release: v })} />
        <Knob label="Ceiling" value={settings.ceiling ?? -0.1} min={-6} max={0} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, ceiling: v })} />
        <Knob label="ISP Look" value={settings.lookahead ?? 2} min={0} max={10} step={0.1} unit="ms" onChange={(v) => onChange({ ...settings, lookahead: v })} />
      </div>
    </div>
  );
}
