import React from 'react';
import { Knob } from '../Knob';

export function ImagerEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-teal-400 uppercase tracking-widest">MID-SIDE STEREO FIELD WIDENER</span>
      <div className="grid grid-cols-4 gap-4">
        <Knob label="Width" value={settings.width ?? 130} min={0} max={200} step={1} unit="%" onChange={(v) => onChange({ ...settings, width: v })} />
        <Knob label="Mid Gain" value={settings.midGain ?? 0} min={-6} max={6} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, midGain: v })} />
        <Knob label="Side Gain" value={settings.sideGain ?? 0} min={-6} max={6} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, sideGain: v })} />
        <Knob label="Bass Mono" value={settings.bassMonoCutoff ?? 120} min={20} max={400} step={5} unit="Hz" onChange={(v) => onChange({ ...settings, bassMonoCutoff: v })} />
      </div>
    </div>
  );
}
