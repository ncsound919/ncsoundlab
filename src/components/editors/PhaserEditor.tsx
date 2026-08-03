import React from 'react';
import { Knob } from '../Knob';

export function PhaserEditor({ settings, onChange }: { settings: any; onChange: (s: any) => void }) {
  return (
    <div className="bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 space-y-4">
      <span className="text-xs font-mono font-bold text-pink-400 uppercase tracking-widest">MULTI-STAGE OPTICAL PHASER</span>
      <div className="grid grid-cols-4 gap-4">
        <Knob label="Rate" value={settings.rate ?? 0.8} min={0.1} max={20} step={0.1} unit="Hz" onChange={(v) => onChange({ ...settings, rate: v })} />
        <Knob label="Depth" value={settings.depth ?? 80} min={0} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, depth: v })} />
        <Knob label="Feedback" value={settings.feedback ?? 40} min={-100} max={100} step={1} unit="%" onChange={(v) => onChange({ ...settings, feedback: v })} />
        <Knob label="Stages" value={settings.stages ?? 6} min={2} max={12} step={2} unit="" onChange={(v) => onChange({ ...settings, stages: v })} />
      </div>
    </div>
  );
}
