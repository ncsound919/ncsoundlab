import React, { useState, useEffect } from 'react';
import { Reorder } from 'motion/react';
import { ModuleCard } from './ModuleCard';
import { useRackStore } from '../store/rackStore';
import { PresetBrowser } from './PresetBrowser';
import { ModuleType } from '../types';
import { Fader } from './Fader';
import { audioEngine } from '../lib/audioEngine';
import { 
  Plus, 
  RotateCcw, 
  RotateCw, 
  Layers, 
  Sliders, 
  Sparkles, 
  Zap, 
  ShieldCheck, 
  Workflow,
  Maximize2,
  X
} from 'lucide-react';

const MODULE_OPTIONS: { type: ModuleType; label: string; desc: string }[] = [
  { type: 'eq', label: 'Parametric EQ', desc: '5-Band Surgical EQ with Realtime FFT' },
  { type: 'compressor', label: 'Pro Compressor', desc: 'VCA/Opto/FET Dynamics Processor' },
  { type: 'limiter', label: 'Mastering Limiter', desc: 'True-Peak Brickwall Ceiling' },
  { type: 'tape', label: 'Tape Saturator', desc: 'Analog Magnetics & Wow/Flutter' },
  { type: 'saturator', label: 'Harmonic Drive', desc: 'Tube Saturation & Overdrive' },
  { type: 'clipper', label: 'Peak Clipper', desc: 'Hard & Soft Harmonic Wave Clipper' },
  { type: 'exciter', label: 'Aural Exciter', desc: 'High-Frequency Harmonic Clarity' },
  { type: 'delay', label: 'Stereo Echo Delay', desc: 'Ping-Pong & Filtered Feedback Delay' },
  { type: 'reverb', label: 'Convolution Reverb', desc: 'Algorithmic Hall & Plate Space' },
  { type: 'chorus', label: 'Ensemble Chorus', desc: 'Multi-Voice Dimensional Chorus' },
  { type: 'flanger', label: 'Jet Flanger', desc: 'Through-Zero Comb Filtering' },
  { type: 'phaser', label: 'Optical Phaser', desc: 'Multi-Stage Allpass Phase Sweeper' },
  { type: 'tremolo', label: 'LFO Tremolo', desc: 'Rhythmic Volume Modulation' },
  { type: 'imager', label: 'Stereo Imager', desc: 'Mid-Side Stereo Width Spreader' },
];

export const StudioRack: React.FC = () => {
  const {
    modules,
    setModules,
    addModule,
    removeModule,
    duplicateModule,
    updateModule,
    undo,
    redo,
    history,
    activeAbState,
    switchToA,
    switchToB,
    copyToA,
    copyToB,
    routingMode,
    setRoutingMode,
    zeroLatency,
    setZeroLatency,
  } = useRackStore();

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [macroValues, setMacroValues] = useState<number[]>([50, 50, 50, 50]);

  // Universalize: the StudioRack drives the real master audio chain.
  // Zero-latency mode bypasses the rack (inserts are bypassed to avoid latency).
  // Debounced so continuous knob-drag updates don't rebuild the node graph per frame.
  // Note: the rack intentionally persists across tab switches — it is a global
  // master-bus processor, not scoped to the mixer view.
  useEffect(() => {
    const t = setTimeout(() => {
      audioEngine.setMasterRack(zeroLatency ? [] : modules);
    }, 100);
    return () => clearTimeout(t);
  }, [modules, zeroLatency]);

  const handleMacroChange = (index: number, value: number) => {
    const updated = [...macroValues];
    updated[index] = value;
    setMacroValues(updated);

    // Scaling tied parameters dynamically
    const ratio = value / 100;
    modules.forEach((mod) => {
      if (mod.type === 'compressor') {
        updateModule(mod.id, {
          settings: { ...mod.settings, makeupGain: ratio * 12 },
        });
      } else if (mod.type === 'saturator' || mod.type === 'tape') {
        updateModule(mod.id, {
          settings: { ...mod.settings, drive: ratio * 18 },
        });
      } else if (mod.type === 'imager') {
        updateModule(mod.id, {
          settings: { ...mod.settings, width: 100 + ratio * 100 },
        });
      }
    });
  };

  return (
    <div className={isFullscreen ? "fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-4 md:p-8 flex items-center justify-center overflow-auto" : ""}>
      <div className={`w-full mx-auto p-2 flex flex-col gap-6 text-[#E2E8F0] select-none ${isFullscreen ? 'max-w-7xl' : 'max-w-7xl'}`}>
        {/* Compact Studio Rack Toolbar */}
        <div className="bg-black border border-[#1e293b] rounded-2xl p-3.5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-yellow-400 to-purple-500"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500 flex items-center justify-center text-yellow-400 shadow-[0_0_10px_rgba(37,99,235,0.4)]">
                <Zap className="w-4 h-4 animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white font-urban tracking-wider uppercase">Signal Routing:</span>
                <div className="flex bg-[#000000] border border-[#1e293b] rounded-lg p-0.5 text-[10px] font-mono">
                <button
                  onClick={() => setRoutingMode('serial')}
                  className={`px-2.5 py-1 rounded font-black uppercase transition-all ${
                    routingMode === 'serial' ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Serial Chain
                </button>
                <button
                  onClick={() => setRoutingMode('parallel')}
                  className={`px-2.5 py-1 rounded font-black uppercase transition-all ${
                    routingMode === 'parallel' ? 'bg-yellow-400 text-black shadow-[0_0_10px_rgba(250,204,21,0.5)]' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Parallel Matrix
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Undo/Redo */}
            <div className="flex items-center bg-[#000000] border border-[#1e293b] rounded-xl p-1">
              <button
                onClick={undo}
                disabled={history.past.length === 0}
                className="p-1.5 rounded-lg text-white hover:text-yellow-400 disabled:opacity-30 transition-colors"
                title="Undo (Ctrl+Z)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={history.future.length === 0}
                className="p-1.5 rounded-lg text-white hover:text-yellow-400 disabled:opacity-30 transition-colors"
                title="Redo (Ctrl+Y)"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* A/B Comparison */}
            <div className="flex items-center bg-[#000000] border border-[#1e293b] rounded-xl p-1 gap-1">
              <button
                onClick={switchToA}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-black transition-all ${
                  activeAbState === 'A'
                    ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.5)]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                A
              </button>
              <button
                onClick={switchToB}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-black transition-all ${
                  activeAbState === 'B'
                    ? 'bg-yellow-400 text-black shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                B
              </button>
              <button
                onClick={activeAbState === 'A' ? copyToB : copyToA}
                className="px-2 py-1 text-[10px] font-mono text-purple-300 hover:text-white uppercase font-black tracking-wider"
                title="Copy current state to other slot"
              >
                Copy &rarr; {activeAbState === 'A' ? 'B' : 'A'}
              </button>
            </div>

            {/* Routing Mode */}
            <div className="flex items-center bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl p-1 gap-1">
              <button
                onClick={() => setRoutingMode('serial')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                  routingMode === 'serial'
                    ? 'bg-yellow-400 text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Workflow className="w-3 h-3" />
                Serial
              </button>
              <button
                onClick={() => setRoutingMode('parallel')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                  routingMode === 'parallel'
                    ? 'bg-yellow-400 text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3" />
                Parallel Split
              </button>
            </div>

            {/* Zero Latency */}
            <button
              onClick={() => setZeroLatency(!zeroLatency)}
              className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                zeroLatency
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_12px_rgba(37,99,235,0.2)]'
                  : 'bg-[#1A1A1E] border-[#2A2A2E] text-gray-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{zeroLatency ? '0-Latency Active' : 'High Quality FFT'}</span>
            </button>

            {/* Presets Manager Toggle */}
            <button
              onClick={() => setShowPresets(!showPresets)}
              className={`px-3.5 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                showPresets
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-[#1A1A1E] border-[#2A2A2E] text-blue-400 hover:border-blue-500'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Presets
            </button>
            
            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] text-slate-400 hover:text-white transition-colors flex items-center justify-center"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Studio Rack"}
            >
              {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* Global Macro Controllers */}
        <div className="mt-5 pt-4 border-t border-[#2A2A2E]/50 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Macro 1: Saturation', minLabel: 'Clean', maxLabel: 'Driven', hexColor: '#2563eb' },
            { label: 'Macro 2: Dynamics', minLabel: 'Loose', maxLabel: 'Tight', hexColor: '#eab308' },
            { label: 'Macro 3: Stereo Width', minLabel: 'Mono', maxLabel: 'Wide', hexColor: '#0ea5e9' },
            { label: 'Macro 4: Clarity/Air', minLabel: 'Dark', maxLabel: 'Bright', hexColor: '#10b981' },
          ].map((macro, idx) => (
            <div key={idx} className="bg-[#101012] border border-[#232328] rounded-xl p-4 flex flex-col items-center justify-between shadow-md group">
              <Fader
                label={macro.label}
                value={macroValues[idx]}
                min={0}
                max={100}
                step={1}
                unit="%"
                color={macro.hexColor}
                onChange={(v) => handleMacroChange(idx, Math.round(v))}
                size={120}
              />
              <div className="w-full flex justify-between text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1 px-2">
                <span>{macro.minLabel}</span>
                <span>{macro.maxLabel}</span>
              </div>
              <div className="mt-2 text-center">
                <span className="text-[11px] font-mono font-bold text-white px-2 py-0.5 bg-[#18181c] rounded border border-[#27272a]">{macroValues[idx]}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preset Browser Drawer */}
      {showPresets && <PresetBrowser />}

      {/* Add Module Bar */}
      <div className="relative">
        <div className="flex items-center justify-between bg-[#121215] border border-[#2A2A2E] rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-white">
              Active Processing Units ({modules.length})
            </span>
          </div>

          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-yellow-400 text-black font-bold text-xs uppercase tracking-wider hover:opacity-90 shadow-[0_0_16px_rgba(37,99,235,0.3)] transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Hardware Module
          </button>
        </div>

        {/* Dropdown Menu */}
        {showAddMenu && (
          <div className="absolute top-full right-0 mt-2 w-96 bg-[#16161A] border border-[#3E3E4A] rounded-2xl p-3 shadow-2xl z-50 grid grid-cols-1 gap-1 max-h-96 overflow-y-auto">
            {MODULE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => {
                  addModule(opt.type);
                  setShowAddMenu(false);
                }}
                className="flex flex-col text-left p-3 rounded-xl hover:bg-[#25252A] transition-colors border border-transparent hover:border-[#3E3E4A] group"
              >
                <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors uppercase tracking-wide">
                  {opt.label}
                </span>
                <span className="text-[10px] text-gray-400 font-sans mt-0.5">
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reorderable Hardware Rack Stack */}
      {modules.length === 0 ? (
        <div className="bg-[#121215] border border-dashed border-[#2A2A2E] rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <Zap className="w-10 h-10 text-gray-600 mb-3" />
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Rack is Empty</h3>
          <p className="text-xs text-gray-500 max-w-md mt-1 mb-4">
            Click "Add Hardware Module" above or select a preset from the Preset Browser to initialize your analog mastering signal path.
          </p>
          <button
            onClick={() => setShowAddMenu(true)}
            className="px-4 py-2 rounded-xl bg-[#1F1F24] border border-[#2A2A2E] hover:border-blue-500/50 text-xs font-bold text-blue-400 uppercase tracking-wider"
          >
            + Add First Module
          </button>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={modules}
          onReorder={(newOrder) => setModules(newOrder)}
          className="flex flex-col gap-4"
        >
          {modules.map((m) => (
            <ModuleCard
              key={m.id}
              module={{
                ...m,
                onUpdate: (id: string, updates: Partial<typeof m>) => updateModule(id, updates),
              }}
              onRemove={removeModule}
              onDuplicate={duplicateModule}
            />
          ))}
        </Reorder.Group>
      )}
    </div>
    </div>
  );
};
