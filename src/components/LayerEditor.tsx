/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Save, Dices, Trash2, Music, Waves, Activity, 
  Sliders, Settings2, Flame, FolderHeart, Play, Info, Zap,
  Scissors
} from 'lucide-react';
import { SoundLayer, SynthSettings, FXSettings, Envelope, FXPreset, DEFAULT_ENVELOPE, DEFAULT_FX, DEFAULT_SYNTH } from '../types';
import { Knob } from './Knob';
import { SmartRandomizerModal } from './SmartRandomizerModal';
import { SynthVisualizer } from './SynthVisualizer';

interface LayerEditorProps {
  selectedLayer: SoundLayer;
  onUpdate: (updates: Partial<SoundLayer>) => void;
  onPlay: () => void;
  onEvolve?: () => void;
  onBounceLayer?: (layer: SoundLayer) => void;
}

interface SynthPreset {
  name: string;
  isCustom?: boolean;
  oscType: OscillatorType;
  frequency: number;
  subLevel: number;
  pitchEnvAmount: number;
  pitchEnvDecay: number;
  envelope: Envelope;
  fx: FXSettings;
  chaosEnabled: boolean;
  synth?: Partial<SynthSettings>;
}

// Highly optimized musical default presets
const FACTORY_PRESETS: SynthPreset[] = [
  {
    name: "Analog Pluck",
    oscType: 'square',
    frequency: 440, // A4
    subLevel: 0.1,
    pitchEnvAmount: 0,
    pitchEnvDecay: 0.1,
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.0, release: 0.1 },
    fx: {
      distortionEnabled: true,
      distortion: 0.05,
      bitcrushEnabled: false,
      bitcrush: 0,
      filterEnabled: true,
      filterFreq: 800,
      filterRes: 1.5,
      filterType: 'lowpass',
      delayEnabled: true,
      delayTime: 0.25,
      delayFeedback: 0.4,
      reverbEnabled: true,
      reverbMix: 0.2,
      chorusEnabled: false,
      chorusMix: 0,
      compressorEnabled: true,
      compressorThreshold: -15,
      compressorRatio: 3,
      lfoEnabled: false,
      lfoRate: 1,
      lfoDepth: 0,
      lfoType: 'sine'
    },
    chaosEnabled: false,
  },
  {
    name: "Reese Bass Heavy",
    oscType: 'sawtooth',
    frequency: 41.2, // E1
    subLevel: 0.4,
    pitchEnvAmount: 0,
    pitchEnvDecay: 0.1,
    envelope: { attack: 0.08, decay: 0.4, sustain: 0.8, release: 0.6 },
    fx: {
      distortionEnabled: true,
      distortion: 0.4,
      bitcrushEnabled: false,
      bitcrush: 0,
      filterEnabled: true,
      filterFreq: 400,
      filterRes: 0.5,
      filterType: 'lowpass',
      delayEnabled: false,
      delayTime: 0,
      delayFeedback: 0,
      reverbEnabled: false,
      reverbMix: 0,
      chorusEnabled: true,
      chorusMix: 0.8,
      compressorEnabled: true,
      compressorThreshold: -20,
      compressorRatio: 6,
      lfoEnabled: true,
      lfoRate: 4,
      lfoDepth: 0.1,
      lfoType: 'sine'
    },
    chaosEnabled: true,
    synth: {
      phaseChaos: 0.2,
      cycleStretch: 0.0,
      fractalHarmonics: 0.0,
      macroChaos: 0.1,
    }
  },
  {
    name: "Space Laser FX",
    oscType: 'triangle',
    frequency: 1200,
    subLevel: 0,
    pitchEnvAmount: -48,
    pitchEnvDecay: 0.2,
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.1 },
    fx: {
      distortionEnabled: false,
      distortion: 0,
      bitcrushEnabled: true,
      bitcrush: 0.1,
      filterEnabled: true,
      filterFreq: 4000,
      filterRes: 2.0,
      filterType: 'bandpass',
      delayEnabled: true,
      delayTime: 0.15,
      delayFeedback: 0.6,
      reverbEnabled: true,
      reverbMix: 0.4,
      chorusEnabled: false,
      chorusMix: 0,
      compressorEnabled: true,
      compressorThreshold: -12,
      compressorRatio: 4,
      lfoEnabled: false,
      lfoRate: 0,
      lfoDepth: 0,
      lfoType: 'sine'
    },
    chaosEnabled: false,
  },
  {
    name: "LoFi Keys",
    oscType: 'sine',
    frequency: 330, // E4
    subLevel: 0.1,
    pitchEnvAmount: 1,
    pitchEnvDecay: 0.5,
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.5 },
    fx: {
      distortionEnabled: true,
      distortion: 0.1,
      bitcrushEnabled: true,
      bitcrush: 0.4,
      filterEnabled: true,
      filterFreq: 1500,
      filterRes: 0.5,
      filterType: 'lowpass',
      delayEnabled: false,
      delayTime: 0,
      delayFeedback: 0,
      reverbEnabled: true,
      reverbMix: 0.3,
      chorusEnabled: true,
      chorusMix: 0.6,
      compressorEnabled: true,
      compressorThreshold: -18,
      compressorRatio: 2.5,
      lfoEnabled: true,
      lfoRate: 3,
      lfoDepth: 0.1,
      lfoType: 'sine'
    },
    chaosEnabled: true,
    synth: {
      phaseChaos: 0.1,
      cycleStretch: 0.1,
      errorInjection: 0.05,
      sampleRateChaos: 0.2,
      macroChaos: 0.3,
    }
  },
  {
    name: "Massive FM Bass",
    oscType: 'square',
    frequency: 41.2, // E1
    subLevel: 1.0,
    pitchEnvAmount: 12,
    pitchEnvDecay: 0.15,
    envelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.3 },
    fx: {
      distortionEnabled: true,
      distortion: 0.6,
      bitcrushEnabled: true,
      bitcrush: 0.1,
      filterEnabled: true,
      filterFreq: 300,
      filterRes: 2.5,
      filterType: 'lowpass',
      delayEnabled: false,
      delayTime: 0,
      delayFeedback: 0,
      reverbEnabled: false,
      reverbMix: 0,
      chorusEnabled: true,
      chorusMix: 0.2,
      compressorEnabled: true,
      compressorThreshold: -24,
      compressorRatio: 8,
      lfoEnabled: true,
      lfoRate: 8,
      lfoDepth: 0.2,
      lfoType: 'sine'
    },
    chaosEnabled: true,
    synth: {
      phaseChaos: 0.3,
      cycleStretch: 0.2,
      fractalHarmonics: 0.4,
      macroChaos: 0.2,
    }
  },
  {
    name: "Fat Sub Bass",
    oscType: 'sine',
    frequency: 55, // A1
    subLevel: 0.8,
    pitchEnvAmount: 24,
    pitchEnvDecay: 0.08,
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.3 },
    fx: {
      distortion: 0.1,
      bitcrush: 0.0,
      filterFreq: 250,
      filterRes: 1.5,
      filterType: 'lowpass',
      delayTime: 0,
      delayFeedback: 0,
      reverbMix: 0,
      chorusMix: 0,
      compressorThreshold: -18,
      compressorRatio: 4,
      lfoRate: 0,
      lfoDepth: 0,
      lfoType: 'sine'
    },
    chaosEnabled: false,
  },
  {
    name: "Smooth Melodic Lead",
    oscType: 'sawtooth',
    frequency: 440, // A4
    subLevel: 0.2,
    pitchEnvAmount: 0,
    pitchEnvDecay: 0.1,
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.8, release: 0.4 },
    fx: {
      distortion: 0.05,
      bitcrush: 0,
      filterFreq: 1800,
      filterRes: 2.0,
      filterType: 'lowpass',
      delayTime: 0.25,
      delayFeedback: 0.35,
      reverbMix: 0.25,
      chorusMix: 0.3,
      compressorThreshold: -15,
      compressorRatio: 2.5,
      lfoRate: 6,
      lfoDepth: 0.15,
      lfoType: 'sine'
    },
    chaosEnabled: false,
  },
  {
    name: "Cinematic Swarm Pad",
    oscType: 'sawtooth',
    frequency: 220, // A3
    subLevel: 0.6,
    pitchEnvAmount: 2,
    pitchEnvDecay: 2.0,
    envelope: { attack: 1.5, decay: 2.0, sustain: 0.8, release: 3.5 },
    fx: {
      distortionEnabled: true,
      distortion: 0.1,
      bitcrushEnabled: false,
      bitcrush: 0.0,
      filterEnabled: true,
      filterFreq: 1200,
      filterRes: 0.5,
      filterType: 'bandpass',
      delayEnabled: true,
      delayTime: 0.6,
      delayFeedback: 0.7,
      reverbEnabled: true,
      reverbMix: 0.85,
      chorusEnabled: true,
      chorusMix: 0.7,
      compressorEnabled: true,
      compressorThreshold: -30,
      compressorRatio: 3.0,
      lfoEnabled: true,
      lfoRate: 0.1,
      lfoDepth: 0.6,
      lfoType: 'triangle'
    },
    chaosEnabled: true,
    synth: {
      phaseChaos: 0.8,
      cycleStretch: 0.4,
      fractalHarmonics: 0.2,
      lorenzRate: 0.3,
      logisticChaos: 0.5,
      macroChaos: 0.5,
      grainCount: 50,
      grainDrift: 0.8,
      grainSizeJitter: 0.6,
      sprayRadius: 0.9,
    }
  },
  {
    name: "Ethereal Ambient Pad",
    oscType: 'sine',
    frequency: 330, // E4
    subLevel: 0.4,
    pitchEnvAmount: 0,
    pitchEnvDecay: 0.5,
    envelope: { attack: 0.8, decay: 1.0, sustain: 1.0, release: 1.2 },
    fx: {
      distortion: 0.0,
      bitcrush: 0.0,
      filterFreq: 800,
      filterRes: 0.8,
      filterType: 'lowpass',
      delayTime: 0.4,
      delayFeedback: 0.5,
      reverbMix: 0.6,
      chorusMix: 0.4,
      compressorThreshold: -24,
      compressorRatio: 2.0,
      lfoRate: 0.25,
      lfoDepth: 0.45,
      lfoType: 'triangle'
    },
    chaosEnabled: false,
  },
  {
    name: "808 Analog Boom Kick",
    oscType: 'sine',
    frequency: 50, // G#1
    subLevel: 0.0,
    pitchEnvAmount: 48,
    pitchEnvDecay: 0.05,
    envelope: { attack: 0.001, decay: 0.45, sustain: 0.0, release: 0.15 },
    fx: {
      distortion: 0.2,
      bitcrush: 0.05,
      filterFreq: 120,
      filterRes: 1.0,
      filterType: 'lowpass',
      delayTime: 0,
      delayFeedback: 0,
      reverbMix: 0,
      chorusMix: 0,
      compressorThreshold: -12,
      compressorRatio: 4,
      lfoRate: 0,
      lfoDepth: 0,
      lfoType: 'sine'
    },
    chaosEnabled: false,
  },
  {
    name: "Screaming Acid Lead",
    oscType: 'sawtooth',
    frequency: 110, // A2
    subLevel: 0.1,
    pitchEnvAmount: 12,
    pitchEnvDecay: 0.15,
    envelope: { attack: 0.002, decay: 0.18, sustain: 0.4, release: 0.25 },
    fx: {
      distortion: 0.45,
      bitcrush: 0.0,
      filterFreq: 900,
      filterRes: 6.5,
      filterType: 'lowpass',
      delayTime: 0.2,
      delayFeedback: 0.25,
      reverbMix: 0.15,
      chorusMix: 0.1,
      compressorThreshold: -16,
      compressorRatio: 4,
      lfoRate: 4.5,
      lfoDepth: 0.35,
      lfoType: 'triangle'
    },
    chaosEnabled: false,
  },
  {
    name: "Cyberpunk Glitch Swarm",
    oscType: 'square',
    frequency: 120,
    subLevel: 0.3,
    pitchEnvAmount: 0,
    pitchEnvDecay: 0.1,
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.4 },
    fx: {
      distortion: 0.3,
      bitcrush: 0.45,
      filterFreq: 4000,
      filterRes: 3.0,
      filterType: 'lowpass',
      delayTime: 0.15,
      delayFeedback: 0.4,
      reverbMix: 0.3,
      chorusMix: 0.5,
      compressorThreshold: -14,
      compressorRatio: 4.0,
      lfoRate: 15,
      lfoDepth: 0.8,
      lfoType: 'sawtooth'
    },
    chaosEnabled: true,
    synth: {
      phaseChaos: 0.4,
      cycleStretch: 0.5,
      fractalHarmonics: 0.6,
      harmonicBias: 0.3,
      lorenzRate: 0.4,
      logisticChaos: 0.45,
      feedbackTurbulence: 0.5,
      macroChaos: 0.6,
      grainCount: 30,
      grainDrift: 0.4,
      grainSizeJitter: 0.3,
      sprayRadius: 0.6,
      sampleRateChaos: 0.2,
      errorInjection: 0.02,
      resonanceBloom: 0.3,
      selfOscillation: 0.2,
    }
  }
];

const Sub808Visualizer: React.FC<{ subDesign?: SoundLayer['subDesign'] }> = ({ subDesign }) => {
  const subType = subDesign?.subType || 'sine';
  const subLevel = subDesign?.subLevel ?? 0.5;
  const saturation = subDesign?.harmonicSaturation ?? 0;
  const drive = subDesign?.drive ?? 0;
  const harm2nd = subDesign?.harmonic2nd ?? 0;
  const harm3rd = subDesign?.harmonic3rd ?? 0;
  const enabled = subDesign?.subEnabled ?? false;

  // Generate waveform path points for 100 samples
  const width = 240;
  const height = 90;
  const points: string[] = [];
  const numPoints = 80;

  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * width;
    const t = (i / numPoints) * 2 * Math.PI * 2; // 2 full cycles
    let yVal = 0;

    if (subType === 'sine') {
      yVal = Math.sin(t);
    } else if (subType === 'triangle') {
      yVal = (Math.asin(Math.sin(t)) * (2 / Math.PI));
    } else if (subType === 'square') {
      yVal = Math.sin(t) >= 0 ? 1 : -1;
    }

    // Add 2nd and 3rd harmonics
    if (harm2nd > 0) yVal += (harm2nd / 100) * 0.4 * Math.sin(2 * t);
    if (harm3rd > 0) yVal += (harm3rd / 100) * 0.3 * Math.sin(3 * t);

    // Apply saturation & drive soft-clipping (tanh)
    const totalDrive = 1 + saturation * 3 + drive * 5;
    yVal = Math.tanh(yVal * totalDrive);

    // Scale by level and invert y for SVG coordinates (height/2 is center)
    const scaledY = (height / 2) - (yVal * (height / 2.4) * Math.min(1.2, subLevel));
    points.push(`${x.toFixed(1)},${scaledY.toFixed(1)}`);
  }

  const pathD = `M ${points.join(' L ')}`;

  return (
    <div className="flex flex-col p-3 bg-[#08080a] rounded-xl border border-red-500/20 text-center space-y-2 h-full justify-between">
      <div className="flex items-center justify-between text-[9px] font-mono text-red-400 font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1"><Zap size={10} className="animate-pulse text-red-500" /> 808 SUB OSCILLOSCOPE</span>
        <span className="text-gray-500">{enabled ? `${subType.toUpperCase()} @ ${Math.round(subLevel * 100)}%` : 'DISABLED'}</span>
      </div>

      <div className="h-24 bg-black/80 rounded-lg border border-red-900/40 relative overflow-hidden flex items-center justify-center p-1">
        <div className="absolute inset-0 bg-radial-glow opacity-20 pointer-events-none" />
        {/* Baseline */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-red-950/60" />
        
        {/* SVG Waveform */}
        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <path
            d={pathD}
            fill="none"
            stroke={enabled ? "#ef4444" : "#4b5563"}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={enabled ? "drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" : ""}
            opacity={enabled ? 0.95 : 0.3}
          />
        </svg>

        <div className="absolute bottom-1 right-2 text-[9px] font-mono font-black text-red-500/80 uppercase">
          SUB PEAK: {Math.min(100, Math.round((subLevel + drive * 0.5) * 60))} Hz
        </div>
      </div>

      {/* Spectral Harmonic Content Bars */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1 pt-1 border-t border-red-950/50 text-[9px] font-mono">
        <div className="flex flex-col items-center">
          <span className="text-gray-500">FUND</span>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-0.5">
            <div className="bg-red-500 h-full transition-all" style={{ width: `${Math.min(100, subLevel * 66)}%` }} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-gray-500">2ND</span>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-0.5">
            <div className="bg-amber-500 h-full transition-all" style={{ width: `${harm2nd}%` }} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-gray-500">3RD</span>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-0.5">
            <div className="bg-yellow-500 h-full transition-all" style={{ width: `${harm3rd}%` }} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-gray-500">DRIVE</span>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-0.5">
            <div className="bg-rose-500 h-full transition-all" style={{ width: `${drive * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export function LayerEditor({ selectedLayer, onUpdate, onPlay, onEvolve, onBounceLayer }: LayerEditorProps) {
  const [activeTab, setActiveTab] = useState<'synth' | 'layerfx'>('synth');
  const [customPresets, setCustomPresets] = useState<SynthPreset[]>([]);
  const [fxPresets, setFxPresets] = useState<FXPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [newFxPresetName, setNewFxPresetName] = useState('');
  const [randomStyle, setRandomStyle] = useState<'lead' | 'bass' | 'pad' | 'glitch'>('lead');
  const [chaosEnabled, setChaosEnabled] = useState(false);
  const [isRandomizerOpen, setIsRandomizerOpen] = useState(false);

  // Load custom presets on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sonik_custom_synth_presets');
      if (saved) {
        setCustomPresets(JSON.parse(saved));
      }
      const savedFx = localStorage.getItem('sonik_fx_presets');
      if (savedFx) {
        setFxPresets(JSON.parse(savedFx));
      }
    } catch (e) {
      console.warn('Failed to load custom presets', e);
    }
  }, []);

  const saveFxPreset = () => {
    if (!newFxPresetName.trim()) return;
    const newPreset: FXPreset = {
      id: Math.random().toString(36).substr(2, 9),
      name: newFxPresetName,
      settings: { ...selectedLayer.fx },
      createdAt: new Date().toISOString()
    };
    const updated = [...fxPresets, newPreset];
    setFxPresets(updated);
    localStorage.setItem('sonik_fx_presets', JSON.stringify(updated));
    setNewFxPresetName('');
  };

  const loadFxPreset = (preset: FXPreset) => {
    onUpdate({ 
      fx: { ...preset.settings },
      fxPresetId: preset.id
    });
  };

  const deleteFxPreset = (id: string) => {
    const updated = fxPresets.filter(p => p.id !== id);
    setFxPresets(updated);
    localStorage.setItem('sonik_fx_presets', JSON.stringify(updated));
  };

  // Sync chaosEnabled checkbox state with current settings
  useEffect(() => {
    if (selectedLayer.type === 'synth' && selectedLayer.synth) {
      const s = selectedLayer.synth;
      const hasChaos = (s.phaseChaos || 0) > 0 || (s.cycleStretch || 0) !== 0 || (s.fractalHarmonics || 0) > 0 || (s.lorenzRate || 0) > 0 || (s.logisticChaos || 0) > 0;
      setChaosEnabled(hasChaos);
    } else {
      setChaosEnabled(false);
    }
  }, [selectedLayer.id]);

  const updateSynthSetting = (key: keyof SynthSettings, value: any) => {
    if (!selectedLayer.synth) return;
    onUpdate({
      synth: {
        ...selectedLayer.synth,
        [key]: value
      }
    });
  };

  const updateSynthSettings = (updates: Partial<SynthSettings>) => {
    if (!selectedLayer.synth) return;
    onUpdate({
      synth: {
        ...selectedLayer.synth,
        ...updates
      }
    });
  };

  const updateFXSetting = (key: keyof FXSettings, value: any) => {
    onUpdate({
      fx: {
        ...selectedLayer.fx,
        [key]: value
      }
    });
  };

  const updateEnvelopeSetting = (key: keyof Envelope, value: any) => {
    onUpdate({
      envelope: {
        ...(selectedLayer.envelope || DEFAULT_ENVELOPE),
        [key]: value
      }
    });
  };

  // Preset saving & loading
  const savePreset = () => {
    if (!newPresetName.trim() || selectedLayer.type !== 'synth') return;
    const currentPreset: SynthPreset = {
      name: newPresetName.trim(),
      isCustom: true,
      oscType: selectedLayer.synth?.oscType || 'sine',
      frequency: selectedLayer.synth?.frequency || 440,
      subLevel: selectedLayer.synth?.subLevel || 0,
      pitchEnvAmount: selectedLayer.synth?.pitchEnvAmount || 0,
      pitchEnvDecay: selectedLayer.synth?.pitchEnvDecay || 0.1,
      envelope: { ...(selectedLayer.envelope || DEFAULT_ENVELOPE) },
      fx: { ...(selectedLayer.fx || DEFAULT_FX) },
      chaosEnabled: chaosEnabled,
      synth: selectedLayer.synth ? { ...selectedLayer.synth } : undefined
    };

    const updated = [...customPresets, currentPreset];
    setCustomPresets(updated);
    setNewPresetName('');
    try {
      localStorage.setItem('sonik_custom_synth_presets', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const deletePreset = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((_, i) => i !== idx);
    setCustomPresets(updated);
    try {
      localStorage.setItem('sonik_custom_synth_presets', JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }
  };

  const loadPreset = (preset: SynthPreset) => {
    const updates: Partial<SoundLayer> = {
      envelope: { ...preset.envelope },
      fx: { ...preset.fx },
    };

    if (selectedLayer.type === 'synth') {
      const baseSynth: SynthSettings = {
        ...DEFAULT_SYNTH,
        ...(selectedLayer.synth || {}),
        oscType: preset.oscType,
        detune: preset.synth?.detune || 0,
        frequency: preset.frequency,
        pitchEnvAmount: preset.pitchEnvAmount,
        pitchEnvDecay: preset.pitchEnvDecay,
        subLevel: preset.subLevel,
      };

      if (preset.chaosEnabled && preset.synth) {
        updates.synth = { ...baseSynth, ...preset.synth };
        setChaosEnabled(true);
      } else {
        updates.synth = {
          ...baseSynth,
          phaseChaos: 0,
          cycleStretch: 0,
          fractalHarmonics: 0,
          harmonicBias: 0,
          lorenzRate: 0,
          logisticChaos: 0,
          feedbackTurbulence: 0,
          macroChaos: 0,
          grainCount: 0,
          grainDrift: 0,
          grainSizeJitter: 0,
          sprayRadius: 0,
          sampleRateChaos: 0,
          errorInjection: 0,
          resonanceBloom: 0,
          selfOscillation: 0,
          zeroCrossingMutator: 0
        };
        setChaosEnabled(false);
      }
      // Also clear out static decoded audio buffer so synth regenerates procedurally with new settings
      updates.audioBuffer = undefined;
    }

    onUpdate(updates);
    setTimeout(onPlay, 100);
  };

  // Smart Randomizer algorithm
  const handleRandomize = () => {
    if (selectedLayer.type !== 'synth') return;

    let oscType: any = 'sine';
    let frequency = 220;
    let subLevel = 0;
    let pitchEnvAmount = 0;
    let pitchEnvDecay = 0.1;
    let envelope: Envelope = { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 };
    let fx: FXSettings = {
      distortion: 0,
      bitcrush: 0,
      filterFreq: 20000,
      filterRes: 1.0,
      filterType: 'lowpass',
      delayTime: 0,
      delayFeedback: 0,
      reverbMix: 0.1,
      chorusMix: 0,
      compressorThreshold: -16,
      compressorRatio: 4,
      lfoRate: 0,
      lfoDepth: 0,
      lfoType: 'sine'
    };

    let synthChaos: Partial<SynthSettings> = {
      phaseChaos: 0,
      cycleStretch: 0,
      fractalHarmonics: 0,
      harmonicBias: 0,
      lorenzRate: 0,
      logisticChaos: 0,
      feedbackTurbulence: 0,
      macroChaos: 0,
      grainCount: 0,
      grainDrift: 0,
      grainSizeJitter: 0,
      sprayRadius: 0,
      sampleRateChaos: 0,
      errorInjection: 0,
      resonanceBloom: 0,
      selfOscillation: 0,
      zeroCrossingMutator: 0
    };

    const roll = (min: number, max: number) => min + Math.random() * (max - min);
    const choose = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    switch (randomStyle) {
      case 'lead':
        oscType = choose(['sawtooth', 'square', 'triangle']);
        frequency = Math.floor(roll(220, 660));
        subLevel = roll(0, 0.3);
        pitchEnvAmount = Math.random() > 0.5 ? Math.floor(roll(-12, 12)) : 0;
        pitchEnvDecay = roll(0.05, 0.2);
        envelope = {
          attack: roll(0.002, 0.08),
          decay: roll(0.1, 0.35),
          sustain: roll(0.2, 0.7),
          release: roll(0.15, 0.4)
        };
        fx = {
          ...fx,
          filterFreq: Math.floor(roll(800, 3500)),
          filterRes: roll(1.5, 4.0),
          delayTime: Math.random() > 0.3 ? roll(0.15, 0.3) : 0,
          delayFeedback: roll(0.2, 0.4),
          reverbMix: roll(0.1, 0.3),
          chorusMix: roll(0, 0.3),
          lfoRate: Math.random() > 0.5 ? roll(3, 8) : 0,
          lfoDepth: roll(0.05, 0.2)
        };
        setChaosEnabled(false);
        break;

      case 'bass':
        oscType = choose(['sine', 'triangle', 'sawtooth']);
        frequency = Math.floor(roll(45, 90));
        subLevel = roll(0.4, 0.9);
        pitchEnvAmount = Math.random() > 0.5 ? Math.floor(roll(12, 24)) : 0;
        pitchEnvDecay = roll(0.04, 0.12);
        envelope = {
          attack: roll(0.001, 0.01),
          decay: roll(0.2, 0.5),
          sustain: roll(0.3, 0.8),
          release: roll(0.2, 0.4)
        };
        fx = {
          ...fx,
          filterFreq: Math.floor(roll(150, 600)),
          filterRes: roll(1.0, 2.2),
          distortion: roll(0.05, 0.3),
          bitcrush: Math.random() > 0.6 ? roll(0.1, 0.25) : 0,
          reverbMix: 0,
          delayTime: 0
        };
        setChaosEnabled(false);
        break;

      case 'pad':
        oscType = choose(['sine', 'triangle', 'sawtooth']);
        frequency = Math.floor(roll(130, 330));
        subLevel = roll(0.2, 0.5);
        envelope = {
          attack: roll(0.5, 1.5),
          decay: roll(0.8, 1.5),
          sustain: roll(0.7, 1.0),
          release: roll(0.6, 1.4)
        };
        fx = {
          ...fx,
          filterFreq: Math.floor(roll(400, 1500)),
          filterRes: roll(0.8, 1.8),
          delayTime: roll(0.3, 0.45),
          delayFeedback: roll(0.4, 0.55),
          reverbMix: roll(0.4, 0.7),
          chorusMix: roll(0.2, 0.5),
          lfoRate: roll(0.1, 1.2),
          lfoDepth: roll(0.2, 0.55),
          lfoType: 'triangle'
        };
        // Add extremely subtle movement
        synthChaos = {
          ...synthChaos,
          phaseChaos: roll(0, 0.15),
          cycleStretch: roll(-0.15, 0.15)
        };
        setChaosEnabled(synthChaos.phaseChaos! > 0);
        break;

      case 'glitch':
        oscType = choose(['sawtooth', 'square']);
        frequency = Math.floor(roll(60, 440));
        subLevel = roll(0, 0.4);
        envelope = {
          attack: roll(0.002, 0.05),
          decay: roll(0.08, 0.3),
          sustain: roll(0.1, 0.6),
          release: roll(0.1, 0.4)
        };
        fx = {
          ...fx,
          filterFreq: Math.floor(roll(1000, 6000)),
          filterRes: roll(2.0, 5.0),
          distortion: roll(0.2, 0.5),
          bitcrush: roll(0.2, 0.6),
          reverbMix: roll(0.15, 0.4),
          delayTime: roll(0.1, 0.25),
          delayFeedback: roll(0.3, 0.5),
          lfoRate: roll(8, 20),
          lfoDepth: roll(0.3, 0.8),
          lfoType: 'sawtooth'
        };
        synthChaos = {
          phaseChaos: roll(0.3, 0.75),
          cycleStretch: roll(-0.6, 0.6),
          fractalHarmonics: roll(0.2, 0.7),
          harmonicBias: roll(0.1, 0.6),
          lorenzRate: roll(0.2, 0.8),
          logisticChaos: roll(0.2, 0.6),
          feedbackTurbulence: roll(0.2, 0.65),
          macroChaos: roll(0.3, 0.8),
          grainCount: Math.floor(roll(10, 45)),
          grainDrift: roll(0.2, 0.6),
          grainSizeJitter: roll(0.2, 0.5),
          sprayRadius: roll(0.3, 0.8),
          sampleRateChaos: roll(0.15, 0.5),
          errorInjection: roll(0.01, 0.04),
          resonanceBloom: roll(0.1, 0.5),
          selfOscillation: roll(0.1, 0.4),
          zeroCrossingMutator: 0
        };
        setChaosEnabled(true);
        break;
    }

    onUpdate({
      audioBuffer: undefined, // Clear pre-rendered buffer so procedural synth engine renders fresh
      envelope,
      fx,
      synth: {
        oscType,
        detune: selectedLayer.synth?.detune || 0,
        frequency,
        pitchEnvAmount,
        pitchEnvDecay,
        subLevel,
        ...synthChaos
      }
    });

    // Play back instantly
    setTimeout(onPlay, 120);
  };

  const handleToggleChaos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setChaosEnabled(checked);
    if (!checked && selectedLayer.synth) {
      // Clear out chaos values
      onUpdate({
        synth: {
          ...selectedLayer.synth,
          phaseChaos: 0,
          cycleStretch: 0,
          fractalHarmonics: 0,
          harmonicBias: 0,
          lorenzRate: 0,
          logisticChaos: 0,
          feedbackTurbulence: 0,
          macroChaos: 0,
          grainCount: 0,
          grainDrift: 0,
          grainSizeJitter: 0,
          sprayRadius: 0,
          sampleRateChaos: 0,
          errorInjection: 0,
          resonanceBloom: 0,
          selfOscillation: 0,
          zeroCrossingMutator: 0
        }
      });
    }
  };

  const renderPowerToggle = (key: keyof FXSettings, label: string, randomizeFields?: Array<keyof FXSettings>, tooltip?: string) => {
    const isEnabled = selectedLayer.fx[key] !== false;
    return (
      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-[#1b1b20]" title={tooltip}>
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 cursor-help select-none" onDoubleClick={() => updateFXSetting(key, !isEnabled)}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          {randomizeFields && (
            <button
              onClick={() => {
                const updates: any = {};
                randomizeFields.forEach(field => {
                   if (field === 'distortion') updates.distortion = parseFloat(Math.random().toFixed(2));
                   if (field === 'bitcrush') updates.bitcrush = parseFloat(Math.random().toFixed(2));
                   if (field === 'filterFreq') updates.filterFreq = parseFloat((Math.random() * 8000).toFixed(0));
                   if (field === 'filterRes') updates.filterRes = parseFloat((Math.random() * 20).toFixed(1));
                   if (field === 'delayTime') updates.delayTime = parseFloat((Math.random() * 0.5).toFixed(2));
                   if (field === 'delayFeedback') updates.delayFeedback = parseFloat((Math.random() * 0.8).toFixed(2));
                   if (field === 'chorusMix') updates.chorusMix = parseFloat(Math.random().toFixed(2));
                   if (field === 'compressorThreshold') updates.compressorThreshold = parseFloat((-60 + Math.random() * 60).toFixed(0));
                   if (field === 'compressorRatio') updates.compressorRatio = parseFloat((1 + Math.random() * 10).toFixed(1));
                   if (field === 'reverbMix') updates.reverbMix = parseFloat((Math.random() * 0.8).toFixed(2));
                   if (field === 'transientAttack') updates.transientAttack = parseFloat(((Math.random() * 2 - 1) * 100).toFixed(0));
                   if (field === 'transientSustain') updates.transientSustain = parseFloat(((Math.random() * 2 - 1) * 100).toFixed(0));
                });
                onUpdate({ fx: { ...selectedLayer.fx, ...updates } });
              }}
              className="text-[7px] text-gray-500 hover:text-white bg-[#1a1a1f] px-1 py-0.5 rounded border border-[#222]"
              title="Randomize Module Settings"
            >
              RND
            </button>
          )}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => updateFXSetting(key, e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-6 h-3.5 bg-[#18181b] rounded-full peer peer-checked:after:translate-x-2.5 peer-checked:after:bg-sky-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#52525b] after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-sky-950/50 peer-checked:border peer-checked:border-sky-500/20"></div>
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#0b0b0d] rounded-2xl border border-[#1f1f23] overflow-hidden shadow-2xl flex flex-col h-full min-h-[500px]">
      
      {/* Layer Header with Rename Input & Audition Button (Skinny Compact Layout) */}
      <div className="bg-[#08080a] px-3.5 py-2 border-b border-[#1f1f23] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
            {selectedLayer.type === 'sample' ? <Waves size={14} /> : <Music size={14} />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-[#71717a] uppercase tracking-wider font-bold shrink-0">
              {selectedLayer.type === 'sample' ? 'Sample' : 'Synth'}:
            </span>
            <input
              type="text"
              value={selectedLayer.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="bg-transparent border-b border-transparent hover:border-[#27272a] focus:border-orange-500 text-xs font-black text-white uppercase focus:outline-none transition-all font-sans py-0.5 tracking-wide w-36 sm:w-48"
              placeholder="Unnamed Layer"
              title="Click to rename layer"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onUpdate({ muted: !selectedLayer.muted })}
            className={`px-2 py-1 rounded text-[9px] font-mono font-extrabold flex items-center justify-center border transition-all ${
              selectedLayer.muted
                ? 'bg-red-950/40 border-red-500/60 text-red-400 shadow-[0_0_6px_rgba(239,68,68,0.2)]'
                : 'bg-[#161619] border-[#222] text-gray-500 hover:text-gray-300'
            }`}
            title="Mute Channel"
          >
            MUTE
          </button>
          <button
            onClick={() => onUpdate({ soloed: !selectedLayer.soloed })}
            className={`px-2 py-1 rounded text-[9px] font-mono font-extrabold flex items-center justify-center border transition-all ${
              selectedLayer.soloed
                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.2)]'
                : 'bg-[#161619] border-[#222] text-gray-500 hover:text-gray-300'
            }`}
            title="Solo Channel"
          >
            SOLO
          </button>
          <button
            onClick={() => onUpdate({ polarityInvert: !selectedLayer.polarityInvert })}
            className={`px-2 py-1 rounded text-[10px] font-mono font-extrabold flex items-center justify-center border transition-all ${
              selectedLayer.polarityInvert
                ? 'bg-blue-950/40 border-blue-500/60 text-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.2)]'
                : 'bg-[#161619] border-[#222] text-gray-500 hover:text-gray-300'
            }`}
            title="Invert Polarity (Phase)"
          >
            Ø
          </button>
          <button
            onClick={() => onUpdate({ chaosMode: !selectedLayer.chaosMode })}
            className={`px-2 py-1 border rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
              selectedLayer.chaosMode 
                ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
                : 'bg-[#1a1a1f] border-[#27272a] text-gray-500 hover:border-red-500/30 hover:text-red-300'
            }`}
            title="Break reality with unstable feedback and spectral folding"
          >
            <Zap size={11} className={selectedLayer.chaosMode ? 'animate-pulse' : ''} />
            <span>Chaos</span>
          </button>

          <button
            onClick={() => setIsRandomizerOpen(true)}
            className="px-2.5 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm"
            title="Open Smart Selective Randomizer pop-up modal with section locks"
          >
            <Dices size={11} className="text-amber-400" />
            <span>Smart Rnd 🎲</span>
          </button>

          <button
            onClick={onEvolve}
            className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
          >
            <Sparkles size={11} />
            <span>Evolve</span>
          </button>

          <button
            onClick={onPlay}
            className="px-3 py-1 bg-orange-500 hover:bg-orange-400 text-black rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm"
          >
            <Play size={11} fill="currentColor" />
            <span>Audition</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation Header - Refactored to drop-down and submenu to reduce screen clutter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1f1f23] bg-[#08080a] px-4 py-2.5 gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 shrink-0">Workspace Editor:</span>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="bg-[#121215] border border-[#2A2A2E] rounded-lg text-xs font-black uppercase tracking-widest px-3 py-1.5 text-orange-400 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="synth" className="text-white">🔊 Synth & LFO</option>
            <option value="layerfx" className="text-white">⚡ Level & FX Rack</option>
          </select>
        </div>

        {/* Quick parameters info / layer identity sub-menu bar */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
            Active: <span className="text-yellow-400 font-bold">{selectedLayer.name}</span> ({selectedLayer.type.toUpperCase()})
          </span>
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
            Gain: <span className="text-blue-400 font-bold">{Math.round(selectedLayer.gain * 100)}%</span>
          </span>
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
            Pitch: <span className="text-teal-400 font-bold">{selectedLayer.pitch >= 0 ? '+' : ''}{selectedLayer.pitch}ST</span>
          </span>
        </div>
      </div>

      {/* Editor Body */}
      <div className="p-5 flex-1 overflow-y-auto custom-scrollbar bg-[#0b0b0d]">
        
        {/* TAB 1: SYNTH CORE & LFO */}
        {activeTab === 'synth' && (
          <div className="space-y-6">
            {selectedLayer.type === 'synth' && selectedLayer.synth ? (
              <>
                {/* Realtime Synth Waveform & Spectrum Visualizer + Quick Macro Bar */}
                <SynthVisualizer
                  synth={selectedLayer.synth}
                  envelope={selectedLayer.envelope}
                  onUpdateSynth={updateSynthSettings}
                  onUpdateEnvelope={(updates) => onUpdate({ envelope: { ...selectedLayer.envelope, ...updates } })}
                  onPlay={onPlay}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0f0f12] p-4 rounded-xl border border-[#1e1e22]">
                  {/* Oscillator Core */}
                  <div className="space-y-4">
                    <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase flex items-center gap-1">
                      <Music size={12} />
                      OSCILLATOR CORE
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Waveform Shape</label>
                      <select
                        value={selectedLayer.synth.oscType}
                        onChange={(e) => updateSynthSetting('oscType', e.target.value)}
                        className="w-full bg-[#161619] text-xs p-2 rounded border border-[#27272a] text-white font-mono uppercase focus:outline-none focus:border-orange-500"
                      >
                        <option value="sine">✨ Pure Sine</option>
                        <option value="triangle">🔺 Triangle</option>
                        <option value="sawtooth">⚡ Analog Saw</option>
                        <option value="square">🟥 Classic Square</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Knob 
                        label="Frequency" 
                        value={selectedLayer.synth.frequency} 
                        min={30} max={1500} step={1} unit="Hz"
                        color="#f97316"
                        onChange={(v) => updateSynthSetting('frequency', v)}
                      />
                      <Knob 
                        label="Detune" 
                        value={selectedLayer.synth.detune} 
                        min={-100} max={100} step={1} unit="ct"
                        color="#f97316"
                        onChange={(v) => updateSynthSetting('detune', v)}
                      />
                      <Knob 
                        label="Sub Level" 
                        value={selectedLayer.synth.subLevel} 
                        min={0} max={1.2} step={0.01}
                        color="#f97316"
                        onChange={(v) => updateSynthSetting('subLevel', v)}
                      />
                    </div>

                    {/* Dual Oscillator & Unison Voice Controls */}
                    <div className="pt-3 border-t border-[#1f1f23] space-y-3">
                      <div className="text-[9px] font-bold text-blue-400 tracking-wider uppercase flex items-center justify-between">
                        <span>Oscillator 2 & Unison Stacking</span>
                        <span className="text-[9px] text-gray-500 font-mono">2 OSC + 7 VOICES</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Osc 2 Shape</label>
                          <select
                            value={selectedLayer.synth.osc2Type || 'sine'}
                            onChange={(e) => updateSynthSetting('osc2Type', e.target.value)}
                            className="w-full bg-[#161619] text-[10px] p-1.5 rounded border border-[#27272a] text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                          >
                            <option value="sine">Sine</option>
                            <option value="triangle">Triangle</option>
                            <option value="sawtooth">Sawtooth</option>
                            <option value="square">Square</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Unison Voices</label>
                          <select
                            value={selectedLayer.synth.unisonVoices ?? 1}
                            onChange={(e) => updateSynthSetting('unisonVoices', parseInt(e.target.value))}
                            className="w-full bg-[#161619] text-[10px] p-1.5 rounded border border-[#27272a] text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                          >
                            <option value={1}>1 Voice (Mono)</option>
                            <option value={3}>3 Voices (Super)</option>
                            <option value={5}>5 Voices (Ultra)</option>
                            <option value={7}>7 Voices (Hyper-Wide)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Knob 
                          label="Osc 2 Mix" 
                          value={selectedLayer.synth.osc2Mix ?? 0} 
                          min={0} max={1} step={0.01}
                          color="#3b82f6"
                          onChange={(v) => updateSynthSetting('osc2Mix', v)}
                          size={46}
                        />
                        <Knob 
                          label="Osc 2 Detune" 
                          value={selectedLayer.synth.osc2Detune ?? 0} 
                          min={-24} max={24} step={1} unit="ST"
                          color="#3b82f6"
                          onChange={(v) => updateSynthSetting('osc2Detune', v)}
                          size={46}
                        />
                        <Knob 
                          label="Unison Detune" 
                          value={selectedLayer.synth.unisonDetune ?? 15} 
                          min={0} max={50} step={1} unit="ct"
                          color="#3b82f6"
                          onChange={(v) => updateSynthSetting('unisonDetune', v)}
                          size={46}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pitch Envelope */}
                  <div className="space-y-4">
                    <div className="text-[10px] font-bold text-blue-400 tracking-widest uppercase flex items-center gap-1">
                      <Activity size={12} />
                      PITCH ENVELOPE (808 ACCENT)
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Creates a transient pitch dive. Crucial for heavy punch kicks, hits, and impact sound design.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <Knob 
                        label="Env Depth" 
                        value={selectedLayer.synth.pitchEnvAmount} 
                        min={-48} max={48} step={1} unit="ST"
                        color="#3b82f6"
                        onChange={(v) => updateSynthSetting('pitchEnvAmount', v)}
                      />
                      <Knob 
                        label="Env Decay" 
                        value={selectedLayer.synth.pitchEnvDecay} 
                        min={0.01} max={1.0} step={0.01} unit="s"
                        color="#3b82f6"
                        onChange={(v) => updateSynthSetting('pitchEnvDecay', v)}
                      />
                    </div>
                  </div>
                </div>

                {/* Filter Cutoff LFO Modulation Section */}
                <div className="bg-[#0f0f12] p-4 rounded-xl border border-[#1e1e22] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold text-sky-400 tracking-widest uppercase flex items-center gap-1.5">
                      <Waves size={12} className="text-sky-400 animate-pulse" />
                      ANALOG-STYLE FILTER LFO SWEEPS
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedLayer.fx.lfoEnabled !== false}
                          onChange={(e) => updateFXSetting('lfoEnabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-6 h-3.5 bg-[#18181b] rounded-full peer peer-checked:after:translate-x-2.5 peer-checked:after:bg-sky-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#52525b] after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-sky-950/50 peer-checked:border peer-checked:border-sky-500/20"></div>
                      </label>
                      <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded font-mono font-bold uppercase">
                        {selectedLayer.fx.lfoEnabled !== false ? "Active" : "Bypassed"}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500">
                    Modulates the filter's cut-off frequency over time, producing beautiful sweeps, wobble modulations, or rapid texture transformations.
                  </p>

                  <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 items-center transition-all duration-200 ${selectedLayer.fx.lfoEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">LFO Shape</label>
                        <select
                          value={selectedLayer.fx.lfoType || 'sine'}
                          onChange={(e) => updateFXSetting('lfoType', e.target.value)}
                          className="w-full bg-[#161619] text-[10px] p-1.5 rounded border border-[#27272a] text-white font-mono uppercase focus:outline-none focus:border-sky-500"
                        >
                          <option value="sine">Sine</option>
                          <option value="triangle">Triangle</option>
                          <option value="sawtooth">Sawtooth</option>
                          <option value="square">Square</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Mod Target</label>
                        <select
                          value={selectedLayer.fx.lfoTarget || 'filterFreq'}
                          onChange={(e) => updateFXSetting('lfoTarget', e.target.value)}
                          className="w-full bg-[#161619] text-[10px] p-1.5 rounded border border-[#27272a] text-sky-400 font-mono font-extrabold uppercase focus:outline-none focus:border-sky-500"
                        >
                          <option value="filterFreq">Filter 1 Cutoff</option>
                          <option value="filter2Freq">Filter 2 Cutoff</option>
                          <option value="pitch">Osc Pitch Detune</option>
                          <option value="pan">Stereo Panning</option>
                          <option value="res">Filter Resonance</option>
                        </select>
                      </div>
                    </div>

                    <div className="col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Knob 
                        className="flex-1"
                        label="LFO Rate (Hz)" 
                        value={selectedLayer.fx.lfoRate ?? 0} 
                        min={0} max={20} step={0.05} unit="Hz"
                        color="#38bdf8"
                        onChange={(v) => updateFXSetting('lfoRate', v)}
                      />
                      <Knob 
                        className="flex-1"
                        label="LFO Depth" 
                        value={selectedLayer.fx.lfoDepth ?? 0} 
                        min={0} max={1} step={0.01} unit="amt"
                        color="#38bdf8"
                        onChange={(v) => updateFXSetting('lfoDepth', v)}
                      />
                      <div className="flex flex-col justify-between bg-[#131316] p-2 rounded-xl border border-[#222226]">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] text-gray-400 font-bold uppercase">Tempo Sync</label>
                          <button
                            onClick={() => updateFXSetting('lfoSync', !selectedLayer.fx.lfoSync)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                              selectedLayer.fx.lfoSync ? 'bg-sky-500 text-black' : 'bg-[#222] text-gray-400'
                            }`}
                          >
                            {selectedLayer.fx.lfoSync ? 'SYNC ON' : 'HZ'}
                          </button>
                        </div>
                        {selectedLayer.fx.lfoSync ? (
                          <select
                            value={selectedLayer.fx.lfoDivision || '1/4'}
                            onChange={(e) => updateFXSetting('lfoDivision', e.target.value)}
                            className="w-full bg-[#0a0a0c] text-[9px] p-1 rounded border border-[#27272a] text-sky-400 font-mono uppercase"
                          >
                            <option value="1/4">1/4 Note</option>
                            <option value="1/8">1/8 Note</option>
                            <option value="1/16">1/16 Note</option>
                            <option value="1/32">1/32 Note</option>
                            <option value="1/8t">1/8 Triplet</option>
                            <option value="1/16t">1/16 Triplet</option>
                          </select>
                        ) : (
                          <span className="text-[9px] text-gray-500 font-mono text-center block pt-1">Free Hz Rate</span>
                        )}
                      </div>
                  </div>
                </div>

                {/* MODULE 8: TEXTURE INJECTION */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md col-span-1 md:col-span-2 xl:col-span-3">
                  <div className="flex items-center gap-2">
                     <span className="text-yellow-500 font-bold text-[10px] tracking-widest uppercase">8. Texture Injection / Layers</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <Knob 
                      label="Texture Mix" 
                      value={selectedLayer.fx.tilAmount ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#eab308"
                      onChange={(v) => updateFXSetting('tilAmount', v)}
                      size={60}
                    />
                    <div className="flex-1 space-y-2">
                       <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block">Texture Mode</label>
                       <select 
                         value={selectedLayer.fx.tilTexture || 'dust'}
                         onChange={(e) => updateFXSetting('tilTexture', e.target.value)}
                         className="w-full bg-[#0a0a0c] text-[10px] font-mono text-gray-300 border border-[#1f1f23] rounded-lg px-3 py-2 uppercase outline-none focus:border-yellow-500 transition-colors"
                       >
                         <option value="dust">Dust / Noise</option>
                         <option value="static">Static Hum</option>
                         <option value="grit">Grit / Dirt</option>
                         <option value="glitch">Glitch / Digital</option>
                         <option value="crackle">Vinyl Crackle</option>
                         <option value="plasma">Plasma Wave</option>
                         <option value="ticks">Analog Ticks</option>
                         <option value="rustle">Tape Rustle</option>
                         <option value="brown">Brown Noise</option>
                         <option value="pink">Pink Noise</option>
                       </select>
                    </div>
                  </div>
                </div>
              </div>

                {/* TRUE ANALOG IMPERFECTIONS & VINTAGE MODE MACRO PANEL */}
                <div className="bg-[#0f0f12] p-4 rounded-xl border border-[#1e1e22] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f1f23] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-blue-600/10 text-blue-400 border border-blue-500/20">
                        <Flame size={14} />
                      </span>
                      <div>
                        <div className="text-[10px] font-bold text-blue-400 tracking-widest uppercase font-mono">
                          TRUE ANALOG IMPERFECTIONS ENGINE
                        </div>
                        <p className="text-[10px] text-gray-500">
                          PolyBLEP oscillators • ZDF Ladder Filter • Component Drift & Voice Aging
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const ages: ('mint' | 'studio80s' | 'dusty70s' | 'broken')[] = [
                          'mint',
                          'studio80s',
                          'dusty70s',
                          'broken',
                        ];
                        const randomAge = ages[Math.floor(Math.random() * ages.length)];
                        updateSynthSetting('vintageMacro', Number((Math.random() * 0.7 + 0.1).toFixed(2)));
                        updateSynthSetting('voiceAge', randomAge);
                        updateSynthSetting('driftAmount', Number((Math.random() * 0.6 + 0.1).toFixed(2)));
                        updateSynthSetting('slopAmount', Number((Math.random() * 0.5 + 0.1).toFixed(2)));
                        updateSynthSetting('filterDrive', Number((Math.random() * 0.5 + 0.05).toFixed(2)));
                        updateSynthSetting('warmthEngine', Number((Math.random() * 0.6 + 0.2).toFixed(2)));
                        setTimeout(onPlay, 100);
                      }}
                      className="px-3 py-1.5 bg-gradient-to-r from-blue-600/20 to-yellow-400/20 hover:from-blue-600/30 hover:to-yellow-400/30 border border-blue-500/40 text-yellow-300 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all shrink-0"
                      title="Generate a unique analog personality with 1 click"
                    >
                      <Dices size={13} className="text-yellow-400" />
                      <span>Randomize Analog Personality 🎲</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    {/* Vintage Macro Slider & Voice Age */}
                    <div className="space-y-3 bg-[#141417] p-3 rounded-xl border border-[#222226]">
                      <Knob
                        label="Vintage Macro"
                        value={selectedLayer.synth.vintageMacro ?? 0.3}
                        min={0}
                        max={1}
                        step={0.01}
                        color="#3b82f6"
                        onChange={(v) => updateSynthSetting('vintageMacro', v)}
                      />
                      <div className="space-y-1">
                        <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">
                          Voice Aging
                        </label>
                        <select
                          value={selectedLayer.synth.voiceAge || 'studio80s'}
                          onChange={(e) => updateSynthSetting('voiceAge', e.target.value)}
                          className="w-full bg-[#161619] text-[10px] p-1.5 rounded border border-[#27272a] text-yellow-400 font-mono font-bold uppercase focus:outline-none focus:border-blue-500"
                        >
                          <option value="mint">✨ Mint (Factory Precision)</option>
                          <option value="studio80s">📼 Studio '80s (Warm Drift)</option>
                          <option value="dusty70s">📻 Dusty '70s (Component Slop)</option>
                          <option value="broken">💥 Broken Transistor (Heavy Instability)</option>
                        </select>
                      </div>
                    </div>

                    {/* Controls 2: Drift & Slop */}
                    <div className="col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Knob
                        label="Voice Pitch Drift"
                        value={selectedLayer.synth.driftAmount ?? 0.2}
                        min={0}
                        max={1}
                        step={0.01}
                        color="#3b82f6"
                        onChange={(v) => updateSynthSetting('driftAmount', v)}
                      />
                      <Knob
                        label="Envelope Slop"
                        value={selectedLayer.synth.slopAmount ?? 0.2}
                        min={0}
                        max={1}
                        step={0.01}
                        color="#3b82f6"
                        onChange={(v) => updateSynthSetting('slopAmount', v)}
                      />
                      <Knob
                        label="Filter Drive"
                        value={selectedLayer.synth.filterDrive ?? 0.2}
                        min={0}
                        max={1}
                        step={0.01}
                        color="#3b82f6"
                        onChange={(v) => updateSynthSetting('filterDrive', v)}
                      />
                      <Knob
                        label="Master Warmth"
                        value={selectedLayer.synth.warmthEngine ?? 0.4}
                        min={0}
                        max={1}
                        step={0.01}
                        color="#3b82f6"
                        onChange={(v) => updateSynthSetting('warmthEngine', v)}
                      />
                    </div>

                    {/* Phase 6.6 — Juno-style filter family selector */}
                    <div className="col-span-3">
                      <label className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                        Filter Family
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                        {([
                          { v: undefined, l: 'ZDF Ladder' },
                          { v: 'moog_ladder', l: 'Moog 24dB' },
                          { v: 'sem_state_variable', l: 'SEM 12dB' },
                          { v: 'ms20_highpass_lowpass', l: 'MS-20' },
                          { v: 'juno_roland', l: 'Juno' },
                          { v: 'prophet_curtis', l: 'Prophet' },
                          { v: 'oberheim_multimode', l: 'OB-X' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.l}
                            type="button"
                            onClick={() => updateSynthSetting('filterFamily', opt.v)}
                            className={`px-2 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider border transition-all ${
                              (selectedLayer.synth.filterFamily ?? undefined) === opt.v
                                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
                            }`}
                          >
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-[#0f0f12] p-5 rounded-xl border border-[#1e1e22] space-y-6 shadow-xl animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#1f1f23] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Waves size={16} />
                    </span>
                    <div>
                      <div className="text-[11px] font-bold text-amber-400 tracking-widest uppercase font-mono">
                        ANALOG SAMPLE WARPER
                      </div>
                      <p className="text-[10px] text-gray-500">
                        Deep individual sample tweaking, tape reverse, pitch transposition & micro‑looping
                      </p>
                    </div>
                  </div>
                  <div className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                    WARPING ENGINE ON
                  </div>
                </div>

                {/* Knobs Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#141417] p-4 rounded-xl border border-[#222226]">
                  <div className="flex justify-center">
                    <Knob
                      label="Playback Speed"
                      value={selectedLayer.sampleSpeed !== undefined ? selectedLayer.sampleSpeed : 1.0}
                      min={0.2}
                      max={4.0}
                      step={0.1}
                      unit="x"
                      color="#f59e0b"
                      onChange={(v) => onUpdate({ sampleSpeed: v })}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Knob
                      label="Coarse Tune"
                      value={selectedLayer.samplePitchCoarse || 0}
                      min={-24}
                      max={24}
                      step={1}
                      unit="ST"
                      color="#f59e0b"
                      onChange={(v) => onUpdate({ samplePitchCoarse: v })}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Knob
                      label="Fine Tune"
                      value={selectedLayer.samplePitchFine || 0}
                      min={-100}
                      max={100}
                      step={1}
                      unit="ct"
                      color="#f59e0b"
                      onChange={(v) => onUpdate({ samplePitchFine: v })}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Knob
                      label="Trigger Delay"
                      value={selectedLayer.startTimeOffset || 0}
                      min={0}
                      max={2.0}
                      step={0.01}
                      unit="s"
                      color="#f59e0b"
                      onChange={(v) => onUpdate({ startTimeOffset: v })}
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Reverse Sample */}
                  <button
                    onClick={() => onUpdate({ sampleReverse: !selectedLayer.sampleReverse })}
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                      selectedLayer.sampleReverse
                        ? 'bg-amber-950/20 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                        : 'bg-[#121215] border-[#1e1e22] text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="text-left">
                      <span className="text-[11px] font-black uppercase tracking-wider block">Reverse Tape Mode</span>
                      <span className="text-[9px] text-gray-500 font-medium leading-none mt-0.5">Flip buffer playback direction</span>
                    </div>
                    <span className={`px-2 py-1 text-[9px] font-black rounded uppercase tracking-widest ${
                      selectedLayer.sampleReverse ? 'bg-amber-500 text-black' : 'bg-[#1b1b22] text-gray-600'
                    }`}>
                      {selectedLayer.sampleReverse ? 'REVERSED' : 'NORMAL'}
                    </span>
                  </button>

                  {/* Loop Sample */}
                  <button
                    onClick={() => onUpdate({ sampleLoop: !selectedLayer.sampleLoop })}
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                      selectedLayer.sampleLoop
                        ? 'bg-blue-950/20 border-blue-500 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                        : 'bg-[#121215] border-[#1e1e22] text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="text-left">
                      <span className="text-[11px] font-black uppercase tracking-wider block">Seamless Looping</span>
                      <span className="text-[9px] text-gray-500 font-medium leading-none mt-0.5">Loop sample between play boundaries</span>
                    </div>
                    <span className={`px-2 py-1 text-[9px] font-black rounded uppercase tracking-widest ${
                      selectedLayer.sampleLoop ? 'bg-blue-500 text-white' : 'bg-[#1b1b22] text-gray-600'
                    }`}>
                      {selectedLayer.sampleLoop ? 'LOOPING' : 'ONESHOT'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADVANCED SYNTHESIS — folded into the Synth tab as a collapsible section */}
        {activeTab === 'synth' && selectedLayer.type === 'synth' && selectedLayer.synth && (
          <details className="border border-[#2A2A2E] rounded-xl overflow-hidden bg-[#0f0f12]">
            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-widest text-yellow-400">
              <span className="flex items-center gap-2">
                <Sparkles size={14} className="text-yellow-400" />
                Advanced Synthesis (FM · Ring Mod · Wavefolder · Noise · Sub · Sync)
              </span>
              <span className="text-slate-500">▾</span>
            </summary>
            <div className="space-y-6 p-4 pt-2">

            <div className="bg-yellow-950/10 border border-yellow-500/20 p-4 rounded-xl flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-yellow-400 font-extrabold uppercase text-xs tracking-wider">
                  <Sparkles size={14} className="text-yellow-400 animate-pulse" />
                  <span>Sound Designer Upgrade Suite</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed max-w-[560px]">
                  Unlocking 15 high-fidelity sound designer parameters. High-end Super-Sync hard synchronization, West-Coast phase distortion, exponential unison detuning curves, morphing sub-oscillators, and oversampled warmth drive.
                </p>
              </div>
              <div className="text-[10px] font-mono font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-3 py-1 rounded hidden sm:block shrink-0">
                15 UPGRADES ACTIVE
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Module 1: Carrier-Modulator Phase FM */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Activity size={12} /> 1 & 2. PM/FM SYNTHESIS</span>
                  <span className="text-[9px] text-gray-500 font-mono">Carrier-Modulator</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Knob 
                    label="Modulator Ratio" 
                    value={selectedLayer.synth.fmRatio ?? 1.0} 
                    min={0.25} max={16.0} step={0.25}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('fmRatio', v)}
                  />
                  <Knob 
                    label="FM Index / Depth" 
                    value={selectedLayer.synth.fmDepth ?? 0.0} 
                    min={0.0} max={10.0} step={0.05}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('fmDepth', v)}
                  />
                  <div className="col-span-2">
                    <Knob 
                      label="Modulator Self-Feedback" 
                      value={selectedLayer.synth.fmFeedback ?? 0.0} 
                      min={0.0} max={1.0} step={0.01}
                      color="#facc15"
                      onChange={(v) => updateSynthSetting('fmFeedback', v)}
                    />
                  </div>
                </div>
              </div>

              {/* Module 2: Ring Modulation & Phase Alignment */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Sliders size={12} /> 3 & 10. RING MOD & PHASE ALIGN</span>
                  <span className="text-[9px] text-gray-500 font-mono">Multiplier</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Knob 
                    label="Ring Carrier Freq" 
                    value={selectedLayer.synth.ringModFreq ?? 440} 
                    min={10} max={1500} step={5}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('ringModFreq', v)}
                  />
                  <Knob 
                    label="Ring Mod Mix" 
                    value={selectedLayer.synth.ringModMix ?? 0.0} 
                    min={0.0} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('ringModMix', v)}
                  />
                  <div className="col-span-2 flex items-center justify-between p-3 bg-[#0d0d0f] rounded-lg border border-[#1c1c1f]">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-300 block">Transient Phase Retrigger</span>
                      <span className="text-[9px] text-gray-500 block">Resets phase to 0° on trigger for identical click punch</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLayer.synth.phaseRetrigger ?? true}
                        onChange={(e) => updateSynthSetting('phaseRetrigger', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-[#18181b] rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:bg-yellow-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#52525b] after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-yellow-950/50 peer-checked:border peer-checked:border-yellow-500/20"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Module 3: Vocal Talkbox Formant Filter */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Waves size={12} /> 4. TALKBOX FORMANT FILTER</span>
                  <span className="text-[9px] text-gray-500 font-mono">Parallel Resonators</span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Target Vowel Sound</label>
                    <div className="flex gap-1">
                      {(['none', 'a', 'e', 'i', 'o', 'u'] as const).map((vow) => (
                        <button
                          key={vow}
                          onClick={() => updateSynthSetting('vowelFormant', vow)}
                          className={`flex-1 py-1.5 rounded text-[10px] font-mono font-black uppercase border transition-all ${
                            (selectedLayer.synth.vowelFormant || 'none') === vow
                              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300 shadow-md shadow-yellow-500/5'
                              : 'bg-[#0d0d0f] border-[#222] text-gray-400 hover:text-white'
                          }`}
                        >
                          {vow}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Knob 
                    label="Vowel Filter Mix" 
                    value={selectedLayer.synth.vowelMix ?? 0.0} 
                    min={0.0} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('vowelMix', v)}
                  />
                </div>
              </div>

              {/* Module 4: Multi-Stage Pitch ADSR */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Activity size={12} /> 5. PITCH ENVELOPE (ADSR)</span>
                  <span className="text-[9px] text-gray-500 font-mono">Modulator Target</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Knob 
                    label="Pitch Env Attack" 
                    value={selectedLayer.synth.pitchEnvAttack ?? 0.0} 
                    min={0.0} max={0.5} step={0.005}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('pitchEnvAttack', v)}
                  />
                  <Knob 
                    label="Pitch Env Sustain" 
                    value={selectedLayer.synth.pitchEnvSustain ?? 1.0} 
                    min={0.0} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('pitchEnvSustain', v)}
                  />
                  <Knob 
                    label="Pitch Env Release" 
                    value={selectedLayer.synth.pitchEnvRelease ?? 0.1} 
                    min={0.01} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('pitchEnvRelease', v)}
                  />
                  <Knob 
                    label="Pitch Env Depth" 
                    value={selectedLayer.synth.pitchEnvDepth ?? 0} 
                    min={-48} max={48} step={1}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('pitchEnvDepth', v)}
                  />
                </div>
              </div>

              {/* Module 5: Procedural Noise Generator */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Waves size={12} /> 6. PROCEDURAL NOISE SECTION</span>
                  <span className="text-[9px] text-gray-500 font-mono">Texture Layer</span>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Knob 
                      label="Noise Mix Level" 
                      value={selectedLayer.synth.noiseLevel ?? 0.0} 
                      min={0.0} max={1.0} step={0.01}
                      color="#facc15"
                      onChange={(v) => updateSynthSetting('noiseLevel', v)}
                    />
                    <Knob 
                      label="Noise Cutoff Freq" 
                      value={selectedLayer.synth.noiseFilterCutoff ?? 12000} 
                      min={100} max={20000} step={100}
                      color="#facc15"
                      onChange={(v) => updateSynthSetting('noiseFilterCutoff', v)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Noise Color Profile</label>
                    <div className="flex gap-1">
                      {(['white', 'pink', 'brown', 'blue'] as const).map((color) => (
                        <button
                          key={color}
                          onClick={() => updateSynthSetting('noiseColor', color)}
                          className={`flex-1 py-1.5 rounded text-[10px] font-mono font-black uppercase border transition-all ${
                            (selectedLayer.synth.noiseColor || 'white') === color
                              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300 shadow-md shadow-yellow-500/5'
                              : 'bg-[#0d0d0f] border-[#222] text-gray-400 hover:text-white'
                          }`}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Module 6: Wavefolder & Analog Saturation Bias */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Flame size={12} /> 7 & 8. WAVEFOLDER & TAPE BIAS</span>
                  <span className="text-[9px] text-gray-500 font-mono">Harmonic Saturation</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Knob 
                    label="Wavefold Depth" 
                    value={selectedLayer.synth.wavefoldDepth ?? 0.0} 
                    min={0.0} max={10.0} step={0.05}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('wavefoldDepth', v)}
                  />
                  <Knob 
                    label="Wavefold Bias" 
                    value={selectedLayer.synth.wavefoldBias ?? 0.0} 
                    min={-1.0} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('wavefoldBias', v)}
                  />
                  <Knob 
                    label="Tape Even Bias" 
                    value={selectedLayer.synth.analogBias ?? 0.0} 
                    min={0.0} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('analogBias', v)}
                  />
                  <Knob 
                    label="Analog Drift Speed" 
                    value={selectedLayer.synth.analogDriftSpeed ?? 1.0} 
                    min={0.1} max={10.0} step={0.1}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('analogDriftSpeed', v)}
                  />
                </div>
              </div>

              {/* Module 7: Lo-Fi Downsampler & Bitcrusher */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4 md:col-span-2">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Settings2 size={12} /> 9. LO-FI DIGITAL DECIMATION</span>
                  <span className="text-[9px] text-gray-500 font-mono">Destructive DSP</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Knob 
                    label="Sample Rate Decimator" 
                    value={selectedLayer.synth.downsampleFactor ?? 1} 
                    min={1} max={32} step={1}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('downsampleFactor', v)}
                  />
                  <Knob 
                    label="Bitcrush Quantizer" 
                    value={selectedLayer.synth.bitcrushDepth ?? 0.0} 
                    min={0.0} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('bitcrushDepth', v)}
                  />
                </div>
              </div>

              {/* Module 8: Super-Sync & West-Coast Phase Distortion */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Sparkles size={12} /> 10 & 11 & 12. SUPER-SYNC & PHASE DISTORTION</span>
                  <span className="text-[9px] text-gray-500 font-mono">Elite Oscillators</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 flex items-center justify-between p-3 bg-[#0d0d0f] rounded-lg border border-[#1c1c1f]">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-300 block">Super-Sync (Hard Sync)</span>
                      <span className="text-[9px] text-gray-500 block">Forces Osc 2 to hard-reset phase with Osc 1 cycle</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLayer.synth.hardSync ?? false}
                        onChange={(e) => updateSynthSetting('hardSync', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-[#18181b] rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:bg-yellow-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#52525b] after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-yellow-950/50 peer-checked:border peer-checked:border-yellow-500/20"></div>
                    </label>
                  </div>
                  <Knob 
                    label="Sync Freq Ratio" 
                    value={selectedLayer.synth.syncRatio ?? 1.8} 
                    min={1.0} max={4.0} step={0.05}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('syncRatio', v)}
                    size={46}
                  />
                  <Knob 
                    label="Phase Distortion" 
                    value={selectedLayer.synth.pdAmount ?? 0.0} 
                    min={0.0} max={1.0} step={0.01}
                    color="#facc15"
                    onChange={(v) => updateSynthSetting('pdAmount', v)}
                    size={46}
                  />
                  <div className="col-span-2 space-y-1">
                    <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Unison Phase Mode</label>
                    <div className="flex gap-1">
                      {(['Retrigger', 'Golden Angle', 'Drift'] as const).map((mode, idx) => (
                        <button
                          key={mode}
                          onClick={() => updateSynthSetting('unisonPhaseOffset', idx)}
                          className={`flex-1 py-1 rounded text-[9px] font-mono font-black uppercase border transition-all ${
                            (selectedLayer.synth.unisonPhaseOffset ?? 1) === idx
                              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                              : 'bg-[#0d0d0f] border-[#222] text-gray-400 hover:text-white'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Knob 
                      label="Unison Detune Curve (Exp)" 
                      value={selectedLayer.synth.unisonDetuneCurve ?? 1.5} 
                      min={1.0} max={3.0} step={0.1}
                      color="#facc15"
                      onChange={(v) => updateSynthSetting('unisonDetuneCurve', v)}
                      size={46}
                    />
                  </div>
                </div>
              </div>

              {/* Module 9: Sub-Oscillator Morph & Oversampled Saturation */}
              <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                <div className="text-[9px] font-bold text-yellow-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Sliders size={12} /> 13 & 14 & 15. SUB-MORPH & OVERSAMPLING</span>
                  <span className="text-[9px] text-gray-500 font-mono">Studio Saturation</span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">Sub Waveform Shape</label>
                    <div className="flex gap-1">
                      {(['sine', 'triangle', 'square', 'sawtooth'] as const).map((subShape) => (
                        <button
                          key={subShape}
                          onClick={() => updateSynthSetting('subType', subShape)}
                          className={`flex-1 py-1.5 rounded text-[9px] font-mono font-black uppercase border transition-all ${
                            (selectedLayer.synth.subType || 'sine') === subShape
                              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                              : 'bg-[#0d0d0f] border-[#222] text-gray-400 hover:text-white'
                          }`}
                        >
                          {subShape}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Knob 
                      label="Sub Phase Align" 
                      value={selectedLayer.synth.subPhaseAlign ?? 0} 
                      min={0} max={360} step={15} unit="°"
                      color="#facc15"
                      onChange={(v) => updateSynthSetting('subPhaseAlign', v)}
                      size={46}
                    />
                    <Knob 
                      label="Asymmetry Bias" 
                      value={selectedLayer.synth.saturationSymmetry ?? 0.0} 
                      min={-1.0} max={1.0} step={0.05}
                      color="#facc15"
                      onChange={(v) => updateSynthSetting('saturationSymmetry', v)}
                      size={46}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#0d0d0f] rounded-lg border border-[#1c1c1f]">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-300 block">2x Oversampling Engine</span>
                      <span className="text-[9px] text-gray-500 block">Eliminates Nyquist reflections & digital harshness</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLayer.synth.oversamplingEnabled ?? true}
                        onChange={(e) => updateSynthSetting('oversamplingEnabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-[#18181b] rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:bg-yellow-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#52525b] after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-yellow-950/50 peer-checked:border peer-checked:border-yellow-500/20"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </details>
        )}

        {/* CHAOS MUTATION ENGINE — folded into the Synth tab as a collapsible section */}
        {activeTab === 'synth' && selectedLayer.type === 'synth' && selectedLayer.synth && (
          <details className="border border-[#2A2A2E] rounded-xl overflow-hidden bg-[#0f0f12]">
            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-widest text-red-300">
              <span className="flex items-center gap-2">
                <Flame size={14} className="text-red-400" />
                Chaos Mutation Engine
              </span>
              <span className="text-slate-500">▾</span>
            </summary>
            <div className="space-y-6 p-4 pt-2">

            <div className="flex items-center justify-between bg-red-950/15 border border-red-500/20 p-4 rounded-xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enableChaos"
                    checked={chaosEnabled}
                    onChange={handleToggleChaos}
                    className="w-4 h-4 text-red-500 accent-red-600 cursor-pointer rounded border-[#3f3f46] focus:ring-red-500"
                  />
                  <label htmlFor="enableChaos" className="text-xs font-extrabold uppercase tracking-widest text-red-400 cursor-pointer flex items-center gap-1">
                    <Activity size={14} className="animate-pulse" />
                    Enable Chaos Mutation Engine
                  </label>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal max-w-[480px]">
                  Bypassing the chaos engine forces the synthesizer to operate as a pristine, musical analog-style generator without any glitchy phase drift, noise, or sample degradation.
                </p>
              </div>
              <span className="text-[9px] font-mono font-bold text-red-500 uppercase tracking-widest border border-red-500/30 px-2 py-0.5 rounded bg-red-500/10">
                {chaosEnabled ? "STABILIZERS BYPASSED" : "CLEAN ANALOG"}
              </span>
            </div>

            {chaosEnabled && (
              <div className="bg-[#121215]/80 border border-[#27272a] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-yellow-400 font-mono">
                  <Info size={14} className="text-yellow-400" />
                  <span>DSP Synthesis Glossary</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[10px] text-gray-400 leading-relaxed font-mono">
                  <div>
                    <span className="text-red-400 font-bold">Phase Chaos:</span> Modulates the lookup-table index to create subtle pitch-shivering voice instability.
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">Cycle Stretch:</span> Non-linearly stretches individual wavecycles to alter wave symmetry.
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">Fractal Harmonics:</span> Generates sub-harmonics inside the wavecycles using self-similarity math.
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">Harmonic Bias:</span> Balances the ratio of odd (square-like) vs even (saw-like) chaos harmonics.
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">Lorenz Speed:</span> Controls the feedback speed of the chaotic Lorenz Strange Attractor.
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">Logistic Map:</span> Models deterministic noise based on the logistic bifurcation equations.
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">Turbulence:</span> Controls high-entropy waveshaping distortion feedback coefficients.
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">Macro Chaos:</span> The master multiplier scaling all structural modulation depths simultaneously.
                  </div>
                </div>
              </div>
            )}

            {chaosEnabled ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Waveform Mutation */}
                <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                  <div className="text-[9px] font-bold text-red-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center gap-1.5">
                    <Flame size={12} />
                    Oscillator Mutation
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Knob 
                      label="Phase Chaos" 
                      value={selectedLayer.synth.phaseChaos ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('phaseChaos', v)}
                    />
                    <Knob 
                      label="Cycle Stretch" 
                      value={selectedLayer.synth.cycleStretch ?? 0} 
                      min={-1} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('cycleStretch', v)}
                    />
                    <Knob 
                      label="Fractal Harmonics" 
                      value={selectedLayer.synth.fractalHarmonics ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('fractalHarmonics', v)}
                    />
                    <Knob 
                      label="Harmonic Bias" 
                      value={selectedLayer.synth.harmonicBias ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('harmonicBias', v)}
                    />
                                                            <Knob 
                      label="Texture Level" 
                      value={selectedLayer.synth.textureLevel ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('textureLevel', v)}
                    />
                    <div className="flex flex-col gap-1 items-center justify-center">
                      <span className="text-[9px] font-bold text-gray-400">TEXTURE TYPE</span>
                      <select 
                        value={selectedLayer.synth.textureType || 'noise'}
                        onChange={(e) => updateSynthSetting('textureType', e.target.value)}
                        className="bg-[#111113] text-[9px] font-mono text-gray-300 border border-[#222226] rounded px-1.5 py-1 uppercase outline-none"
                      >
                        <option value="noise">White Noise</option>
                        <option value="vinyl">Vinyl Crackle</option>
                        <option value="tape">Tape Hiss</option>
                        <option value="hum">Mains Hum</option>
                        <option value="digital">Digital Glitch</option>
                        <option value="brown">Brown Noise</option>
                        <option value="pink">Pink Noise</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Chaotic Modulators */}
                <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                  <div className="text-[9px] font-bold text-red-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center gap-1.5">
                    <Activity size={12} />
                    Chaotic Feedback Loop
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Knob 
                      label="Lorenz Speed" 
                      value={selectedLayer.synth.lorenzRate ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('lorenzRate', v)}
                    />
                    <Knob 
                      label="Logistic Map" 
                      value={selectedLayer.synth.logisticChaos ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('logisticChaos', v)}
                    />
                    <Knob 
                      label="Turbulence" 
                      value={selectedLayer.synth.feedbackTurbulence ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('feedbackTurbulence', v)}
                    />
                    <Knob 
                      label="Macro Chaos" 
                      value={selectedLayer.synth.macroChaos ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('macroChaos', v)}
                    />
                  </div>
                </div>

                {/* Granular Post Processor */}
                <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                  <div className="text-[9px] font-bold text-red-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center gap-1.5">
                    <Waves size={12} />
                    Granular Particles Scatter
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Knob 
                      label="Grain Density" 
                      value={selectedLayer.synth.grainCount ?? 0} 
                      min={0} max={100} step={1}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('grainCount', v)}
                    />
                    <Knob 
                      label="Grain Drift" 
                      value={selectedLayer.synth.grainDrift ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('grainDrift', v)}
                    />
                    <Knob 
                      label="Size Jitter" 
                      value={selectedLayer.synth.grainSizeJitter ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('grainSizeJitter', v)}
                    />
                    <Knob 
                      label="Stereo Spray" 
                      value={selectedLayer.synth.sprayRadius ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('sprayRadius', v)}
                    />
                  </div>
                </div>

                {/* Digital Destruction */}
                <div className="p-4 bg-[#121215] border border-[#1e1e22] rounded-xl space-y-4">
                  <div className="text-[9px] font-bold text-red-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center gap-1.5">
                    <Sliders size={12} />
                    Digital Destruction
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Knob 
                      label="Downsample Chaos" 
                      value={selectedLayer.synth.sampleRateChaos ?? 0} 
                      min={0} max={0.99} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('sampleRateChaos', v)}
                    />
                    <Knob 
                      label="Error Injection" 
                      value={selectedLayer.synth.errorInjection ?? 0} 
                      min={0} max={0.1} step={0.001}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('errorInjection', v)}
                    />
                    <Knob 
                      label="Resonance Bloom" 
                      value={selectedLayer.synth.resonanceBloom ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('resonanceBloom', v)}
                    />
                    <Knob 
                      label="Self-Oscillation" 
                      value={selectedLayer.synth.selfOscillation ?? 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateSynthSetting('selfOscillation', v)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex flex-col items-center justify-center text-center text-gray-500 space-y-2 bg-[#121215]/40 border border-[#232329] rounded-xl p-6">
                <Settings2 size={24} className="text-gray-600" />
                <span className="text-xs font-bold uppercase text-gray-400">Pure Analog Mode</span>
                <p className="text-[10px] max-w-[340px] text-gray-500 leading-normal">
                  Turn on the checkbox above to enable strange attractors, granular scatter, downsampling chaos, and phase mutation sliders!
                </p>
              </div>
            )}
          </div>
          </details>
        )}

        {/* LEVEL & ENVELOPE — folded into the Layer FX tab */}
        {activeTab === 'layerfx' && (
          <details className="border border-[#2A2A2E] rounded-xl overflow-hidden bg-[#0f0f12]">
            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-widest text-blue-300">
              <span className="flex items-center gap-2">
                <Sliders size={14} className="text-blue-400" />
                Level, Envelope & FX Presets
              </span>
              <span className="text-slate-500">▾</span>
            </summary>
            <div className="space-y-6 p-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#121215] p-4 rounded-xl border border-[#1f1f23]">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex-1 max-w-xs relative">
                  <input
                    type="text"
                    value={newFxPresetName}
                    onChange={(e) => setNewFxPresetName(e.target.value)}
                    placeholder="New FX Preset Name..."
                    className="w-full bg-[#0a0a0c] border border-[#1f1f23] rounded-lg px-3 py-2 text-[10px] font-bold text-gray-300 focus:border-blue-500/50 outline-none placeholder:text-gray-600"
                  />
                </div>
                <button
                  onClick={saveFxPreset}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-2"
                >
                  <Save size={12} />
                  Save FX Chain
                </button>
              </div>

              <div className="flex items-center gap-2">
                {onBounceLayer && (
                  <button
                    onClick={() => onBounceLayer(selectedLayer)}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-2"
                  >
                    <Scissors size={12} />
                    Bounce Layer
                  </button>
                )}
              </div>
            </div>

            {fxPresets.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {fxPresets.map(preset => (
                  <div 
                    key={preset.id}
                    className={`group relative p-2 rounded-lg border transition-all cursor-pointer ${
                      selectedLayer.fxPresetId === preset.id 
                        ? 'bg-blue-600/10 border-blue-500/50 text-blue-400' 
                        : 'bg-[#121215] border-[#1f1f23] text-gray-500 hover:border-gray-600'
                    }`}
                    onClick={() => loadFxPreset(preset)}
                  >
                    <div className="text-[9px] font-bold uppercase truncate pr-4">{preset.name}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFxPreset(preset.id); }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-red-500 hover:bg-red-500/10 rounded transition-all"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Level & Mixer */}
              <div className="p-5 bg-[#0f0f12] border border-[#1e1e22] rounded-xl space-y-5 h-fit shadow-lg">
                <div className="text-[12px] font-extrabold text-sky-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2.5 flex items-center gap-1.5">
                  <Sliders size={13} />
                  Layer Level & Pan
                </div>
                <div className="grid grid-cols-1 gap-5">
                  <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                    <Knob 
                      label="Volume Gain" 
                      value={selectedLayer.gain} 
                      min={0} max={2.0} step={0.01} unit="x"
                      color="#0ea5e9"
                      onChange={(v) => onUpdate({ gain: v })}
                      size={64}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                      <Knob 
                        label="Stereo Pan" 
                        value={selectedLayer.pan} 
                        min={-1} max={1} step={0.01} unit="L/R"
                        color="#0ea5e9"
                        onChange={(v) => onUpdate({ pan: v })}
                        size={48}
                      />
                    </div>
                    <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                      <Knob 
                        label="Coarse Pitch" 
                        value={selectedLayer.pitch} 
                        min={-24} max={24} step={1} unit="ST"
                        color="#0ea5e9"
                        onChange={(v) => onUpdate({ pitch: v })}
                        size={48}
                      />
                    </div>
                    <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                      <Knob 
                        label="Micro Delay" 
                        value={Math.round((selectedLayer.startTimeOffset ?? 0) * 1000)} 
                        min={0} max={250} step={1} unit="ms"
                        color="#a855f7"
                        onChange={(v) => onUpdate({ startTimeOffset: v / 1000 })}
                        size={48}
                      />
                    </div>
                    <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                      <Knob 
                        label="Phase Angle" 
                        value={selectedLayer.phaseAngle ?? 0} 
                        min={0} max={360} step={1} unit="°"
                        color="#38bdf8"
                        onChange={(v) => onUpdate({ phaseAngle: v })}
                        size={48}
                      />
                    </div>
                  </div>

                  {/* Producer Macro Controls Rack */}
                  <div className="pt-3 border-t border-[#1a1a1f] space-y-2">
                    <div className="text-[10px] font-bold text-blue-400 tracking-widest uppercase flex items-center justify-between">
                      <span>Performance Macros</span>
                      <span className="text-[9px] font-mono text-gray-500">EXPRESSIVE PERFORMANCE</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="flex justify-center p-1.5 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                        <Knob 
                          label="Punch" 
                          value={selectedLayer.macroPunch ?? 0} 
                          min={0} max={1} step={0.01}
                          color="#f59e0b"
                          onChange={(v) => onUpdate({ macroPunch: v })}
                          size={44}
                        />
                      </div>
                      <div className="flex justify-center p-1.5 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                        <Knob 
                          label="Grit" 
                          value={selectedLayer.macroGrit ?? 0} 
                          min={0} max={1} step={0.01}
                          color="#ef4444"
                          onChange={(v) => onUpdate({ macroGrit: v })}
                          size={44}
                        />
                      </div>
                      <div className="flex justify-center p-1.5 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                        <Knob 
                          label="Space" 
                          value={selectedLayer.macroSpace ?? 0} 
                          min={0} max={1} step={0.01}
                          color="#a855f7"
                          onChange={(v) => onUpdate({ macroSpace: v })}
                          size={44}
                        />
                      </div>
                      <div className="flex justify-center p-1.5 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                        <Knob 
                          label="Sub Depth" 
                          value={selectedLayer.macroDepth ?? 0} 
                          min={0} max={1} step={0.01}
                          color="#10b981"
                          onChange={(v) => onUpdate({ macroDepth: v })}
                          size={44}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {selectedLayer.type === 'sample' && (
                  <div className="mt-6 border-t border-[#1a1a1f] pt-4">
                    <div className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-3 flex items-center gap-2">
                      <Scissors size={12} />
                      Sample Boundaries
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                        <Knob 
                          label="Start" 
                          value={selectedLayer.playStartPct || 0} 
                          min={0} max={1} step={0.001} unit="%"
                          color="#f59e0b"
                          onChange={(v) => {
                            if (v >= (selectedLayer.playEndPct ?? 1)) return;
                            onUpdate({ playStartPct: v });
                          }}
                          size={56}
                        />
                      </div>
                      <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                        <Knob 
                          label="End" 
                          value={selectedLayer.playEndPct ?? 1} 
                          min={0} max={1} step={0.001} unit="%"
                          color="#f59e0b"
                          onChange={(v) => {
                            if (v <= (selectedLayer.playStartPct || 0)) return;
                            onUpdate({ playEndPct: v });
                          }}
                          size={56}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Envelope Panel */}
              <div className="p-5 bg-[#0f0f12] border border-[#1e1e22] rounded-xl space-y-5 h-fit shadow-lg">
                <div className="text-[12px] font-extrabold text-sky-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2.5 flex items-center gap-1.5">
                  <Activity size={13} />
                  Amplitude Envelope ADSR
                </div>
                
                {/* Envelope Quick Presets */}
                <div className="flex gap-2">
                  <button onClick={() => onUpdate({ envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }})} className="flex-1 py-1 bg-[#1a1a1f] hover:bg-[#202025] text-sky-400 border border-[#222] rounded text-[9px] font-bold uppercase transition-colors">Pluck</button>
                  <button onClick={() => onUpdate({ envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1.5 }})} className="flex-1 py-1 bg-[#1a1a1f] hover:bg-[#202025] text-sky-400 border border-[#222] rounded text-[9px] font-bold uppercase transition-colors">Pad</button>
                  <button onClick={() => onUpdate({ envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 }})} className="flex-1 py-1 bg-[#1a1a1f] hover:bg-[#202025] text-sky-400 border border-[#222] rounded text-[9px] font-bold uppercase transition-colors">Keys</button>
                  <button onClick={() => onUpdate({ envelope: { attack: 0.002, decay: 0.05, sustain: 0, release: 0.05 }})} className="flex-1 py-1 bg-[#1a1a1f] hover:bg-[#202025] text-sky-400 border border-[#222] rounded text-[9px] font-bold uppercase transition-colors">Perc</button>
                </div>

                {/* Visual Envelope Shape Representation */}
                {(() => {
                  const env = selectedLayer.envelope || DEFAULT_ENVELOPE;
                  return (
                    <>
                      <div className="h-24 bg-[#0a0a0c] rounded-xl border border-[#27272a] relative overflow-hidden flex items-end p-2 shadow-inner">
                        <svg className="w-full h-full text-sky-500/10 fill-sky-500/20 stroke-sky-400" strokeWidth="2" viewBox="0 0 100 40">
                          <path d={`M 0 40 
                                   L ${Math.min(25, env.attack * 50)} 0 
                                   L ${Math.min(50, 25 + env.decay * 50)} ${40 - (env.sustain * 40)} 
                                   L 75 ${40 - (env.sustain * 40)} 
                                   L 100 40`} />
                        </svg>
                        <span className="absolute bottom-2 left-3 text-[9px] font-mono font-extrabold text-gray-500 uppercase tracking-widest">ADSR Outline</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                          <Knob 
                            label="Attack" 
                            value={env.attack} 
                            min={0.001} max={2.0} step={0.01} unit="s"
                            color="#0ea5e9"
                            onChange={(v) => updateEnvelopeSetting('attack', v)}
                            size={54}
                          />
                        </div>
                        <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                          <Knob 
                            label="Decay" 
                            value={env.decay} 
                            min={0.01} max={3.0} step={0.01} unit="s"
                            color="#0ea5e9"
                            onChange={(v) => updateEnvelopeSetting('decay', v)}
                            size={54}
                          />
                        </div>
                        <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                          <Knob 
                            label="Sustain" 
                            value={env.sustain} 
                            min={0.0} max={1.0} step={0.01} unit="lvl"
                            color="#0ea5e9"
                            onChange={(v) => updateEnvelopeSetting('sustain', v)}
                            size={54}
                          />
                        </div>
                        <div className="flex justify-center p-2 bg-[#0a0a0c] rounded-xl border border-[#1a1a1f]">
                          <Knob 
                            label="Release" 
                            value={env.release} 
                            min={0.01} max={4.0} step={0.01} unit="s"
                            color="#0ea5e9"
                            onChange={(v) => updateEnvelopeSetting('release', v)}
                            size={54}
                          />
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

            </div>
          </div>
          </details>
        )}

        {/* LAYER modular FX RACK */}
        {activeTab === 'layerfx' && (
          <div className="space-y-6">
            <div className="bg-[#0f0f12] border border-[#1e1e22] rounded-xl p-5 space-y-5 shadow-2xl">
              <div className="text-[12px] font-extrabold text-blue-400 tracking-widest uppercase border-b border-[#1f1f23] pb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <Flame size={13} className="text-blue-500" />
                  Layer DSP FX Rack (Modular Rack)
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      const updates = {
                        distortionEnabled: false,
                        bitcrushEnabled: false,
                        filterEnabled: false,
                        transientEnabled: false,
                        delayEnabled: false,
                        chorusEnabled: false,
                        compressorEnabled: false,
                        reverbEnabled: false
                      };
                      onUpdate({ fx: { ...selectedLayer.fx, ...updates } });
                    }}
                    className="px-2 py-1 bg-[#1a1a1f] hover:bg-[#202025] text-gray-400 hover:text-white border border-[#222] rounded text-[9px] font-bold uppercase transition-colors"
                  >
                    Bypass All
                  </button>
                  <button 
                    onClick={() => {
                      const updates = {
                        distortionEnabled: true,
                        bitcrushEnabled: true,
                        filterEnabled: true,
                        transientEnabled: true,
                        delayEnabled: true,
                        chorusEnabled: true,
                        compressorEnabled: true,
                        reverbEnabled: true
                      };
                      onUpdate({ fx: { ...selectedLayer.fx, ...updates } });
                    }}
                    className="px-2 py-1 bg-[#1a1a1f] hover:bg-[#202025] text-sky-400 hover:text-sky-300 border border-[#222] rounded text-[9px] font-bold uppercase transition-colors"
                  >
                    Enable All
                  </button>
                  <button 
                    onClick={() => {
                      const updates = {
                        distortion: parseFloat(Math.random().toFixed(2)),
                        bitcrush: parseFloat(Math.random().toFixed(2)),
                        filterFreq: parseFloat((Math.random() * 8000).toFixed(0)),
                        filterRes: parseFloat((Math.random() * 20).toFixed(1)),
                        delayTime: parseFloat((Math.random() * 0.5).toFixed(2)),
                        delayFeedback: parseFloat((Math.random() * 0.8).toFixed(2)),
                        chorusMix: parseFloat(Math.random().toFixed(2)),
                        compressorThreshold: parseFloat((-60 + Math.random() * 60).toFixed(0)),
                        compressorRatio: parseFloat((1 + Math.random() * 10).toFixed(1)),
                        reverbMix: parseFloat((Math.random() * 0.8).toFixed(2)),
                        transientAttack: parseFloat(((Math.random() * 2 - 1) * 100).toFixed(0)),
                        transientSustain: parseFloat(((Math.random() * 2 - 1) * 100).toFixed(0))
                      };
                      onUpdate({ fx: { ...selectedLayer.fx, ...updates } });
                    }}
                    className="px-2 py-1 bg-[#1a1a1f] hover:bg-[#202025] text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded text-[9px] font-bold uppercase transition-colors ml-2"
                  >
                    Randomize FX
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {/* MODULE 1: TUBE SATURATOR */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md">
                  {renderPowerToggle('distortionEnabled', '1. Tube Saturation', ['distortion'], 'Adds analog warmth and harmonic distortion')}
                                    <div className={`flex justify-center gap-4 transition-all duration-200 ${selectedLayer.fx.distortionEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <Knob 
                      label="Drive Gain" 
                      value={selectedLayer.fx.distortion} 
                      min={0} max={1} step={0.01}
                      color="#3b82f6"
                      onChange={(v) => updateFXSetting('distortion', v)}
                      size={60}
                    />
                    <Knob 
                      label="2nd Harm" 
                      value={selectedLayer.fx.harmonic2nd ?? 0} 
                      min={0} max={100} step={1}
                      color="#3b82f6"
                      onChange={(v) => updateFXSetting('harmonic2nd', v)}
                      size={40}
                    />
                    <Knob 
                      label="3rd Harm" 
                      value={selectedLayer.fx.harmonic3rd ?? 0} 
                      min={0} max={100} step={1}
                      color="#3b82f6"
                      onChange={(v) => updateFXSetting('harmonic3rd', v)}
                      size={40}
                    />
                  </div>
                </div>

                {/* MODULE 2: DIGITAL BITCRUSHER */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md">
                  {renderPowerToggle('bitcrushEnabled', '2. Bitcrush Sample Jitter', ['bitcrush'], 'Reduces audio resolution for a lo-fi digital sound')}
                  <div className={`flex justify-center transition-all duration-200 ${selectedLayer.fx.bitcrushEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <Knob 
                      label="Decimation" 
                      value={selectedLayer.fx.bitcrush} 
                      min={0} max={0.9} step={0.01}
                      color="#ef4444"
                      onChange={(v) => updateFXSetting('bitcrush', v)}
                      size={60}
                    />
                  </div>
                </div>

                {/* MODULE 3: BIQUAD FILTER */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md col-span-1 md:col-span-2 xl:col-span-1">
                  {renderPowerToggle('filterEnabled', '3. Dual Filter & Drive', ['filterFreq', 'filterRes'], 'Sculpts frequencies using highpass, lowpass, or bandpass shapes')}
                  <div className={`space-y-3.5 transition-all duration-200 ${selectedLayer.fx.filterEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <div className="grid grid-cols-2 gap-2 bg-[#09090b] p-1.5 rounded-lg border border-[#27272a]">
                      <div>
                        <label className="text-[9px] text-[#a1a1aa] font-bold uppercase tracking-wider block">Filter 1 Type</label>
                        <select
                          value={selectedLayer.fx.filterType}
                          onChange={(e) => updateFXSetting('filterType', e.target.value)}
                          className="w-full bg-[#121215] text-[9px] p-1 rounded border border-[#27272a] text-white focus:outline-none focus:border-blue-500 font-mono uppercase"
                        >
                          <option value="lowpass">Lowpass</option>
                          <option value="highpass">Highpass</option>
                          <option value="bandpass">Bandpass</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-[#a1a1aa] font-bold uppercase tracking-wider block">Filter 2 Type</label>
                        <select
                          value={selectedLayer.fx.filter2Type || 'highpass'}
                          onChange={(e) => updateFXSetting('filter2Type', e.target.value)}
                          className="w-full bg-[#121215] text-[9px] p-1 rounded border border-[#27272a] text-white focus:outline-none focus:border-blue-500 font-mono uppercase"
                        >
                          <option value="highpass">Highpass</option>
                          <option value="lowpass">Lowpass</option>
                          <option value="bandpass">Bandpass</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Knob 
                        label="F1 Cutoff" 
                        value={selectedLayer.fx.filterFreq} 
                        min={40} max={20000} step={10} unit="Hz"
                        color="#10b981"
                        onChange={(v) => updateFXSetting('filterFreq', v)}
                        size={44}
                      />
                      <Knob 
                        label="F2 Cutoff" 
                        value={selectedLayer.fx.filter2Freq ?? 20} 
                        min={20} max={18000} step={10} unit="Hz"
                        color="#10b981"
                        onChange={(v) => updateFXSetting('filter2Freq', v)}
                        size={44}
                      />
                      <Knob 
                        label="Tube Drive" 
                        value={selectedLayer.fx.filterDrive ?? 0} 
                        min={0} max={1} step={0.01}
                        color="#f59e0b"
                        onChange={(v) => updateFXSetting('filterDrive', v)}
                        size={44}
                      />
                      <Knob 
                        label="Key Track" 
                        value={selectedLayer.fx.keyTracking ?? 0} 
                        min={0} max={100} step={1} unit="%"
                        color="#a855f7"
                        onChange={(v) => updateFXSetting('keyTracking', v)}
                        size={44}
                      />
                    </div>
                  </div>
                </div>

                {/* MODULE 3.5: TRANSIENT SHAPER & ATTACK PUNCH */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md">
                  {renderPowerToggle('transientEnabled', 'Transient Shaper & Punch', ['transientAttack', 'transientSustain'], 'Shapes the attack punch and sustain body of the sound')}
                  <div className={`grid grid-cols-2 gap-3 transition-all duration-200 ${selectedLayer.fx.transientEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <Knob 
                      label="Attack Punch" 
                      value={selectedLayer.fx.transientAttack ?? 0} 
                      min={-100} max={100} step={1} unit="%"
                      color="#f59e0b"
                      onChange={(v) => updateFXSetting('transientAttack', v)}
                      size={52}
                    />
                    <Knob 
                      label="Sustain Body" 
                      value={selectedLayer.fx.transientSustain ?? 0} 
                      min={-100} max={100} step={1} unit="%"
                      color="#f59e0b"
                      onChange={(v) => updateFXSetting('transientSustain', v)}
                      size={52}
                    />
                  </div>
                </div>

                {/* MODULE 4: STEREO DELAY */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md">
                  {renderPowerToggle('delayEnabled', '4. Analog Tape Delay', ['delayTime', 'delayFeedback'], 'Creates repeating echoes that simulate magnetic tape delay')}
                  <div className={`grid grid-cols-2 gap-3 transition-all duration-200 ${selectedLayer.fx.delayEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <Knob 
                      label="Delay Time" 
                      value={selectedLayer.fx.delayTime} 
                      min={0} max={1.0} step={0.01} unit="s"
                      color="#3b82f6"
                      onChange={(v) => updateFXSetting('delayTime', v)}
                      size={52}
                    />
                    <Knob 
                      label="Feedback" 
                      value={selectedLayer.fx.delayFeedback} 
                      min={0} max={0.95} step={0.01}
                      color="#3b82f6"
                      onChange={(v) => updateFXSetting('delayFeedback', v)}
                      size={52}
                    />
                  </div>
                </div>

                {/* MODULE 5: CHORUS MODULATOR */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md">
                  {renderPowerToggle('chorusEnabled', '5. Chorus / Ensemble', ['chorusMix'], 'Thickens the sound by adding slightly detuned copies')}
                  <div className={`flex justify-center transition-all duration-200 ${selectedLayer.fx.chorusEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <Knob 
                      label="Mix Depth" 
                      value={selectedLayer.fx.chorusMix} 
                      min={0} max={0.9} step={0.01}
                      color="#8b5cf6"
                      onChange={(v) => updateFXSetting('chorusMix', v)}
                      size={60}
                    />
                  </div>
                </div>

                {/* MODULE 6: DYNAMIC COMPRESSOR */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md">
                  {renderPowerToggle('compressorEnabled', '6. Dynamics Compressor', ['compressorThreshold', 'compressorRatio'], 'Controls dynamic range by reducing peaks above the threshold')}
                  <div className={`grid grid-cols-2 gap-3 transition-all duration-200 ${selectedLayer.fx.compressorEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <Knob 
                      label="Threshold" 
                      value={selectedLayer.fx.compressorThreshold} 
                      min={-60} max={0} step={1} unit="dB"
                      color="#ec4899"
                      onChange={(v) => updateFXSetting('compressorThreshold', v)}
                      size={52}
                    />
                    <Knob 
                      label="Ratio" 
                      value={selectedLayer.fx.compressorRatio} 
                      min={1} max={20} step={0.5} unit=":1"
                      color="#ec4899"
                      onChange={(v) => updateFXSetting('compressorRatio', v)}
                      size={52}
                    />
                  </div>
                </div>

                {/* MODULE 7: CONVOLVER REVERB */}
                <div className="bg-[#121215] border border-[#202025] rounded-xl p-4 space-y-3.5 flex flex-col justify-between shadow-md col-span-1 md:col-span-2 xl:col-span-3">
                  {renderPowerToggle('reverbEnabled', '7. Reverb (Hall/Plate Space)', ['reverbMix'], 'Algorithmic reverb space for the layer')}
                  <div className={`flex items-center gap-8 transition-all duration-200 ${selectedLayer.fx.reverbEnabled !== false ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <Knob 
                      label="Reverb Mix" 
                      value={selectedLayer.fx.reverbMix} 
                      min={0} max={0.95} step={0.01}
                      color="#f43f5e"
                      onChange={(v) => updateFXSetting('reverbMix', v)}
                      size={60}
                    />
                    <p className="flex-1 text-[10px] text-slate-500 font-mono leading-relaxed">
                      Controls how much of the layer is sent to the shared algorithmic reverb. Master reverb and other
                      master processing live in the Studio Console Mixer (Stage 03).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 808 SUB DESIGNER — folded into the Synth tab as a collapsible section */}
        {activeTab === 'synth' && (
          <details className="border border-[#2A2A2E] rounded-xl overflow-hidden bg-[#0f0f12]">
            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-widest text-red-300">
              <span className="flex items-center gap-2">
                <Zap size={14} className="text-red-400" />
                808 Sub Designer
              </span>
              <span className="text-slate-500">▾</span>
            </summary>
            <div className="space-y-6 p-4 pt-2">
            <div className="bg-[#0f0f12] p-6 rounded-xl border border-red-500/20 shadow-lg shadow-red-500/5">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                    <Zap size={20} className="animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-red-400 uppercase tracking-widest">Sub-Octave Designer</h4>
                    <p className="text-[10px] text-gray-500">Reinforce 808s with harmonic sub-oscillators & saturation</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   <label className="text-[10px] font-bold text-gray-400 uppercase">Power</label>
                   <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLayer.subDesign?.subEnabled || false}
                      onChange={(e) => onUpdate({
                        subDesign: {
                          ...(selectedLayer.subDesign || { subEnabled: false, subLevel: 0.5, subType: 'sine', harmonicSaturation: 0, xSubMix: 0, drive: 0, dynamicTracking: true }),
                          subEnabled: e.target.checked
                        }
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-[#18181b] rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:bg-red-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#52525b] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-950/50 peer-checked:border peer-checked:border-red-500/20"></div>
                  </label>
                </div>
              </div>

              <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 transition-all ${selectedLayer.subDesign?.subEnabled ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
                 <div className="space-y-4">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Sub Shape</label>
                    <div className="flex gap-1 bg-[#0a0a0c] p-1 rounded-lg border border-[#1a1a1e]">
                      {['sine', 'triangle', 'square'].map(type => (
                        <button
                          key={type}
                          onClick={() => onUpdate({
                            subDesign: {
                              ...(selectedLayer.subDesign!),
                              subType: type as any
                            }
                          })}
                          className={`flex-1 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${
                            selectedLayer.subDesign?.subType === type 
                              ? 'bg-red-500 text-black' 
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <Knob 
                      label="Sub Level" 
                      value={selectedLayer.subDesign?.subLevel || 0.5} 
                      min={0} max={1.5} step={0.01}
                      color="#ef4444"
                      onChange={(v) => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), subLevel: v } })}
                    />
                 </div>

                 <div className="space-y-4">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Harmonics</label>
                    <div className="flex flex-wrap gap-4">
                      <Knob 
                        label="Saturation" 
                        value={selectedLayer.subDesign?.harmonicSaturation || 0} 
                        min={0} max={1} step={0.01}
                        color="#ef4444"
                        onChange={(v) => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), harmonicSaturation: v } })}
                      />
                      <Knob 
                        label="2nd Harm" 
                        value={selectedLayer.subDesign?.harmonic2nd || 0} 
                        min={0} max={100} step={1}
                        color="#ef4444"
                        onChange={(v) => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), harmonic2nd: v } })}
                      />
                      <Knob 
                        label="3rd Harm" 
                        value={selectedLayer.subDesign?.harmonic3rd || 0} 
                        min={0} max={100} step={1}
                        color="#ef4444"
                        onChange={(v) => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), harmonic3rd: v } })}
                      />
                    </div>
                    <Knob 
                      label="Drive" 
                      value={selectedLayer.subDesign?.drive || 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), drive: v } })}
                    />
                 </div>

                 <div className="space-y-4">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Layering</label>
                    <Knob 
                      label="X-Sub Mix" 
                      value={selectedLayer.subDesign?.xSubMix || 0} 
                      min={0} max={1} step={0.01}
                      color="#ef4444"
                      onChange={(v) => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), xSubMix: v } })}
                    />
                    <Knob 
                        label="Phase" 
                        value={selectedLayer.subDesign?.phase || 0} 
                        min={0} 
                        max={360} 
                        step={1} 
                        color="#ef4444" 
                        unit="°"
                        onChange={(v) => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), phase: v } })}
                    />
                    <div className="flex flex-col items-center gap-2 pt-2">
                       <label className="text-[9px] font-bold text-gray-500 uppercase">Pitch Tracking</label>
                       <button
                         onClick={() => onUpdate({ subDesign: { ...(selectedLayer.subDesign!), dynamicTracking: !selectedLayer.subDesign?.dynamicTracking } })}
                         className={`px-3 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${
                           selectedLayer.subDesign?.dynamicTracking 
                            ? 'bg-red-500/20 border-red-500/50 text-red-400' 
                            : 'bg-[#1a1a1e] border-[#222] text-gray-500'
                         }`}
                       >
                         {selectedLayer.subDesign?.dynamicTracking ? 'AUTO TRACKING' : 'FIXED (C1)'}
                       </button>
                    </div>
                 </div>

                 <div className="col-span-1 min-h-[160px]">
                   <Sub808Visualizer subDesign={selectedLayer.subDesign} />
                  </div>
               </div>
             </div>
          </div>
          </details>
        )}

        {/* PRESETS & RANDOMIZE — folded into the Synth tab as a collapsible section */}
        {activeTab === 'synth' && (
          <details className="border border-[#2A2A2E] rounded-xl overflow-hidden bg-[#0f0f12]">
            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-widest text-blue-300">
              <span className="flex items-center gap-2">
                <FolderHeart size={14} className="text-blue-400" />
                Presets & Randomize
              </span>
              <span className="text-slate-500">▾</span>
            </summary>
            <div className="space-y-6 p-4 pt-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Presets Column */}
            <div className="p-4 bg-[#0f0f12] border border-[#1e1e22] rounded-xl flex flex-col h-full min-h-[350px]">
              <div className="text-[10px] font-bold text-blue-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center gap-1.5 mb-3">
                <FolderHeart size={12} />
                Synth Presets Browser
              </div>
              
              {/* Save New Preset */}
              {selectedLayer.type === 'synth' ? (
                <div className="flex gap-2 mb-4 bg-[#151518] p-2 rounded-lg border border-[#232328]">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Enter preset name..."
                    className="flex-1 bg-[#09090b] border border-[#27272a] rounded-md px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
                  />
                  <button
                    onClick={savePreset}
                    disabled={!newPresetName.trim()}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-[#1a1a20] disabled:text-gray-600 text-white font-extrabold text-[10px] uppercase rounded-md transition-all flex items-center gap-1"
                  >
                    <Save size={11} />
                    <span>Save</span>
                  </button>
                </div>
              ) : (
                <div className="mb-4 bg-emerald-500/5 text-emerald-400 text-[10px] p-2.5 border border-emerald-500/10 rounded-lg flex items-center gap-2">
                  <Info size={12} />
                  <span>Preset loading updates the complete ADSR envelope, filter sweeps, delays, and reverbs.</span>
                </div>
              )}

              {/* Presets List */}
              <div className="flex-1 overflow-y-auto max-h-[250px] custom-scrollbar space-y-1.5 pr-1">
                {/* Custom Presets Section */}
                {customPresets.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block font-bold">Custom Presets</span>
                    {customPresets.map((p, idx) => (
                      <div
                        key={`custom-${idx}`}
                        onClick={() => loadPreset(p)}
                        className="group flex justify-between items-center bg-[#151518] hover:bg-blue-950/20 border border-[#232328] hover:border-blue-500/30 p-2 rounded-lg cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-blue-400 font-mono">CST</span>
                          <span className="text-xs font-bold text-gray-300 uppercase">{p.name}</span>
                        </div>
                        <button
                          onClick={(e) => deletePreset(idx, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Factory Presets Section */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block font-bold">Factory Soundbanks</span>
                  {FACTORY_PRESETS.map((p, idx) => (
                    <div
                      key={`factory-${idx}`}
                      onClick={() => loadPreset(p)}
                      className="flex justify-between items-center bg-[#131316] hover:bg-blue-950/25 border border-[#1e1e22] hover:border-blue-500/30 p-2 rounded-lg cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-blue-500/60 font-mono">FAC</span>
                        <span className="text-xs font-bold text-gray-300 uppercase">{p.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-500 uppercase font-semibold">
                        {p.oscType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Smart Randomizer Column */}
            <div className="p-4 bg-[#0f0f12] border border-[#1e1e22] rounded-xl flex flex-col h-full min-h-[350px]">
              <div className="text-[10px] font-bold text-blue-400 tracking-widest uppercase border-b border-[#1f1f23] pb-2 flex items-center gap-1.5 mb-3">
                <Dices size={12} />
                Smart Synth Randomizer
              </div>

              <p className="text-[10px] text-gray-400 leading-normal mb-4">
                Instead of simple random noise, our generator creates mathematically tuned sound configurations following standard acoustic engineering templates. Choose a style style below:
              </p>

              {selectedLayer.type === 'synth' ? (
                <div className="flex-1 flex flex-col justify-between space-y-4">
                  {/* Style selector cards */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'lead', title: 'Melodic Lead / Pluck', icon: '⚡' },
                      { id: 'bass', title: 'Fat Analog Bass', icon: '🎛️' },
                      { id: 'pad', title: 'Ethereal Pad / Sweep', icon: '🌪️' },
                      { id: 'glitch', title: 'Cyber Chaos FX', icon: '👾' },
                    ].map((st) => (
                      <div
                        key={st.id}
                        onClick={() => setRandomStyle(st.id as any)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between h-20 ${
                          randomStyle === st.id
                            ? 'bg-blue-950/20 border-blue-500 text-white'
                            : 'bg-[#121215] border-[#1e1e22] text-gray-400 hover:border-gray-700'
                        }`}
                      >
                        <span className="text-lg">{st.icon}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider">{st.title}</span>
                      </div>
                    ))}
                  </div>

                  {/* Trigger Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleRandomize}
                      className="py-3 bg-[#181822] hover:bg-[#20202e] border border-[#2a2a3e] text-gray-200 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <Sparkles size={13} className="text-blue-400" />
                      <span>Quick Roll</span>
                    </button>

                    <button
                      onClick={() => setIsRandomizerOpen(true)}
                      className="py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/15 active:scale-[0.98]"
                    >
                      <Dices size={15} />
                      <span>Smart Locks 🔒</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-6 bg-[#0c0c0f] border border-dashed border-[#1f1f23] rounded-xl text-gray-500">
                  <div className="space-y-1 text-[10px] leading-normal max-w-[240px]">
                    <span className="font-bold uppercase block mb-1 text-gray-400">Synth Randomizer Locked</span>
                    <span>The active layer is a sample audio clip. Synthesis randomization is only available for procedurally synthesized Oscillator Tracks.</span>
                  </div>
                </div>
              )}
            </div>

          </div>
          </div>
          </details>
        )}

      </div>

      <SmartRandomizerModal
        isOpen={isRandomizerOpen}
        onClose={() => setIsRandomizerOpen(false)}
        selectedLayer={selectedLayer}
        onUpdate={onUpdate}
        onPlay={onPlay}
      />
    </div>
  );
}
