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
import { ChannelStrip } from './ChannelStrip';
import { SendsPanel } from './SendsPanel';
import { audioEngine as sharedAudioEngine } from '../audio/AudioEngine';
import { audioEngine } from '../lib/audioEngine';
import { computeMeterLevel, makeScratchBuffer } from '../audio/metering';

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
  const [masterMeter, setMasterMeter] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
  const animationRef = useRef<number | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Phase 3.1 — real per-channel metering. Each layer has an AnalyserNode
  // exposed by SharedAudioEngine (created lazily when its gain is first
  // requested); the mixer reads peak amplitude from that node on each
  // animation frame. Master reads from the master analyser.
  useEffect(() => {
    const fftSize = 1024;
    const scratchByLayer = new Map<string, Float32Array>();
    const masterScratch = makeScratchBuffer(fftSize);
    const masterAnalyser = audioEngine.getAnalyser?.() ?? null;

    const updateMeters = () => {
      const next: { [id: string]: number } = {};
      let masterLeft = 0;
      let masterRight = 0;
      for (const layer of layers) {
        if (!layer.enabled || layer.muted) {
          next[layer.id] = 0;
          continue;
        }
        let scratch = scratchByLayer.get(layer.id);
        if (!scratch) {
          scratch = makeScratchBuffer(fftSize);
          scratchByLayer.set(layer.id, scratch);
        }
        const analyser = sharedAudioEngine.getModuleAnalyser(layer.id, fftSize) as unknown as Parameters<typeof computeMeterLevel>[0];
        const reading = computeMeterLevel(analyser, scratch);
        next[layer.id] = reading.peak;
      }
      if (masterAnalyser) {
        const reading = computeMeterLevel(masterAnalyser, masterScratch);
        masterLeft = reading.peak;
        masterRight = reading.peak;
      }
      setActiveMeterVals(next);
      setMasterMeter({ left: masterLeft, right: masterRight });
      animationRef.current = requestAnimationFrame(updateMeters);
    };

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateMeters);
    } else {
      setActiveMeterVals({});
      setMasterMeter({ left: 0, right: 0 });
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
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
          return (
            <ChannelStrip
              key={layer.id}
              layer={layer}
              index={index}
              isSelected={isSelected}
              peak={peak}
              onSelectLayer={onSelectLayer}
              onUpdateLayer={onUpdateLayer}
              onDuplicateLayer={onDuplicateLayer}
              onCopyFX={onCopyFX}
              onPasteFX={onPasteFX}
              onRandomizePitchPan={onRandomizePitchPan}
              onReorderLayer={onReorderLayer}
            />
          );
        })}

        {/* Phase 3.3 — FX bus returns panel sits next to the master strip */}
        <SendsPanel buses={['reverb', 'delay']} />

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
                  height: `${isPlaying ? Math.min(100, masterMeter.left * 100) : 0}%`,
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
                  height: `${isPlaying ? Math.min(100, masterMeter.right * 100) : 0}%`,
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
