/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Play, Sparkles, Activity, Sliders, Volume2, Flame, Zap } from 'lucide-react';
import { SynthSettings, Envelope } from '../types';

interface SynthVisualizerProps {
  synth: SynthSettings;
  envelope?: Envelope;
  onUpdateSynth: (updates: Partial<SynthSettings>) => void;
  onUpdateEnvelope?: (updates: Partial<Envelope>) => void;
  onPlay?: () => void;
}

export const SynthVisualizer: React.FC<SynthVisualizerProps> = ({
  synth,
  envelope,
  onUpdateSynth,
  onUpdateEnvelope,
  onPlay,
}) => {
  const [activeTab, setActiveTab] = useState<'scope' | 'harmonics' | 'xy' | 'adsr'>('scope');
  const [scopeTheme, setScopeTheme] = useState<'orange' | 'green' | 'amber' | 'cyan'>('orange');
  const [scopeZoom, setScopeZoom] = useState<number>(1);
  const [triggerSync, setTriggerSync] = useState<boolean>(true);
  
  // A/B Patch Comparison & Continuous Morphing Crossfader
  const [slotA, setSlotA] = useState<SynthSettings>(synth);
  const [slotB, setSlotB] = useState<SynthSettings | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [morphPos, setMorphPos] = useState<number>(0);

  // Sound Design Patch Archetype Classifier
  const patchTags = useMemo(() => {
    const tags: string[] = [];
    if ((synth.subLevel ?? 0) > 0.4) tags.push('#DeepSub');
    if ((synth.fmDepth ?? 0) > 0.5) tags.push('#GlassyFM');
    if ((synth.wavefoldDepth ?? synth.wavefold ?? 0) > 0.4) tags.push('#Wavefolded');
    if ((synth.unisonVoices ?? 1) >= 4) tags.push('#SuperSawUnison');
    if ((synth.warmthEngine ?? 0) > 0.5 || (synth.filterDrive ?? 0) > 0.3) tags.push('#AnalogWarmth');
    if ((synth.noiseLevel ?? 0) > 0.3) tags.push('#TexturalNoise');
    if ((synth.macroChaos ?? 0) > 0.3 || (synth.lorenzRate ?? 0) > 0) tags.push('#ChaoticDrone');
    if (tags.length === 0) tags.push('#CleanSynth');
    return tags;
  }, [synth]);

  const handleSelectSlot = (slot: 'A' | 'B') => {
    if (slot === 'A') {
      setActiveSlot('A');
      setMorphPos(0);
      onUpdateSynth(slotA);
    } else {
      if (!slotB) {
        const currentB = { ...synth };
        setSlotB(currentB);
        setActiveSlot('B');
        setMorphPos(1);
        onUpdateSynth(currentB);
      } else {
        setActiveSlot('B');
        setMorphPos(1);
        onUpdateSynth(slotB);
      }
    }
  };

  const handleCopyAtoB = () => {
    const copy = { ...synth };
    if (activeSlot === 'A') {
      setSlotB(copy);
    } else {
      setSlotA(copy);
    }
  };

  const handleMorphChange = (val: number) => {
    setMorphPos(val);
    if (!slotB) return;
    // Linearly interpolate continuous numerical synth parameters
    const lerp = (a: number = 0, b: number = 0, t: number) => a + (b - a) * t;
    const morphed: Partial<SynthSettings> = {
      detune: lerp(slotA.detune, slotB.detune, val),
      subLevel: lerp(slotA.subLevel, slotB.subLevel, val),
      osc2Mix: lerp(slotA.osc2Mix, slotB.osc2Mix, val),
      osc2Detune: lerp(slotA.osc2Detune, slotB.osc2Detune, val),
      unisonDetune: lerp(slotA.unisonDetune, slotB.unisonDetune, val),
      unisonWidth: lerp(slotA.unisonWidth, slotB.unisonWidth, val),
      fmDepth: lerp(slotA.fmDepth, slotB.fmDepth, val),
      fmRatio: lerp(slotA.fmRatio, slotB.fmRatio, val),
      fmFeedback: lerp(slotA.fmFeedback, slotB.fmFeedback, val),
      ringModFreq: lerp(slotA.ringModFreq, slotB.ringModFreq, val),
      ringModMix: lerp(slotA.ringModMix, slotB.ringModMix, val),
      wavefoldDepth: lerp(slotA.wavefoldDepth, slotB.wavefoldDepth, val),
      filterDrive: lerp(slotA.filterDrive, slotB.filterDrive, val),
      warmthEngine: lerp(slotA.warmthEngine, slotB.warmthEngine, val),
      macroChaos: lerp(slotA.macroChaos, slotB.macroChaos, val),
    };
    onUpdateSynth(morphed);
  };

  // Trigger test tone pitch audition across octaves (C1 to C6)
  const handleAuditionPitch = (midiNote: number) => {
    const targetFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
    onUpdateSynth({ frequency: targetFreq });
    if (onPlay) onPlay();
  };

  // Compute 256 time domain points representing ~2 cycles of the synthesized wave
  const wavePoints = useMemo(() => {
    const points: { x: number; y: number }[] = [];
    const numPoints = 256;
    const osc1Type = synth.oscType || 'sine';
    const osc2Type = synth.osc2Type || 'sawtooth';
    const osc2Mix = synth.osc2Mix ?? 0;
    const osc2Detune = synth.osc2Detune ?? 0;
    const subLevel = synth.subLevel ?? 0;
    const fmDepth = synth.fmDepth ?? 0;
    const fmRatio = synth.fmRatio ?? 2;
    const wavefold = synth.wavefoldDepth ?? synth.wavefold ?? 0;
    const noiseLevel = synth.noiseLevel ?? 0;
    const phaseChaos = synth.phaseChaos ?? 0;
    const drive = synth.filterDrive ?? 0;

    const evalWave = (phase: number, type: string) => {
      const p = ((phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const normP = p / (2 * Math.PI);
      if (type === 'sine') return Math.sin(p);
      if (type === 'triangle') return 1 - 4 * Math.abs(normP - 0.5);
      if (type === 'sawtooth') return 2 * normP - 1;
      if (type === 'square') return normP < 0.5 ? 1 : -1;
      return Math.sin(p);
    };

    let lastFmSample = 0;
    for (let i = 0; i < numPoints; i++) {
      const t = (i / numPoints) * 2 * Math.PI * 2; // 2 complete cycles
      
      // FM Modulation
      const modPhase = t * fmRatio;
      const modSig = Math.sin(modPhase + lastFmSample * (synth.fmFeedback ?? 0));
      lastFmSample = modSig;
      const phaseMod = t + modSig * fmDepth;

      // Osc 1
      let y1 = evalWave(phaseMod + (Math.random() - 0.5) * phaseChaos * 0.2, osc1Type);

      // Osc 2
      let y2 = evalWave(phaseMod * Math.pow(2, osc2Detune / 12), osc2Type);

      // Osc blend
      let y = y1 * (1 - osc2Mix) + y2 * osc2Mix;

      // Sub
      if (subLevel > 0) {
        y = y * (1 - subLevel * 0.4) + Math.sin(t * 0.5) * subLevel * 0.6;
      }

      // Wavefold
      if (wavefold > 0) {
        const foldVal = y * (1 + wavefold * 3);
        y = Math.sin(foldVal * Math.PI * 0.5);
      }

      // Noise
      if (noiseLevel > 0) {
        y = y * (1 - noiseLevel * 0.5) + (Math.random() * 2 - 1) * noiseLevel * 0.5;
      }

      // Drive saturation
      if (drive > 0) {
        y = Math.tanh(y * (1 + drive * 2));
      }

      // Map y (-1.5 to 1.5) to SVG canvas space (0 to 120)
      const svgX = (i / (numPoints - 1)) * 320;
      const svgY = 60 - Math.max(-1.4, Math.min(1.4, y)) * 42;
      points.push({ x: svgX, y: svgY });
    }

    return points;
  }, [synth]);

  // SVG Path string for oscilloscope
  const pathD = useMemo(() => {
    if (wavePoints.length === 0) return '';
    return wavePoints.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');
  }, [wavePoints]);

  // Approximate 16 Harmonic bars derived from waveform parameters
  const harmonicBars = useMemo(() => {
    const bars: number[] = [];
    const oscType = synth.oscType || 'sine';
    const sub = synth.subLevel ?? 0;
    const fm = synth.fmDepth ?? 0;
    const wavefold = synth.wavefoldDepth ?? synth.wavefold ?? 0;
    const noise = synth.noiseLevel ?? 0;
    const chaos = synth.macroChaos ?? 0;

    for (let h = 1; h <= 16; h++) {
      let amp = 0;
      if (h === 1) {
        amp = 1.0;
      } else if (oscType === 'sine') {
        amp = Math.exp(-h * 1.5) + (fm > 0 ? Math.sin(h * fm) * 0.3 : 0);
      } else if (oscType === 'triangle') {
        amp = h % 2 === 1 ? 1 / (h * h) : 0;
      } else if (oscType === 'sawtooth') {
        amp = 1 / h;
      } else if (oscType === 'square') {
        amp = h % 2 === 1 ? 1 / h : 0;
      }

      // Sub harmonic booster on bar 1 & sub
      if (h === 1) amp += sub * 0.4;

      // FM spread
      if (fm > 0) {
        amp += Math.abs(Math.sin(h * (synth.fmRatio || 2))) * fm * 0.4;
      }

      // Wavefold harmonics fill
      if (wavefold > 0) {
        amp += (1 / Math.sqrt(h)) * wavefold * 0.5;
      }

      // Noise & Chaos floor
      amp += (noise + chaos) * 0.15 * Math.random();

      bars.push(Math.min(1.0, Math.max(0.02, amp)));
    }
    return bars;
  }, [synth]);

  // ADSR SVG Path
  const adsrPathD = useMemo(() => {
    if (!envelope) return '';
    const { attack = 0.01, decay = 0.2, sustain = 0.5, release = 0.3 } = envelope;
    
    // Scale total width (320px) to max ~2 seconds envelope view
    const totalTime = Math.max(0.5, attack + decay + 0.3 + release);
    const scale = 280 / totalTime;

    const x0 = 20;
    const y0 = 100; // baseline 0
    const x1 = x0 + Math.max(8, attack * scale);
    const y1 = 15; // Peak level
    const x2 = x1 + Math.max(8, decay * scale);
    const y2 = 100 - sustain * 85; // Sustain level
    const x3 = x2 + 50; // Sustained hold visualization
    const y3 = y2;
    const x4 = Math.min(310, x3 + Math.max(8, release * scale));
    const y4 = 100;

    return `M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4}`;
  }, [envelope]);

  // Handle XY Pad dragging
  const handleXYMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    // X axis -> Warmth / Drive & Filter Cutoff
    // Y axis -> Brightness / FM Depth & Wavefolding
    onUpdateSynth({
      filterDrive: Number(x.toFixed(2)),
      warmthEngine: Number((0.2 + x * 0.8).toFixed(2)),
      fmDepth: Number((y * 5).toFixed(2)),
      wavefoldDepth: Number((y * 2).toFixed(2)),
    });
  };

  return (
    <div className="bg-[#121216] border border-[#232328] rounded-2xl p-4 shadow-2xl space-y-3">
      {/* Top Header & View Modes */}
      <div className="flex flex-col gap-2 border-b border-[#1f1f25] pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Activity size={15} className="animate-pulse" />
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-orange-400 flex items-center gap-1.5">
                SYNTH WAVEFORM & SPECTRUM ANALYZER
                <span className="text-[8px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-1.5 py-0.2 rounded font-mono">
                  DSP v2.4
                </span>
              </div>
              <div className="text-[9px] text-gray-400 font-mono flex items-center gap-2">
                <span>{synth.oscType?.toUpperCase() || 'SINE'} • {synth.unisonVoices || 1}V UNISON</span>
                {/* Acoustic Archetype Tags */}
                <div className="flex items-center gap-1">
                  {patchTags.map((tag) => (
                    <span key={tag} className="text-[8px] text-amber-300/80 bg-amber-950/40 border border-amber-500/20 px-1 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* A/B Comparison Memory Bar & Navigation Tabs */}
          <div className="flex items-center gap-2">
            {/* A/B Compare Tool */}
            <div className="flex items-center gap-1 bg-[#09090b] p-1 rounded-xl border border-[#1f1f26]">
              <button
                onClick={() => handleSelectSlot('A')}
                className={`px-2 py-0.5 text-[9px] font-black uppercase rounded transition-all ${
                  activeSlot === 'A'
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Slot A Patch Memory"
              >
                Slot A
              </button>
              <button
                onClick={() => handleSelectSlot('B')}
                className={`px-2 py-0.5 text-[9px] font-black uppercase rounded transition-all ${
                  activeSlot === 'B'
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Slot B Patch Memory"
              >
                Slot B {slotB ? '•' : ''}
              </button>
              <button
                onClick={handleCopyAtoB}
                className="px-1.5 py-0.5 text-[8px] font-mono text-gray-400 hover:text-purple-300 transition-colors border-l border-gray-800 ml-0.5"
                title="Copy current patch to opposing A/B slot"
              >
                A↔B
              </button>
            </div>

            <div className="flex items-center gap-1 bg-[#0b0b0d] p-1 rounded-xl border border-[#1d1d22]">
              <button
                onClick={() => setActiveTab('scope')}
                className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-lg transition-all ${
                  activeTab === 'scope'
                    ? 'bg-orange-500 text-black shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Oscilloscope
              </button>
              <button
                onClick={() => setActiveTab('harmonics')}
                className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-lg transition-all ${
                  activeTab === 'harmonics'
                    ? 'bg-sky-500 text-black shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Harmonics
              </button>
              <button
                onClick={() => setActiveTab('xy')}
                className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-lg transition-all ${
                  activeTab === 'xy'
                    ? 'bg-yellow-400 text-black shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Morph XY Pad
              </button>
              {envelope && (
                <button
                  onClick={() => setActiveTab('adsr')}
                  className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-lg transition-all ${
                    activeTab === 'adsr'
                      ? 'bg-emerald-400 text-black shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  ADSR Curve
                </button>
              )}

              {onPlay && (
                <button
                  onClick={onPlay}
                  className="ml-2 px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black text-[10px] font-black uppercase rounded-lg flex items-center gap-1 shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
                  title="Audition Synth Sound"
                >
                  <Play size={10} className="fill-black" />
                  Audition
                </button>
              )}
            </div>
          </div>
        </div>

        {/* OCTAVE AUDITION PITCH STRIP (C1–C6 Test Notes) */}
        <div className="flex items-center justify-between bg-[#0a0a0d] px-3 py-1.5 rounded-xl border border-[#1b1b22]">
          <span className="text-[8px] font-mono uppercase text-gray-400 font-extrabold tracking-wider">
            🎹 Quick Pitch Register Test:
          </span>
          <div className="flex items-center gap-1">
            {[
              { note: 36, label: 'C1 Sub' },
              { note: 48, label: 'C2 Bass' },
              { note: 60, label: 'C3 Mid' },
              { note: 72, label: 'C4 Lead' },
              { note: 84, label: 'C5 High' },
              { note: 96, label: 'C6 Air' },
            ].map(({ note, label }) => (
              <button
                key={note}
                onClick={() => handleAuditionPitch(note)}
                className="px-2 py-0.5 bg-[#14141a] hover:bg-orange-500/20 hover:text-orange-300 text-gray-400 text-[8px] font-mono rounded border border-[#23232c] transition-colors"
                title={`Trigger synth at ${label} (${440 * Math.pow(2, (note-69)/12)} Hz)`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Scope Controls */}
          {activeTab === 'scope' && (
            <div className="flex items-center gap-1 border-l border-[#1f1f26] pl-2">
              <span className="text-[8px] font-mono text-gray-500">Theme:</span>
              {(['orange', 'green', 'amber', 'cyan'] as const).map((thm) => (
                <button
                  key={thm}
                  onClick={() => setScopeTheme(thm)}
                  className={`w-3 h-3 rounded-full border ${
                    scopeTheme === thm ? 'ring-2 ring-white' : ''
                  } ${
                    thm === 'orange' ? 'bg-orange-500 border-orange-400' :
                    thm === 'green' ? 'bg-emerald-400 border-emerald-300' :
                    thm === 'amber' ? 'bg-amber-400 border-amber-300' :
                    'bg-cyan-400 border-cyan-300'
                  }`}
                  title={`${thm} CRT Phosphor Theme`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Continuous A ↔ B Patch Morph Crossfader (If Slot B exists) */}
        {slotB && (
          <div className="flex items-center gap-2 bg-purple-950/20 border border-purple-500/30 px-3 py-1.5 rounded-xl">
            <span className="text-[8px] font-extrabold uppercase text-purple-300 tracking-wider">
              🎛️ A ↔ B Continuous Patch Morph
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={morphPos}
              onChange={(e) => handleMorphChange(parseFloat(e.target.value))}
              className="flex-1 accent-purple-400 h-1.5 bg-[#0e0e12] rounded cursor-pointer"
            />
            <span className="text-[9px] font-mono text-purple-300 font-bold">
              {Math.round(morphPos * 100)}% B
            </span>
          </div>
        )}
      </div>

      {/* Main Display Box */}
      <div className="relative bg-[#070709] rounded-xl border border-[#1a1a20] h-32 overflow-hidden flex items-center justify-center p-2">
        {/* Background Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#14141a_1px,transparent_1px),linear-gradient(to_bottom,#14141a_1px,transparent_1px)] bg-[size:16px_16px] opacity-40 pointer-events-none" />

        {/* TAB 1: OSCILLOSCOPE TRACE */}
        {activeTab === 'scope' && (
          <svg className="w-full h-full relative z-10" viewBox="0 0 320 120" preserveAspectRatio="none">
            {/* Center Zero Line */}
            <line x1="0" y1="60" x2="320" y2="60" stroke="#2a2a35" strokeDasharray="2,2" strokeWidth="1" />
            
            {/* Glow Path */}
            <path
              d={pathD}
              fill="none"
              stroke={
                scopeTheme === 'green' ? '#10b981' :
                scopeTheme === 'amber' ? '#f59e0b' :
                scopeTheme === 'cyan' ? '#06b6d4' : '#f97316'
              }
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-20 blur-sm"
            />
            {/* Crisp Foreground Trace */}
            <path
              d={pathD}
              fill="none"
              stroke={
                scopeTheme === 'green' ? '#34d399' :
                scopeTheme === 'amber' ? '#fbbf24' :
                scopeTheme === 'cyan' ? '#22d3ee' : '#fb923c'
              }
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* TAB 2: HARMONICS BAR SPECTRUM */}
        {activeTab === 'harmonics' && (
          <div className="w-full h-full relative z-10 flex items-end justify-between gap-1.5 px-4 pt-4 pb-2">
            {harmonicBars.map((amp, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className="w-full bg-[#181820] rounded-t overflow-hidden relative h-full flex items-end">
                  <div
                    className="w-full bg-gradient-to-t from-sky-600 via-sky-400 to-amber-300 rounded-t transition-all duration-150"
                    style={{ height: `${Math.round(amp * 100)}%` }}
                  />
                </div>
                <span className="text-[7px] font-mono text-gray-500">H{idx + 1}</span>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: TIMBRE MORPHING XY PAD */}
        {activeTab === 'xy' && (
          <div
            onMouseDown={handleXYMove}
            onMouseMove={handleXYMove}
            className="w-full h-full relative z-10 cursor-crosshair select-none flex items-center justify-center"
          >
            {/* Corner Labels */}
            <span className="absolute top-2 left-2 text-[8px] font-bold text-gray-500 uppercase tracking-widest pointer-events-none">
              Clean / Soft
            </span>
            <span className="absolute top-2 right-2 text-[8px] font-bold text-yellow-400 uppercase tracking-widest pointer-events-none">
              Bright / FM / Fold
            </span>
            <span className="absolute bottom-2 left-2 text-[8px] font-bold text-orange-400 uppercase tracking-widest pointer-events-none">
              Warm / Drive / Sat
            </span>
            <span className="absolute bottom-2 right-2 text-[8px] font-bold text-red-400 uppercase tracking-widest pointer-events-none">
              Maximum Chaos & Drive
            </span>

            {/* Target Indicator */}
            {(() => {
              const xPct = (synth.filterDrive ?? 0) * 100;
              const yPct = Math.min(100, ((synth.fmDepth ?? 0) / 5) * 100);
              return (
                <div
                  className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-yellow-400 bg-yellow-400/20 shadow-[0_0_15px_rgba(250,204,21,0.5)] flex items-center justify-center transition-all duration-75 pointer-events-none"
                  style={{ left: `${xPct}%`, top: `${100 - yPct}%` }}
                >
                  <div className="w-1.5 h-1.5 bg-yellow-300 rounded-full animate-ping" />
                </div>
              );
            })()}

            <div className="text-[10px] text-gray-400 font-mono text-center pointer-events-none bg-black/60 px-3 py-1 rounded-full border border-gray-800">
              CLICK & DRAG TO MORPH TIMBRE LIVE
            </div>
          </div>
        )}

        {/* TAB 4: VISUAL ADSR ENVELOPE CURVE */}
        {activeTab === 'adsr' && envelope && (
          <svg className="w-full h-full relative z-10" viewBox="0 0 320 120" preserveAspectRatio="none">
            {/* Grid baseline */}
            <line x1="20" y1="100" x2="310" y2="100" stroke="#2a2a35" strokeWidth="1" />
            
            {/* Filled Envelope Area */}
            <path
              d={`${adsrPathD} L 310 100 Z`}
              fill="rgba(52, 211, 153, 0.15)"
            />
            {/* Envelope Line */}
            <path
              d={adsrPathD}
              fill="none"
              stroke="#34d399"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Stage Text Overlay */}
            <text x="35" y="30" fill="#34d399" fontSize="8" fontWeight="bold" fontFamily="monospace">
              ATTACK: {(envelope.attack ?? 0.01).toFixed(3)}s
            </text>
            <text x="110" y="30" fill="#34d399" fontSize="8" fontWeight="bold" fontFamily="monospace">
              DECAY: {(envelope.decay ?? 0.2).toFixed(2)}s
            </text>
            <text x="180" y="30" fill="#34d399" fontSize="8" fontWeight="bold" fontFamily="monospace">
              SUSTAIN: {Math.round((envelope.sustain ?? 0.5) * 100)}%
            </text>
            <text x="250" y="30" fill="#34d399" fontSize="8" fontWeight="bold" fontFamily="monospace">
              REL: {(envelope.release ?? 0.3).toFixed(2)}s
            </text>
          </svg>
        )}
      </div>

      {/* QUICK MASTER SYNTH MACRO BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* MACRO 1: PUNCH */}
        <div className="bg-[#16161c] p-2 rounded-xl border border-[#23232a] flex items-center justify-between">
          <div>
            <div className="text-[8px] font-extrabold uppercase text-orange-400 tracking-wider">
              💥 PUNCH
            </div>
            <div className="text-[7px] text-gray-500">Sub + Pitch Snap</div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={synth.subLevel ?? 0}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onUpdateSynth({ subLevel: val, pitchEnvAmount: val * 24 });
            }}
            className="w-16 accent-orange-500 h-1 bg-[#0b0b0d] rounded cursor-pointer"
          />
        </div>

        {/* MACRO 2: WARMTH */}
        <div className="bg-[#16161c] p-2 rounded-xl border border-[#23232a] flex items-center justify-between">
          <div>
            <div className="text-[8px] font-extrabold uppercase text-amber-400 tracking-wider">
              🔥 WARMTH
            </div>
            <div className="text-[7px] text-gray-500">ZDF + Analog Slop</div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={synth.warmthEngine ?? 0.3}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onUpdateSynth({ warmthEngine: val, filterDrive: val * 0.8, slopAmount: val * 0.5 });
            }}
            className="w-16 accent-amber-500 h-1 bg-[#0b0b0d] rounded cursor-pointer"
          />
        </div>

        {/* MACRO 3: BIGHTNESS / WAVEFOLD */}
        <div className="bg-[#16161c] p-2 rounded-xl border border-[#23232a] flex items-center justify-between">
          <div>
            <div className="text-[8px] font-extrabold uppercase text-yellow-400 tracking-wider">
              ⚡ FOLD / FM
            </div>
            <div className="text-[7px] text-gray-500">Wavefolder & FM</div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={(synth.wavefoldDepth ?? 0) / 3}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onUpdateSynth({ wavefoldDepth: val * 3, fmDepth: val * 4 });
            }}
            className="w-16 accent-yellow-400 h-1 bg-[#0b0b0d] rounded cursor-pointer"
          />
        </div>

        {/* MACRO 4: DIMENSION */}
        <div className="bg-[#16161c] p-2 rounded-xl border border-[#23232a] flex items-center justify-between">
          <div>
            <div className="text-[8px] font-extrabold uppercase text-sky-400 tracking-wider">
              🌌 DIMENSION
            </div>
            <div className="text-[7px] text-gray-500">Unison + Width</div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={(synth.unisonVoices ? synth.unisonVoices / 7 : 0.1)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              const voices = Math.max(1, Math.round(val * 7));
              onUpdateSynth({ unisonVoices: voices, unisonDetune: val * 35, unisonWidth: val });
            }}
            className="w-16 accent-sky-400 h-1 bg-[#0b0b0d] rounded cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
