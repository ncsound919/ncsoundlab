/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvolutionVariation } from '../types';
import { safeAudioValue } from './audioUtils';

/**
 * Sound Evolution Engine
 * Takes a source buffer and generates a set of mutated variations.
 */
export type EvolutionMode = 'mutations' | 'melodic' | 'kit';
export type FXEvolutionOption = 'mutate' | 'freeze' | 'fx_only';

export async function generateEvolutionVariations(
  ctx: BaseAudioContext,
  sourceBuffer: AudioBuffer,
  count: number = 20,
  baseChaos: number = 0.5,
  mode: EvolutionMode = 'mutations',
  fxOption: FXEvolutionOption = 'mutate'
): Promise<EvolutionVariation[]> {
  const variations: EvolutionVariation[] = [];

    let roles = [];
  if (mode === 'kit') {
    roles = [
      { role: 'Kick', path: ['pitch_down_2', 'filter', 'distortion'], p: 0.25 },
      { role: 'Snare', path: ['aliasing', 'distortion', 'reverb'], p: 0.25 },
      { role: 'Hi-Hat', path: ['pitch_up_2', 'filter', 'bitcrush'], p: 0.25 },
      { role: 'Percussion', path: ['pitch_up', 'delay', 'spectral_fold'], p: 0.25 }
    ];
  } else if (mode === 'melodic') {
    roles = [
      { role: 'Root', path: ['reverb'], p: 0.2 },
      { role: 'Fifth', path: ['pitch_up_fifth', 'delay'], p: 0.2 },
      { role: 'Octave Up', path: ['pitch_up', 'reverb', 'filter'], p: 0.2 },
      { role: 'Octave Down', path: ['pitch_down', 'distortion'], p: 0.2 },
      { role: 'Major Third', path: ['pitch_up_third', 'reverb'], p: 0.2 }
    ];
  } else {
    roles = [
      { role: 'Complementary Bass', path: ['pitch_down', 'filter', 'distortion'], p: 0.15 },
      { role: 'Atmospheric Pad', path: ['reverb', 'delay', 'filter'], p: 0.2 },
      { role: 'Glitch Texture', path: ['aliasing', 'bitcrush', 'spectral_fold', 'delay'], p: 0.15 },
      { role: 'Harmonic Lead', path: ['distortion', 'filter', 'delay', 'reverb'], p: 0.15 },
      { role: 'Sub Frequency', path: ['pitch_down_2', 'filter'], p: 0.1 },
      { role: 'Ambient Drone', path: ['pitch_down', 'reverb', 'reverb', 'filter'], p: 0.25 }
    ];
  }

  const pitchEffects = ['pitch_down', 'pitch_down_2', 'pitch_up', 'pitch_up_2', 'pitch_up_fifth', 'pitch_up_third'];
  const fxEffects = ['bitcrush', 'distortion', 'filter', 'delay', 'reverb', 'spectral_fold', 'aliasing'];

  for (let i = 0; i < count; i++) {
    const chaosLevel = Math.min(1, baseChaos * (0.5 + Math.random()));
    const spectralDensity = Math.random();
    const temporalBehavior = Math.random();
    
    // Pick a role randomly based on probabilities
    const rand = Math.random();
    let acc = 0;
    let selectedRole = roles[0];
    for (const r of roles) {
      acc += r.p;
      if (rand <= acc) {
        selectedRole = r;
        break;
      }
    }

    let routingPath = [...selectedRole.path];

    if (fxOption === 'freeze') {
      // Freeze FX: remove randomized FX insertions, keep only core sound pitch/filter path
      routingPath = routingPath.filter(e => !['bitcrush', 'distortion', 'delay', 'reverb', 'spectral_fold', 'aliasing'].includes(e));
    } else if (fxOption === 'fx_only') {
      // Change FX Only: strip pitch shifts, randomize & mutate FX modules heavily
      routingPath = routingPath.filter(e => !pitchEffects.includes(e));
      // Always add at least 1 or 2 randomized FX
      const extra1 = fxEffects[Math.floor(Math.random() * fxEffects.length)];
      const extra2 = fxEffects[Math.floor(Math.random() * fxEffects.length)];
      if (!routingPath.includes(extra1)) routingPath.push(extra1);
      if (!routingPath.includes(extra2)) routingPath.push(extra2);
    } else {
      // Mutate Both
      if (chaosLevel > 0.4) {
        const extraEffect = fxEffects[Math.floor(Math.random() * fxEffects.length)];
        if (!routingPath.includes(extraEffect)) {
          routingPath.push(extraEffect);
        }
      }
    }
    
    if (routingPath.length === 0) routingPath.push('filter');

    const buffer = await mutateBuffer(ctx, sourceBuffer, {
      chaosLevel,
      spectralDensity,
      temporalBehavior,
      routingPath
    });

    variations.push({
      id: crypto.randomUUID(),
      name: `${selectedRole.role} ${i+1}${fxOption === 'freeze' ? ' (FX Frozen)' : fxOption === 'fx_only' ? ' (FX Only)' : ''}`,
      role: selectedRole.role,
      buffer,
      chaosLevel,
      spectralDensity,
      temporalBehavior,
      routingPath
    });
  }

  return variations;
}

interface MutationParams {
  chaosLevel: number;
  spectralDensity: number;
  temporalBehavior: number;
  routingPath: string[];
}

async function mutateBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  params: MutationParams
): Promise<AudioBuffer> {
  const { chaosLevel, spectralDensity, temporalBehavior, routingPath } = params;
  const sampleRate = ctx.sampleRate;
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, sampleRate);
  
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = source;
  
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 1.0;

  let lastNode: AudioNode = sourceNode;

  // Apply routing path
  for (const effect of routingPath) {
    if (effect === 'pitch_down') {
      sourceNode.playbackRate.value = 0.5; // pitch down an octave
    } else if (effect === 'pitch_down_2') {
      sourceNode.playbackRate.value = 0.25; // pitch down 2 octaves
    } else if (effect === 'pitch_up') {
      sourceNode.playbackRate.value = 2.0; // octave up
    } else if (effect === 'pitch_up_2') {
      sourceNode.playbackRate.value = 4.0; // 2 octaves up
    } else if (effect === 'pitch_up_fifth') {
      sourceNode.playbackRate.value = 1.498; // Perfect fifth up
    } else if (effect === 'pitch_up_third') {
      sourceNode.playbackRate.value = 1.259; // Major third up
    } else if (effect === 'reverb') {
      const reverb = offlineCtx.createConvolver();
      // create a simple synthetic impulse response
      const length = offlineCtx.sampleRate * 2.0;
      const impulse = offlineCtx.createBuffer(2, length, offlineCtx.sampleRate);
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (offlineCtx.sampleRate * 0.5));
        impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * decay;
        impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * decay;
      }
      reverb.buffer = impulse;
      lastNode.connect(reverb);
      lastNode = reverb;
    } else if (effect === 'bitcrush') {
      const bitcrush = offlineCtx.createWaveShaper();
      bitcrush.curve = makeBitcrushCurve(0.1 + chaosLevel * 0.8);
      lastNode.connect(bitcrush);
      lastNode = bitcrush;
    } else if (effect === 'distortion') {
      const dist = offlineCtx.createWaveShaper();
      dist.curve = makeDistortionCurve(0.2 + chaosLevel * 3);
      lastNode.connect(dist);
      lastNode = dist;
    } else if (effect === 'filter') {
      // Create a more complex "Bowed Metal" or "Resonant" filter stack
      const filter = offlineCtx.createBiquadFilter();
      filter.type = Math.random() > 0.4 ? 'bandpass' : 'notch';
      filter.frequency.value = safeAudioValue(400 + (1 - spectralDensity) * 8000, 1000);
      filter.Q.value = safeAudioValue(10 + chaosLevel * 50, 1); // High Q for ringing resonances
      lastNode.connect(filter);
      lastNode = filter;
    } else if (effect === 'delay') {
      const delay = offlineCtx.createDelay(1.0);
      delay.delayTime.value = safeAudioValue(0.005 + temporalBehavior * 0.1, 0.1); // Shorter delays for comb filtering
      const feedback = offlineCtx.createGain();
      feedback.gain.value = safeAudioValue(0.6 + chaosLevel * 0.3, 0.5);
      lastNode.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      lastNode = delay;
    } else if (effect === 'spectral_fold') {
      const fold = offlineCtx.createWaveShaper();
      fold.curve = makeSpectralFoldCurve(1 + chaosLevel * 6);
      lastNode.connect(fold);
      lastNode = fold;
    }
  }

  lastNode.connect(masterGain);
  masterGain.connect(offlineCtx.destination);
  sourceNode.start(0);
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Final Pass: Peak Normalization
  return normalizeBuffer(renderedBuffer);
}

function normalizeBuffer(buffer: AudioBuffer): AudioBuffer {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  let maxPeak = 0;

  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  if (maxPeak > 0) {
    const ratio = 0.95 / maxPeak;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] *= ratio;
      }
    }
  }

  return buffer;
}

function makeBitcrushCurve(amount: number) {
  const steps = Math.max(2, Math.floor(Math.pow(2, 16 * (1 - amount * 0.75))));
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

function makeDistortionCurve(amount: number) {
  const k = amount * 100;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function makeSpectralFoldCurve(amount: number) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    // Sine foldback
    curve[i] = Math.sin(x * Math.PI * amount);
  }
  return curve;
}

function makeAliasingCurve(amount: number) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    // Step function distortion
    const steps = 4 + Math.floor((1 - amount) * 20);
    curve[i] = Math.floor(x * steps) / steps;
  }
  return curve;
}
