/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, 
  Square, 
  Repeat, 
  Volume2, 
  Sliders, 
  Clock, 
  Scissors, 
  Activity,
  ArrowRight,
  Maximize2,
  X
} from 'lucide-react';
import { SoundLayer } from '../types';
import { Fader } from './Fader';
import { Knob } from './Knob';

interface LayerMixerProps {
  layers: SoundLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (id: string, updates: Partial<SoundLayer>) => void;
  onPlayLayer: (layer: SoundLayer) => void;
  onPlayAll: () => void;
  onStop: () => void;
  isPlaying: boolean;
  loopEnabled: boolean;
  onToggleLoop: () => void;
  masterLevel: number;
  onUpdateMasterLevel: (level: number) => void;
  onDuplicateLayer?: (id: string) => void;
  onCopyFX?: (id: string) => void;
  onPasteFX?: (id: string) => void;
  onRandomizePitchPan?: (id: string) => void;
  onReorderLayer?: (id: string, direction: 'up' | 'down') => void;
}

export function LayerMixer({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onPlayLayer,
  onStop,
  onPlayAll,
  isPlaying,
  loopEnabled,
  onToggleLoop,
  masterLevel,
  onUpdateMasterLevel,
  onDuplicateLayer,
  onCopyFX,
  onPasteFX,
  onRandomizePitchPan,
  onReorderLayer,
}: LayerMixerProps) {
  const [activeMeterVals, setActiveMeterVals] = useState<{ [id: string]: number }>({});
  const animationRef = useRef<number | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dynamic VU Meter simulation for playing tracks
  useEffect(() => {
    if (!isPlaying) {
      setActiveMeterVals({});
      return;
    }

    const updateMeters = () => {
      const next: { [id: string]: number } = {};
      layers.forEach(layer => {
        if (layer.enabled && !layer.muted) {
          // Simulate dynamic peaks around their gain value
          const randomPeak = 0.7 + Math.random() * 0.3;
          next[layer.id] = layer.gain * randomPeak;
        } else {
          next[layer.id] = 0;
        }
      });
      setActiveMeterVals(next);
      animationRef.current = requestAnimationFrame(updateMeters);
    };

    updateMeters();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, layers]);

  return (
    <div className={isFullscreen ? "fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-4 md:p-8 flex flex-col items-center justify-center overflow-hidden" : ""}>
      <div className={`w-full bg-[#0a0a0d] border border-[#1f1f23] rounded-2xl shadow-2xl p-5 relative overflow-hidden ${isFullscreen ? 'max-w-7xl h-full flex flex-col' : ''}`}>
        {/* Console Frame Screws */}
        <div className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-[#202024] border border-[#111] shadow-inner flex items-center justify-center"><div className="w-1.5 h-0.5 bg-[#444] rotate-45" /></div>
        <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#202024] border border-[#111] shadow-inner flex items-center justify-center"><div className="w-1.5 h-0.5 bg-[#444] -rotate-45" /></div>
        <div className="absolute bottom-3 left-3 w-2.5 h-2.5 rounded-full bg-[#202024] border border-[#111] shadow-inner flex items-center justify-center"><div className="w-1.5 h-0.5 bg-[#444] -rotate-45" /></div>
        <div className="absolute bottom-3 right-3 w-2.5 h-2.5 rounded-full bg-[#202024] border border-[#111] shadow-inner flex items-center justify-center"><div className="w-1.5 h-0.5 bg-[#444] rotate-45" /></div>

        {/* Header Info Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-[#1e293b] pb-4 mb-4 gap-3 bg-black">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-white text-[11px] font-black font-urban uppercase tracking-[0.2em]">
              <Sliders size={14} className="text-yellow-400" />
              CONSOLE_BOARD_STATION
              <span className="text-[9px] bg-blue-600/30 text-yellow-300 px-2 py-0.5 rounded border border-blue-500 font-mono font-bold">
                NC_TARHEEL_MIXER_PRO
              </span>
            </div>
            <p className="text-[10px] text-slate-300 mt-0.5 font-sans font-medium">
              Adjust channel faders, pan placement, crop boundaries, & align triggers on the master playback timeline.
            </p>
          </div>

<div className="flex items-center gap-2 mt-3 sm:mt-0">
            {layers.some(l => l.muted) && (
              <button 
                onClick={() => layers.forEach(l => { if (l.muted) onUpdateLayer(l.id, { muted: false }) })}
                className="px-3 py-1 bg-red-900/30 text-red-400 hover:bg-red-800/50 hover:text-red-300 border border-red-900/50 rounded text-[10px] font-bold uppercase transition-colors"
              >
                Clear Mutes
              </button>
            )}
            {layers.some(l => l.soloed) && (
              <button 
                onClick={() => layers.forEach(l => { if (l.soloed) onUpdateLayer(l.id, { soloed: false }) })}
                className="px-3 py-1 bg-yellow-900/30 text-yellow-500 hover:bg-yellow-800/50 hover:text-yellow-400 border border-yellow-900/50 rounded text-[10px] font-bold uppercase transition-colors"
              >
                Clear Solos
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] text-slate-400 hover:text-white transition-colors flex items-center justify-center"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mixer"}
            >
              {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
            </button>

            {/* Global Board Playback Panel */}
            <div className="flex items-center gap-2 bg-[#000000] border border-[#1e293b] px-3 py-1.5 rounded-xl shadow-inner">
          <button
            onClick={onToggleLoop}
            className={`p-2 rounded-lg transition-all border flex items-center justify-center ${
              loopEnabled 
                ? 'bg-blue-600/30 border-blue-500 text-yellow-300 shadow-[0_0_12px_rgba(37,99,235,0.4)]' 
                : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:text-white'
            }`}
            title={loopEnabled ? "Disable Loop Playback" : "Enable Loop Playback"}
          >
            <Repeat size={14} className={loopEnabled ? "animate-spin-slow" : ""} />
          </button>

          <button
            onClick={onStop}
            className="p-2 rounded-lg bg-[#0f172a] hover:bg-red-600 hover:text-white border border-[#1e293b] text-red-400 transition-colors flex items-center justify-center"
            title="Stop All Sources Instantly"
          >
            <Square size={14} fill="currentColor" />
          </button>

          <button
            onClick={onPlayAll}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md ${
              isPlaying 
                ? 'bg-yellow-400 text-black shadow-yellow-400/40 font-black' 
                : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 shadow-blue-600/30'
            }`}
            title="Trigger All Enabled Tracks Combined"
          >
            <Play size={12} fill="currentColor" />
            <span>{isPlaying ? 'Playing Mix' : 'Play Mix'}</span>
          </button>
        </div>
        </div>
      </div>

      {/* Mixer Channel Grid */}
      <div className="flex flex-row overflow-x-auto gap-4 pb-4 no-scrollbar items-stretch">
        
        {/* Layer Strips */}
        {layers.map((layer, index) => {
          const isSelected = selectedLayerId === layer.id;
          const peak = activeMeterVals[layer.id] || 0;
          const displayNum = (index + 1).toString().padStart(2, '0');

          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer(layer.id)}
              className={`w-44 flex-shrink-0 flex flex-col justify-between bg-black border rounded-2xl p-3 transition-all cursor-pointer group select-none relative ${
                isSelected 
                  ? 'border-blue-500 bg-[#000000] shadow-[0_0_20px_rgba(37,99,235,0.45)]' 
                  : 'border-[#1e293b] hover:border-blue-900'
              } ${!layer.enabled ? 'opacity-40 hover:opacity-75' : ''}`}
            >
              {/* Channel Strip Top Details */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono font-black text-yellow-400">CH {displayNum}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onReorderLayer?.(layer.id, 'up'); }}
                      disabled={index === 0}
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed ml-1"
                      title="Move Layer Up"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onReorderLayer?.(layer.id, 'down'); }}
                      disabled={index === layers.length - 1}
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Layer Down"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                  </div>
                  
                  {/* Channel Power / LED Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateLayer(layer.id, { enabled: !layer.enabled });
                    }}
                    aria-label={layer.enabled ? "Bypass Track" : "Activate Track"}
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                      layer.enabled
                        ? 'bg-yellow-400/30 border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]'
                        : 'bg-[#0f172a] border-[#3f3f46]'
                    }`}
                    title={layer.enabled ? "Bypass Track" : "Activate Track"}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${layer.enabled ? 'bg-yellow-400' : 'bg-slate-600'}`} />
                  </button>
                </div>

                <div className="flex flex-col truncate">
                  <span className="text-[11px] font-black font-urban text-white uppercase truncate tracking-wide" title={layer.name}>
                    {layer.name}
                  </span>
                  <span className="text-[9px] text-purple-300 uppercase tracking-widest font-mono font-bold">
                    {layer.type === 'sample' ? '💿 SAMPLE' : '🎹 SYNTH'}
                  </span>
                </div>
              </div>

              {/* Mute and Solo Rack Buttons */}
              <div className="grid grid-cols-3 gap-1 mb-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateLayer(layer.id, { muted: !layer.muted });
                  }}
                  className={`py-1 rounded text-[9px] font-mono font-extrabold flex items-center justify-center border transition-all ${
                    layer.muted
                      ? 'bg-red-950/40 border-red-500/60 text-red-400 shadow-[0_0_6px_rgba(239,68,68,0.2)]'
                      : 'bg-[#161619] border-[#222] text-gray-500 hover:text-gray-300'
                  }`}
                  title="Mute Channel"
                >
                  MUTE
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateLayer(layer.id, { soloed: !layer.soloed });
                  }}
                  className={`py-1 rounded text-[9px] font-mono font-extrabold flex items-center justify-center border transition-all ${
                    layer.soloed
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.2)]'
                      : 'bg-[#161619] border-[#222] text-gray-500 hover:text-gray-300'
                  }`}
                  title="Solo Channel"
                >
                  SOLO
                </button>
              </div>

              {/* Alignment Control: Trigger Delay Knob */}
              <div className="bg-[#0c0c0e] border border-[#1b1b1e] rounded-xl p-3 mb-3.5 flex flex-col items-center justify-center relative">
                <div className="flex justify-center mb-1">
                  <Knob 
                    label="Trigger Delay" 
                    value={layer.startTimeOffset ?? 0} 
                    min={0.0} 
                    max={3.0} 
                    step={0.05} 
                    unit="s"
                    color="#f97316" 
                    onChange={(v) => onUpdateLayer(layer.id, { startTimeOffset: v })} 
                    size={48} 
                  />
                </div>
              </div>

              {/* Crop Boundaries Monitor */}
              <div className="bg-[#0c0c0e] border border-[#1b1b1e] rounded-xl p-2 mb-3.5 space-y-1 relative">
                <div className="flex items-center justify-between text-[9px] font-bold text-[#888]">
                  <span className="flex items-center gap-0.5"><Scissors size={9} /> CROP RANGE</span>
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 pt-0.5">
                  <div className="bg-[#151518] px-1 py-0.5 rounded border border-[#222] text-[#888]">
                    {Math.round((layer.playStartPct ?? 0) * 100)}%
                  </div>
                  <ArrowRight size={8} className="text-[#444]" />
                  <div className="bg-[#151518] px-1 py-0.5 rounded border border-[#222] text-[#888]">
                    {Math.round((layer.playEndPct ?? 1) * 100)}%
                  </div>
                </div>
              </div>

              {/* Channel Pan (Stereo placement Knob) */}
              <div className="flex items-center justify-center pb-3">
                <Knob
                  label="PAN"
                  value={layer.pan}
                  min={-1}
                  max={1}
                  step={0.05}
                  onChange={(v) => onUpdateLayer(layer.id, { pan: v })}
                  className="scale-90"
                />
              </div>

              {/* Vertical Fader Section with VU Peak Indicator */}
              <div className="flex items-stretch justify-center h-44 gap-3 bg-[#0a0a0c] p-2 rounded-xl border border-[#1b1b1e]">
                {/* Visual LED Level Meter */}
                <div className="w-1.5 flex flex-col justify-end bg-black/60 rounded-full h-full p-0.5 overflow-hidden">
                  <div 
                    className="w-full rounded-full transition-all duration-75"
                    style={{ 
                      height: `${Math.min(100, peak * 100)}%`,
                      background: peak > 0.85 
                        ? 'linear-gradient(to top, #10B981, #F59E0B, #EF4444)' 
                        : peak > 0.65 
                          ? 'linear-gradient(to top, #10B981, #F59E0B)' 
                          : '#10B981'
                    }}
                  />
                </div>

                {/* Tactile Channel Volume Fader */}
                <Fader
                  label="GAIN"
                  value={layer.gain}
                  min={0.0}
                  max={1.5}
                  step={0.02}
                  size={144}
                  color={isSelected ? '#F97316' : '#3B82F6'}
                  onChange={(v) => onUpdateLayer(layer.id, { gain: v })}
                />
              </div>

              {/* Channel Quick Actions Bar */}
              <div className="pt-2 mt-2 border-t border-[#1a1a20] grid grid-cols-4 gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicateLayer?.(layer.id);
                  }}
                  className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-amber-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
                  title="Duplicate Layer"
                >
                  Dup
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyFX?.(layer.id);
                  }}
                  className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-sky-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
                  title="Copy FX Settings"
                >
                  Copy
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPasteFX?.(layer.id);
                  }}
                  className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-emerald-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
                  title="Paste FX Settings"
                >
                  Pst
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRandomizePitchPan?.(layer.id);
                  }}
                  className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-purple-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
                  title="Randomize Pitch & Pan"
                >
                  Rnd
                </button>
              </div>

            </div>
          );
        })}

        {/* Master Output Channel Strip */}
        <div className="w-40 flex-shrink-0 flex flex-col justify-between bg-[#0e0e11] border border-orange-500/20 rounded-2xl p-3 select-none relative shadow-[0_0_15px_rgba(249,115,22,0.05)]">
          
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-orange-400">MASTER</span>
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)] animate-pulse" />
            </div>
            
            <div className="flex flex-col">
              <span className="text-[11px] font-extrabold text-white uppercase tracking-wide">
                MAIN_MIXER
              </span>
              <span className="text-[9px] text-orange-500 font-mono tracking-widest font-bold">
                BUS_SUM
              </span>
            </div>
          </div>

          <div className="bg-[#050507] border border-[#1d1d22] p-2 rounded-xl text-center space-y-1">
            <span className="text-[9px] text-gray-500 uppercase tracking-widest block font-bold">Status</span>
            <div className="text-[9px] font-mono text-orange-400 font-bold uppercase tracking-wider">
              {isPlaying ? '⚡ ACTIVE' : '💤 READY'}
            </div>
          </div>

          <div className="bg-[#050507] border border-[#1d1d22] p-2 rounded-xl text-center space-y-1 mt-2 mb-3">
            <span className="text-[9px] text-gray-500 uppercase tracking-widest block font-bold">Mode</span>
            <div className="text-[9px] font-mono text-blue-400 font-bold uppercase tracking-wider">
              {loopEnabled ? '➰ LOOPING' : '⏹️ SINGLE'}
            </div>
          </div>

          {/* Master Channel Vertical Fader strip with Dual meters */}
          <div className="flex items-stretch justify-center h-52 gap-2 bg-[#050508] p-2.5 rounded-xl border border-[#1a1a1f] mt-2">
            
            {/* Left Output Peak Meter */}
            <div className="w-1 flex flex-col justify-end bg-black/60 rounded-full h-full p-0.5 overflow-hidden">
              <div 
                className="w-full rounded-full transition-all duration-75"
                style={{ 
                  height: `${isPlaying ? Math.min(100, masterLevel * (70 + Math.random() * 25)) : 0}%`,
                  background: 'linear-gradient(to top, #10B981, #F59E0B, #EF4444)'
                }}
              />
            </div>

            {/* Tactile Master Volume Fader */}
            <Fader
              label="LR_VOL"
              value={masterLevel}
              min={0.0}
              max={1.2}
              step={0.02}
              size={172}
              color="#F59E0B"
              onChange={onUpdateMasterLevel}
            />

            {/* Right Output Peak Meter */}
            <div className="w-1 flex flex-col justify-end bg-black/60 rounded-full h-full p-0.5 overflow-hidden">
              <div 
                className="w-full rounded-full transition-all duration-75"
                style={{ 
                  height: `${isPlaying ? Math.min(100, masterLevel * (65 + Math.random() * 30)) : 0}%`,
                  background: 'linear-gradient(to top, #10B981, #F59E0B, #EF4444)'
                }}
              />
            </div>
          </div>

          {/* Global Stop Button under Master channel */}
          <button
            onClick={onStop}
            className="w-full py-1.5 mt-3.5 bg-red-950/25 border border-red-500/35 hover:bg-red-500 hover:text-white rounded-lg text-[9px] font-bold uppercase tracking-widest text-red-400 transition-colors flex items-center justify-center gap-1"
          >
            <Square size={8} fill="currentColor" />
            <span>MUTE_ALL</span>
          </button>
        </div>

      </div>
    </div>
    </div>
  );
}
