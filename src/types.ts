/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LayerType = 'sample' | 'synth';

export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface ConvolutionPreset {
  id?: string;
  name: string;
  category: 'room' | 'hall' | 'plate' | 'special' | 'fx';
  irId: string;

  preEq: {
    hpFreq: number;
    tiltAmount: number; // -1 = darker, +1 = brighter
  };

  irProcessing: {
    stretchFactor: number; // 0.5–2.0
    reverse: boolean;
    irLowShelfDb: number;
    irHighShelfDb: number;
    mode: 'fullband' | 'multiband';
    multibandIRs?: { low: string; mid: string; high: string };
  };

  mix: {
    dry: number;
    wet: number;
  };

  postEq: {
    dampingFreq: number;
    presenceDb: number;
    airDb: number;
  };

  nonlinearTail: {
    saturationAmount: number;
    tailModDepth: number;
    tailModRate: number;
  };
}

export interface TapeDelayPreset {
  id?: string;
  name: string;
  category: 'utility' | 'space' | 'character' | 'fx';

  preFilter: {
    hpFreq: number;
    lpFreq: number;
    midBumpDb: number;
  };

  saturation: {
    drive: number;
    biasTilt: number; // -1 = darker saturation, +1 = brighter
  };

  heads: {
    count: number;
    timesMs: number[]; // per-head delay times
    levels: number[];  // per-head gains
    pans: number[];    // -1..+1
    syncMode: 'free' | 'tempo';
  };

  modulation: {
    wowDepthMs: number;
    wowRateHz: number;
    flutterDepthMs: number;
    flutterRateHz: number;
  };

  feedback: {
    amount: number;
    filterType: 'lp' | 'hp' | 'band';
    filterFreq: number;
    extraSaturation: number;
    miniIRId?: string; // optional short IR in feedback
  };

  mix: {
    dry: number;
    wet: number;
  };
}

export interface FXSettings {
  distortion: number;
  distortionEnabled?: boolean;
  distortionType?: 'tube' | 'tape' | 'clip' | 'fuzz';
  harmonic2nd?: number;
  harmonic3rd?: number;
  bitcrush: number;
  bitcrushEnabled?: boolean;
  filterFreq: number;
  filterRes: number;
  filterType: BiquadFilterType | 'peaking' | 'notch' | 'allpass';
  filterEnabled?: boolean;
  delayTime: number;
  delayFeedback: number;
  delayEnabled?: boolean;
  delayPingPong?: boolean;
  delayStereoSpread?: number;
  reverbMix: number;
  reverbEnabled?: boolean;
  reverbIRUrl?: string;       // Custom IR source
  reverbIRBuffer?: AudioBuffer; // Decoded IR
  
  // Convolution Reverb Enhanced DSP Preset
  convolutionPreset?: ConvolutionPreset;

  // Tape Delay Enhanced DSP Preset
  tapeDelayPreset?: TapeDelayPreset;

  chorusMix: number;
  chorusEnabled?: boolean;
  chorusSpread?: number;
  compressorThreshold: number;
  compressorRatio: number;
  compressorEnabled?: boolean;
  lfoRate?: number;
  lfoDepth?: number;
  lfoType?: OscillatorType;
  lfoEnabled?: boolean;
  
  // Auto-Pan
  autoPanRate?: number;
  autoPanDepth?: number;
  
  // Hybrid Source Fusion (HSF)
  hsfEnabled?: boolean;
  hsfMix?: number;
  hsfEngine?: 'physical' | 'granular' | 'additive' | 'fm' | 'noise' | 'resonator';
  hsfAmount?: number;

  // Micro-Resonator Swarm (MRS)
  mrsEnabled?: boolean;
  mrsMix?: number;
  mrsDensity?: number;
  mrsMaterial?: 'metal' | 'glass' | 'wood' | 'digital' | 'bio';
  mrsChaos?: number;

  // Texture Injection Layer (TIL)
  tilEnabled?: boolean;
  tilMix?: number;
  tilTexture?: 'dust' | 'static' | 'grit' | 'glitch' | 'crackle' | 'plasma' | 'ticks' | 'rustle' | 'brown' | 'pink';
  tilAmount?: number;

  // Transient Shaper & Attack Punch Engine
  transientAttack?: number;   // -100 to 100 (%)
  transientSustain?: number;  // -100 to 100 (%)
  transientEnabled?: boolean;

  // Secondary Filter & Drive
  filter2Freq?: number;
  filter2Res?: number;
  filter2Type?: BiquadFilterType;
  filter2Enabled?: boolean;
  filterDrive?: number;       // Analog tube warmth drive (0 to 100)
  keyTracking?: number;        // Filter pitch tracking (0 to 100%)

  // Advanced Modulation Matrix Routing
  lfoTarget?: 'filterFreq' | 'filter2Freq' | 'pitch' | 'pan' | 'distortion' | 'res';
  lfoSync?: boolean;
  lfoDivision?: '1/4' | '1/8' | '1/16' | '1/32' | '1/8t' | '1/16t';
}

export interface SynthSettings {
  oscType: OscillatorType;
  detune: number;
  frequency: number;
  pitchEnvAmount: number;
  pitchEnvDecay: number;
  subLevel: number;

  // Dual Oscillator & Unison Engine
  osc2Type?: OscillatorType;
  osc2Detune?: number;        // -24 to 24 ST
  osc2Mix?: number;           // 0 to 1
  unisonVoices?: number;      // 1 to 7 voices
  unisonDetune?: number;      // 0 to 50 cents micro-detune
  hardSync?: boolean;         // Sync osc2 to osc1
  syncRatio?: number;         // Hard-sync slave oscillator frequency ratio (1.0 to 4.0)
  unisonPhaseOffset?: number; // Starting phase offset mode (0: retrigger, 1: golden ratio, 2: random)
  unisonDetuneCurve?: number; // Detune spacing curve exponent (1.0 to 3.0)

  // Sub Oscillator
  subType?: OscillatorType;   // Shape of sub (default sine)
  subPhaseAlign?: number;     // Phase alignment angle for sub-oscillator (0 to 360 degrees)

  // West-Coast Phase Distortion
  pdAmount?: number;          // West-Coast Phase Distortion intensity (0 to 1)

  // Oversampling & Saturation Symmetry
  oversamplingEnabled?: boolean; // Enable 2x oversampling with decimation filter
  saturationSymmetry?: number;  // Asymmetrical saturation bias factor (-1 to +1)

  // Pitch & Portamento
  glideTime?: number;        // 0 to 2 seconds

  // Advanced FM / RM
  fmAmount?: number;         // 0 to 1
  fmRatio?: number;          // frequency ratio (e.g., 0.5, 1, 2, 4)
  ringMod?: number;          // 0 to 1
  wavefold?: number;         // Wavefolding intensity (0 to 1)

  // Core Oscillator Mutation
  phaseChaos?: number;       // Random phase drift (0 - 1)
  cycleStretch?: number;     // Waveform stretch asymmetry (-1 to 1)
  fractalHarmonics?: number; // Recursive FM modulation (0 - 1)
  harmonicBias?: number;     // Timbre shift (0 - 1)
  // Texture Generation
  textureType?: 'noise' | 'vinyl' | 'tape' | 'hum' | 'digital' | 'brown' | 'pink';
  textureLevel?: number;
  
  // Chaotic Systems
  lorenzRate?: number;       // Lorenz ODE speed (0 - 1)
  logisticChaos?: number;    // Logistic map chaos (0 - 1)
  feedbackTurbulence?: number; // Soft-clipped feedback loop (0 - 1)
  macroChaos?: number;       // Master chaos macro (0 - 1)

  // Granular / Particle
  grainCount?: number;       // Grains density (0 - 100)
  grainDrift?: number;       // Grain start jitter (0 - 1)
  grainSizeJitter?: number;  // Grain duration variance (0 - 1)
  sprayRadius?: number;      // Stereo scatter (0 - 1)

  // Filter Mutation
  resonanceBloom?: number;   // Swelling resonance (0 - 1)
  selfOscillation?: number;  // Comb ring (0 - 1)

  // Destruction
  sampleRateChaos?: number;  // Downsampling rate jitter (0 - 1)
  errorInjection?: number;   // Buffer droppings/corruption (0 - 1)
  zeroCrossingMutator?: number; // Zero-crossing step alteration (0 - 1)

  // True Analog Architecture & Imperfections Engine
  vintageMacro?: number;       // 0 - 1 (Master analog slop macro)
  voiceAge?: 'mint' | 'studio80s' | 'dusty70s' | 'broken';
  driftAmount?: number;        // Pitch & cutoff drift factor (0 - 1)
  slopAmount?: number;         // Voice envelope & phase slop (0 - 1)
  analogFilterMode?: 'zdfLadder' | 'zdfSvf' | 'biquad';
  filterDrive?: number;        // Transistor ladder drive (0 - 1)
  warmthEngine?: number;       // Master bus warmth/tape saturation (0 - 1)
  oversampling?: 1 | 2 | 4;

  // Sound Designer Dream Upgrades (10 Specific Synth Parameters)
  unisonWidth?: number;        // Stereo width of unison voices (0 to 1)
  fmDepth?: number;            // Modulation index/depth (0 to 10.0)
  fmFeedback?: number;         // Modulator self-feedback (0 to 1.0)
  ringModFreq?: number;        // Carrier frequency of Ring Modulator (0 to 1500 Hz)
  ringModMix?: number;         // Ring Modulator blend dry/wet (0 to 1.0)
  vowelFormant?: 'none' | 'a' | 'e' | 'i' | 'o' | 'u'; // Talk box formant filters
  vowelMix?: number;           // Vowel filter blend (0 to 1.0)
  pitchEnvAttack?: number;     // Multi-stage pitch attack time (0 to 0.5s)
  pitchEnvSustain?: number;    // Multi-stage pitch sustain level (0 to 1.0)
  pitchEnvRelease?: number;    // Multi-stage pitch release time (0 to 1.0)
  pitchEnvDepth?: number;      // Targeted pitch shift envelope depth (-48 to +48 semitones)
  noiseLevel?: number;         // Blend of custom procedural noise (0 to 1.0)
  noiseColor?: 'white' | 'pink' | 'brown' | 'blue'; // Color palette of noise generator
  noiseFilterCutoff?: number;  // Dedicated noise lowpass filter cutoff (100 to 20000 Hz)
  wavefoldDepth?: number;      // West-coast style waveshape folding factor (0 to 10.0)
  wavefoldBias?: number;       // Asymmetry bias for wavefolder folding center (-1.0 to 1.0)
  analogBias?: number;         // Even-harmonic tape saturation bias (0 to 1.0)
  analogDriftSpeed?: number;   // Low frequency pitch wander speed (0.1 to 10.0 Hz)
  bitcrushDepth?: number;      // 2 to 16-bit bitcrush sample quantizer (0 to 1.0)
  downsampleFactor?: number;   // Quantized integer sample rate divisor (1 to 32)
  phaseRetrigger?: boolean;    // If true, reset phase to 0 on trigger for punchy consistency
}

export interface SubDesignSettings {
  subEnabled: boolean;
  subLevel: number;
  subType: 'sine' | 'triangle' | 'square';
  harmonicSaturation: number;
  harmonic2nd?: number;
  harmonic3rd?: number;
  xSubMix: number;          // Extra sub-octave layer
  drive: number;
  dynamicTracking: boolean; // Tracks the sample's pitch
  phase?: number;           // Phase alignment (0 to 360 degrees)
}

export interface FXPreset {
  id: string;
  name: string;
  settings: FXSettings;
  createdAt: string;
}

export interface SoundLayer {
  id: string;
  name: string;
  type: LayerType;
  enabled: boolean;
  muted?: boolean;
  soloed?: boolean;
  polarityInvert?: boolean;
  gain: number;
  pan: number;
  pitch: number; // in semitones
  envelope: Envelope;
  fx: FXSettings;
  fxPresetId?: string;
  
  // 808 Specialized Sound Design (SubLab style)
  subDesign?: SubDesignSettings;
  
  // For 'sample' type
  audioBuffer?: AudioBuffer;
  fileName?: string;
  analysis?: AudioAnalysisResult;

  // Playback start/stop and delay parameters
  playStartPct?: number;       // Crop start (0 to 1, default 0)
  playEndPct?: number;         // Crop end (0 to 1, default 1)
  startTimeOffset?: number;    // Trigger delay in seconds (default 0)

  // For 'synth' type
  synth?: SynthSettings;

  chaosMode?: boolean;

  // Phase Alignment & Macro Performance Controls
  phaseAngle?: number;          // Phase rotation in degrees (0 to 360)
  macroPunch?: number;          // Transient attack punch macro (0 to 100)
  macroGrit?: number;           // Distortion & saturation macro (0 to 100)
  macroSpace?: number;          // Reverb & delay space macro (0 to 100)
  macroDepth?: number;          // Sub bass & low end depth macro (0 to 100)

  // Individual Sample Tweaker parameters (for deep individual tweaking)
  sampleReverse?: boolean;
  sampleSpeed?: number;
  sampleLoop?: boolean;
  samplePitchCoarse?: number;
  samplePitchFine?: number;
  sampleFreqShift?: number;
  sampleBitcrush?: number;
}

export const DEFAULT_ENVELOPE: Envelope = {
  attack: 0.01,
  decay: 0.2,
  sustain: 0.1,
  release: 0.5,
};

export const DEFAULT_FX: FXSettings = {
  distortion: 0,
  distortionEnabled: true,
  bitcrush: 0,
  bitcrushEnabled: true,
  filterFreq: 20000,
  filterRes: 1,
  filterType: 'lowpass',
  filterEnabled: true,
  delayTime: 0.3,
  delayFeedback: 0.2,
  delayEnabled: false,
  reverbMix: 0,
  reverbEnabled: true,
  chorusMix: 0,
  chorusEnabled: true,
  compressorThreshold: -24,
  compressorRatio: 4,
  compressorEnabled: true,
  lfoRate: 0,
  lfoDepth: 0,
  lfoType: 'sine',
  lfoEnabled: true,
  hsfEnabled: false,
  hsfMix: 0.5,
  hsfEngine: 'noise',
  hsfAmount: 0.5,
  mrsEnabled: false,
  mrsMix: 0.5,
  mrsDensity: 0.5,
  mrsMaterial: 'metal',
  mrsChaos: 0.5,
  tilEnabled: false,
  tilMix: 0.5,
  tilTexture: 'dust',
  tilAmount: 0.5,
  transientAttack: 0,
  transientSustain: 0,
  transientEnabled: true,
  filter2Freq: 20000,
  filter2Res: 1,
  filter2Type: 'highpass',
  filter2Enabled: false,
  filterDrive: 0,
  keyTracking: 0,
  lfoTarget: 'filterFreq',
  lfoSync: false,
  lfoDivision: '1/4',
};

export const DEFAULT_SYNTH: SynthSettings = {
  oscType: 'sine',
  detune: 0,
  frequency: 440,
  pitchEnvAmount: 0,
  pitchEnvDecay: 0.1,
  subLevel: 0,
  osc2Type: 'sawtooth',
  osc2Detune: 0,
  osc2Mix: 0,
  unisonVoices: 1,
  unisonDetune: 0,
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
  resonanceBloom: 0,
  selfOscillation: 0,
  sampleRateChaos: 0,
  errorInjection: 0,
  zeroCrossingMutator: 0,
  
  // Sound Designer Defaults
  unisonWidth: 0.7,
  fmRatio: 1.0,
  fmDepth: 0.0,
  fmFeedback: 0.0,
  ringModFreq: 440,
  ringModMix: 0.0,
  vowelFormant: 'none',
  vowelMix: 0.0,
  pitchEnvAttack: 0.0,
  pitchEnvSustain: 1.0,
  pitchEnvRelease: 0.1,
  pitchEnvDepth: 0,
  noiseLevel: 0.0,
  noiseColor: 'white',
  noiseFilterCutoff: 12000,
  wavefoldDepth: 0.0,
  wavefoldBias: 0.0,
  analogBias: 0.0,
  analogDriftSpeed: 1.0,
  bitcrushDepth: 0.0,
  downsampleFactor: 1,
  phaseRetrigger: true,

  // 5 Premium Sound Designer Defaults
  hardSync: false,
  syncRatio: 1.8,
  unisonPhaseOffset: 1, // Golden Angle
  unisonDetuneCurve: 1.5,
  subType: 'sine',
  subPhaseAlign: 0,
  pdAmount: 0.0,
  oversamplingEnabled: true,
  saturationSymmetry: 0.0,
};

// --- Rack & Module Types ---
export type ModuleType =
  | 'eq'
  | 'compressor'
  | 'limiter'
  | 'clipper'
  | 'saturator'
  | 'tape'
  | 'exciter'
  | 'delay'
  | 'reverb'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'tremolo'
  | 'imager';

export interface RackModule {
  id: string;
  type: ModuleType;
  enabled: boolean;
  solo?: boolean;
  settings: Record<string, any>;
  parallelGain?: number;
  parallelPan?: number;
  parallelMute?: boolean;
  parallelSolo?: boolean;
}

// --- Compare Engine Types ---
export interface ReferenceTrack {
  id: string;
  name: string;
  duration: number;
  channels: number;
  buffer: AudioBuffer;
  peakMap: number[];
}

export interface CompareEngineSnapshot {
  id: string;
  name: string;
  refTrackId: string;
  refGainOffset: number;
  loopStart: number;
  loopEnd: number;
  createdAt: string;
}

// --- Sound Category & Metatagging Types ---
export type SampleCategory = 
  | 'Atmospheres'
  | 'Impacts'
  | 'Transitions'
  | 'Glitches'
  | 'FX Elements'
  | 'Percussive FX'
  | 'Melodic FX'
  | 'Kick'
  | 'Snare'
  | 'HiHat'
  | 'Clap'
  | '808'
  | 'Perc'
  | 'Vox'
  | 'FX'
  | 'Melody'
  | 'Bass';

export interface AudioAnalysisResult {
  peakDb: number;
  rmsDb: number;
  lufsDb: number;
  transientSharpness: number; // 0 to 10
  estimatedKey?: string;
  estimatedBpm?: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  suggestedCategory: SampleCategory;
  features?: {
    attackTime: number;
    decayTime: number;
    spectralCentroid: number;
    transientStrength: number;
    noiseRatio: number;
  };
}

export interface SoundKitSample {
  id: string;
  name: string;
  fileName: string;
  category: SampleCategory;
  tags: string[];
  key?: string;
  bpm?: number;
  gain: number;
  pitch: number;
  audioBuffer?: AudioBuffer;
  analysis?: AudioAnalysisResult;
  sizeBytes?: number;
}

export type HipHopEra =
  | 'boom_bap'
  | 'golden_era'
  | 'trap'
  | 'drill'
  | 'g_funk'
  | 'vinyl_press'
  | 'conscious_jazz'
  | 'crunk'
  | 'cloud_rap'
  | 'grime'
  | 'mixtape_era';

export interface CoverArtOptions {
  theme?: 'cyberpunk' | 'gold_analog' | 'obsidian' | 'acid_retro' | 'minimal' | 'custom' | string;
  era?: HipHopEra;
  title: string;
  subtitle: string;
  producer: string;
  customImageUrl?: string;
  selectedPicturePreset?: string;
  overlayTexture?: 'none' | 'vinyl' | 'grid' | 'foil' | 'gold_stamp' | string;
  badgeText?: string;
  accentColor: string;
  seedOverride?: number;
}

export interface SoundKit {
  id: string;
  title: string;
  producer: string;
  description: string;
  genre: string;
  tags: string[];
  price: number; // 0 for FREE, or price in USD e.g. 19.99
  isPublished: boolean;
  coverArt: CoverArtOptions;
  coverArtDataUrl?: string;
  samples: SoundKitSample[];
  createdAt: string;
  downloadsCount?: number;
  rating?: number;
}

export interface BatchProcessOptions {
  normalizePeak: boolean;
  targetPeakDb: number; // e.g. -0.1
  trimSilence: boolean;
  silenceThresholdDb: number; // e.g. -45
  transientSharpness?: number; // -100 to 100
  pitchSemitones: number; // -12 to 12
  tubeDrive: number; // 0 to 100
  highPassFreq: number; // 0 to 500 Hz
  lowPassFreq?: number; // 1000 to 20000 Hz
  fadeOutDurationSec: number; // 0 to 0.5 sec
  chaosMode?: boolean;
  reverbSpace?: number; // 0 to 100
  bitcrushDepth?: number; // 0 to 100
  stereoWidening?: number; // 0 to 100
}

export interface EvolutionVariation {
  id: string;
  name: string;
  role: string;
  buffer: AudioBuffer;
  chaosLevel: number;
  spectralDensity: number;
  temporalBehavior: number;
  routingPath: string[];
}

export type StyleProfile = 'Clean' | 'Punchy' | 'LoFi' | 'Soft' | 'Experimental';

export interface VariantProfile {
  name: string;
  transientBoost: number;
  saturation: number;
  eqTilt: number;
  bitDepth?: number;
  sampleRate?: number;
}

