import React from 'react';
import { Knob } from '../Knob';

export function TapeEmulationEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">
        ANALOG TAPE SATURATION & TAPE FLUTTER
      </span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Knob label="Drive" value={settings.drive ?? 3} min={0} max={18} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, drive: v })} />
        <Knob label="Bias" value={settings.bias ?? 50} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, bias: v })} />
        <Knob label="Flutter" value={settings.wowFlutter ?? 15} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, wowFlutter: v })} />
        <Knob label="Head Bump" value={settings.headBump ?? 2} min={0} max={6} step={0.1} unit="dB" onChange={(v) => onChange({ ...settings, headBump: v })} />
      </div>
    </div>
  );
}
