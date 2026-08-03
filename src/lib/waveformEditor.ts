/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DSP Waveform Editing Functions for AudioBuffers.
 * These methods take an input AudioBuffer, apply digital signal processing,
 * and return a new, mutated AudioBuffer.
 */

export function cloneBuffer(ctx: AudioContext, src: AudioBuffer): AudioBuffer {
  const dest = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
  for (let c = 0; c < src.numberOfChannels; c++) {
    dest.getChannelData(c).set(src.getChannelData(c));
  }
  return dest;
}

/**
 * Reverses the samples of an AudioBuffer.
 */
export function reverseBuffer(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const result = cloneBuffer(ctx, buffer);
  for (let c = 0; c < result.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    Array.prototype.reverse.call(data);
  }
  return result;
}

/**
 * Inverts the phase (polarity) of an AudioBuffer.
 */
export function invertPhase(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const result = cloneBuffer(ctx, buffer);
  for (let c = 0; c < result.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] = -data[i];
    }
  }
  return result;
}

/**
 * Normalizes the amplitude of an AudioBuffer so its absolute peak matches the target level (e.g., 0.98).
 */
export function normalizeBuffer(ctx: AudioContext, buffer: AudioBuffer, targetLevel: number = 0.98): AudioBuffer {
  const result = cloneBuffer(ctx, buffer);
  let maxVal = 0;

  // Find overall absolute peak
  for (let c = 0; c < result.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const val = Math.abs(data[i]);
      if (val > maxVal) maxVal = val;
    }
  }

  if (maxVal > 0) {
    const scale = targetLevel / maxVal;
    for (let c = 0; c < result.numberOfChannels; c++) {
      const data = result.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        data[i] *= scale;
      }
    }
  }

  return result;
}

/**
 * Trims/Crops an AudioBuffer to a start and end range specified in percentages (0.0 to 1.0).
 */
export function trimBuffer(ctx: AudioContext, buffer: AudioBuffer, startPct: number, endPct: number): AudioBuffer {
  const startFrame = Math.max(0, Math.floor(startPct * buffer.length));
  const endFrame = Math.min(buffer.length, Math.floor(endPct * buffer.length));
  const newLength = Math.max(1, endFrame - startFrame);

  const result = ctx.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);

  const attackFadeLength = Math.min(Math.floor(newLength / 2), Math.floor(0.003 * buffer.sampleRate));
  const releaseFadeLength = Math.min(Math.floor(newLength / 2), Math.floor(0.005 * buffer.sampleRate));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const srcData = buffer.getChannelData(c);
    const destData = result.getChannelData(c);
    destData.set(srcData.subarray(startFrame, endFrame));

    // Anti-click attack micro-fade
    for (let i = 0; i < attackFadeLength; i++) {
      destData[i] *= (i / attackFadeLength);
    }
    // Anti-click release micro-fade
    for (let i = 0; i < releaseFadeLength; i++) {
      const idx = newLength - 1 - i;
      destData[idx] *= (i / releaseFadeLength);
    }
  }

  return result;
}

/**
 * Applies a linear Fade In to the beginning of the buffer.
 * @param durationSec - Duration of the fade in seconds.
 */
export function fadeInBuffer(ctx: AudioContext, buffer: AudioBuffer, durationSec: number): AudioBuffer {
  const result = cloneBuffer(ctx, buffer);
  const fadeLength = Math.min(buffer.length, Math.floor(durationSec * buffer.sampleRate));

  if (fadeLength <= 0) return result;

  for (let c = 0; c < result.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = 0; i < fadeLength; i++) {
      const gain = i / fadeLength;
      data[i] *= gain;
    }
  }

  return result;
}

/**
 * Applies a linear Fade Out to the end of the buffer.
 * @param durationSec - Duration of the fade in seconds.
 */
export function fadeOutBuffer(ctx: AudioContext, buffer: AudioBuffer, durationSec: number): AudioBuffer {
  const result = cloneBuffer(ctx, buffer);
  const fadeLength = Math.min(buffer.length, Math.floor(durationSec * buffer.sampleRate));

  if (fadeLength <= 0) return result;

  const startIdx = buffer.length - fadeLength;

  for (let c = 0; c < result.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = 0; i < fadeLength; i++) {
      const gain = 1 - (i / fadeLength);
      data[startIdx + i] *= gain;
    }
  }

  return result;
}

/**
 * Glitches the audio buffer by inserting micro-silences or noise bursts.
 */
export function glitchBuffer(ctx: AudioContext, buffer: AudioBuffer, intensity: number = 0.5): AudioBuffer {
  const result = cloneBuffer(ctx, buffer);
  const totalSamples = buffer.length;

  for (let c = 0; c < result.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    const numGlitches = Math.floor(intensity * 12);

    for (let g = 0; g < numGlitches; g++) {
      // Pick a random glitch start sample and duration (e.g. 10ms to 80ms)
      const glitchDur = Math.floor((0.01 + Math.random() * 0.07) * buffer.sampleRate);
      const startIdx = Math.floor(Math.random() * (totalSamples - glitchDur - 1));

      const type = Math.random() > 0.5 ? 'silence' : 'noise';

      for (let i = 0; i < glitchDur; i++) {
        if (type === 'silence') {
          data[startIdx + i] = 0;
        } else {
          // Injected digital static/noise burst
          data[startIdx + i] = (Math.random() * 2 - 1) * 0.3;
        }
      }
    }
  }

  return result;
}

/**
 * Amplifies or attenuates the buffer by a specific decibel value.
 */
export function gainAdjustBuffer(ctx: AudioContext, buffer: AudioBuffer, db: number): AudioBuffer {
  const result = cloneBuffer(ctx, buffer);
  const factor = Math.pow(10, db / 20);

  for (let c = 0; c < result.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.max(-1, Math.min(1, data[i] * factor));
    }
  }

  return result;
}
