import React, { useState } from 'react';
import { Knob } from '../Knob';
import { TAPE_DELAY_PRESETS } from '../../lib/convolutionAndTapePresets';
import { TapeDelayPreset } from '../../types';
import { Activity, Disc } from 'lucide-react';

export function DelayEditor({
  settings,
  onChange,
}: {
  settings: any;
  onChange: (s: any) => void;
}) {
  const activePreset: TapeDelayPreset =
    settings.tapeDelayPreset || TAPE_DELAY_PRESETS[0];

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredPresets =
    selectedCategory === 'all'
      ? TAPE_DELAY_PRESETS
      : TAPE_DELAY_PRESETS.filter((p) => p.category === selectedCategory);

  const updatePreset = (nextPreset: TapeDelayPreset) => {
    onChange({
      ...settings,
      time: nextPreset.heads.timesMs[0] || 250,
      feedback: Math.round(nextPreset.feedback.amount * 100),
      tapeDelayPreset: nextPreset,
    });
  };

  const updatePreFilter = (preFilter: Partial<TapeDelayPreset['preFilter']>) => {
    updatePreset({
      ...activePreset,
      preFilter: { ...activePreset.preFilter, ...preFilter },
    });
  };

  const updateSaturation = (
    saturation: Partial<TapeDelayPreset['saturation']>
  ) => {
    updatePreset({
      ...activePreset,
      saturation: { ...activePreset.saturation, ...saturation },
    });
  };

  const updateHeads = (heads: Partial<TapeDelayPreset['heads']>) => {
    updatePreset({
      ...activePreset,
      heads: { ...activePreset.heads, ...heads },
    });
  };

  const updateModulation = (
    modulation: Partial<TapeDelayPreset['modulation']>
  ) => {
    updatePreset({
      ...activePreset,
      modulation: { ...activePreset.modulation, ...modulation },
    });
  };

  const updateFeedback = (feedback: Partial<TapeDelayPreset['feedback']>) => {
    updatePreset({
      ...activePreset,
      feedback: { ...activePreset.feedback, ...feedback },
    });
  };

  const updateMix = (mix: Partial<TapeDelayPreset['mix']>) => {
    updatePreset({
      ...activePreset,
      mix: { ...activePreset.mix, ...mix },
    });
  };

  const handleSelectPreset = (preset: TapeDelayPreset) => {
    onChange({
      ...settings,
      time: preset.heads.timesMs[0] || 250,
      feedback: Math.round(preset.feedback.amount * 100),
      tapeDelayPreset: preset,
    });
  };

  return (
    <div className="bg-[#0D0D10] rounded-2xl border border-[#27272A] p-5 space-y-6 text-[#E4E4E7] shadow-2xl relative overflow-hidden">
      {/* Top Header & Preset Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#27272A] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Disc className="w-4 h-4 animate-spin-slow" />
            </span>
            <h3 className="text-sm font-bold tracking-wider text-white uppercase font-mono">
              MULTI-HEAD TAPE DELAY DSP
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Analog Tape Magnetics • Wow & Flutter Mod • Feedback Sculpting
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Category Filter */}
          <div className="flex bg-[#18181B] border border-[#27272A] rounded-xl p-1 text-[11px] font-mono">
            {['all', 'utility', 'space', 'character', 'fx'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg transition-all capitalize ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-black font-bold shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Preset Selector Dropdown */}
          <select
            value={activePreset.id}
            onChange={(e) => {
              const p = TAPE_DELAY_PRESETS.find(
                (pr) => pr.id === e.target.value
              );
              if (p) handleSelectPreset(p);
            }}
            className="bg-[#18181B] border border-amber-500/30 text-amber-300 text-xs font-mono font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {filteredPresets.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name} ({pr.category.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* DSP Signal Flow Pipeline Visualizer */}
      <div className="bg-[#121215] border border-[#27272A] rounded-xl p-3 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 gap-2">
        <span className="flex items-center gap-1 text-amber-400 font-bold">
          <Activity className="w-3.5 h-3.5" />
          SIGNAL FLOW:
        </span>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
            Pre-Filter
          </span>
          <span>→</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
            Tape Saturation
          </span>
          <span>→</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
            {activePreset.heads.count}-Head Delay
          </span>
          <span>→</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
            Wow / Flutter
          </span>
          <span>→</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
            Feedback Sculptor
          </span>
        </div>
      </div>

      {/* Grid of Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Module 1: Pre-Filter & Saturation */}
        <div className="bg-[#141417] border border-[#27272A] rounded-xl p-3.5 space-y-3">
          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block border-b border-[#27272A] pb-1.5">
            1. Pre-Filter & Drive
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="HP Cut"
              value={activePreset.preFilter.hpFreq}
              min={20}
              max={500}
              step={5}
              unit="Hz"
              onChange={(v) => updatePreFilter({ hpFreq: v })}
            />
            <Knob
              label="LP Cut"
              value={activePreset.preFilter.lpFreq}
              min={1000}
              max={20000}
              step={100}
              unit="Hz"
              onChange={(v) => updatePreFilter({ lpFreq: v })}
            />
            <Knob
              label="Tape Drive"
              value={activePreset.saturation.drive}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => updateSaturation({ drive: v })}
            />
            <Knob
              label="Bias Tilt"
              value={activePreset.saturation.biasTilt}
              min={-1}
              max={1}
              step={0.05}
              onChange={(v) => updateSaturation({ biasTilt: v })}
            />
          </div>
        </div>

        {/* Module 2: Multi-Head Delays */}
        <div className="bg-[#141417] border border-[#27272A] rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#27272A] pb-1.5">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
              2. Virtual Heads
            </span>
            <div className="flex bg-[#1E1E22] rounded-lg p-0.5 border border-[#27272A] text-[10px]">
              {[1, 2, 3, 4].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => updateHeads({ count: cnt })}
                  className={`px-1.5 py-0.5 rounded ${
                    activePreset.heads.count === cnt
                      ? 'bg-amber-500 text-black font-bold'
                      : 'text-zinc-400'
                  }`}
                >
                  {cnt}H
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="Head 1 (ms)"
              value={activePreset.heads.timesMs[0] || 250}
              min={20}
              max={2000}
              step={5}
              unit="ms"
              onChange={(v) => {
                const times = [...activePreset.heads.timesMs];
                times[0] = v;
                updateHeads({ timesMs: times });
              }}
            />
            <Knob
              label="Head 2 (ms)"
              value={activePreset.heads.timesMs[1] || 500}
              min={20}
              max={2000}
              step={5}
              unit="ms"
              onChange={(v) => {
                const times = [...activePreset.heads.timesMs];
                times[1] = v;
                updateHeads({ timesMs: times });
              }}
            />
          </div>
        </div>

        {/* Module 3: Wow & Flutter */}
        <div className="bg-[#141417] border border-[#27272A] rounded-xl p-3.5 space-y-3">
          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block border-b border-[#27272A] pb-1.5">
            3. Wow & Flutter
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="Wow Depth"
              value={activePreset.modulation.wowDepthMs}
              min={0}
              max={10}
              step={0.1}
              unit="ms"
              onChange={(v) => updateModulation({ wowDepthMs: v })}
            />
            <Knob
              label="Wow Rate"
              value={activePreset.modulation.wowRateHz}
              min={0.1}
              max={2}
              step={0.05}
              unit="Hz"
              onChange={(v) => updateModulation({ wowRateHz: v })}
            />
            <Knob
              label="Flutter Depth"
              value={activePreset.modulation.flutterDepthMs}
              min={0}
              max={5}
              step={0.05}
              unit="ms"
              onChange={(v) => updateModulation({ flutterDepthMs: v })}
            />
            <Knob
              label="Flutter Rate"
              value={activePreset.modulation.flutterRateHz}
              min={2}
              max={12}
              step={0.2}
              unit="Hz"
              onChange={(v) => updateModulation({ flutterRateHz: v })}
            />
          </div>
        </div>

        {/* Module 4: Feedback Sculptor & Mix */}
        <div className="bg-[#141417] border border-[#27272A] rounded-xl p-3.5 space-y-3">
          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block border-b border-[#27272A] pb-1.5">
            4. Feedback & Mix
          </span>
          <div className="grid grid-cols-3 gap-2">
            <Knob
              label="Feedback"
              value={Math.round(activePreset.feedback.amount * 100)}
              min={0}
              max={95}
              step={1}
              unit="%"
              onChange={(v) => updateFeedback({ amount: v / 100 })}
            />
            <Knob
              label="Loop Filter"
              value={activePreset.feedback.filterFreq}
              min={500}
              max={15000}
              step={200}
              unit="Hz"
              onChange={(v) => updateFeedback({ filterFreq: v })}
            />
            <Knob
              label="Wet Mix"
              value={Math.round(activePreset.mix.wet * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => updateMix({ wet: v / 100, dry: 1 - v / 200 })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
