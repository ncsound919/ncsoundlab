/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SynthSettings } from '../types';
import {
  generateAnalogOscSample,
  ZDFLadderFilter,
  getVoiceAgeParameters,
  WarmthEngineDSP,
} from '../audio/dsp/AnalogEngineDSP';
import { createFilterFamily, type FilterFamily } from '../audio/dsp/FilterFamily';

/**
 * Procedural Chaos Sound FX & Synthesis Engine.
 * Generates highly complex, weird, glitchy, and non-linear waveforms.
 */

export interface AdvancedChaosSettings extends SynthSettings {
  // Core Oscillator Mutation
  phaseChaos?: number;       // Random phase drift (0 - 1)
  cycleStretch?: number;     // Waveform stretch asymmetry (-1 to 1)
  fractalHarmonics?: number; // Recursive frequency modulation (0 - 1)
  harmonicBias?: number;     // Timbre shifting towards metallic/hollow (0 - 1)
  subLevel: number;

  // Chaotic Systems
  lorenzRate?: number;       // Integration speed of Lorenz system (0 - 1)
  logisticChaos?: number;    // Logistic map waveshaping factor (0 - 1)
  feedbackTurbulence?: number; // Unstable sample feedback delay (0 - 1)
  macroChaos?: number;       // Master chaos slider pushing all parameters (0 - 1)

  // Granular / Particle
  grainCount?: number;       // Grains density (0 - 100)
  grainDrift?: number;       // Grain start offset jitter (0 - 1)
  grainSizeJitter?: number;  // Grain duration variance (0 - 1)
  sprayRadius?: number;      // Stereo spread (0 - 1)

  // Filter Mutation
  resonanceBloom?: number;   // Sweeping resonance boost (0 - 1)
  selfOscillation?: number;  // Feedback ring comb filter (0 - 1)
  filterCutoff?: number;     // Ladder filter cutoff (Hz)
  filterResonance?: number;  // Ladder filter resonance (Q)

  // Destruction
  sampleRateChaos?: number;  // Downsampling rate jitter (0 - 1)
  errorInjection?: number;   // Buffer droppings/corruption probability (0 - 1)
  zeroCrossingMutator?: number; // Zero-crossing step alteration (0 - 1)
}

/**
 * Clean 2-pole Biquad filter implementation for real-time formant/vocal simulation
 */
class SimpleBiquad {
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  a0 = 1; a1 = 0; a2 = 0; b1 = 0; b2 = 0;
  
  setBandpass(freq: number, Q: number, sampleRate: number) {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);
    const cosw0 = Math.cos(w0);
    
    const a0Recip = 1 / (1 + alpha);
    this.a0 = alpha * a0Recip;
    this.a1 = 0;
    this.a2 = -alpha * a0Recip;
    this.b1 = -2 * cosw0 * a0Recip;
    this.b2 = (1 - alpha) * a0Recip;
  }
  
  process(x: number): number {
    const y = this.a0 * x + this.a1 * this.x1 + this.a2 * this.x2 - this.b1 * this.y1 - this.b2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// In-memory LRU AudioBuffer cache for procedural synth generation (Enhancement 10)
const SYNTH_CACHE_MAX_SIZE = 32;
const synthBufferCache = new Map<string, AudioBuffer>();

function cloneAudioBuffer(ctx: AudioContext | BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const clone = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    clone.getChannelData(c).set(buffer.getChannelData(c));
  }
  return clone;
}

/**
 * Generates a procedurally synthesized AudioBuffer using chaotic math.
 */
export function generateChaosSynthBuffer(
  ctx: AudioContext | BaseAudioContext,
  settings: AdvancedChaosSettings,
  durationSec: number = 1.5
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * durationSec);

  // Generate cache fingerprint key
  const cacheKey = `${sampleRate}-${durationSec.toFixed(2)}-${JSON.stringify(settings)}`;
  if (synthBufferCache.has(cacheKey)) {
    const cached = synthBufferCache.get(cacheKey)!;
    // Touch key to refresh LRU order
    synthBufferCache.delete(cacheKey);
    synthBufferCache.set(cacheKey, cached);
    return cloneAudioBuffer(ctx, cached);
  }

  const buffer = ctx.createBuffer(2, numSamples, sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Initialize chaotic system state variables
  // Lorenz Attractor states (standard chaotic constants)
  let lx = 0.1, ly = 0.0, lz = 0.0;
  const sigma = 10.0, beta = 8.0 / 3.0, rho = 28.0;
  const lorenzDt = 0.005 * (settings.lorenzRate ?? 0.2);

  // Logistic Map state
  let logX = 0.5;

  // Past sample buffers for feedback & turbulence
  const feedbackDelaySamples = Math.floor(0.012 * sampleRate); // ~12ms feedback loop
  const feedbackBuffer = new Float32Array(feedbackDelaySamples);
  let fbIdx = 0;
  let brownNoiseState = 0;
  let pinkNoiseState0 = 0, pinkNoiseState1 = 0, pinkNoiseState2 = 0, pinkNoiseState3 = 0, pinkNoiseState4 = 0, pinkNoiseState5 = 0;

  // Seed-based/Macro-chaos scaling
  const macro = settings.macroChaos ?? 0;
  const pChaos = Math.min(1, (settings.phaseChaos ?? 0) + macro * 0.4);
  const cStretch = Math.max(-0.99, Math.min(0.99, (settings.cycleStretch ?? 0) + macro * 0.3));
  const fHarmonics = Math.min(1, (settings.fractalHarmonics ?? 0) + macro * 0.5);
  const hBias = Math.min(1, (settings.harmonicBias ?? 0) + macro * 0.3);
  const logChaos = Math.min(0.99, (settings.logisticChaos ?? 0) + macro * 0.4);
  const fbTurbulence = Math.min(0.95, (settings.feedbackTurbulence ?? 0) + macro * 0.3);
  const srChaos = Math.min(0.99, (settings.sampleRateChaos ?? 0) + macro * 0.5);
  const errInject = Math.min(0.1, (settings.errorInjection ?? 0) + macro * 0.05);

  const baseFreq = settings.frequency || 220;

  // Vintage Macro & Voice Aging Setup
  const vintageMacro = settings.vintageMacro ?? 0;
  const voiceAge = settings.voiceAge || 'studio80s';
  const ageParams = getVoiceAgeParameters(voiceAge);
  const driftFactor = (settings.driftAmount ?? 0.2) + vintageMacro * 0.4;
  const filterDrive = (settings.filterDrive ?? 0) + vintageMacro * 0.3;
  const warmthAmount = (settings.warmthEngine ?? 0.3) + vintageMacro * 0.3;

  const zdfFilter = new ZDFLadderFilter();
  // Phase 6.6 — Juno-style filter family. When a modeled family is selected it
  // replaces the default ZDF ladder; 'zdf' / 'custom' / undefined keep the
  // original behavior.
  const family = settings.filterFamily;
  const familyFilter = family && family !== 'zdf' && family !== 'custom'
    ? createFilterFamily(family)
    : null;
  const warmthEngine = new WarmthEngineDSP();

  // Sound Designer Parameters
  const uniWidth = settings.unisonWidth ?? 0.7;
  const unisonDetuneCents = settings.unisonDetune ?? 15;
  const fmRatio = settings.fmRatio ?? 1.0;
  const fmDepth = settings.fmDepth ?? 0.0;
  const fmFeedback = settings.fmFeedback ?? 0.0;
  const ringModFreq = settings.ringModFreq ?? 440;
  const ringModMix = settings.ringModMix ?? 0.0;
  const vowelFormant = settings.vowelFormant ?? 'none';
  const vowelMix = settings.vowelMix ?? 0.0;
  const pitchEnvAttack = settings.pitchEnvAttack ?? 0.0;
  const pitchEnvSustain = settings.pitchEnvSustain ?? 1.0;
  const pitchEnvRelease = settings.pitchEnvRelease ?? 0.1;
  const pitchEnvDepth = settings.pitchEnvDepth ?? 0;
  const noiseLevel = settings.noiseLevel ?? 0.0;
  const noiseColor = settings.noiseColor ?? 'white';
  const noiseFilterCutoff = settings.noiseFilterCutoff ?? 12000;
  const wavefoldDepth = settings.wavefoldDepth ?? 0.0;
  const wavefoldBias = settings.wavefoldBias ?? 0.0;
  const analogBias = settings.analogBias ?? 0.0;
  const analogDriftSpeed = settings.analogDriftSpeed ?? 1.0;
  const bitcrushDepth = settings.bitcrushDepth ?? 0.0;
  const downsampleFactor = settings.downsampleFactor ?? 1;
  const phaseRetrigger = settings.phaseRetrigger ?? true;

  // 5 Premium Sound Designer Upgrades unpacked
  const syncRatio = settings.syncRatio ?? 1.8;
  const unisonPhaseOffset = settings.unisonPhaseOffset ?? 1; // 0 = retrigger, 1 = golden ratio, 2 = random
  const unisonDetuneCurve = settings.unisonDetuneCurve ?? 1.5;
  const subPhaseAlign = settings.subPhaseAlign ?? 0;
  const pdAmount = settings.pdAmount ?? 0;
  const oversamplingEnabled = settings.oversamplingEnabled ?? true;
  const saturationSymmetry = settings.saturationSymmetry ?? 0.0;

  // Formant Filter Instantiation
  const bp1 = new SimpleBiquad();
  const bp2 = new SimpleBiquad();
  const bp3 = new SimpleBiquad();
  
  // Set frequencies for vowels
  let f1 = 600, f2 = 1040, f3 = 2250;
  if (vowelFormant === 'a') { f1 = 730; f2 = 1090; f3 = 2440; }
  else if (vowelFormant === 'e') { f1 = 270; f2 = 2290; f3 = 3010; }
  else if (vowelFormant === 'i') { f1 = 220; f2 = 1020; f3 = 2240; }
  else if (vowelFormant === 'o') { f1 = 570; f2 = 840; f3 = 2410; }
  else if (vowelFormant === 'u') { f1 = 300; f2 = 870; f3 = 2240; }

  bp1.setBandpass(f1, 8, sampleRate);
  bp2.setBandpass(f2, 6, sampleRate);
  bp3.setBandpass(f3, 4, sampleRate);

  // Noise generator state variables
  let pinkB0 = 0, pinkB1 = 0, pinkB2 = 0, pinkB3 = 0, pinkB4 = 0, pinkB5 = 0, pinkB6 = 0;
  let brownAccum = 0;
  let lastBlueWhite = 0;
  // Simple noise filter (1-pole lowpass)
  let noiseFilterY = 0;

  // LFO & Phase states
  let pitchDriftLfo = 0;
  let pitchDriftTarget = (Math.random() * 2 - 1) * ageParams.pitchDriftCents * driftFactor;

  let phase = phaseRetrigger ? 0 : Math.random() * 2 * Math.PI;
  let fmPhase = Math.random() * 2 * Math.PI;
  let ringPhase = Math.random() * 2 * Math.PI;
  let lastModSample = 0;
  let slavePhase = phaseRetrigger ? 0 : Math.random() * 2 * Math.PI;

  let holdCounter = 0;
  const unisonPhases = new Float32Array(7);
  for (let v = 0; v < 7; v++) {
    if (unisonPhaseOffset === 1) {
      unisonPhases[v] = v * 2 * Math.PI * 0.618033988749895; // Golden Ratio angle
    } else if (unisonPhaseOffset === 2) {
      unisonPhases[v] = Math.random() * 2 * Math.PI;
    } else {
      unisonPhases[v] = 0; // Phase Retrigger
    }
  }

  let lastFilteredSample = 0;
  let holdValue = 0;

  // Synthesis pass
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Smoothly wander pitch drift
    const driftUpdateSamples = Math.max(128, Math.floor(sampleRate / (analogDriftSpeed * 8)));
    if (i % driftUpdateSamples === 0) {
      pitchDriftTarget = (Math.random() * 2 - 1) * ageParams.pitchDriftCents * driftFactor;
    }
    pitchDriftLfo += (pitchDriftTarget - pitchDriftLfo) * (0.005 * analogDriftSpeed);

    // Upgrade: Pitch Glide / Portamento
    let glidePitchOffset = 0;
    const glideTime = settings.glideTime ?? 0;
    if (glideTime > 0) {
      // simulate gliding from a previous note (e.g. -12 semitones away)
      // just a stylistic effect for the sampler here since it's one-shot
      const glideStartST = -12;
      const glideEnd = glideTime;
      if (t < glideEnd) {
        glidePitchOffset = glideStartST * (1 - (t / glideEnd));
      }
    }

    // Multi-stage Pitch Envelope Calculation (Attack-Decay-Sustain-Release)
    let pEnvVal = 0;
    const pAttack = pitchEnvAttack;
    const pDecay = settings.pitchEnvDecay ?? 0.1;
    const pSustain = pitchEnvSustain;
    const pRelease = pitchEnvRelease;
    
    if (t < pAttack) {
      pEnvVal = pAttack > 0 ? (t / pAttack) : 1;
    } else if (t < pAttack + pDecay) {
      const pct = (t - pAttack) / pDecay;
      pEnvVal = 1.0 - (1.0 - pSustain) * pct;
    } else {
      const releaseTime = t - (pAttack + pDecay);
      pEnvVal = pSustain * Math.exp(-releaseTime * 4.6 / (pRelease || 0.05));
    }
    const finalPitchEnvSemitones = pEnvVal * pitchEnvDepth + glidePitchOffset;

    // Solve Lorenz Attractor step (chaotic modulator)
    const dx = sigma * (ly - lx) * lorenzDt;
    const dy = (lx * (rho - lz) - ly) * lorenzDt;
    const dz = (lx * ly - beta * lz) * lorenzDt;
    lx += dx;
    ly += dy;
    lz += dz;

    // Use normalized Lorenz-X coordinate to modulate synthesis frequency
    const lorenzModVal = Math.tanh(lx * 0.05); // range -1 to 1
    const lorenzFreqOffset = lorenzModVal * baseFreq * 0.8; // up to 80% pitch shift

    // Apply voice pitch drift & Envelope target
    const pitchOffsetSemitones = (settings.pitchEnvAmount ?? 0) * Math.exp(-t * 10) + finalPitchEnvSemitones;
    const driftedFreq = (baseFreq + lorenzFreqOffset) * 
      Math.pow(2, pitchDriftLfo / 1200) * 
      Math.pow(2, pitchOffsetSemitones / 12);

    // Synthesize base phase step
    let phaseStep = (2 * Math.PI * driftedFreq) / sampleRate;

    // FM MODULATOR (Carrier-Modulator FM)
    const modFreq = driftedFreq * fmRatio;
    const fmPhaseStep = (2 * Math.PI * modFreq) / sampleRate;
    fmPhase += fmPhaseStep;
    
    const modSignal = Math.sin(fmPhase + lastModSample * fmFeedback);
    lastModSample = modSignal;
    
    // Add FM modulation directly to phaseStep
    const fmOffset = modSignal * fmDepth * phaseStep;
    phaseStep += fmOffset;

    // Cycle-Stretch: alters cycle shape dynamically
    if (cStretch !== 0) {
      const halfPhase = phase % (2 * Math.PI);
      const stretchFactor = halfPhase < Math.PI ? (1 + cStretch) : (1 - cStretch);
      phaseStep *= stretchFactor;
    }

    // Add Phase-Chaos (random drift)
    if (pChaos > 0) {
      phaseStep += (Math.random() * 2 - 1) * pChaos * 0.3;
    }

    // 1. Super-Sync Engine slave phase reset tracking
    let slavePhaseStep = phaseStep * syncRatio;
    const masterWrapped = (phase + phaseStep) >= 2 * Math.PI;
    if (masterWrapped) {
      const fraction = (2 * Math.PI - (phase % (2 * Math.PI))) / phaseStep;
      slavePhase = fraction * slavePhaseStep;
    } else {
      slavePhase += slavePhaseStep;
    }

    phase += phaseStep;

    // Increment all unison phases
    for (let v = 0; v < 7; v++) {
      const voiceNorm = v === 0 ? 0 : (v / 6) * 2 - 1; // -1 to +1
      const sign = Math.sign(voiceNorm);
      const spacedNorm = sign * Math.pow(Math.abs(voiceNorm), unisonDetuneCurve);
      const centsOffset = spacedNorm * unisonDetuneCents;
      const voiceRatio = Math.pow(2, centsOffset / 1200);
      unisonPhases[v] += phaseStep * voiceRatio;
    }

    // Helper to apply Casio CZ-Style Phase Distortion (Upgrade 3)
    const applyPD = (ph: number, amount: number): number => {
      if (amount <= 0) return ph;
      const norm = ((ph % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
      const d = amount * 0.94; // avoid division by zero
      let distorted = norm;
      if (norm < 0.5) {
        distorted = (norm * 0.5) / (0.5 - d * (0.5 - norm));
      } else {
        distorted = 0.5 + ((norm - 0.5) * 0.5) / (0.5 + d * (norm - 0.5));
      }
      return distorted * 2 * Math.PI;
    };

    // Helper to evaluate waveform at given phase and type
    const evalWave = (ph: number, type: OscillatorType): number => {
      const normalizedPhase = (((ph % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI)) / (2 * Math.PI);
      const phaseInc = phaseStep / (2 * Math.PI);
      return generateAnalogOscSample(normalizedPhase, phaseInc, type, 0.5, 0.05 * driftFactor);
    };

    // Generate primary oscillator wave (Osc 1) with Phase Distortion
    const osc1Phase = applyPD(phase, pdAmount);
    let rawWave = evalWave(osc1Phase, settings.oscType || 'sine');

    // Dual Oscillator 2 blending with Super-Sync Support (Upgrade 1)
    const osc2Mix = settings.osc2Mix ?? 0;
    if (osc2Mix > 0) {
      const osc2DetuneSt = settings.osc2Detune ?? 0;
      const osc2FreqRatio = Math.pow(2, osc2DetuneSt / 12);
      const baseOsc2Phase = settings.hardSync ? slavePhase : (phase * osc2FreqRatio);
      const osc2Phase = applyPD(baseOsc2Phase, pdAmount);
      const wave2 = evalWave(osc2Phase, settings.osc2Type || 'sawtooth');
      rawWave = rawWave * (1 - osc2Mix) + wave2 * osc2Mix;
    }

    // Unison voices stereo spread with Golden-ratio phases & Exponential Detune (Upgrade 2)
    const unisonVoices = Math.max(1, Math.min(7, settings.unisonVoices ?? 1));
    let leftUnisonAcc = rawWave;
    let rightUnisonAcc = rawWave;

    if (unisonVoices > 1 && unisonDetuneCents > 0) {
      leftUnisonAcc = 0;
      rightUnisonAcc = 0;
      for (let v = 0; v < unisonVoices; v++) {
        // Distribute voices symmetrically
        const voiceNorm = (v / (unisonVoices - 1)) * 2 - 1; // -1 to +1
        const voicePhase = applyPD(unisonPhases[v], pdAmount);
        const vWave = evalWave(voicePhase, settings.oscType || 'sine');
        
        // Stereo position with customizable Unison Width
        const pan = voiceNorm * 0.8 * uniWidth;
        const lGain = Math.cos((pan + 1) * Math.PI / 4);
        const rGain = Math.sin((pan + 1) * Math.PI / 4);

        leftUnisonAcc += vWave * lGain;
        rightUnisonAcc += vWave * rGain;
      }
      leftUnisonAcc /= Math.sqrt(unisonVoices);
      rightUnisonAcc /= Math.sqrt(unisonVoices);
    } else {
      leftUnisonAcc = rawWave;
      rightUnisonAcc = rawWave;
    }

    // Upgrade: Wavefolding (Saturating and folding back the wave)
    const wavefold = settings.wavefold ?? 0;
    if (wavefold > 0) {
      const threshold = 1.0 - (wavefold * 0.9);
      // Fast branchless wavefolder approximation
      let fwL = leftUnisonAcc * (1 + wavefold * 4);
      let fwR = rightUnisonAcc * (1 + wavefold * 4);
      
      const doFold = (v) => {
        if (v > threshold) return threshold - (v - threshold);
        if (v < -threshold) return -threshold - (v + threshold);
        return v;
      };
      
      fwL = doFold(doFold(fwL));
      fwR = doFold(doFold(fwR));
      
      leftUnisonAcc = leftUnisonAcc * (1 - wavefold) + fwL * wavefold;
      rightUnisonAcc = rightUnisonAcc * (1 - wavefold) + fwR * wavefold;
    }

    rawWave = (leftUnisonAcc + rightUnisonAcc) * 0.5;

    // Apply Fractal Harmonics (recursive sine modulator)
    if (fHarmonics > 0) {
      const nestedMod = Math.sin(phase * 3.5) * fHarmonics * 1.5;
      rawWave = (1 - fHarmonics * 0.5) * rawWave + fHarmonics * 0.5 * Math.sin(phase + nestedMod);
    }

    // Blend subharmonic oscillator with perfect sub-phase alignment and waveform morphing (Upgrade 4)
    if (settings.subLevel > 0) {
      const subPhaseAlignRad = (subPhaseAlign * Math.PI) / 180;
      const subPhase = phase * 0.5 + subPhaseAlignRad;
      const subType = settings.subType || 'sine';
      
      let subWave = 0;
      if (subType === 'sine') {
        subWave = Math.sin(subPhase);
      } else if (subType === 'triangle') {
        const normSub = (((subPhase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
        subWave = Math.abs(normSub - 0.5) * 4.0 - 1.0;
      } else if (subType === 'square') {
        const normSub = (((subPhase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
        subWave = normSub < 0.5 ? 1.0 : -1.0;
      } else if (subType === 'sawtooth') {
        const normSub = (((subPhase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
        subWave = normSub * 2.0 - 1.0;
      }
      
      rawWave = rawWave * (1 - settings.subLevel * 0.5) + subWave * settings.subLevel * 0.5;
    }

    // Harmonic Bias shaping: morphs towards metallic or hollow timbre
    if (hBias > 0) {
      const metallicComp = Math.sin(phase * 1.5) * Math.cos(phase * 4.3);
      rawWave = (1 - hBias) * rawWave + hBias * metallicComp;
    }

    // CUSTOM PROCEDURAL NOISE GENERATION & MIXING (White, Pink, Brown, Blue)
    if (noiseLevel > 0) {
      let noiseVal = 0;
      const white = Math.random() * 2 - 1;

      if (noiseColor === 'white') {
        noiseVal = white;
      } else if (noiseColor === 'pink') {
        pinkB0 = 0.99886 * pinkB0 + white * 0.0555179;
        pinkB1 = 0.99332 * pinkB1 + white * 0.0750759;
        pinkB2 = 0.96900 * pinkB2 + white * 0.1538520;
        pinkB3 = 0.86650 * pinkB3 + white * 0.3104856;
        pinkB4 = 0.55000 * pinkB4 + white * 0.5329522;
        pinkB5 = -0.7616 * pinkB5 - white * 0.0168980;
        noiseVal = (pinkB0 + pinkB1 + pinkB2 + pinkB3 + pinkB4 + pinkB5 + pinkB6 + white * 0.5362) * 0.11;
        pinkB6 = white * 0.115926;
      } else if (noiseColor === 'brown') {
        brownAccum = (brownAccum + 0.02 * white) / 1.02;
        noiseVal = brownAccum * 3.5;
      } else if (noiseColor === 'blue') {
        noiseVal = (white - lastBlueWhite) * 0.5;
        lastBlueWhite = white;
      }

      // Simple lowpass filter on noise
      const rc = 1.0 / (2 * Math.PI * noiseFilterCutoff);
      const dt = 1.0 / sampleRate;
      const alpha = dt / (rc + dt);
      noiseFilterY = noiseFilterY + alpha * (noiseVal - noiseFilterY);

      // Mix noise with wave
      rawWave = rawWave * (1 - noiseLevel) + noiseFilterY * noiseLevel;
    }

    // RING MODULATION
    if (ringModMix > 0) {
      const ringPhaseStep = (2 * Math.PI * ringModFreq) / sampleRate;
      ringPhase += ringPhaseStep;
      const ringSignal = Math.sin(ringPhase);
      const ringOutput = rawWave * ringSignal;
      rawWave = rawWave * (1 - ringModMix) + ringOutput * ringModMix;
    }

    // WEST-COAST SINE WAVEFOLDER
    if (wavefoldDepth > 0) {
      const foldInput = rawWave * (1.0 + wavefoldDepth) + wavefoldBias;
      rawWave = Math.sin(foldInput * Math.PI * 0.5);
    }

    // Apply Nonlinear Logistic Map Waveshaping
    let shapedSample = rawWave;
    if (logChaos > 0) {
      const r = 3.6 + logChaos * 0.4 * Math.abs(rawWave);
      logX = r * logX * (1 - logX);
      if (isNaN(logX) || !isFinite(logX)) logX = 0.5;
      const mapOutput = (logX * 2 - 1);
      shapedSample = (1 - logChaos) * rawWave + logChaos * mapOutput;
    }

    // Feedback Turbulence loop (analog instability)
    // Texture Layer Generation
    if (settings.textureLevel && settings.textureLevel > 0) {
      let textureVal = 0;
      const textureType = settings.textureType || 'noise';
      if (textureType === 'noise') {
        textureVal = Math.random() * 2 - 1;
      } else if (textureType === 'vinyl') {
        textureVal = (Math.random() > 0.999 ? (Math.random() * 2 - 1) * 3 : 0) + (Math.random() * 2 - 1) * 0.1;
      } else if (textureType === 'tape') {
        textureVal = (Math.random() * 2 - 1) * 0.4 + Math.sin(t * 50) * 0.05 + Math.sin(t * 60 * 2 * Math.PI) * 0.05;
      } else if (textureType === 'hum') {
        textureVal = Math.sin(t * 60 * 2 * Math.PI) * 0.8 + Math.sin(t * 120 * 2 * Math.PI) * 0.2;
      } else if (textureType === 'digital') {
        textureVal = (i % Math.floor(10 + Math.random() * 50)) === 0 ? (Math.random() * 2 - 1) : 0;
      } else if (textureType === 'brown') {
        const white = Math.random() * 2 - 1;
        brownNoiseState = (brownNoiseState + (0.02 * white)) / 1.02;
        textureVal = brownNoiseState * 3.5;
      } else if (textureType === 'pink') {
        const white = Math.random() * 2 - 1;
        pinkNoiseState0 = 0.99886 * pinkNoiseState0 + white * 0.0555179;
        pinkNoiseState1 = 0.99332 * pinkNoiseState1 + white * 0.0750759;
        pinkNoiseState2 = 0.96900 * pinkNoiseState2 + white * 0.1538520;
        pinkNoiseState3 = 0.86650 * pinkNoiseState3 + white * 0.3104856;
        pinkNoiseState4 = 0.55000 * pinkNoiseState4 + white * 0.5329522;
        pinkNoiseState5 = -0.7616 * pinkNoiseState5 - white * 0.0168980;
        textureVal = (pinkNoiseState0 + pinkNoiseState1 + pinkNoiseState2 + pinkNoiseState3 + pinkNoiseState4 + pinkNoiseState5 + white * 0.5362) * 0.11;
      }
      shapedSample = shapedSample * (1 - settings.textureLevel) + textureVal * settings.textureLevel;
    }

    if (fbTurbulence > 0) {
      const fbVal = feedbackBuffer[fbIdx];
      shapedSample += fbVal * fbTurbulence;
      shapedSample = Math.tanh(shapedSample); // Soft saturation

      feedbackBuffer[fbIdx] = shapedSample;
      fbIdx = (fbIdx + 1) % feedbackDelaySamples;
    }

    // Formant (Talk Box) Vocal Filtering
    if (vowelFormant !== 'none' && vowelMix > 0) {
      const fSample = (bp1.process(shapedSample) * 1.0 + bp2.process(shapedSample) * 0.7 + bp3.process(shapedSample) * 0.5) * 0.8;
      shapedSample = shapedSample * (1 - vowelMix) + fSample * vowelMix;
    }

    // Analog ZDF Ladder Filter Stage (or modeled filter family)
    const cutoffHz = settings.filterCutoff ?? 3500;
    const filterRes = settings.filterResonance ?? 0.3;
    let filteredSample: number;
    if (familyFilter) {
      filteredSample = familyFilter.process(shapedSample, cutoffHz, filterRes, filterDrive, sampleRate);
    } else {
      filteredSample = zdfFilter.process(
        shapedSample,
        cutoffHz,
        filterRes,
        filterDrive,
        sampleRate
      );
    }

    // Analog Warmth Engine & Asymmetric Bias Saturation with 2x Oversampling (Upgrade 5)
    let outputSample = 0;
    const applySaturation = (inputVal: number) => {
      // Blend custom saturation symmetry with the analog bias parameter
      const bias = saturationSymmetry !== 0 ? saturationSymmetry : analogBias;
      const biased = inputVal + bias * 0.45;
      const saturated = Math.tanh(biased * (1.0 + warmthAmount * 2.5));
      return saturated - Math.tanh(bias * 0.45); // Safe DC removal
    };

    if (oversamplingEnabled) {
      // 2x oversampling linear interpolation midpoint
      const midPoint = (filteredSample + lastFilteredSample) * 0.5;
      const sample1 = applySaturation(filteredSample);
      const sample2 = applySaturation(midPoint);
      // Average (decimate) to reject alias reflections above base sampleRate
      outputSample = (sample1 + sample2) * 0.5;
    } else {
      outputSample = applySaturation(filteredSample);
    }
    lastFilteredSample = filteredSample;

    // Downsampling & Bitcrushing Destruction
    if (downsampleFactor > 1) {
      if (i % Math.floor(downsampleFactor) !== 0) {
        outputSample = holdValue;
      } else {
        holdValue = outputSample;
      }
    }
    
    if (bitcrushDepth > 0) {
      const steps = Math.pow(2, 16 - bitcrushDepth * 14);
      outputSample = Math.round(outputSample * steps) / steps;
    }

    if (srChaos > 0) {
      // Intentionally freeze sample values based on a dynamic hold timer
      const holdLimit = Math.max(1, Math.floor(srChaos * 30 * (1 + Math.random() * 2)));
      if (holdCounter >= holdLimit) {
        holdCounter = 0;
        holdValue = outputSample;
      } else {
        holdCounter++;
        outputSample = holdValue;
      }
    }

    // Digital Error/Buffer Corruption Injection
    if (errInject > 0 && Math.random() < errInject) {
      outputSample = Math.random() > 0.5 ? 0 : (Math.random() > 0.5 ? 0.95 : -0.95);
    }

    // Prevent extreme DC offsets or blowouts
    outputSample = Math.max(-1, Math.min(1, outputSample));

    // Smooth entry and decay envelope (anti-click 8ms Hann quarter-sine fade-in for pure 808 & synth start)
    const envAttackLimit = Math.max(1, Math.floor(sampleRate * 0.008)); // 8ms anti-click attack
    const envReleaseLimit = Math.max(1, Math.floor(sampleRate * 0.05)); // 50ms fade-out
    if (i < envAttackLimit) {
      const fade = Math.sin((Math.PI / 2) * (i / envAttackLimit));
      outputSample *= fade;
    } else if (numSamples - i < envReleaseLimit) {
      const fade = Math.sin((Math.PI / 2) * ((numSamples - i) / envReleaseLimit));
      outputSample *= fade;
    }

    left[i] = outputSample;
    right[i] = outputSample;
  }

  // Granular/Particle Scatter Post-Processor
  const grainCount = settings.grainCount ?? 0;
  if (grainCount > 0) {
    const rawLeft = new Float32Array(left);
    const rawRight = new Float32Array(right);

    // Clear output arrays to rebuild via grain overlaps
    left.fill(0);
    right.fill(0);

    const gSizeJitter = settings.grainSizeJitter ?? 0.3;
    const gDrift = settings.grainDrift ?? 0.2;
    const spray = settings.sprayRadius ?? 0.5;

    // Standard grain length 50ms - 150ms
    const baseGrainLen = Math.floor(0.08 * sampleRate);

    // Scatter grains across the timeline
    for (let g = 0; g < grainCount; g++) {
      const targetCenterPct = g / grainCount;
      const targetCenterSample = Math.floor(targetCenterPct * numSamples);

      // Jitter start offset
      const driftSamples = Math.floor((Math.random() * 2 - 1) * gDrift * 0.15 * sampleRate);
      const startSourceSample = Math.max(0, Math.min(numSamples - 1, targetCenterSample + driftSamples));

      // Jitter grain length
      const grainLen = Math.floor(baseGrainLen * (1 + (Math.random() * 2 - 1) * gSizeJitter));
      const endSourceSample = Math.min(numSamples, startSourceSample + grainLen);

      // Stereo panning spray
      const panL = Math.max(0, Math.min(1, 0.5 + (Math.random() * 2 - 1) * spray * 0.5));
      const panR = 1 - panL;

      // Overlap-add grain into the output buffers
      for (let s = startSourceSample; s < endSourceSample; s++) {
        const destIdx = s; // Play back in original alignment or micro-scattered
        if (destIdx >= numSamples) break;

        // Apply Hanning/Cosine grain window
        const grainIdx = s - startSourceSample;
        const windowVal = Math.sin((Math.PI * grainIdx) / (endSourceSample - startSourceSample));

        left[destIdx] += rawLeft[s] * windowVal * panL * 1.5;
        right[destIdx] += rawRight[s] * windowVal * panR * 1.5;
      }
    }

    // Final peak safety normalization on the scattered buffer
    let peak = 0;
    for (let i = 0; i < numSamples; i++) {
      const aL = Math.abs(left[i]);
      const aR = Math.abs(right[i]);
      if (aL > peak) peak = aL;
      if (aR > peak) peak = aR;
    }
    if (peak > 0) {
      const normScale = 0.95 / peak;
      for (let i = 0; i < numSamples; i++) {
        left[i] *= normScale;
        right[i] *= normScale;
      }
    }
  }

  // Master Anti-Click Windowing (8ms Hann fade-in, 15ms Hann fade-out)
  const masterAttackSamples = Math.max(1, Math.floor(sampleRate * 0.008));
  const masterReleaseSamples = Math.max(1, Math.floor(sampleRate * 0.015));

  for (let i = 0; i < masterAttackSamples; i++) {
    const fade = Math.sin((Math.PI / 2) * (i / masterAttackSamples));
    left[i] *= fade;
    right[i] *= fade;
  }

  for (let i = 0; i < masterReleaseSamples; i++) {
    const idx = numSamples - 1 - i;
    if (idx >= 0) {
      const fade = Math.sin((Math.PI / 2) * (i / masterReleaseSamples));
      left[idx] *= fade;
      right[idx] *= fade;
    }
  }

  // Store into LRU cache
  if (synthBufferCache.size >= SYNTH_CACHE_MAX_SIZE) {
    const oldestKey = synthBufferCache.keys().next().value;
    if (oldestKey) synthBufferCache.delete(oldestKey);
  }
  synthBufferCache.set(cacheKey, buffer);

  return cloneAudioBuffer(ctx, buffer);
}
