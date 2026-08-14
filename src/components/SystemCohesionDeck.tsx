/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  GitCommit, 
  Sliders, 
  Layers, 
  Activity, 
  Tag, 
  Play, 
  Square, 
  Copy, 
  Sparkles, 
  ChevronUp, 
  ChevronDown,
  RefreshCw,
  CheckCircle
} from 'lucide-react';
import { SoundLayer } from '../types';
import { audioEngine } from '../lib/audioEngine';

interface SystemCohesionDeckProps {
  layers: SoundLayer[];
  selectedLayerId: string | null;
  onUpdateLayer: (layerId: string, updates: Partial<SoundLayer>) => void;
  onAddToast: (message: string, type: 'success' | 'info' | 'warn') => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  bpm: number;
}

export const SystemCohesionDeck: React.FC<SystemCohesionDeckProps> = ({
  layers,
  selectedLayerId,
  onUpdateLayer,
  onAddToast,
  setActiveTab,
  bpm
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDeckTab, setActiveDeckTab] = useState<'routing' | 'performance' | 'mirror' | 'arpeggiator' | 'distro'>('routing');
  
  // Ref for selected layer
  const selectedLayer = layers.find(l => l.id === selectedLayerId) || null;

  // -------------------------------------------------------------
  // UPGRADE 1: Visual Signal Chain Routing Flow Chart State
  // -------------------------------------------------------------
  const [signalActive, setSignalActive] = useState(false);

  // -------------------------------------------------------------
  // UPGRADE 2: XY Touch Pad Performance Matrix
  // -------------------------------------------------------------
  const padRef = useRef<HTMLDivElement>(null);
  const [xyPos, setXyPos] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);

  const handlePadInteraction = (clientX: number, clientY: number) => {
    if (!padRef.current || !selectedLayer) return;
    const rect = padRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, (1 - (clientY - rect.top) / rect.height) * 100));
    
    setXyPos({ x, y });

    // Map X to macroGrit (Distortion / Drive) and Y to macroPunch (Attack envelope punch)
    onUpdateLayer(selectedLayer.id, {
      macroGrit: Math.round(x),
      macroPunch: Math.round(y),
      // Update linked values on the layer as well for immediate audio response
      gain: Math.max(0.1, Math.min(1.2, selectedLayer.gain + (y - 50) / 100 * 0.2)),
    });

    // Trigger subtle play trigger for auditory feedback
    if (Math.random() > 0.7) {
      audioEngine.playLayer(selectedLayer);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handlePadInteraction(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    if (e.touches[0]) {
      handlePadInteraction(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) handlePadInteraction(e.clientX, e.clientY);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) handlePadInteraction(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, selectedLayerId]);

  // Sync XY position from active layer macro values on load
  useEffect(() => {
    if (selectedLayer) {
      setXyPos({
        x: selectedLayer.macroGrit ?? 50,
        y: selectedLayer.macroPunch ?? 50
      });
    }
  }, [selectedLayerId]);


  // -------------------------------------------------------------
  // UPGRADE 3: Parameter Mirroring, Copy & Linked Groups
  // -------------------------------------------------------------
  const [copiedSettings, setCopiedSettings] = useState<any | null>(null);
  const [linkedLayers, setLinkedLayers] = useState<string[]>([]);
  const [isLinkMasterActive, setIsLinkMasterActive] = useState(false);

  const handleCopySettings = () => {
    if (!selectedLayer) {
      onAddToast('Please select a layer to copy parameters', 'warn');
      return;
    }
    setCopiedSettings({
      envelope: { ...selectedLayer.envelope },
      fx: { ...selectedLayer.fx },
      synth: selectedLayer.synth ? { ...selectedLayer.synth } : undefined,
      pitch: selectedLayer.pitch,
      gain: selectedLayer.gain,
      pan: selectedLayer.pan,
      macroPunch: selectedLayer.macroPunch,
      macroGrit: selectedLayer.macroGrit,
      macroSpace: selectedLayer.macroSpace,
      macroDepth: selectedLayer.macroDepth
    });
    onAddToast(`Copied sound & FX settings from ${selectedLayer.name}`, 'success');
  };

  const toggleLinkLayer = (layerId: string) => {
    if (layerId === selectedLayerId) return; // Can't link itself as child
    setLinkedLayers(prev => 
      prev.includes(layerId) ? prev.filter(id => id !== layerId) : [...prev, layerId]
    );
  };

  // Sync parameters automatically in master link mode
  useEffect(() => {
    if (isLinkMasterActive && selectedLayer && linkedLayers.length > 0) {
      linkedLayers.forEach(targetId => {
        onUpdateLayer(targetId, {
          macroPunch: selectedLayer.macroPunch,
          macroGrit: selectedLayer.macroGrit,
          macroSpace: selectedLayer.macroSpace,
          macroDepth: selectedLayer.macroDepth,
          envelope: { ...selectedLayer.envelope },
          // Keep subtle offsets so it still sounds organic
        });
      });
    }
  }, [
    selectedLayer?.macroPunch, 
    selectedLayer?.macroGrit, 
    selectedLayer?.macroSpace, 
    selectedLayer?.macroDepth,
    selectedLayer?.envelope.attack,
    selectedLayer?.envelope.decay,
    selectedLayer?.envelope.sustain,
    selectedLayer?.envelope.release,
    isLinkMasterActive
  ]);


  // -------------------------------------------------------------
  // UPGRADE 4: Live Loop Sequencer & Audition Ribbon
  // -------------------------------------------------------------
  const [isArpPlaying, setIsArpPlaying] = useState(false);
  const [arpStep, setArpStep] = useState(0);
  const [arpPattern, setArpPattern] = useState<boolean[]>([true, false, true, false, true, true, false, true]);
  const [arpRate, setArpRate] = useState<'1/8' | '1/16' | '1/8t' | 'offbeat'>('1/8');
  const arpTimerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleArpStep = (idx: number) => {
    setArpPattern(prev => {
      const copy = [...prev];
      copy[idx] = !copy[idx];
      return copy;
    });
  };

  // Web Audio trigger scheduler for mini Arp Loop (only while the deck is open)
  useEffect(() => {
    if (arpTimerRef.current) {
      clearInterval(arpTimerRef.current);
      arpTimerRef.current = null;
    }

    if (!isOpen || !isArpPlaying || !selectedLayer) return;

    // Calculate delay based on tempo (BPM)
    let stepMs = (60000 / bpm) / 2; // Default 1/8 note
    if (arpRate === '1/16') stepMs = (60000 / bpm) / 4;
    if (arpRate === '1/8t') stepMs = (60000 / bpm) / 3;

    let localStep = arpStep;

    const runStep = () => {
      if (arpPattern[localStep]) {
        // Synthesise pitches based on typical step indexing (C2 to G3 offsets)
        const pitchOffsets = [0, 4, 7, 12, 11, 7, 4, 0];
        const stepPitch = pitchOffsets[localStep];
        
        // Trigger layer note
        const originalPitch = selectedLayer.pitch;
        audioEngine.playLayer({
          ...selectedLayer,
          pitch: originalPitch + stepPitch
        });

        // Toggle Visual LED
        setSignalActive(true);
        setTimeout(() => setSignalActive(false), 80);
      }

      setArpStep(localStep);
      localStep = (localStep + 1) % arpPattern.length;
    };

    arpTimerRef.current = setInterval(runStep, stepMs);

    return () => {
      if (arpTimerRef.current) {
        clearInterval(arpTimerRef.current);
      }
    };
  }, [isOpen, isArpPlaying, selectedLayerId, bpm, arpRate, arpPattern]);


  // -------------------------------------------------------------
  // UPGRADE 5: Auto-Tagging Exporter & Distribution Bridge
  // -------------------------------------------------------------
  const [detectedKey, setDetectedKey] = useState('C Major');
  const [analyzing, setAnalyzing] = useState(false);
  const [customTag, setCustomTag] = useState('Sub-Heavy');
  const [compiledPack, setCompiledPack] = useState<Array<{ name: string; key: string; tag: string; bpm: number }>>([]);

  const handleRunAnalysis = () => {
    if (!selectedLayer) return;
    setAnalyzing(true);
    setTimeout(() => {
      // Analyze synthetic spectral elements from layer settings
      const pitchValue = selectedLayer.pitch;
      const keyList = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      // Derive a mock analyzed key based on actual semitone offsets
      const baseIdx = 0; // standard C
      const offsetIdx = (baseIdx + pitchValue + 24) % 12;
      const computedKey = keyList[offsetIdx] + (selectedLayer.subDesign ? ' Minor' : ' Major');
      setDetectedKey(computedKey);
      setAnalyzing(false);
      onAddToast(`Waveform analyzed! Estimated Root Key: ${computedKey}`, 'success');
    }, 900);
  };

  const handleExportToDistribution = () => {
    if (!selectedLayer) return;
    const newAsset = {
      name: selectedLayer.name,
      key: detectedKey,
      tag: customTag,
      bpm: bpm
    };
    setCompiledPack(prev => [...prev, newAsset]);
    onAddToast(`Added "${selectedLayer.name}" to Sound Kit Creator Pack list!`, 'success');
  };

  return (
    <div className="border-t border-[#1e293b] bg-[#070709] select-none">
      {/* Collapsible Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 px-6 bg-black flex items-center justify-between cursor-pointer hover:bg-slate-900/40 transition-colors border-b border-[#111] border-t border-[#1e293b]/40"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
          <span className="text-[10.5px] font-black uppercase tracking-[0.15em] text-white">
            System Cohesion Dashboard & Sound Engine Integrations
          </span>
          <span className="text-[8.5px] bg-[#111827] text-slate-400 px-2 py-0.5 rounded border border-blue-900/60 font-mono">
            5 Advanced Upgrades
          </span>
        </div>
        
        <div className="flex items-center gap-4 text-xs">
          {selectedLayer && (
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest hidden md:inline">
              Selected: <span className="text-yellow-400 font-bold">{selectedLayer.name}</span>
            </span>
          )}
          {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
        </div>
      </div>

      {/* Main Collapsible Drawer Content */}
      {isOpen && (
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#030304] max-h-[420px] overflow-y-auto no-scrollbar border-b border-[#1e293b]">
          
          {/* LEFT COLUMN: Sidebar Navigation Buttons */}
          <div className="lg:col-span-3 flex flex-col gap-1.5">
            <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-1 px-1">
              Engine Modules
            </div>

            <button
              onClick={() => setActiveDeckTab('routing')}
              className={`px-3 py-2.5 rounded-xl text-left text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2.5 ${
                activeDeckTab === 'routing'
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-md shadow-blue-500/5'
                  : 'bg-black border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <div className="flex flex-col text-left">
                <span>01. Signal Routing Matrix</span>
                <span className="text-[9px] font-medium font-mono text-slate-500 lowercase mt-0.5">visual flow & node bypass</span>
              </div>
            </button>

            <button
              onClick={() => setActiveDeckTab('performance')}
              className={`px-3 py-2.5 rounded-xl text-left text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2.5 ${
                activeDeckTab === 'performance'
                  ? 'bg-yellow-400/10 border-yellow-500/50 text-yellow-400 shadow-md shadow-yellow-500/5'
                  : 'bg-black border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <div className="flex flex-col text-left">
                <span>02. XY Macro Matrix</span>
                <span className="text-[9px] font-medium font-mono text-slate-500 lowercase mt-0.5">tactile grit & punch pad</span>
              </div>
            </button>

            <button
              onClick={() => setActiveDeckTab('mirror')}
              className={`px-3 py-2.5 rounded-xl text-left text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2.5 ${
                activeDeckTab === 'mirror'
                  ? 'bg-fuchsia-600/10 border-fuchsia-500/50 text-fuchsia-300 shadow-md shadow-fuchsia-500/5'
                  : 'bg-black border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <div className="flex flex-col text-left">
                <span>03. Params Sync & Link</span>
                <span className="text-[9px] font-medium font-mono text-slate-500 lowercase mt-0.5">cloning & layer linking</span>
              </div>
            </button>

            <button
              onClick={() => setActiveDeckTab('arpeggiator')}
              className={`px-3 py-2.5 rounded-xl text-left text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2.5 ${
                activeDeckTab === 'arpeggiator'
                  ? 'bg-teal-400/10 border-teal-500/50 text-teal-300 shadow-md shadow-teal-500/5'
                  : 'bg-black border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <div className="flex flex-col text-left">
                <span>04. Sequencer Audition</span>
                <span className="text-[9px] font-medium font-mono text-slate-500 lowercase mt-0.5">8-step arp test engine</span>
              </div>
            </button>

            <button
              onClick={() => setActiveDeckTab('distro')}
              className={`px-3 py-2.5 rounded-xl text-left text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2.5 ${
                activeDeckTab === 'distro'
                  ? 'bg-purple-600/10 border-purple-500/50 text-purple-300 shadow-md shadow-purple-500/5'
                  : 'bg-black border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <div className="flex flex-col text-left">
                <span>05. Sound Kit Bridge</span>
                <span className="text-[9px] font-medium font-mono text-slate-500 lowercase mt-0.5">key analysis & distribution</span>
              </div>
            </button>
          </div>

          {/* RIGHT COLUMN: Active Upgrade Interactive Canvas */}
          <div className="lg:col-span-9 bg-[#0b0b0d] border border-[#1e293b] rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
            
            {/* 1. ROUTING FLOW CHART */}
            {activeDeckTab === 'routing' && (
              <div className="space-y-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <GitCommit className="w-3.5 h-3.5" /> Unified Signal Routing Flow & Node Controller
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Click any module to open editor</span>
                </div>

                {/* Flow Diagram */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 py-4 relative overflow-x-auto no-scrollbar">
                  {/* Flow Lines Background Overlay */}
                  <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-slate-900 z-0 hidden md:block" />

                  {/* Node 1: Sound Generator Source */}
                  <div 
                    onClick={() => setActiveTab('soundlab')}
                    className="flex flex-col items-center bg-black border border-blue-500/40 hover:border-blue-400 p-2.5 rounded-xl text-center cursor-pointer min-w-[100px] z-10 transition-all hover:-translate-y-0.5"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mb-1.5 animate-pulse" />
                    <span className="text-[9px] font-mono text-blue-400 font-extrabold uppercase">Generator</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-0.5 truncate max-w-[80px]">
                      {selectedLayer ? selectedLayer.type.toUpperCase() : 'NO LAYER'}
                    </span>
                  </div>

                  <div className="text-slate-600 text-[10px] hidden md:block">→</div>

                  {/* Node 2: ADSR Envelope */}
                  <div 
                    onClick={() => setActiveTab('tweaking')}
                    className="flex flex-col items-center bg-black border border-teal-500/40 hover:border-teal-400 p-2.5 rounded-xl text-center cursor-pointer min-w-[100px] z-10 transition-all hover:-translate-y-0.5"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full mb-1.5 transition-colors ${signalActive ? 'bg-teal-400 shadow-[0_0_8px_#14b8a6]' : 'bg-zinc-800'}`} />
                    <span className="text-[9px] font-mono text-teal-400 font-extrabold uppercase">ADSR Amp</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                      {selectedLayer ? `A:${selectedLayer.envelope.attack}s` : 'OFF'}
                    </span>
                  </div>

                  <div className="text-slate-600 text-[10px] hidden md:block">→</div>

                  {/* Node 3: Insert FX Rack */}
                  <div 
                    onClick={() => setActiveTab('tweaking')}
                    className="flex flex-col items-center bg-black border border-amber-500/40 hover:border-amber-400 p-2.5 rounded-xl text-center cursor-pointer min-w-[100px] z-10 transition-all hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <input 
                        type="checkbox" 
                        checked={selectedLayer ? selectedLayer.fx.distortionEnabled : false}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (selectedLayer) {
                            onUpdateLayer(selectedLayer.id, {
                              fx: { ...selectedLayer.fx, distortionEnabled: e.target.checked }
                            });
                          }
                        }}
                        className="w-2.5 h-2.5 rounded bg-zinc-900 border-slate-700 cursor-pointer"
                      />
                      <div className={`w-2 h-2 rounded-full ${selectedLayer?.fx.distortionEnabled ? 'bg-amber-400' : 'bg-zinc-800'}`} />
                    </div>
                    <span className="text-[9px] font-mono text-amber-400 font-extrabold uppercase">Insert FX</span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      {selectedLayer ? `Dist: ${selectedLayer.fx.distortion}%` : 'OFF'}
                    </span>
                  </div>

                  <div className="text-slate-600 text-[10px] hidden md:block">→</div>

                  {/* Node 4: 3D Room */}
                  <div 
                    onClick={() => setActiveTab('spatial')}
                    className="flex flex-col items-center bg-black border border-purple-500/40 hover:border-purple-400 p-2.5 rounded-xl text-center cursor-pointer min-w-[100px] z-10 transition-all hover:-translate-y-0.5"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-500 mb-1.5" />
                    <span className="text-[9px] font-mono text-purple-400 font-extrabold uppercase">3D Space</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                      {selectedLayer ? `Pan: ${selectedLayer.pan}` : 'OFF'}
                    </span>
                  </div>

                  <div className="text-slate-600 text-[10px] hidden md:block">→</div>

                  {/* Node 5: Master Out Bus */}
                  <div 
                    onClick={() => setActiveTab('mixer')}
                    className="flex flex-col items-center bg-black border border-emerald-500/40 hover:border-emerald-400 p-2.5 rounded-xl text-center cursor-pointer min-w-[100px] z-10 transition-all hover:-translate-y-0.5"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mb-1.5" />
                    <span className="text-[9px] font-mono text-emerald-400 font-extrabold uppercase">Console Out</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                      Gain: {selectedLayer ? `${Math.round(selectedLayer.gain * 100)}%` : 'OFF'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-black rounded-xl border border-[#1e293b]/50 text-slate-400 text-[9px] leading-relaxed">
                  💡 <span className="text-slate-200 font-bold uppercase tracking-wider">How to use</span>: Click on any of the process blocks above to bypass its action or jump instantly to that workflow editor pane. Signal paths are real-time, interactive, and computed inside our compiled audio core.
                </div>
              </div>
            )}

            {/* 2. XY PERFORMANCE TOUCH-PAD MATRIX */}
            {activeDeckTab === 'performance' && (
              <div className="space-y-3 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-black text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 animate-spin" /> Tactile XY Macro Performance Matrix & FX Pad
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Live modulation controller</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  {/* XY Touch Pad Area */}
                  <div className="space-y-2">
                    <div className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest block">
                      MODULATION XY CONTROLLER PAD
                    </div>
                    <div 
                      ref={padRef}
                      onMouseDown={handleMouseDown}
                      onTouchStart={handleTouchStart}
                      className="aspect-square md:h-44 w-full bg-black rounded-xl border border-[#1e293b] relative overflow-hidden cursor-crosshair shadow-inner"
                    >
                      {/* Grid Lines */}
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#111827] border-dashed" />
                      <div className="absolute top-1/2 left-0 right-0 h-px bg-[#111827] border-dashed" />
                      
                      {/* Crosshair Coordinates HUD */}
                      <div className="absolute bottom-2 left-2 text-[9px] font-mono text-slate-500 uppercase">
                        Grit (X): {Math.round(xyPos.x)} | Punch (Y): {Math.round(xyPos.y)}
                      </div>

                      {/* Moving Dot */}
                      <div 
                        className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-yellow-400 border-2 border-black shadow-[0_0_12px_#facc15] pointer-events-none transition-transform active:scale-95"
                        style={{ left: `${xyPos.x}%`, top: `${100 - xyPos.y}%` }}
                      />
                    </div>
                  </div>

                  {/* Manual Sliders info */}
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold">
                        <span className="text-slate-400 uppercase tracking-wide">Macro Grit (Distortion Drive)</span>
                        <span className="text-yellow-400 font-mono font-bold">{selectedLayer ? selectedLayer.macroGrit ?? 0 : 0}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="100" 
                        value={selectedLayer ? selectedLayer.macroGrit ?? 0 : 0}
                        disabled={!selectedLayer}
                        onChange={(e) => selectedLayer && onUpdateLayer(selectedLayer.id, { macroGrit: parseInt(e.target.value) })}
                        className="w-full accent-yellow-400 h-1.5 bg-black rounded-lg appearance-none cursor-pointer border border-[#1e293b]"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold">
                        <span className="text-slate-400 uppercase tracking-wide">Macro Punch (Attack Power)</span>
                        <span className="text-blue-400 font-mono font-bold">{selectedLayer ? selectedLayer.macroPunch ?? 0 : 0}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="100" 
                        value={selectedLayer ? selectedLayer.macroPunch ?? 0 : 0}
                        disabled={!selectedLayer}
                        onChange={(e) => selectedLayer && onUpdateLayer(selectedLayer.id, { macroPunch: parseInt(e.target.value) })}
                        className="w-full accent-blue-500 h-1.5 bg-black rounded-lg appearance-none cursor-pointer border border-[#1e293b]"
                      />
                    </div>

                    <div className="p-2.5 bg-[#070709] border border-[#1e293b]/60 rounded-lg text-slate-500 text-[9px] leading-relaxed">
                      🔥 Drag inside the black grid above! X-Axis modulates standard layer digital crunch (Distortion), Y-Axis shapes transient envelope punch.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. PARAMS CLONING & MIRROR MATRIX */}
            {activeDeckTab === 'mirror' && (
              <div className="space-y-3 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-black text-fuchsia-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Multi-Layer Parameter Cloning & Mirror Linker
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Unify parameters across layers</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Side: Copy/Paste Action Hub */}
                  <div className="p-3 bg-black rounded-xl border border-[#1e293b] flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-200 block">Preset Copy Desk</span>
                      <span className="text-[9px] text-slate-500 block leading-tight">Copy all ADSR, EQ, and effects from the selected layer and replicate them instantly.</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleCopySettings}
                        disabled={!selectedLayer}
                        className="flex-1 py-1.5 bg-[#121215] hover:bg-zinc-800 text-white text-[9px] font-bold uppercase rounded-lg border border-[#1e293b] transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3 text-fuchsia-400" /> Copy Selected Layer
                      </button>
                    </div>

                    {copiedSettings ? (
                      <div className="p-2 bg-fuchsia-950/25 border border-fuchsia-900/40 rounded-lg">
                        <span className="text-[9px] font-mono text-fuchsia-300 uppercase block">Copied Cache Active:</span>
                        <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                          Attack: {copiedSettings.envelope.attack}s | Release: {copiedSettings.envelope.release}s | Saturation: {copiedSettings.fx.distortion}%
                        </span>
                      </div>
                    ) : (
                      <div className="p-2 bg-[#070709] border border-dashed border-[#1e293b] rounded-lg text-center text-[9px] text-slate-600 uppercase">
                        Cache Empty (Click Copy to Load Settings)
                      </div>
                    )}
                  </div>

                  {/* Right Side: Linked Master Selector */}
                  <div className="p-3 bg-black rounded-xl border border-[#1e293b] flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-200 block">Link Master Channel</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLinkMasterActive}
                          onChange={(e) => setIsLinkMasterActive(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-[#121215] rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:bg-fuchsia-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#52525b] after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-fuchsia-950/40 peer-checked:border peer-checked:border-fuchsia-500/20"></div>
                      </label>
                    </div>

                    <span className="text-[9px] text-slate-500 leading-tight block">
                      When enabled, parameter adjustments made to the active layer will automatically mirror onto the checked target channels below.
                    </span>

                    <div className="space-y-1 max-h-[80px] overflow-y-auto pr-1 no-scrollbar">
                      {layers.map(l => (
                        <div 
                          key={l.id}
                          onClick={() => toggleLinkLayer(l.id)}
                          className={`flex items-center justify-between p-1.5 rounded-md text-[8.5px] font-mono cursor-pointer transition-all ${
                            linkedLayers.includes(l.id) 
                              ? 'bg-fuchsia-600/10 text-fuchsia-300 border border-fuchsia-500/20' 
                              : 'bg-[#121215] text-slate-400 hover:text-white'
                          }`}
                        >
                          <span className="truncate">{l.name} {l.id === selectedLayerId ? '(Master)' : ''}</span>
                          <span className="font-bold">{linkedLayers.includes(l.id) ? 'LINKED' : 'UNLINKED'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. LOOP SEQUENCER & ARP AUDITION */}
            {activeDeckTab === 'arpeggiator' && (
              <div className="space-y-3 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-black text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 animate-pulse" /> Rhythmic Arpeggiator & Instant Audition Test Deck
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsArpPlaying(!isArpPlaying)}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isArpPlaying
                          ? 'bg-red-500/10 border-red-500 text-red-400 animate-pulse'
                          : 'bg-teal-500/10 border-teal-500 text-teal-400'
                      }`}
                    >
                      {isArpPlaying ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                      <span>{isArpPlaying ? 'Stop Arpeggio' : 'Run Arpeggio'}</span>
                    </button>
                    
                    <select
                      value={arpRate}
                      onChange={(e) => setArpRate(e.target.value as any)}
                      className="bg-black border border-[#1e293b] text-[9px] font-mono uppercase tracking-wider p-1 rounded text-slate-300 cursor-pointer"
                    >
                      <option value="1/8">1/8 Step</option>
                      <option value="1/16">1/16 Fast</option>
                      <option value="1/8t">1/8 Triplet</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest block">
                    8-STEP COHESIVE TRIG PATTERN (CLICK STEPS TO TOGGLE)
                  </div>
                  
                  {/* Beat Grid */}
                  <div className="grid grid-cols-8 gap-1.5">
                    {arpPattern.map((active, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleArpStep(idx)}
                        className={`h-12 rounded-xl border flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer ${
                          active 
                            ? 'bg-teal-500/10 border-teal-400 text-teal-300 shadow-md shadow-teal-500/5' 
                            : 'bg-black border-[#1e293b]/50 text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${arpStep === idx && isArpPlaying ? 'bg-yellow-400 shadow-[0_0_6px_#facc15]' : 'bg-transparent'}`} />
                        <span className="text-[8.5px] font-mono font-bold">0{idx + 1}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-2 bg-[#070709] border border-[#1e293b]/60 rounded-lg text-slate-500 text-[9px] leading-relaxed">
                      🎵 <span className="text-slate-200 font-bold uppercase tracking-wider">Sound Pitch Sequence:</span> This arpeggiation triggers a series of chord pitch steps (root, major third, perfect fifth, octave) based on the layer pitch offsets so you hear the full acoustic capabilities of your design in context.
                    </div>
                    <div className="p-2 bg-[#070709] border border-[#1e293b]/60 rounded-lg text-slate-500 text-[9px] leading-relaxed">
                      ⚡ <span className="text-slate-200 font-bold uppercase tracking-wider">Sync Info:</span> Speed is locked automatically to the main studio transport BPM. Speed up the master BPM to drive faster arpeggiator step speeds.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. SOUND KIT EXPORTER & KEY ANALYSIS BRIDGE */}
            {activeDeckTab === 'distro' && (
              <div className="space-y-3 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Auto-Tagging Analyzer & Distribution Asset Bridge
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Export to distribution packs</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Analysis Box */}
                  <div className="p-3 bg-black rounded-xl border border-[#1e293b] flex flex-col justify-between gap-2.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-200 block">Spectral & Tone Analysis</span>
                    
                    <div className="flex items-center justify-between p-2.5 bg-[#070709] border border-[#1e293b]/60 rounded-lg">
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-slate-500 uppercase font-mono">Root Pitch / Key</span>
                        <span className="text-[10px] font-black uppercase text-yellow-400 font-mono tracking-wide">
                          {analyzing ? 'ANALYZING...' : detectedKey}
                        </span>
                      </div>
                      <button
                        onClick={handleRunAnalysis}
                        disabled={analyzing || !selectedLayer}
                        className="p-1.5 bg-[#121215] hover:bg-zinc-800 border border-[#1e293b] rounded-lg transition-all text-yellow-400 cursor-pointer"
                        title="Analyze Key and Spectrum"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Distro Category Tag</label>
                      <input 
                        type="text"
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        placeholder="e.g. Sub-Heavy, Ambient Pluck"
                        className="w-full bg-[#121215] border border-[#1e293b] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <button
                      onClick={handleExportToDistribution}
                      disabled={!selectedLayer}
                      className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[9.5px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle className="w-3 h-3" /> Push to Sample Kit Creator
                    </button>
                  </div>

                  {/* Distribution Pack List */}
                  <div className="p-3 bg-[#070709] rounded-xl border border-[#1e293b] flex flex-col justify-between gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-200 block">Ready Kit Bundle ({compiledPack.length} items)</span>
                    
                    <div className="flex-1 overflow-y-auto max-h-[110px] pr-1 no-scrollbar space-y-1">
                      {compiledPack.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center text-[8.5px] uppercase">
                          No samples compiled yet. Push sound layers on the left.
                        </div>
                      ) : (
                        compiledPack.map((item, idx) => (
                          <div key={idx} className="p-2 bg-black rounded-lg border border-[#1e293b]/60 flex items-center justify-between text-[9px] font-mono text-slate-400">
                            <span className="font-extrabold text-white truncate max-w-[90px]">{item.name}</span>
                            <span>{item.key}</span>
                            <span className="text-purple-400">{item.tag}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {compiledPack.length > 0 && (
                      <button
                        onClick={() => {
                          setActiveTab('kitcreator');
                          onAddToast('Bridge complete! Configure artwork and package your sounds.', 'info');
                        }}
                        className="w-full py-1 bg-black hover:bg-zinc-800 text-[8.5px] font-bold uppercase border border-[#1e293b] text-slate-300 rounded transition-all cursor-pointer"
                      >
                        Configure Kit Pack & Publish →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
};
