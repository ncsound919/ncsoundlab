/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EQBand {
  id: string;
  type: 'bell' | 'lowShelf' | 'highShelf' | 'lowpass' | 'highpass' | 'notch';
  freq: number;
  gain: number;
  q: number;
  enabled: boolean;
}

export interface AdvancedEQSettings {
  bands: EQBand[];
  outputTrimDb: number;
}

export const DEFAULT_EQ_SETTINGS: AdvancedEQSettings = {
  bands: [
    { id: 'b1', type: 'highpass', freq: 30, gain: 0, q: 0.7, enabled: true },
    { id: 'b2', type: 'lowShelf', freq: 100, gain: 2, q: 0.7, enabled: true },
    { id: 'b3', type: 'bell', freq: 450, gain: -1.5, q: 1.2, enabled: true },
    { id: 'b4', type: 'bell', freq: 2500, gain: 3, q: 1.0, enabled: true },
    { id: 'b5', type: 'highShelf', freq: 8000, gain: 2.5, q: 0.7, enabled: true },
  ],
  outputTrimDb: 0,
};

export function calculateAdvancedEQResponse(settings: AdvancedEQSettings, freqs: Float32Array) {
  const result: { freq: number; magnitudeDb: number }[] = [];
  const trim = settings.outputTrimDb || 0;

  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    let totalGain = trim;

    for (const b of settings.bands) {
      if (!b.enabled) continue;
      const ratio = f / Math.max(1, b.freq);

      if (b.type === 'bell') {
        const bandwidth = 1 / Math.max(0.1, b.q);
        const distance = Math.abs(Math.log2(ratio));
        const factor = Math.exp(-Math.pow(distance / (bandwidth * 0.5), 2));
        totalGain += b.gain * factor;
      } else if (b.type === 'lowShelf') {
        if (f <= b.freq) {
          totalGain += b.gain;
        } else {
          const octs = Math.log2(ratio);
          const falloff = Math.max(0, 1 - octs * 0.8);
          totalGain += b.gain * falloff;
        }
      } else if (b.type === 'highShelf') {
        if (f >= b.freq) {
          totalGain += b.gain;
        } else {
          const octs = Math.log2(b.freq / f);
          const falloff = Math.max(0, 1 - octs * 0.8);
          totalGain += b.gain * falloff;
        }
      } else if (b.type === 'lowpass') {
        if (f > b.freq) {
          const octs = Math.log2(ratio);
          totalGain -= octs * 12 * (b.q || 1);
        }
      } else if (b.type === 'highpass') {
        if (f < b.freq) {
          const octs = Math.log2(b.freq / f);
          totalGain -= octs * 12 * (b.q || 1);
        }
      } else if (b.type === 'notch') {
        const bandwidth = 0.2 / Math.max(0.1, b.q);
        if (Math.abs(Math.log2(ratio)) < bandwidth) {
          totalGain -= 36;
        }
      }
    }

    result.push({
      freq: f,
      magnitudeDb: Math.max(-24, Math.min(24, totalGain)),
    });
  }

  return result;
}
