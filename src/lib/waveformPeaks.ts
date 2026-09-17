/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Downsample an audio buffer into a small peak array for waveform thumbnails.
 * Pure and dependency-free so it can run for every layer row every render
 * without touching the AudioContext.
 */

/** The minimal shape needed to read samples (satisfied by AudioBuffer). */
export interface PeakSource {
  length: number;
  getChannelData(channel: number): Float32Array;
}

/**
 * Normalised peak magnitude per bucket (0..1). Returns all zeros when there is
 * no usable buffer, so callers can render an empty baseline instead of throwing.
 */
export function computePeaks(source: PeakSource | null | undefined, buckets = 48): number[] {
  const count = Math.max(0, Math.floor(buckets));
  if (count === 0) return [];
  if (!source || !source.length) return new Array(count).fill(0);

  const data = source.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / count));
  const peaks = new Array<number>(count).fill(0);
  let max = 0;

  for (let b = 0; b < count; b++) {
    const start = b * block;
    const end = Math.min(data.length, start + block);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const a = data[i] < 0 ? -data[i] : data[i];
      if (a > peak) peak = a;
    }
    peaks[b] = peak;
    if (peak > max) max = peak;
  }

  if (max > 0) {
    for (let b = 0; b < count; b++) peaks[b] = peaks[b] / max;
  }
  return peaks;
}

/** SVG path (centred, mirrored vertical) for a peak array inside w×h. */
export function peaksToPath(peaks: readonly number[], w = 48, h = 16): string {
  if (peaks.length === 0) return '';
  const mid = h / 2;
  const scale = mid - 1;
  const step = peaks.length > 1 ? w / (peaks.length - 1) : w;
  // Outline left→right along the top of the peaks, then back for the mirror.
  const top = peaks.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(mid - p * scale).toFixed(2)}`);
  const bottom = [...peaks].reverse().map((p, i) => {
    const x = (peaks.length - 1 - i) * step;
    return `L${x.toFixed(2)},${(mid + p * scale).toFixed(2)}`;
  });
  return `${top.join(' ')} ${bottom.join(' ')} Z`;
}
