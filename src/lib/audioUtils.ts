/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encode an AudioBuffer to a base64-encoded WAV string (data URL fragment only,
 * no `data:audio/wav;base64,` prefix). Used by the project-document serializer
 * to embed sample audio into a self-contained `.nsl` file.
 *
 * 16-bit PCM is the default to keep serialized project size small; samples are
 * usually transient material and 16-bit is sufficient for round-trip audition.
 */
export async function audioBufferToBase64(buffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 16): Promise<string> {
  const blob = audioBufferToWav(buffer, bitDepth);
  const arrayBuffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Decode a base64-encoded WAV string (no data-URI prefix) back into an
 * AudioBuffer using the provided BaseAudioContext.
 */
export async function base64ToAudioBuffer(context: BaseAudioContext, base64: string): Promise<AudioBuffer> {
  let binary: string;
  if (typeof atob !== 'undefined') {
    binary = atob(base64);
  } else {
    binary = Buffer.from(base64, 'base64').toString('binary');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

// Simple WAV encoder helper
export function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 32): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = bitDepth === 32 ? 3 : 1; // 3 = IEEE Float, 1 = PCM
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const dataLen = buffer.length * blockAlign;
  // Format chunk for extensible or float might require more bytes but standard 44 bytes works in most DAWs for 32-bit float
  const headerLen = 44;
  const totalLen = headerLen + dataLen;
  
  const arrayBuffer = new ArrayBuffer(totalLen);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, totalLen - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLen, true);
  
  const offset = 44;
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  let index = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = channels[channel][i];
      sample = Math.max(-1, Math.min(1, sample)); // Hard clip at 0dBFS
      
      if (bitDepth === 32) {
        view.setFloat32(offset + index, sample, true);
      } else if (bitDepth === 24) {
        // 24-bit PCM. TPDF dither (±1 LSB) decorrelates quantization noise so
        // tails and fades don't get a grainy, breathing noise floor.
        sample = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
        sample += Math.random() + Math.random() - 1; // triangular PDF, ±1 LSB
        const intSample = Math.round(sample);
        view.setUint8(offset + index, intSample & 0xFF);
        view.setUint8(offset + index + 1, (intSample >> 8) & 0xFF);
        view.setUint8(offset + index + 2, (intSample >> 16) & 0xFF);
      } else {
        // 16-bit PCM (with TPDF dither).
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        sample += Math.random() + Math.random() - 1; // triangular PDF, ±1 LSB
        view.setInt16(offset + index, Math.round(sample), true);
      }
      
      index += bytesPerSample;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function createSwarmBuffer(context: BaseAudioContext, duration: number, material: string, density: number) {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const buffer = context.createBuffer(2, length, sampleRate);
  
  const numResonators = 20 + Math.floor(density * 180); // 20 to 200 resonators
  
  const baseFreqMap: Record<string, number> = {
    metal: 800,
    glass: 2500,
    wood: 350,
    digital: 1200,
    bio: 200
  };
  
  const decayMap: Record<string, number> = {
    metal: 0.9999, // long ringing
    glass: 0.9995, // brittle ringing
    wood: 0.99,    // damped
    digital: 0.998,
    bio: 0.995
  };
  
  const baseFreq = baseFreqMap[material] || 800;
  const baseDecay = decayMap[material] || 0.999;
  
  const resonators: any[] = [];
  for (let i = 0; i < numResonators; i++) {
    let freq = baseFreq * (0.5 + Math.random() * 2);
    if (material === 'bio') {
      freq = baseFreq * Math.exp(Math.random() * 2);
    } else if (material === 'glass') {
      freq = baseFreq * (1 + Math.random() * 3);
    }
    
    // Convert freq to normalized frequency omega
    const omega = 2 * Math.PI * freq / sampleRate;
    resonators.push({
      omega,
      decay: Math.pow(baseDecay, 1 + Math.random() * (1 - density)),
      phaseL: Math.random() * 2 * Math.PI,
      phaseR: Math.random() * 2 * Math.PI,
      amp: (0.1 + Math.random() * 0.9) / Math.sqrt(numResonators)
    });
  }

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Generate an impulse response that represents a swarm of resonators
  for (let i = 0; i < length; i++) {
    let sl = 0;
    let sr = 0;
    
    // Apply an attack envelope based on material so it's not a pure impulse
    const attack = (material === 'wood' || material === 'bio') ? Math.min(1, i / (sampleRate * 0.05)) : Math.min(1, i / (sampleRate * 0.005));
    
    for (let r = 0; r < numResonators; r++) {
      const res = resonators[r];
      // simple damped sine
      const env = Math.pow(res.decay, i);
      sl += Math.sin(i * res.omega + res.phaseL) * env * res.amp;
      sr += Math.sin(i * res.omega + res.phaseR) * env * res.amp;
    }
    
    left[i] = sl * attack;
    right[i] = sr * attack;
  }
  
  return buffer;
}

export async function createReverbBuffer(context: BaseAudioContext, duration: number, decay: number) {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const buffer = context.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

/**
 * Synthesizes an AudioBuffer for samples lacking PCM data (e.g. factory presets).
 */
export function synthesizeSampleBuffer(
  category: string = 'Kick',
  durationSec: number = 0.8,
  sampleRate: number = 44100
): AudioBuffer {
  const length = Math.floor(sampleRate * durationSec);
  const audioCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(2, length, sampleRate);
  const buffer = audioCtx.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const cat = category.toLowerCase();

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (cat.includes('808') || cat.includes('sub') || cat.includes('bass')) {
      const freq = 60 * Math.exp(-t * 5) + 35;
      const env = Math.exp(-t * 2.2);
      sample = Math.sin(2 * Math.PI * freq * t) * env;
      sample = Math.tanh(sample * 1.4);
    } else if (cat.includes('kick')) {
      const freq = 130 * Math.exp(-t * 28) + 45;
      const env = Math.exp(-t * 9);
      sample = Math.sin(2 * Math.PI * freq * t) * env;
    } else if (cat.includes('snare') || cat.includes('clap')) {
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 14);
      const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 22);
      sample = noise * 0.75 + tone * 0.25;
    } else if (cat.includes('hat') || cat.includes('perc')) {
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 38);
      sample = noise * 0.8;
    } else {
      const freq = 220;
      const env = Math.exp(-t * 4);
      sample = Math.sin(2 * Math.PI * freq * t) * env;
    }

    left[i] = Math.max(-1, Math.min(1, sample * 0.85));
    right[i] = Math.max(-1, Math.min(1, sample * 0.85));
  }

  return buffer;
}

/**
 * Remove DC offset from an AudioBuffer by subtracting each channel's arithmetic
 * mean. Returns a NEW buffer (the input is untouched). DC offset causes a
 * "thump"/pop at sample start and on loop/release, skews peak analysis, and
 * wastes headroom. Cheap (one pass per channel).
 */
export function removeDcOffset(buffer: AudioBuffer): AudioBuffer {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dest = new Float32Array(src.length);
    let sum = 0;
    for (let i = 0; i < src.length; i++) sum += src[i];
    const mean = src.length > 0 ? sum / src.length : 0;
    for (let i = 0; i < src.length; i++) dest[i] = src[i] - mean;
    channels.push(dest);
  }
  // Build the output without relying on the `AudioBuffer` constructor (missing
  // in jsdom / old Safari). A getChannelData()-shaped object is all the WAV
  // encoder consumes.
  return {
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    duration: buffer.duration ?? buffer.length / buffer.sampleRate,
    getChannelData: (c: number) => channels[c] ?? channels[0],
  } as unknown as AudioBuffer;
}

/**
 * Ensure a numerical value is finite and safe for Web Audio API.
 */
export function safeAudioValue(val: any, fallback: number = 0): number {
  if (typeof val !== 'number' || !isFinite(val)) {
    return fallback;
  }
  return val;
}

/**
 * Helper: convert dB to linear gain
 */
export function dbToGain(db: number): number {
  const safeDb = safeAudioValue(db, -100);
  return Math.pow(10, safeDb / 20);
}

/**
 * Helper: convert linear gain to dB
 */
export function gainToDb(gain: number): number {
  const safeGain = safeAudioValue(gain, 0);
  if (safeGain <= 0) return -100;
  return 20 * Math.log10(safeGain);
}
