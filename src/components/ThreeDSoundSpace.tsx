/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { SoundLayer, DEFAULT_FX } from '../types';
import { Layers, Mic, Speaker, Waves, Maximize2, X } from 'lucide-react';

interface ThreeDSoundSpaceProps {
  layers: SoundLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (id: string, updates: Partial<SoundLayer>) => void;
}

export const ThreeDSoundSpace: React.FC<ThreeDSoundSpaceProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const onUpdateLayerRef = useRef(onUpdateLayer);
  useEffect(() => {
    onUpdateLayerRef.current = onUpdateLayer;
  }, [onUpdateLayer]);

  const dragInfoRef = useRef<{ id: string; startX: number; startY: number; initialPan: number; initialGain: number } | null>(null);
  const layerElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  const isReverbEnabled = selectedLayer?.fx?.reverbEnabled !== false && (selectedLayer?.fx?.reverbMix ?? 0) > 0;

  const handleMouseDown = (layer: SoundLayer, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectLayer(layer.id);
    setIsDragging(layer.id);
    dragInfoRef.current = {
      id: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      initialPan: layer.pan,
      initialGain: layer.gain
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !dragInfoRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const { startX, startY, initialPan, initialGain, id } = dragInfoRef.current;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const deltaPan = (dx / rect.width) * 2;
      const deltaGain = -(dy / rect.height) * 1.5;

      const pan = Math.max(-1, Math.min(1, initialPan + deltaPan));
      const gain = Math.max(0, Math.min(1.5, initialGain + deltaGain));

      const el = layerElementRefs.current.get(id);
      if (el) {
        const leftPct = ((pan + 1) / 2) * 88 + 6; // Stay within room boundary
        const topPct = (1 - (gain / 1.5)) * 75 + 12;
        el.style.left = `${leftPct}%`;
        el.style.top = `${topPct}%`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (containerRef.current && dragInfoRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const { startX, startY, initialPan, initialGain, id } = dragInfoRef.current;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const deltaPan = (dx / rect.width) * 2;
        const deltaGain = -(dy / rect.height) * 1.5;

        const pan = Math.max(-1, Math.min(1, initialPan + deltaPan));
        const gain = Math.max(0, Math.min(1.5, initialGain + deltaGain));
        const filterFreq = 500 + (gain * 10000);

        const targetLayer = layersRef.current.find(l => l.id === id);
        if (targetLayer) {
          onUpdateLayerRef.current(id, {
            pan,
            gain,
            fx: {
              ...DEFAULT_FX,
              ...(targetLayer.fx || {}),
              filterFreq
            }
          });
        }
      }
      setIsDragging(null);
      dragInfoRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleKeyDownNode = (layer: SoundLayer, e: React.KeyboardEvent) => {
    let deltaPan = 0;
    let deltaGain = 0;
    if (e.key === 'ArrowLeft') deltaPan = -0.05;
    else if (e.key === 'ArrowRight') deltaPan = 0.05;
    else if (e.key === 'ArrowUp') deltaGain = 0.05;
    else if (e.key === 'ArrowDown') deltaGain = -0.05;
    else return;

    e.preventDefault();
    const newPan = Math.max(-1, Math.min(1, layer.pan + deltaPan));
    const newGain = Math.max(0, Math.min(1.5, layer.gain + deltaGain));
    const filterFreq = 500 + (newGain * 10000);

    onUpdateLayer(layer.id, {
      pan: newPan,
      gain: newGain,
      fx: {
        ...DEFAULT_FX,
        ...(layer.fx || {}),
        filterFreq
      }
    });
  };

  return (
    <div className={isFullscreen ? "fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-4 md:p-8 flex items-center justify-center overflow-auto" : ""}>
      <div className={`w-full relative ${isFullscreen ? 'max-w-7xl' : ''}`}>
        
        {/* Fullscreen Toggle */}
        <div className={`absolute -top-10 right-0 z-50 flex justify-end ${!isFullscreen && 'hidden'}`}>
          <button
            onClick={() => setIsFullscreen(false)}
            aria-label="Exit Fullscreen Mode"
            className="p-2 rounded-lg bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 w-full ${isFullscreen ? 'bg-black border border-[#1e293b] rounded-2xl p-6 shadow-2xl' : ''}`}>
          
          <div className="lg:col-span-2 relative w-full h-[460px] bg-black border border-[#1e293b] rounded-2xl overflow-hidden group shadow-2xl select-none">
            {/* Inline Fullscreen Toggle for normal view */}
            {!isFullscreen && (
              <button
                onClick={() => setIsFullscreen(true)}
                aria-label="Enter Fullscreen Mode"
                className="absolute top-4 right-4 z-50 p-2 rounded-lg bg-black/50 hover:bg-black/80 border border-blue-900/50 text-slate-400 hover:text-white transition-colors"
              >
                <Maximize2 size={14} />
              </button>
            )}
        
        {/* Back Wall Atmosphere & Ambient LED Glow */}
        <div className="absolute top-0 inset-x-0 h-2/3 bg-gradient-to-b from-[#090d16] via-[#05070c] to-black relative">
          {/* RGB LED Backlight Tube */}
          <div className="absolute top-8 inset-x-12 h-1 bg-gradient-to-r from-blue-600 via-yellow-400 to-purple-500 rounded-full blur-[2px] shadow-[0_0_20px_#2563eb]" />
          
          {/* Acoustic Foam Panels (Left & Right Walls) */}
          <div className="absolute top-6 left-3 w-16 h-40 bg-[#0f172a] border border-blue-900/60 rounded-lg opacity-80 grid grid-cols-2 gap-1 p-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-[#1e293b] rounded-[2px]" />
            ))}
          </div>
          <div className="absolute top-6 right-3 w-16 h-40 bg-[#0f172a] border border-purple-900/60 rounded-lg opacity-80 grid grid-cols-2 gap-1 p-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-[#1e293b] rounded-[2px]" />
            ))}
          </div>

          {/* Bedroom Studio Computer Monitor & Workstation Desk (Top Center) */}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 w-64 h-28 bg-[#020617] border border-blue-600/40 rounded-xl flex flex-col items-center justify-between p-2 shadow-[0_0_25px_rgba(37,99,235,0.25)]">
            {/* DAW Screen Display */}
            <div className="w-full h-16 bg-black rounded border border-blue-900/80 p-1.5 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between text-[9px] font-mono text-yellow-400 font-bold">
                <span>DAW_CANVAS_4K</span>
                <span className="text-purple-300">NC TAR HEEL LAB</span>
              </div>
              {/* Animated Audio Wave Spectrum inside DAW screen */}
              <div className="flex items-end gap-1 h-8 px-1">
                {Array.from({ length: 24 }).map((_, i) => {
                  const h = 20 + Math.sin(i * 0.8) * 60;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-blue-600 to-yellow-400 rounded-t-[1px]"
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>
            </div>
            {/* Monitor Stand */}
            <div className="w-12 h-3 bg-slate-800 rounded-b border border-slate-700" />
          </div>

          {/* Left Studio Monitor Speaker */}
          <div className="absolute top-14 left-24 w-12 h-24 bg-[#020617] border-2 border-yellow-500/80 rounded-lg flex flex-col items-center justify-around p-1 shadow-[0_0_15px_rgba(250,204,21,0.3)]">
            <div className="w-6 h-6 rounded-full bg-slate-900 border border-yellow-400 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-950 border border-blue-500 flex items-center justify-center shadow-inner">
              <div className="w-4 h-4 rounded-full bg-yellow-400/80" />
            </div>
            <div className="text-[7px] font-mono font-bold text-yellow-400">MONITOR_L</div>
          </div>

          {/* Right Studio Monitor Speaker */}
          <div className="absolute top-14 right-24 w-12 h-24 bg-[#020617] border-2 border-yellow-500/80 rounded-lg flex flex-col items-center justify-around p-1 shadow-[0_0_15px_rgba(250,204,21,0.3)]">
            <div className="w-6 h-6 rounded-full bg-slate-900 border border-yellow-400 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-950 border border-blue-500 flex items-center justify-center shadow-inner">
              <div className="w-4 h-4 rounded-full bg-yellow-400/80" />
            </div>
            <div className="text-[7px] font-mono font-bold text-yellow-400">MONITOR_R</div>
          </div>
        </div>

        {/* Bedroom Studio Wood/Carpet Perspective Floor Grid */}
        <div 
          className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-black via-[#080c14] to-transparent pointer-events-none"
          style={{
            perspective: '600px',
          }}
        >
          <div 
            className="w-full h-full border-t border-blue-600/40 opacity-30"
            style={{
              transform: 'rotateX(55deg)',
              transformOrigin: 'bottom center',
              backgroundImage: 'linear-gradient(to right, #1e3a8a 1px, transparent 1px), linear-gradient(to bottom, #1e3a8a 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />
        </div>

        {/* Producer Listener Headphone Seat (Bottom Center) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
          <div className="px-3 py-1 bg-black text-white border border-zinc-800 font-hiphop font-black text-[10px] uppercase rounded-full shadow-[0_0_15px_rgba(0,0,0,0.8)] flex items-center gap-1.5">
            <Mic size={10} className="text-yellow-400" /> PRODUCER LISTENING POSITION
          </div>
          <div className="w-12 h-2 bg-slate-800/40 rounded-full blur-[2px] mt-0.5" />
        </div>

        {/* Interactive Layer Nodes Canvas Container */}
        <div ref={containerRef} className="absolute inset-0 z-20">
          {layers.filter(l => l.enabled).map(layer => {
            const isSelected = selectedLayerId === layer.id;
            
            const left = ((layer.pan + 1) / 2) * 88 + 6;
            const top = (1 - (layer.gain / 1.5)) * 75 + 12;

            return (
              <div
                key={layer.id}
                ref={(node) => {
                  if (node) {
                    layerElementRefs.current.set(layer.id, node);
                  } else {
                    layerElementRefs.current.delete(layer.id);
                  }
                }}
                tabIndex={0}
                role="slider"
                aria-label={`Spatial position for layer ${layer.name}`}
                aria-valuenow={Math.round(layer.pan * 100)}
                onKeyDown={(e) => handleKeyDownNode(layer, e)}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  willChange: isDragging === layer.id ? 'left, top' : 'auto',
                }}
                onMouseDown={(e) => handleMouseDown(layer, e)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-yellow-400 ${
                  isSelected 
                    ? 'bg-yellow-400 text-black border-2 border-white shadow-[0_0_25px_rgba(250,204,21,0.9)] z-30 scale-110' 
                    : 'bg-[#0f172a] text-white border-2 border-blue-500 hover:border-yellow-400 z-20 shadow-[0_0_12px_rgba(37,99,235,0.5)]'
                }`}
              >
                {/* Layer Title Card Tag */}
                <div className="absolute -top-7 whitespace-nowrap bg-black/90 px-2 py-0.5 rounded border border-blue-500/80 text-[10px] font-black uppercase tracking-wider text-white pointer-events-none shadow-md flex items-center gap-1">
                  <span className={isSelected ? 'text-yellow-400' : 'text-blue-400'}>●</span>
                  {layer.name}
                </div>
                
                {isSelected && (
                  <div className="absolute inset-[-12px] border-2 border-yellow-400 rounded-full animate-ping pointer-events-none opacity-75" />
                )}
                
                <Layers size={16} className={isSelected ? 'text-black' : 'text-yellow-400'} />
                
                {/* Sound Wave Projection Ray back to Producer Position */}
                <div 
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 w-0.5 pointer-events-none ${
                    isSelected ? 'bg-gradient-to-t from-yellow-400 via-blue-500 to-transparent' : 'bg-gradient-to-t from-blue-600/40 to-transparent'
                  }`}
                  style={{ height: `${Math.max(20, (layer.gain / 1.5) * 120)}px`, transform: 'rotate(180deg)', transformOrigin: 'top' }}
                />
              </div>
            );
          })}
        </div>

        {/* Axis & Legend Overlay */}
        <div className="absolute bottom-3 left-4 flex flex-col gap-1 text-[9px] font-black text-white font-mono uppercase tracking-widest pointer-events-none bg-black/80 p-2 rounded-xl border border-blue-900/80 z-20">
          <div className="flex items-center gap-1.5 text-yellow-400">
            <Speaker size={12} /> <span>BEDROOM STUDIO 3D PANNING ROOM</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <div className="w-2 h-0.5 bg-yellow-400" /> <span>X: Stereo Pan (Left Monitor &rarr; Right Monitor)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <div className="w-0.5 h-2 bg-blue-500" /> <span>Y: Distance / Gain (Near Desk &rarr; Back Room)</span>
          </div>
        </div>
        
        <div className="absolute top-3 right-4 text-[10px] font-black text-yellow-400 font-hiphop uppercase tracking-widest pointer-events-none bg-black/80 px-3 py-1 rounded-lg border border-yellow-500/40 z-20 shadow-md">
          NC SOUNDLAB ROOM SPATIALIZER
        </div>
      </div>

      {/* SPATIAL LAYER STATUS (reverb is controlled in the Layer FX Rack — no duplicate controls here) */}
      <div className="relative w-full bg-[#121215] border border-[#2A2A2E] rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Waves className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white truncate">
            {selectedLayer ? selectedLayer.name : 'No Layer Selected'}
          </span>
          {isReverbEnabled && (
            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-600/15 border border-blue-500/30 text-blue-300 shrink-0">
              REVERB ACTIVE
            </span>
          )}
        </div>
        <p className="hidden sm:block text-[10px] font-mono text-gray-500 text-right max-w-[260px]">
          Reverb amount is set per-layer in the Layer FX Rack; master FX live in the Console Mixer.
        </p>
      </div>
      </div>
      </div>
    </div>
  );
};
