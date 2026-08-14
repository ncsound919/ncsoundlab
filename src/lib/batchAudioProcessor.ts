/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Meyda from 'meyda';
import { AudioAnalysisResult, SampleCategory, BatchProcessOptions } from '../types';

/**
 * Meyda requires the input signal length to be a power of two. We take the
 * largest power-of-two window that fits (min 512, cap 8192) so spectral
 * features stay stable for any buffer length without zero-padding distortion.
 */
function toPow2Signal(channel: Float32Array): Float32Array {
  let len = 512;
  while (len * 2 <= channel.length && len < 8192) len *= 2;
  if (len > channel.length) {
    const padded = new Float32Array(len);
    padded.set(channel);
    return padded;
  }
  return channel.subarray(0, len);
}

/**
 * Analyzes an AudioBuffer for peak, RMS, transient sharpness, estimated pitch/key, and suggested category.
 * Spectral features (spectral centroid, RMS, zero-crossing rate) are computed via Meyda.
 */
export function analyzeAudioBuffer(buffer: AudioBuffer, fileName: string): AudioAnalysisResult {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const durationSeconds = length / sampleRate;

  let maxPeak = 0;
  let transients = 0;

  // Combine channels for analysis
  const channel0 = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const val = Math.abs(channel0[i]);
    if (val > maxPeak) maxPeak = val;

    // Transient detection (sudden rise)
    if (i > 0 && val > Math.abs(channel0[i - 1]) * 2.5 && val > 0.1) {
      transients++;
    }
  }

  const peakDb = maxPeak > 0 ? 20 * Math.log10(maxPeak) : -96;

  // Meyda-powered spectral features (rms, zero-crossing rate, spectral centroid).
  const meydaSignal = toPow2Signal(channel0);
  // Meyda's `extract(feature, signal, previousSignal)` ignores any 4th config
  // arg and reads module-level `bufferSize`/`sampleRate` (defaults 512/44100).
  // Set them to the actual window so the FFT covers the signal and the
  // centroid converts to Hz correctly; otherwise spectral features are
  // computed on a truncated 256-bin spectrum and classification skews wildly.
  const meydaCfg = Meyda as unknown as { bufferSize: number; sampleRate: number };
  meydaCfg.bufferSize = meydaSignal.length;
  meydaCfg.sampleRate = sampleRate;
  const features = (Meyda.extract as unknown as (
    feature: string | string[],
    signal: Float32Array,
    previousSignal: Float32Array | undefined,
    config: { sampleRate: number; bufferSize: number }
  ) => { rms: number; zcr: number; spectralCentroid: number })(
    ['rms', 'zcr', 'spectralCentroid'],
    meydaSignal,
    undefined,
    { sampleRate, bufferSize: meydaSignal.length }
  );
  const rms = features.rms;
  // spectralCentroid is returned in FFT bins; convert to Hz (bin spacing =
  // sampleRate / bufferSize now that bufferSize matches the signal window).
  const spectralCentroid = (features.spectralCentroid * sampleRate) / meydaSignal.length;
  const zcr = features.zcr;
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -96;

  // Time features
  let attackIdx = -1;
  const threshold = 0.01;
  for (let i = 0; i < length; i++) {
    if (Math.abs(channel0[i]) > threshold) {
      attackIdx = i;
      break;
    }
  }
  const attackTime = attackIdx !== -1 ? attackIdx / sampleRate : 0;
  const decayTime = durationSeconds - attackTime;

  const noiseRatio = Math.min(1, zcr * 2.5);
  // Guard against 0/ε durations (empty or ~2ms buffers): the documented
  // transientSharpness range is 0–10, so clamp instead of emitting NaN/Infinity.
  const safeDuration = durationSeconds > 0 ? durationSeconds : 1;
  const transientStrength = Math.max(0, Math.min(10, (transients / safeDuration) * 10));

  const suggestedCategory = classifyCategory(
    fileName,
    durationSeconds,
    transientStrength,
    peakDb,
    rmsDb,
    spectralCentroid,
    noiseRatio
  );

  return {
    peakDb: parseFloat(peakDb.toFixed(1)),
    rmsDb: parseFloat(rmsDb.toFixed(1)),
    lufsDb: parseFloat((rmsDb + 3).toFixed(1)),
    transientSharpness: parseFloat(transientStrength.toFixed(1)),
    durationSeconds: parseFloat(durationSeconds.toFixed(3)),
    sampleRate,
    channels: numChannels,
    suggestedCategory,
    features: {
      attackTime,
      decayTime,
      spectralCentroid,
      transientStrength,
      noiseRatio
    }
  };
}

/**
 * Classifies drum category based on filename and signal properties
 */
function classifyCategory(
  fileName: string,
  duration: number,
  transient: number,
  _peakDb: number,
  _rmsDb: number,
  centroid: number,
  noise: number
): SampleCategory {
  const name = fileName.toLowerCase();

  // 1. Keyword Overrides
  if (name.includes('kick') || name.includes('bd')) return 'Kick';
  if (name.includes('snare') || name.includes('sd')) return 'Snare';
  if (name.includes('hihat') || name.includes('hat') || name.includes('hh')) return 'HiHat';
  if (name.includes('clap')) return 'Clap';
  if (name.includes('perc')) return 'Percussive FX';
  if (name.includes('glitch')) return 'Glitches';
  if (name.includes('atmosphere') || name.includes('drone')) return 'Atmospheres';

  // 2. Deterministic Feature Logic
  if (centroid < 800 && transient > 5 && noise < 0.3) return 'Kick';
  if (centroid > 5000 && noise > 0.6 && duration < 0.5) return 'HiHat';
  if (centroid > 1500 && centroid < 4000 && noise > 0.4 && transient > 4) return 'Snare';
  if (duration < 0.1 && transient > 8) return 'Glitches';
  if (duration > 2.0 && transient < 2) return 'Atmospheres';

  return 'FX Elements';
}

/**
 * Generates variants of a sound based on a profile.
 */
export async function generateVariants(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  count: number,
  profile: any // VariantProfile or simple settings
): Promise<AudioBuffer[]> {
  const variants: AudioBuffer[] = [];
  
  for (let i = 0; i < count; i++) {
    // Each variant has controlled but slightly different tweaks
    const options: BatchProcessOptions = {
      normalizePeak: true,
      targetPeakDb: -0.1,
      trimSilence: true,
      silenceThresholdDb: -45,
      transientSharpness: (profile.transientBoost || 0) + (Math.random() - 0.5) * 10,
      pitchSemitones: (Math.random() - 0.5) * 0.5, // Subtle pitch drift
      tubeDrive: (profile.saturation || 0) + (Math.random() * 5),
      highPassFreq: 20 + (profile.eqTilt || 0),
      lowPassFreq: 20000,
      fadeOutDurationSec: 0.1
    };
    
    variants.push(processAudioBuffer(ctx as any, source, options));
  }
  
  return variants;
}

/**
 * Processes an AudioBuffer with a batch options pipeline (Normalize, Trim, Pitch, Saturation, Filter, Fade)
 */
export function processAudioBuffer(
  audioCtx: AudioContext | OfflineAudioContext,
  sourceBuffer: AudioBuffer,
  options: BatchProcessOptions
): AudioBuffer {
  const numChannels = sourceBuffer.numberOfChannels;
  const origLength = sourceBuffer.length;
  const sampleRate = sourceBuffer.sampleRate;

  // 1. Silence Trimming
  let startIndex = 0;
  let endIndex = origLength - 1;

  if (options.trimSilence) {
    const threshLinear = Math.pow(10, options.silenceThresholdDb / 20);
    let foundStart = false;

    // Scan from start
    for (let i = 0; i < origLength; i++) {
      for (let c = 0; c < numChannels; c++) {
        if (Math.abs(sourceBuffer.getChannelData(c)[i]) > threshLinear) {
          startIndex = Math.max(0, i - 100); // 100 sample pre-roll
          foundStart = true;
          break;
        }
      }
      if (foundStart) break;
    }

    // Scan from end
    let foundEnd = false;
    for (let i = origLength - 1; i >= startIndex; i--) {
      for (let c = 0; c < numChannels; c++) {
        if (Math.abs(sourceBuffer.getChannelData(c)[i]) > threshLinear) {
          endIndex = Math.min(origLength - 1, i + 500); // 500 sample post-roll
          foundEnd = true;
          break;
        }
      }
      if (foundEnd) break;
    }
  }

  // Bound the trimmed length to what actually exists in the source. The old
  // `Math.max(1024, …)` floor silently LENGTHENED any sample shorter than 1024
  // samples (~23 ms) with a zero tail, and `src[startIndex + i]` read past the
  // end of the buffer — corrupting duration/analysis/pitch for short one-shots.
  const available = origLength - startIndex;
  const trimmedLength = Math.max(1, Math.min(available, endIndex - startIndex + 1));

  // Create working buffer
  const outBuffer = audioCtx.createBuffer(numChannels, trimmedLength, sampleRate);

  // Copy trimmed audio
  for (let c = 0; c < numChannels; c++) {
    const src = sourceBuffer.getChannelData(c);
    const dest = outBuffer.getChannelData(c);
    for (let i = 0; i < trimmedLength; i++) {
      dest[i] = src[startIndex + i] || 0;
    }
  }

  // 2. Pitch Shifting (Resampling / Semi-tone pitch factor)
  let pitchShiftedBuffer = outBuffer;
  if (options.pitchSemitones !== 0) {
    const pitchFactor = Math.pow(2, options.pitchSemitones / 12);
    const newLen = Math.floor(trimmedLength / pitchFactor);
    pitchShiftedBuffer = audioCtx.createBuffer(numChannels, newLen, sampleRate);

    for (let c = 0; c < numChannels; c++) {
      const src = outBuffer.getChannelData(c);
      const dest = pitchShiftedBuffer.getChannelData(c);

      for (let i = 0; i < newLen; i++) {
        const srcPos = i * pitchFactor;
        const i0 = Math.floor(srcPos);
        const i1 = Math.min(trimmedLength - 1, i0 + 1);
        const frac = srcPos - i0;
        dest[i] = src[i0] * (1 - frac) + src[i1] * frac; // Linear interpolation
      }
    }
  }

  // 3. DSP Effects: Transient Shaper, Saturation, Filter, Normalize, Fade, Reverb, Bitcrush, Stereo Widening
  const finalLen = pitchShiftedBuffer.length;
  const destChannels = (numChannels === 1 && options.stereoWidening && options.stereoWidening > 100) ? 2 : numChannels;
  const processedBuffer = audioCtx.createBuffer(destChannels, finalLen, sampleRate);

  // Peak calculation for normalization
  let maxPeak = 0;

  for (let c = 0; c < destChannels; c++) {
    // If original is mono but output is stereo, both channels read from the mono pitchShiftedBuffer channel 0
    const src = pitchShiftedBuffer.getChannelData(numChannels === 1 ? 0 : c);
    const dest = processedBuffer.getChannelData(c);

    // Haas Delay for pseudo-stereo widening on the second channel (c === 1) of mono input
    const isHaasChannel = (c === 1 && numChannels === 1 && options.stereoWidening && options.stereoWidening > 100);
    const haasSamples = Math.floor(sampleRate * 0.012); // 12ms delay

    // Tube drive factor
    const driveGain = 1 + (options.tubeDrive / 100) * 3;

    // Transient attack factor
    const attackBoost = 1 + ((options.transientSharpness || 0) / 100) * 1.5;

    for (let i = 0; i < finalLen; i++) {
      let sample = src[i];

      // If Haas pseudo-stereo channel, apply delay
      if (isHaasChannel) {
        sample = i >= haasSamples ? src[i - haasSamples] : 0;
      }

      // Transient Shaping (First 15ms boost)
      if (options.transientSharpness && options.transientSharpness !== 0 && i < sampleRate * 0.015) {
        sample *= attackBoost;
      }

      // Tube Saturation (Soft Clipper)
      if (options.tubeDrive > 0) {
        sample *= driveGain;
        sample = Math.tanh(sample); // Smooth analog saturation curve
      }

      // Digital Bitcrusher
      if (options.bitcrushDepth && options.bitcrushDepth > 0) {
        const bits = Math.max(3, 16 - (options.bitcrushDepth / 100) * 13);
        const steps = Math.pow(2, bits - 1);
        sample = Math.round(sample * steps) / steps;
      }

      // Simple High Pass Filter (RC Filter)
      if (options.highPassFreq > 10 && i > 0) {
        const dt = 1 / sampleRate;
        const RC = 1 / (2 * Math.PI * options.highPassFreq);
        const alpha = RC / (RC + dt);
        sample = alpha * (dest[i - 1] + sample - src[i - 1]);
      }

      dest[i] = sample;

      const abs = Math.abs(sample);
      if (abs > maxPeak) maxPeak = abs;
    }

    // Reverb processing (recursive feedback delay lines for a cozy space/plate reverb tail)
    if (options.reverbSpace && options.reverbSpace > 0) {
      const revMix = (options.reverbSpace / 100) * 0.45; // Max 45% wet
      const delay1 = Math.floor(sampleRate * 0.027); // 27ms
      const delay2 = Math.floor(sampleRate * 0.041); // 41ms
      const delay3 = Math.floor(sampleRate * 0.059); // 59ms
      const decay = 0.5 + (options.reverbSpace / 100) * 0.38; // feedback amount
      
      const temp = new Float32Array(finalLen);
      for (let i = 0; i < finalLen; i++) {
        let wet = 0;
        if (i >= delay1) wet += temp[i - delay1] * 0.45;
        if (i >= delay2) wet += temp[i - delay2] * 0.35;
        if (i >= delay3) wet += temp[i - delay3] * 0.20;
        
        temp[i] = dest[i] + wet * decay;
        dest[i] = dest[i] * (1 - revMix) + temp[i] * revMix;
        
        const abs = Math.abs(dest[i]);
        if (abs > maxPeak) maxPeak = abs;
      }
    }

    // Smooth Fade-out tail
    if (options.fadeOutDurationSec > 0) {
      const fadeSamples = Math.floor(options.fadeOutDurationSec * sampleRate);
      const fadeStart = Math.max(0, finalLen - fadeSamples);
      for (let i = fadeStart; i < finalLen; i++) {
        const progress = (i - fadeStart) / fadeSamples;
        const fadeGain = Math.cos((progress * Math.PI) / 2); // Exponential smooth fade
        dest[i] *= fadeGain;
      }
    }
  }

  // Mid/Side stereo widening for native stereo files (destChannels === 2 and input was already 2 channels)
  if (numChannels === 2 && options.stereoWidening !== undefined && options.stereoWidening !== 100) {
    const widthFactor = options.stereoWidening / 100;
    const left = processedBuffer.getChannelData(0);
    const right = processedBuffer.getChannelData(1);
    for (let i = 0; i < finalLen; i++) {
      const mid = (left[i] + right[i]) * 0.5;
      const side = (left[i] - right[i]) * 0.5;
      left[i] = mid + side * widthFactor;
      right[i] = mid - side * widthFactor;
      
      const absL = Math.abs(left[i]);
      const absR = Math.abs(right[i]);
      if (absL > maxPeak) maxPeak = absL;
      if (absR > maxPeak) maxPeak = absR;
    }
  }

  // 4. Peak Normalization
  if (options.normalizePeak && maxPeak > 0) {
    const targetLinear = Math.pow(10, options.targetPeakDb / 20);
    const normFactor = targetLinear / maxPeak;

    for (let c = 0; c < destChannels; c++) {
      const data = processedBuffer.getChannelData(c);
      for (let i = 0; i < finalLen; i++) {
        data[i] = Math.max(-1, Math.min(1, data[i] * normFactor));
      }
    }
  }

  return processedBuffer;
}
