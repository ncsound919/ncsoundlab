import React, { useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { GripVertical, Power, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Knob } from './Knob';
import { useRackStore } from '../store/rackStore';

import { AdvancedEQEditor } from './AdvancedEQEditor';
import { AdvancedCompEditor } from './AdvancedCompEditor';
import { AdvancedTremoloEditor } from '../audio/dsp/Tremolo';
import { TapeEmulationEditor } from './editors/TapeEmulationEditor';
import { ReverbUI } from './editors/ReverbUI';
import { DelayEditor } from './editors/DelayEditor';
import { ChorusEditor } from './editors/ChorusEditor';
import { FlangerEditor } from './editors/FlangerEditor';
import { PhaserEditor } from './editors/PhaserEditor';
import { SaturatorEditor } from './editors/SaturatorEditor';
import { ImagerEditor } from './editors/ImagerEditor';
import { ClipperEditor } from './editors/ClipperEditor';
import { LimiterEditor } from './editors/LimiterEditor';
import { ExciterEditor } from './editors/ExciterEditor';

const PARAM_DEFS: Record<string, Record<string, { min: number; max: number; step?: number; label: string }>> = {
  eq: {
    gain: { min: -18, max: 18, step: 0.1, label: 'Gain' },
    freq: { min: 20, max: 20000, step: 1, label: 'Freq' },
    q: { min: 0.1, max: 10, step: 0.01, label: 'Q' },
  },
  compressor: {
    threshold: { min: -60, max: 0, step: 0.5, label: 'Thresh' },
    ratio: { min: 1, max: 20, step: 0.5, label: 'Ratio' },
    attack: { min: 0.1, max: 100, step: 0.1, label: 'Attack' },
    release: { min: 10, max: 1000, step: 10, label: 'Release' },
    makeup: { min: 0, max: 24, step: 0.1, label: 'Makeup' },
  },
  limiter: {
    threshold: { min: -60, max: 0, step: 0.5, label: 'Thresh' },
    release: { min: 10, max: 500, step: 1, label: 'Release' },
  },
  saturator: {
    drive: { min: 0, max: 48, step: 0.5, label: 'Drive' },
    mix: { min: 0, max: 100, step: 1, label: 'Mix' },
  },
  tape: {
    drive: { min: 0, max: 18, step: 0.5, label: 'Drive' },
    bias: { min: 0, max: 100, step: 1, label: 'Bias' },
  },
  exciter: {
    amount: { min: 0, max: 100, step: 1, label: 'Amount' },
    freq: { min: 1000, max: 12000, step: 100, label: 'Freq' },
  },
  delay: {
    mix: { min: 0, max: 100, step: 1, label: 'Mix' },
    time: { min: 10, max: 2000, step: 1, label: 'Time (ms)' },
    feedback: { min: 0, max: 90, step: 0.5, label: 'Fb' },
  },
  reverb: {
    mix: { min: 0, max: 100, step: 1, label: 'Mix' },
    decay: { min: 0.1, max: 10, step: 0.1, label: 'Decay' },
    preDelay: { min: 0, max: 200, step: 1, label: 'Pre-Delay' },
  },
  chorus: {
    rate: { min: 0.1, max: 20, step: 0.1, label: 'Rate' },
    depth: { min: 0, max: 100, step: 1, label: 'Depth' },
    mix: { min: 0, max: 100, step: 1, label: 'Mix' },
  },
  flanger: {
    rate: { min: 0.1, max: 20, step: 0.1, label: 'Rate' },
    depth: { min: 0, max: 100, step: 1, label: 'Depth' },
    feedback: { min: -100, max: 100, step: 1, label: 'Fb' },
  },
  phaser: {
    rate: { min: 0.1, max: 20, step: 0.1, label: 'Rate' },
    depth: { min: 0, max: 100, step: 1, label: 'Depth' },
    feedback: { min: -100, max: 100, step: 1, label: 'Fb' },
  },
  tremolo: {
    rate: { min: 0.1, max: 20, step: 0.1, label: 'Rate' },
    depth: { min: 0, max: 100, step: 1, label: 'Depth' },
  },
  imager: {
    width: { min: 0, max: 200, step: 1, label: 'Width' },
    midGain: { min: -6, max: 6, step: 0.1, label: 'Mid' },
    sideGain: { min: -6, max: 6, step: 0.1, label: 'Side' },
  },
  clipper: {
    threshold: { min: -24, max: 0, step: 0.5, label: 'Thresh' },
    ceil: { min: -24, max: 0, step: 0.5, label: 'Ceil' },
  },
};

interface ModuleCardProps {
  module: any;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  isLinkingMode?: boolean;
  selectedMacroIndex?: number | null;
  onAssignParam?: (moduleId: string, paramKey: string) => void;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  onRemove,
  onDuplicate,
  isLinkingMode = false,
  selectedMacroIndex = null,
  onAssignParam = (_moduleId: string, _paramKey: string) => {},
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const dragControls = useDragControls();
  const routingMode = useRackStore((s) => s.routingMode);

  const paramDefs = PARAM_DEFS[module.type] || {};
  const paramKeys = Object.keys(paramDefs);

  const renderParamKnobs = () => {
    return paramKeys.map((key) => {
      const def = paramDefs[key];
      const currentVal = module.settings[key] ?? def.min;
      const paramKey = key;

      return (
        <div
          key={key}
          className={`relative p-1 rounded-xl transition-all ${
            isLinkingMode && selectedMacroIndex !== null
              ? 'hover:ring-2 hover:ring-orange-500/70 cursor-pointer bg-white/5'
              : ''
          }`}
          onClick={() => {
            if (isLinkingMode && selectedMacroIndex !== null) {
              onAssignParam(module.id, paramKey);
            }
          }}
        >
          <Knob
            label={def.label}
            value={currentVal}
            min={def.min}
            max={def.max}
            step={def.step ?? 0.1}
            size={44}
            onChange={(v) => {
              module.onUpdate?.(module.id, { settings: { ...module.settings, [key]: v } });
            }}
          />
          {isLinkingMode && selectedMacroIndex !== null && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
          )}
        </div>
      );
    });
  };

  return (
    <Reorder.Item
      value={module}
      dragListener={false}
      dragControls={dragControls}
      className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
        !module.enabled 
          ? 'opacity-40 grayscale-[0.8] bg-black border-[#1e293b]' 
          : 'bg-black border-[#1e293b] shadow-[0_4px_24px_rgba(0,0,0,0.8),0_0_15px_rgba(37,99,235,0.2)]'
      } border`}
    >
      {module.enabled && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 via-yellow-400 to-purple-500" />
      )}
      <div className="flex items-center justify-between px-5 py-3 bg-black border-b border-[#1e293b]">
        <div className="flex items-center gap-3">
          <button
            onPointerDown={(e) => dragControls.start(e)}
            className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-white transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span className="text-base font-hiphop font-black text-white uppercase tracking-wider">
            {module.type}
          </span>
          <span className="text-[10px] text-yellow-400 font-mono font-bold">#{module.id.slice(0, 4)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => module.onUpdate?.(module.id, { enabled: !module.enabled })}
            aria-label="Toggle Power"
            className={`flex items-center gap-2 p-1.5 px-3 rounded-lg transition-all border ${
              module.enabled 
                ? 'bg-[#0f172a] text-yellow-300 border-yellow-400/50 shadow-[0_0_10px_rgba(250,204,21,0.4)]' 
                : 'bg-[#000000] text-slate-500 border-[#1e293b] hover:border-red-500/50'
            }`}
          >
            <div className={`w-2 h-2 rounded-full transition-all ${
              module.enabled 
                ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]' 
                : 'bg-red-500/50 shadow-[0_0_4px_rgba(239,68,68,0.4)]'
            }`} />
            <Power className="w-3 h-3" />
          </button>

          <div className="w-px h-5 bg-[#1e293b] mx-1"></div>

          <button
            onClick={() => onDuplicate(module.id)}
            aria-label="Duplicate Module"
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(module.id)}
            aria-label="Remove Module"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {routingMode === 'parallel' && (
        <div className="flex items-center justify-between px-5 py-3 bg-[#131316] border-b border-[#2A2A2E]/50 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold font-mono uppercase tracking-[0.15em] text-[#8E9299] bg-[#1B1B1F] px-2.5 py-1 rounded-md border border-[#2A2A2E]">
              Split Branch
            </span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Knob
                label="P-GAIN"
                value={module.parallelGain ?? 0}
                min={-40}
                max={6}
                step={0.5}
                size={34}
                onChange={(v) => module.onUpdate?.(module.id, { parallelGain: v })}
              />
              <div className="flex flex-col select-none">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Level</span>
                <span className="text-xs font-semibold font-mono text-orange-400 min-w-[50px]">
                  {(module.parallelGain ?? 0) > -40 ? `${(module.parallelGain ?? 0).toFixed(1)} dB` : '-∞ dB'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Knob
                label="P-PAN"
                value={module.parallelPan ?? 0}
                min={-1}
                max={1}
                step={0.05}
                size={34}
                onChange={(v) => module.onUpdate?.(module.id, { parallelPan: v })}
              />
              <div className="flex flex-col select-none">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Pan</span>
                <span className="text-xs font-semibold font-mono text-blue-400 min-w-[50px]">
                  {(module.parallelPan ?? 0) === 0 ? 'C' : (module.parallelPan ?? 0) < 0 ? `L${Math.abs(Math.round((module.parallelPan ?? 0) * 100))}` : `R${Math.round((module.parallelPan ?? 0) * 100)}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-[#2A2A2E] pl-4">
              <button
                onClick={() => module.onUpdate?.(module.id, { parallelMute: !module.parallelMute })}
                className={`w-9 h-7 rounded text-[10px] font-bold font-mono transition-all border ${
                  module.parallelMute
                    ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.15)]'
                    : 'bg-white/5 text-gray-400 border-transparent hover:text-white hover:bg-white/10'
                }`}
              >
                M
              </button>
              <button
                onClick={() => module.onUpdate?.(module.id, { parallelSolo: !module.parallelSolo })}
                className={`w-9 h-7 rounded text-[10px] font-bold font-mono transition-all border ${
                  module.parallelSolo
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                    : 'bg-white/5 text-gray-400 border-transparent hover:text-white hover:bg-white/10'
                }`}
              >
                S
              </button>
            </div>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="p-5 border-t border-[#2A2A2E]/50 bg-[#121215]/40">
          {module.type === 'eq' && (
            <AdvancedEQEditor moduleId={module.id} settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'compressor' && (
            <AdvancedCompEditor moduleId={module.id} settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'tremolo' && (
            <AdvancedTremoloEditor moduleId={module.id} settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'reverb' && (
            <ReverbUI settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'delay' && (
            <DelayEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'tape' && (
            <TapeEmulationEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'chorus' && (
            <ChorusEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'flanger' && (
            <FlangerEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'phaser' && (
            <PhaserEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'saturator' && (
            <SaturatorEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'imager' && (
            <ImagerEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'clipper' && (
            <ClipperEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'limiter' && (
            <LimiterEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}
          {module.type === 'exciter' && (
            <ExciterEditor settings={module.settings} onChange={(s) => module.onUpdate?.(module.id, { settings: s })} />
          )}

          {!['eq', 'compressor', 'tremolo', 'reverb', 'delay', 'tape', 'chorus', 'flanger', 'phaser', 'saturator', 'imager', 'clipper', 'limiter', 'exciter'].includes(module.type) && (
            <div className="flex flex-wrap gap-4 justify-start">
              {renderParamKnobs()}
            </div>
          )}

          {isLinkingMode && selectedMacroIndex !== null && (
            <div className="mt-4 text-[10px] text-orange-400/80 font-mono bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-1.5 text-center">
              🔗 Click any <strong>parameter knob</strong> above to link it to <strong>Macro {selectedMacroIndex + 1}</strong>
            </div>
          )}
        </div>
      )}
    </Reorder.Item>
  );
};
