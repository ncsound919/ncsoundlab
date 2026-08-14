import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Sparkles, Lock, Unlock, Play, RotateCcw, Sliders, 
  Dices, Zap, Flame, Activity, Radio, Volume2, Wand2,
  Compass, Cpu, ShieldCheck
} from 'lucide-react';
import { SoundLayer, SynthSettings, FXSettings, Envelope, SubDesignSettings } from '../types';

interface SmartRandomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLayer: SoundLayer;
  onUpdate: (updates: Partial<SoundLayer>) => void;
  onPlay: () => void;
}

export interface SectionLocks {
  oscillators: boolean;     // Waveforms, Detune, Sub Level, Unison
  pitchEnvelope: boolean;  // Pitch Env Amount, Decay, Transient Punch
  ampEnvelope: boolean;    // Attack, Decay, Sustain, Release
  filterDrive: boolean;    // Cutoff, Resonance, Filter Type, Tube Drive
  saturation: boolean;     // Distortion, Bitcrush
  lfoModulation: boolean;  // LFO Rate, Depth, Type, Target
  timeFx: boolean;         // Reverb, Delay, Chorus
  chaosGranular: boolean;  // Phase Chaos, Lorenz, MRS Density, HSF
  subDesign: boolean;      // Sub Bass Synthesizer Engine
  spatialGain: boolean;    // Gain, Pan, Master Pitch
}

export type RandomCategory = 
  | 'sub808' 
  | 'snare' 
  | 'hihat' 
  | 'lead' 
  | 'pad' 
  | 'glitch' 
  | 'wobble' 
  | 'physical' 
  | 'chaos';

interface CategoryPreset {
  id: RandomCategory;
  name: string;
  icon: string;
  desc: string;
  badge: string;
  color: string;
}

const CATEGORIES: CategoryPreset[] = [
  { id: 'sub808', name: '808 Sub Boom', icon: '🔊', desc: 'Heavy sub frequencies with punchy pitch drop', badge: 'SUB BASS', color: 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10' },
  { id: 'snare', name: 'Snare & Snap', icon: '💥', desc: 'Sharp transient click with noisy body decay', badge: 'DRUM', color: 'border-rose-500/50 text-rose-400 bg-rose-500/10' },
  { id: 'hihat', name: 'Hi-Hat / Cymbal', icon: '⚡', desc: 'High frequency metallic noise & sizzle', badge: 'PERC', color: 'border-yellow-500/50 text-yellow-300 bg-yellow-500/10' },
  { id: 'lead', name: 'Analog Lead', icon: '🎹', desc: 'Cutting saw/square synth with unison chorus', badge: 'SYNTH', color: 'border-sky-500/50 text-sky-400 bg-sky-500/10' },
  { id: 'pad', name: 'Ambient Pad', icon: '🌊', desc: 'Lush slow-attack swell with deep reverb', badge: 'ATMOS', color: 'border-indigo-500/50 text-indigo-400 bg-indigo-500/10' },
  { id: 'wobble', name: 'Wobble Acid Bass', icon: '🌀', desc: 'Aggressive LFO modulated resonant filter', badge: 'BASS', color: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' },
  { id: 'glitch', name: 'Cyber Glitch FX', icon: '🛸', desc: 'Granular pitch drifts, bitcrush & chaos', badge: 'EXPERIMENTAL', color: 'border-purple-500/50 text-purple-400 bg-purple-500/10' },
  { id: 'physical', name: 'Acoustic Resonator', icon: '🌌', desc: 'Micro-resonator swarm & physical modeling', badge: 'HYBRID', color: 'border-pink-500/50 text-pink-400 bg-pink-500/10' },
  { id: 'chaos', name: 'Complete Wild Chaos', icon: '🎲', desc: 'Unconstrained procedural re-synthesis', badge: 'TOTAL CHAOS', color: 'border-blue-500/50 text-blue-400 bg-blue-500/10' },
];

const roll = (min: number, max: number) => min + Math.random() * (max - min);
const choose = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Interpolate between original value and random target based on intensity
const lerpVal = (current: number, min: number, max: number, amt: number): number => {
  const randomTarget = roll(min, max);
  return current + (randomTarget - current) * amt;
};

export function applyStateWithLocks(
  lastState: Partial<SoundLayer>,
  currentState: SoundLayer,
  locks: SectionLocks
): Partial<SoundLayer> {
  const result: Partial<SoundLayer> = {};

  // spatialGain (10)
  if (locks.spatialGain) {
    result.gain = currentState.gain;
    result.pan = currentState.pan;
    result.pitch = currentState.pitch;
  } else {
    result.gain = lastState.gain ?? currentState.gain;
    result.pan = lastState.pan ?? currentState.pan;
    result.pitch = lastState.pitch ?? currentState.pitch;
  }

  // ampEnvelope (3)
  if (locks.ampEnvelope) {
    result.envelope = { ...currentState.envelope };
  } else {
    result.envelope = lastState.envelope ? { ...lastState.envelope } : { ...currentState.envelope };
  }

  // subDesign (9)
  if (locks.subDesign) {
    result.subDesign = currentState.subDesign ? { ...currentState.subDesign } : undefined;
  } else {
    result.subDesign = lastState.subDesign ? { ...lastState.subDesign } : (currentState.subDesign ? { ...currentState.subDesign } : undefined);
  }

  // Synth and FX are more granular
  const synth: SynthSettings = { ...(currentState.synth || {}) } as SynthSettings;
  const lastSynth = (lastState.synth || {}) as Partial<SynthSettings>;

  // 1. oscillators
  if (!locks.oscillators) {
    synth.oscType = lastSynth.oscType ?? synth.oscType;
    synth.osc2Type = lastSynth.osc2Type;
    synth.osc2Mix = lastSynth.osc2Mix ?? synth.osc2Mix;
    synth.osc2Detune = lastSynth.osc2Detune ?? synth.osc2Detune;
    synth.frequency = lastSynth.frequency ?? synth.frequency;
    synth.subLevel = lastSynth.subLevel ?? synth.subLevel;
    synth.unisonVoices = lastSynth.unisonVoices ?? synth.unisonVoices;
    synth.unisonDetune = lastSynth.unisonDetune ?? synth.unisonDetune;
  }

  // 2. pitchEnvelope
  if (!locks.pitchEnvelope) {
    synth.pitchEnvAmount = lastSynth.pitchEnvAmount ?? synth.pitchEnvAmount;
    synth.pitchEnvDecay = lastSynth.pitchEnvDecay ?? synth.pitchEnvDecay;
  }

  // 8. chaosGranular
  if (!locks.chaosGranular) {
    synth.phaseChaos = lastSynth.phaseChaos ?? synth.phaseChaos;
    synth.cycleStretch = lastSynth.cycleStretch ?? synth.cycleStretch;
    synth.fractalHarmonics = lastSynth.fractalHarmonics ?? synth.fractalHarmonics;
    synth.macroChaos = lastSynth.macroChaos ?? synth.macroChaos;
    synth.lorenzRate = lastSynth.lorenzRate ?? synth.lorenzRate;
  }

  result.synth = synth;

  const fx: FXSettings = { ...(currentState.fx || {}) } as FXSettings;
  const lastFx = (lastState.fx || {}) as Partial<FXSettings>;

  // 2. pitchEnvelope (transient parts)
  if (!locks.pitchEnvelope) {
    fx.transientEnabled = lastFx.transientEnabled ?? fx.transientEnabled;
    fx.transientAttack = lastFx.transientAttack ?? fx.transientAttack;
  }

  // 4. filterDrive
  if (!locks.filterDrive) {
    fx.filterEnabled = lastFx.filterEnabled ?? fx.filterEnabled;
    fx.filterType = lastFx.filterType ?? fx.filterType;
    fx.filterFreq = lastFx.filterFreq ?? fx.filterFreq;
    fx.filterRes = lastFx.filterRes ?? fx.filterRes;
    fx.filterDrive = lastFx.filterDrive ?? fx.filterDrive;
  }

  // 5. saturation
  if (!locks.saturation) {
    fx.distortionEnabled = lastFx.distortionEnabled ?? fx.distortionEnabled;
    fx.distortion = lastFx.distortion ?? fx.distortion;
    fx.bitcrushEnabled = lastFx.bitcrushEnabled ?? fx.bitcrushEnabled;
    fx.bitcrush = lastFx.bitcrush ?? fx.bitcrush;
  }

  // 6. lfoModulation
  if (!locks.lfoModulation) {
    fx.lfoEnabled = lastFx.lfoEnabled ?? fx.lfoEnabled;
    fx.lfoRate = lastFx.lfoRate ?? fx.lfoRate;
    fx.lfoDepth = lastFx.lfoDepth ?? fx.lfoDepth;
    fx.lfoType = lastFx.lfoType ?? fx.lfoType;
    fx.lfoTarget = lastFx.lfoTarget ?? fx.lfoTarget;
  }

  // 7. timeFx
  if (!locks.timeFx) {
    fx.reverbEnabled = lastFx.reverbEnabled ?? fx.reverbEnabled;
    fx.reverbMix = lastFx.reverbMix ?? fx.reverbMix;
    fx.delayEnabled = lastFx.delayEnabled ?? fx.delayEnabled;
    fx.delayTime = lastFx.delayTime ?? fx.delayTime;
    fx.delayFeedback = lastFx.delayFeedback ?? fx.delayFeedback;
    fx.chorusEnabled = lastFx.chorusEnabled ?? fx.chorusEnabled;
    fx.chorusMix = lastFx.chorusMix ?? fx.chorusMix;
  }

  // 8. chaosGranular
  if (!locks.chaosGranular) {
    fx.tilEnabled = lastFx.tilEnabled ?? fx.tilEnabled;
    fx.tilTexture = lastFx.tilTexture ?? fx.tilTexture;
    fx.tilMix = lastFx.tilMix ?? fx.tilMix;
    fx.mrsEnabled = lastFx.mrsEnabled ?? fx.mrsEnabled;
    fx.mrsMix = lastFx.mrsMix ?? fx.mrsMix;
    fx.mrsDensity = lastFx.mrsDensity ?? fx.mrsDensity;
    fx.mrsMaterial = lastFx.mrsMaterial ?? fx.mrsMaterial;
    fx.mrsChaos = lastFx.mrsChaos ?? fx.mrsChaos;
  }

  result.fx = fx;

  return result;
}

export function SmartRandomizerModal({
  isOpen,
  onClose,
  selectedLayer,
  onUpdate,
  onPlay,
}: SmartRandomizerModalProps) {
  const [locks, setLocks] = useState<SectionLocks>({
    oscillators: false,
    pitchEnvelope: false,
    ampEnvelope: false,
    filterDrive: false,
    saturation: false,
    lfoModulation: false,
    timeFx: false,
    chaosGranular: false,
    subDesign: false,
    spatialGain: false,
  });

  const [intensity, setIntensity] = useState<number>(0.5); // 0.1 to 1.0
  const [selectedCategory, setSelectedCategory] = useState<RandomCategory>('lead');
  const [autoAudition, setAutoAudition] = useState<boolean>(true);
  
  // History stack for undo within modal
  const [historyStack, setHistoryStack] = useState<Partial<SoundLayer>[]>([]);

  // Escape closes the dialog
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleLock = (key: keyof SectionLocks) => {
    setLocks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const lockAll = () => {
    setLocks({
      oscillators: true,
      pitchEnvelope: true,
      ampEnvelope: true,
      filterDrive: true,
      saturation: true,
      lfoModulation: true,
      timeFx: true,
      chaosGranular: true,
      subDesign: true,
      spatialGain: true,
    });
  };

  const unlockAll = () => {
    setLocks({
      oscillators: false,
      pitchEnvelope: false,
      ampEnvelope: false,
      filterDrive: false,
      saturation: false,
      lfoModulation: false,
      timeFx: false,
      chaosGranular: false,
      subDesign: false,
      spatialGain: false,
    });
  };

  const handleGenerate = (customIntensity?: number) => {
    if (selectedLayer.type !== 'synth') return;

    // Save current snapshot to history before modifying
    const currentSnapshot: Partial<SoundLayer> = {
      gain: selectedLayer.gain,
      pan: selectedLayer.pan,
      pitch: selectedLayer.pitch,
      envelope: selectedLayer.envelope ? { ...selectedLayer.envelope } : undefined,
      synth: selectedLayer.synth ? { ...selectedLayer.synth } : undefined,
      fx: selectedLayer.fx ? { ...selectedLayer.fx } : undefined,
      subDesign: selectedLayer.subDesign ? { ...selectedLayer.subDesign } : undefined,
    };
    setHistoryStack(prev => [currentSnapshot, ...prev.slice(0, 9)]);

    const rawIntensity = customIntensity !== undefined ? customIntensity : intensity;
    const effIntensity = Math.min(Math.max(rawIntensity, 0.1), 1.0);

    // Start with current values
    let envelope: Envelope = { ...(selectedLayer.envelope || { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 }) };
    let synth: SynthSettings = { ...(selectedLayer.synth || { oscType: 'sine', detune: 0, frequency: 440, pitchEnvAmount: 0, pitchEnvDecay: 0.1, subLevel: 0 }) };
    let fx: FXSettings = { ...(selectedLayer.fx || { distortion: 0, bitcrush: 0, filterFreq: 20000, filterRes: 1, filterType: 'lowpass', delayTime: 0, delayFeedback: 0, reverbMix: 0, chorusMix: 0, compressorThreshold: -16, compressorRatio: 4, lfoRate: 0, lfoDepth: 0, lfoType: 'sine' }) };
    let subDesign: SubDesignSettings = { ...(selectedLayer.subDesign || { subEnabled: false, subLevel: 0.5, subType: 'sine', harmonicSaturation: 0, xSubMix: 0, drive: 0, dynamicTracking: true }) };
    let gain = selectedLayer.gain;
    let pan = selectedLayer.pan;
    let pitch = selectedLayer.pitch;

    // 1. OSCILLATORS & UNISON (If not locked)
    if (!locks.oscillators) {
      // Clear all oscillator variables to prevent category leaks
      synth.oscType = 'sine';
      synth.osc2Type = undefined;
      synth.osc2Mix = 0;
      synth.osc2Detune = 0;
      synth.unisonVoices = 1;
      synth.unisonDetune = 0;
      synth.subLevel = 0;

      if (selectedCategory === 'sub808') {
        synth.oscType = 'sine';
        synth.frequency = Math.round(lerpVal(synth.frequency || 55, 45, 65, effIntensity));
        synth.subLevel = lerpVal(synth.subLevel || 0, 0.6, 1.0, effIntensity);
        synth.unisonVoices = 1;
        synth.unisonDetune = 0;
      } else if (selectedCategory === 'snare') {
        synth.oscType = choose(['triangle', 'sine', 'square']);
        synth.frequency = Math.round(lerpVal(synth.frequency || 200, 150, 320, effIntensity));
        synth.subLevel = lerpVal(synth.subLevel || 0, 0, 0.2, effIntensity);
      } else if (selectedCategory === 'hihat') {
        synth.oscType = choose(['square', 'sawtooth']);
        synth.frequency = Math.round(lerpVal(synth.frequency || 3000, 1200, 4500, effIntensity));
        synth.subLevel = 0;
      } else if (selectedCategory === 'lead') {
        synth.oscType = choose(['sawtooth', 'square', 'triangle']);
        synth.osc2Type = choose(['sawtooth', 'square', 'sine']);
        synth.osc2Mix = 0.5;
        synth.osc2Detune = 12;
        synth.frequency = Math.round(lerpVal(synth.frequency || 440, 220, 880, effIntensity));
        synth.subLevel = lerpVal(synth.subLevel || 0, 0.1, 0.4, effIntensity);
        synth.unisonVoices = choose([1, 3, 5, 7]);
        synth.unisonDetune = Math.round(lerpVal(synth.unisonDetune || 10, 5, 35, effIntensity));
      } else if (selectedCategory === 'pad') {
        synth.oscType = choose(['sine', 'sawtooth', 'triangle']);
        synth.frequency = Math.round(lerpVal(synth.frequency || 220, 130, 390, effIntensity));
        synth.subLevel = lerpVal(synth.subLevel || 0, 0.2, 0.6, effIntensity);
        synth.unisonVoices = choose([3, 5, 7]);
        synth.unisonDetune = Math.round(lerpVal(synth.unisonDetune || 15, 10, 45, effIntensity));
      } else if (selectedCategory === 'wobble') {
        synth.oscType = choose(['sawtooth', 'square']);
        synth.frequency = Math.round(lerpVal(synth.frequency || 80, 55, 130, effIntensity));
        synth.subLevel = lerpVal(synth.subLevel || 0, 0.5, 0.9, effIntensity);
      } else if (selectedCategory === 'glitch') {
        synth.oscType = choose(['square', 'sawtooth']);
        synth.frequency = Math.round(lerpVal(synth.frequency || 440, 80, 1500, effIntensity));
        synth.subLevel = lerpVal(synth.subLevel || 0, 0, 0.5, effIntensity);
      } else if (selectedCategory === 'physical') {
        synth.oscType = choose(['triangle', 'sine']);
        synth.frequency = Math.round(lerpVal(synth.frequency || 300, 200, 600, effIntensity));
      } else { // Chaos
        synth.oscType = choose(['sine', 'sawtooth', 'square', 'triangle']);
        synth.frequency = Math.round(roll(40, 2000));
        synth.subLevel = roll(0, 1);
        synth.unisonVoices = choose([1, 3, 5, 7]);
        synth.unisonDetune = Math.round(roll(0, 50));
      }
    }

    // 2. PITCH ENVELOPE & TRANSIENT ATTACK PUNCH (If not locked)
    if (!locks.pitchEnvelope) {
      synth.pitchEnvAmount = 0;
      synth.pitchEnvDecay = 0.1;
      fx.transientEnabled = false;
      fx.transientAttack = 0;

      if (selectedCategory === 'sub808') {
        synth.pitchEnvAmount = Math.round(lerpVal(synth.pitchEnvAmount || 0, 24, 48, effIntensity));
        synth.pitchEnvDecay = lerpVal(synth.pitchEnvDecay || 0.1, 0.03, 0.12, effIntensity);
        fx.transientEnabled = true;
        fx.transientAttack = lerpVal(fx.transientAttack || 0, 20, 80, effIntensity);
      } else if (selectedCategory === 'snare') {
        synth.pitchEnvAmount = Math.round(lerpVal(synth.pitchEnvAmount || 0, 12, 36, effIntensity));
        synth.pitchEnvDecay = lerpVal(synth.pitchEnvDecay || 0.1, 0.02, 0.08, effIntensity);
        fx.transientEnabled = true;
        fx.transientAttack = lerpVal(fx.transientAttack || 0, 40, 100, effIntensity);
      } else if (selectedCategory === 'pad') {
        synth.pitchEnvAmount = 0;
        synth.pitchEnvDecay = 0.5;
        fx.transientEnabled = false;
      } else {
        synth.pitchEnvAmount = Math.random() > 0.5 ? Math.round(roll(-24, 24) * effIntensity) : 0;
        synth.pitchEnvDecay = lerpVal(synth.pitchEnvDecay || 0.1, 0.05, 0.3, effIntensity);
        fx.transientAttack = lerpVal(fx.transientAttack || 0, 20, 80, effIntensity);
      }
    }

    // 3. AMP ENVELOPE (If not locked)
    if (!locks.ampEnvelope) {
      envelope.attack = 0.01;
      envelope.decay = 0.3;
      envelope.sustain = 0.5;
      envelope.release = 0.4;

      if (selectedCategory === 'sub808') {
        envelope.attack = 0.001;
        envelope.decay = lerpVal(envelope.decay || 0.3, 0.3, 0.9, effIntensity);
        envelope.sustain = lerpVal(envelope.sustain || 0.5, 0.1, 0.5, effIntensity);
        envelope.release = lerpVal(envelope.release || 0.4, 0.2, 0.6, effIntensity);
      } else if (selectedCategory === 'snare' || selectedCategory === 'hihat') {
        envelope.attack = 0.001;
        envelope.decay = lerpVal(envelope.decay || 0.2, 0.05, 0.25, effIntensity);
        envelope.sustain = 0;
        envelope.release = lerpVal(envelope.release || 0.2, 0.05, 0.2, effIntensity);
      } else if (selectedCategory === 'pad') {
        envelope.attack = lerpVal(envelope.attack || 0.5, 0.5, 2.0, effIntensity);
        envelope.decay = lerpVal(envelope.decay || 1.5, 1.0, 3.0, effIntensity);
        envelope.sustain = lerpVal(envelope.sustain || 0.8, 0.6, 1.0, effIntensity);
        envelope.release = lerpVal(envelope.release || 1.5, 1.0, 3.0, effIntensity);
      } else {
        envelope.attack = lerpVal(envelope.attack || 0.01, 0.002, 0.1, effIntensity);
        envelope.decay = lerpVal(envelope.decay || 0.3, 0.1, 0.6, effIntensity);
        envelope.sustain = lerpVal(envelope.sustain || 0.5, 0.2, 0.8, effIntensity);
        envelope.release = lerpVal(envelope.release || 0.4, 0.1, 0.8, effIntensity);
      }
    }

    // 4. FILTER & TUBE DRIVE (If not locked)
    if (!locks.filterDrive) {
      fx.filterEnabled = true;
      fx.filterType = 'lowpass';
      fx.filterFreq = 20000;
      fx.filterRes = 1.0;
      fx.filterDrive = 0;

      if (selectedCategory === 'sub808') {
        fx.filterType = 'lowpass';
        fx.filterFreq = Math.round(lerpVal(fx.filterFreq || 20000, 120, 450, effIntensity));
        fx.filterRes = lerpVal(fx.filterRes || 1.0, 1.0, 2.5, effIntensity);
        fx.filterDrive = lerpVal(fx.filterDrive || 0, 10, 50, effIntensity);
      } else if (selectedCategory === 'hihat') {
        fx.filterType = 'highpass';
        fx.filterFreq = Math.round(lerpVal(fx.filterFreq || 20000, 3000, 8000, effIntensity));
        fx.filterRes = lerpVal(fx.filterRes || 1.0, 1.0, 3.0, effIntensity);
      } else if (selectedCategory === 'wobble') {
        fx.filterType = 'lowpass';
        fx.filterFreq = Math.round(lerpVal(fx.filterFreq || 20000, 200, 1800, effIntensity));
        fx.filterRes = lerpVal(fx.filterRes || 1.0, 3.0, 8.0, effIntensity);
        fx.filterDrive = lerpVal(fx.filterDrive || 0, 30, 80, effIntensity);
      } else if (selectedCategory === 'pad') {
        fx.filterType = choose(['lowpass', 'bandpass']);
        fx.filterFreq = Math.round(lerpVal(fx.filterFreq || 20000, 500, 2200, effIntensity));
        fx.filterRes = lerpVal(fx.filterRes || 1.0, 0.8, 2.0, effIntensity);
      } else {
        fx.filterType = choose(['lowpass', 'highpass', 'bandpass']);
        fx.filterFreq = Math.round(lerpVal(fx.filterFreq || 20000, 300, 5000, effIntensity));
        fx.filterRes = lerpVal(fx.filterRes || 1.0, 1.0, 5.0, effIntensity);
        fx.filterDrive = lerpVal(fx.filterDrive || 0, 0, 60, effIntensity);
      }
    }

    // 5. SATURATION & BITCRUSHER (If not locked)
    if (!locks.saturation) {
      fx.distortionEnabled = false;
      fx.distortion = 0;
      fx.bitcrushEnabled = false;
      fx.bitcrush = 0;

      if (selectedCategory === 'sub808' || selectedCategory === 'wobble') {
        fx.distortionEnabled = true;
        fx.distortion = lerpVal(fx.distortion || 0, 0.1, 0.45, effIntensity);
      } else if (selectedCategory === 'glitch') {
        fx.distortionEnabled = true;
        fx.distortion = lerpVal(fx.distortion || 0, 0.2, 0.6, effIntensity);
        fx.bitcrushEnabled = true;
        fx.bitcrush = lerpVal(fx.bitcrush || 0, 0.2, 0.7, effIntensity);
      } else {
        fx.distortionEnabled = Math.random() > 0.5;
        fx.distortion = lerpVal(fx.distortion || 0, 0.0, 0.3, effIntensity);
        fx.bitcrushEnabled = Math.random() > 0.7;
        fx.bitcrush = lerpVal(fx.bitcrush || 0, 0.0, 0.4, effIntensity);
      }
    }

    // 6. LFO MODULATION (If not locked)
    if (!locks.lfoModulation) {
      fx.lfoEnabled = false;
      fx.lfoRate = 0;
      fx.lfoDepth = 0;
      fx.lfoType = 'sine';
      fx.lfoTarget = 'filterFreq';

      if (selectedCategory === 'wobble') {
        fx.lfoEnabled = true;
        fx.lfoRate = lerpVal(fx.lfoRate || 0, 3, 12, effIntensity);
        fx.lfoDepth = lerpVal(fx.lfoDepth || 0, 0.3, 0.8, effIntensity);
        fx.lfoType = choose(['sine', 'sawtooth', 'triangle']);
        fx.lfoTarget = 'filterFreq';
      } else if (selectedCategory === 'pad') {
        fx.lfoEnabled = true;
        fx.lfoRate = lerpVal(fx.lfoRate || 0, 0.1, 1.5, effIntensity);
        fx.lfoDepth = lerpVal(fx.lfoDepth || 0, 0.2, 0.5, effIntensity);
        fx.lfoType = 'sine';
        fx.lfoTarget = 'filterFreq';
      } else {
        fx.lfoEnabled = Math.random() > 0.6;
        fx.lfoRate = lerpVal(fx.lfoRate || 0, 0.5, 8.0, effIntensity);
        fx.lfoDepth = lerpVal(fx.lfoDepth || 0, 0.0, 0.4, effIntensity);
      }
    }

    // 7. TIME FX (Reverb, Delay, Chorus) (If not locked)
    if (!locks.timeFx) {
      fx.reverbEnabled = false;
      fx.reverbMix = 0;
      fx.delayEnabled = false;
      fx.delayTime = 0;
      fx.delayFeedback = 0;
      fx.chorusEnabled = false;
      fx.chorusMix = 0;

      if (selectedCategory === 'pad' || selectedCategory === 'physical') {
        fx.reverbEnabled = true;
        fx.reverbMix = lerpVal(fx.reverbMix || 0, 0.4, 0.85, effIntensity);
        fx.delayEnabled = true;
        fx.delayTime = lerpVal(fx.delayTime || 0, 0.2, 0.5, effIntensity);
        fx.delayFeedback = lerpVal(fx.delayFeedback || 0, 0.3, 0.6, effIntensity);
        fx.chorusEnabled = true;
        fx.chorusMix = lerpVal(fx.chorusMix || 0, 0.3, 0.7, effIntensity);
      } else if (selectedCategory === 'sub808') {
        fx.reverbEnabled = false;
        fx.reverbMix = 0;
        fx.delayEnabled = false;
        fx.delayTime = 0;
      } else if (selectedCategory === 'lead') {
        fx.reverbEnabled = true;
        fx.reverbMix = lerpVal(fx.reverbMix || 0, 0.15, 0.35, effIntensity);
        fx.delayEnabled = Math.random() > 0.3;
        fx.delayTime = lerpVal(fx.delayTime || 0, 0.15, 0.35, effIntensity);
        fx.delayFeedback = lerpVal(fx.delayFeedback || 0, 0.2, 0.45, effIntensity);
      } else {
        fx.reverbEnabled = Math.random() > 0.4;
        fx.reverbMix = lerpVal(fx.reverbMix || 0, 0.0, 0.4, effIntensity);
        fx.delayEnabled = Math.random() > 0.5;
        fx.delayTime = lerpVal(fx.delayTime || 0, 0.0, 0.4, effIntensity);
      }
    }

    // 8. CHAOS & GRANULAR & MICRO-RESONATOR SWARM (If not locked)
    if (!locks.chaosGranular) {
      synth.phaseChaos = 0;
      synth.cycleStretch = 0;
      synth.fractalHarmonics = 0;
      synth.macroChaos = 0;
      synth.lorenzRate = 0;
      fx.tilEnabled = false;
      fx.tilTexture = 'static';
      fx.tilMix = 0;
      fx.mrsEnabled = false;
      fx.mrsMix = 0;
      fx.mrsDensity = 0;
      fx.mrsMaterial = 'metal';
      fx.mrsChaos = 0;

      if (selectedCategory === 'glitch' || selectedCategory === 'chaos') {
        synth.phaseChaos = lerpVal(synth.phaseChaos || 0, 0.3, 0.8, effIntensity);
        synth.cycleStretch = lerpVal(synth.cycleStretch || 0, -0.5, 0.5, effIntensity);
        synth.fractalHarmonics = lerpVal(synth.fractalHarmonics || 0, 0.2, 0.7, effIntensity);
        synth.macroChaos = lerpVal(synth.macroChaos || 0, 0.3, 0.8, effIntensity);
        synth.lorenzRate = lerpVal(synth.lorenzRate || 0, 0.2, 0.7, effIntensity);
        fx.tilEnabled = true;
        fx.tilTexture = choose(['grit', 'static', 'glitch', 'crackle', 'plasma']);
        fx.tilMix = lerpVal(fx.tilMix || 0, 0.2, 0.6, effIntensity);
      } else if (selectedCategory === 'physical') {
        fx.mrsEnabled = true;
        fx.mrsMix = lerpVal(fx.mrsMix || 0, 0.3, 0.7, effIntensity);
        fx.mrsDensity = lerpVal(fx.mrsDensity || 0, 20, 80, effIntensity);
        fx.mrsMaterial = choose(['metal', 'glass', 'wood', 'bio']);
        fx.mrsChaos = lerpVal(fx.mrsChaos || 0, 0.2, 0.6, effIntensity);
      }
    }

    // 9. SUB DESIGN ENGINE (If not locked)
    if (!locks.subDesign) {
      subDesign.subEnabled = false;
      subDesign.subLevel = 0.5;
      subDesign.subType = 'sine';
      subDesign.harmonicSaturation = 0;
      subDesign.xSubMix = 0;
      subDesign.drive = 0;
      subDesign.dynamicTracking = true;

      if (selectedCategory === 'sub808' || selectedCategory === 'wobble') {
        subDesign.subEnabled = true;
        subDesign.subLevel = lerpVal(subDesign.subLevel || 0.5, 0.6, 1.0, effIntensity);
        subDesign.subType = choose(['sine', 'triangle']);
        subDesign.harmonicSaturation = lerpVal(subDesign.harmonicSaturation || 0, 20, 70, effIntensity);
        subDesign.xSubMix = lerpVal(subDesign.xSubMix || 0, 0.1, 0.5, effIntensity);
      }
    }

    // 10. SPATIAL & GAIN (If not locked)
    if (!locks.spatialGain) {
      gain = lerpVal(gain, 0.8, 1.0, effIntensity);
      pan = lerpVal(pan, -0.2, 0.2, effIntensity);
      
      // Randomize pitch with producer-focused musical semitone intervals
      if (effIntensity > 0.4) {
        const transpositions = [-12, -7, -5, 0, 5, 7, 12];
        pitch = choose(transpositions);
      } else {
        pitch = 0;
      }
    }

    // Commit changes
    onUpdate({
      audioBuffer: undefined, // Clear buffer so procedural synth engine rebuilds
      gain,
      pan,
      pitch,
      envelope,
      synth,
      fx,
      subDesign,
    });

    // Auto-Audition
    if (autoAudition) {
      setTimeout(onPlay, 100);
    }
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const lastState = historyStack[0];
    setHistoryStack(prev => prev.slice(1));
    
    // Respect active section locks when undoing
    const updatedState = applyStateWithLocks(lastState, selectedLayer, locks);

    onUpdate({
      audioBuffer: undefined,
      ...updatedState
    });
    if (autoAudition) {
      setTimeout(onPlay, 100);
    }
  };

  const lockedCount = Object.values(locks).filter(Boolean).length;
  const totalSections = Object.keys(locks).length;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label="Smart Selective Randomizer"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#0c0c11] border border-[#242432] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white relative"
        >
          {/* Header */}
          <div className="bg-[#12121b] border-b border-[#222230] px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-600/20 to-yellow-400/20 border border-blue-500/40 rounded-xl text-yellow-400 shadow-inner">
                <Dices size={24} className="animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black tracking-tight text-white font-sans uppercase">
                    Smart Selective Randomizer
                  </h2>
                  <span className="px-2.5 py-0.5 bg-yellow-400/20 border border-yellow-400/30 text-yellow-300 font-mono text-[10px] font-bold rounded-full">
                    SECTION LOCKING ENGINE ⚡
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Select target sound profile, lock sections to preserve, & tweak intensity in real-time!
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#0f172a] text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-[#1e293b]"
              title="Close Randomizer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#030305]">

            {/* 1. Target Sound Category Selector */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 font-urban">
                  <Sparkles size={14} /> 1. Target Sound Style / Archetype
                </label>
                <span className="text-[10px] text-gray-400 font-mono">
                  Guides DSP generation rules & envelopes
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {CATEGORIES.map(cat => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`text-left p-3 rounded-xl border transition-all relative overflow-hidden group ${
                        isSelected 
                          ? `${cat.color} border-2 shadow-lg scale-[1.01]` 
                          : 'bg-[#12121a] hover:bg-[#181824] border-[#1f1f2d] text-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xl">{cat.icon}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                          isSelected ? 'bg-black/40 text-white' : 'bg-[#1a1a26] text-gray-400'
                        }`}>
                          {cat.badge}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-white leading-tight">{cat.name}</div>
                      <div className="text-[10px] text-gray-400 leading-tight mt-0.5 line-clamp-1">{cat.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Section Locking Matrix */}
            <div className="bg-[#101017] border border-[#222232] rounded-xl p-5 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#1c1c28] pb-3">
                <div>
                  <div className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                    <ShieldCheck size={16} /> 2. Section Selective Locks ({lockedCount}/{totalSections} Locked)
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Locked sections stay 100% unchanged during randomization!
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={unlockAll}
                    className="px-2.5 py-1 bg-[#181824] hover:bg-[#222234] border border-[#2a2a3e] rounded-lg text-[10px] font-mono font-bold text-gray-300 transition-all flex items-center gap-1"
                  >
                    <Unlock size={12} className="text-sky-400" /> Unlock All
                  </button>
                  <button
                    onClick={lockAll}
                    className="px-2.5 py-1 bg-[#181824] hover:bg-[#222234] border border-[#2a2a3e] rounded-lg text-[10px] font-mono font-bold text-gray-300 transition-all flex items-center gap-1"
                  >
                    <Lock size={12} className="text-amber-400" /> Lock All
                  </button>
                </div>
              </div>

              {/* Grid of Section Locks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                
                {/* Lock Item */}
                <button
                  onClick={() => toggleLock('oscillators')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.oscillators 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Radio size={14} className={locks.oscillators ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Oscillators & Unison</div>
                      <div className="text-[9px] text-slate-400 font-mono">Waveforms, Pitch, Voices</div>
                    </div>
                  </div>
                  {locks.oscillators ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-gray-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('pitchEnvelope')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.pitchEnvelope 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Zap size={14} className={locks.pitchEnvelope ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Pitch Env & Attack Punch</div>
                      <div className="text-[9px] text-slate-400 font-mono">Pitch Drop, Transient Snap</div>
                    </div>
                  </div>
                  {locks.pitchEnvelope ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-gray-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('ampEnvelope')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.ampEnvelope 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Activity size={14} className={locks.ampEnvelope ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Amp Volume Envelope</div>
                      <div className="text-[9px] text-slate-400 font-mono">Attack, Decay, Sustain, Rel</div>
                    </div>
                  </div>
                  {locks.ampEnvelope ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-gray-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('filterDrive')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.filterDrive 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Sliders size={14} className={locks.filterDrive ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Filter & Tube Drive</div>
                      <div className="text-[9px] text-slate-400 font-mono">Cutoff, Res, Tube Warmth</div>
                    </div>
                  </div>
                  {locks.filterDrive ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-gray-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('saturation')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.saturation 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Flame size={14} className={locks.saturation ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Distortion & Bitcrush</div>
                      <div className="text-[9px] text-slate-400 font-mono">Overdrive, Digital Sizzle</div>
                    </div>
                  </div>
                  {locks.saturation ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-gray-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('lfoModulation')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.lfoModulation 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Wand2 size={14} className={locks.lfoModulation ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">LFO & Wobble Matrix</div>
                      <div className="text-[9px] text-slate-400 font-mono">Rate, Depth, Filter Wobble</div>
                    </div>
                  </div>
                  {locks.lfoModulation ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-slate-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('timeFx')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.timeFx 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Compass size={14} className={locks.timeFx ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Reverb, Delay & Chorus</div>
                      <div className="text-[9px] text-slate-400 font-mono">Echo, Space Depth, Stereo</div>
                    </div>
                  </div>
                  {locks.timeFx ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-slate-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('chaosGranular')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.chaosGranular 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Cpu size={14} className={locks.chaosGranular ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Chaos & Micro-Resonator</div>
                      <div className="text-[9px] text-slate-400 font-mono">Phase Drift, Lorenz, MRS</div>
                    </div>
                  </div>
                  {locks.chaosGranular ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-slate-600 shrink-0" />}
                </button>

                <button
                  onClick={() => toggleLock('subDesign')}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                    locks.subDesign 
                      ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200 shadow-md' 
                      : 'bg-[#0f172a] border-[#1e293b] text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Volume2 size={14} className={locks.subDesign ? 'text-yellow-400' : 'text-slate-500'} />
                    <div>
                      <div className="font-bold text-[11px]">Sub Bass Synthesizer</div>
                      <div className="text-[9px] text-slate-400 font-mono">Sub Type, X-Sub, Saturation</div>
                    </div>
                  </div>
                  {locks.subDesign ? <Lock size={14} className="text-yellow-400 shrink-0" /> : <Unlock size={14} className="text-slate-600 shrink-0" />}
                </button>

              </div>
            </div>

            {/* 3. Intensity Slider & Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#050507] border border-[#1e293b] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5 font-urban">
                    <Sliders size={14} /> Tweak / Morph Intensity
                  </span>
                  <span className="px-2 py-0.5 bg-yellow-400/20 text-yellow-300 font-mono text-xs font-bold rounded">
                    {Math.round(intensity * 100)}%
                  </span>
                </div>

                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={intensity}
                  onChange={(e) => setIntensity(parseFloat(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer h-2 bg-[#0f172a] rounded-lg"
                />

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>10% Subtle Tweak</span>
                  <span>50% Balanced</span>
                  <span>100% Total Mutation</span>
                </div>
              </div>

              <div className="bg-[#050507] border border-[#1e293b] rounded-xl p-4 flex flex-col justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5 font-urban">
                    <Play size={14} /> Audition & Fast Tweaks
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Automatically trigger audio playback upon generating new variations
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#1e293b]">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoAudition}
                      onChange={(e) => setAutoAudition(e.target.checked)}
                      className="rounded accent-blue-500"
                    />
                    <span>Auto-Play Sound on Generate</span>
                  </label>

                  <button
                    onClick={onPlay}
                    className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/50 font-mono text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Play size={12} fill="currentColor" /> Test Sound Now
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Footer Action Bar */}
          <div className="bg-[#12121b] border-t border-[#222230] p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleUndo}
                disabled={historyStack.length === 0}
                className="px-3 py-2 bg-[#1a1a26] hover:bg-[#222234] disabled:opacity-40 border border-[#2a2a3e] text-gray-300 font-mono text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                title="Undo last randomize roll"
              >
                <RotateCcw size={14} /> Undo ({historyStack.length})
              </button>

              <button
                onClick={() => handleGenerate(0.15)}
                className="px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-mono text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                title="Morph current sound by 15% subtle tweak"
              >
                <Wand2 size={14} /> Morph 15%
              </button>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#1a1a26] hover:bg-[#242436] text-gray-300 font-mono text-xs font-bold rounded-xl border border-[#2e2e42] transition-all"
              >
                Done / Close
              </button>

              <button
                onClick={() => handleGenerate()}
                className="px-6 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black font-urban text-xs rounded-xl shadow-lg shadow-yellow-400/20 hover:scale-[1.02] transition-all flex items-center gap-2"
              >
                <Dices size={18} /> GENERATE RANDOMIZED SOUND ⚡
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
