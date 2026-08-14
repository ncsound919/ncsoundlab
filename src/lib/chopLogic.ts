/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure slicing logic for the MPC-style ChopEditor: boundary markers → slice
 * regions, region extraction, and silence-based "smart" auto-slicing.
 * Extracted from `ChopEditor.tsx` so it's unit-testable without wavesurfer.
 */

/** Boundary markers (0..1) → slices between them (with 0 and 1). */
export function slicesFromMarkers(markers: number[]): { start: number; end: number }[] {
  const sorted = [...markers].sort((a, b) => a - b);
  // Dedupe: markers closer than 0.1% of the file collapse into one boundary
  // (a sub-1ms slice is inaudible and leaves an uncovered sliver). Markers
  // within 0.001 of 1 collapse into the end boundary.
  const pts: number[] = [];
  let prev = 0;
  for (const m of sorted) {
    const clamped = Math.max(0, Math.min(1, m));
    if (clamped - prev >= 0.001 && 1 - clamped >= 0.001) {
      pts.push(clamped);
      prev = clamped;
    }
  }
  // Always cover [0, 1] exactly.
  const out: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const p of pts) {
    out.push({ start: cursor, end: p });
    cursor = p;
  }
  out.push({ start: cursor, end: 1 });
  return out;
}

/** Extract a [startPct, endPct] region of a buffer as a NEW AudioBuffer. */
export function sliceRegion(ctx: BaseAudioContext, buffer: AudioBuffer, startPct: number, endPct: number): AudioBuffer {
  const start = Math.max(0, Math.floor(startPct * buffer.length));
  const end = Math.min(buffer.length, Math.floor(endPct * buffer.length));
  const len = Math.max(1, end - start);
  const channels = buffer.numberOfChannels;
  // Use ctx.createBuffer — `new AudioBuffer({...})` throws in Safari/WebKit.
  const out = ctx.createBuffer(channels, len, buffer.sampleRate);
  for (let c = 0; c < channels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(start, end), c);
  }
  return out;
}

/** Smart silence-based auto slicing. */
export function autoMarkers(buffer: AudioBuffer, maxChops: number): number[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.max(256, Math.floor(sr * 0.01));
  const rms: number[] = [];
  let peak = 0;
  for (let i = 0; i + win <= data.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += data[j] * data[j];
    const r = Math.sqrt(sum / win);
    if (r > peak) peak = r;
    rms.push(r);
  }
  if (peak <= 1e-5) return [];
  const threshold = peak * 0.04;
  // At least one window each of loud and silence, or the marker branches below
  // never fire (at low sample rates floor(sr*0.03/win) collapses to 0 and
  // smart-slicing silently returns nothing).
  const minLoud = Math.max(1, Math.floor((sr * 0.03) / win));
  const minSilent = Math.max(1, Math.floor((sr * 0.02) / win));
  const markers: number[] = [];
  let loud = 0;
  let silent = 0;
  let last = -1;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] >= threshold) {
      loud++;
      silent = 0;
      if (loud === minLoud && i / rms.length - last > 0.02) {
        markers.push(i / rms.length);
        last = i / rms.length;
      }
    } else {
      silent++;
      if (loud >= minLoud && silent === minSilent && i / rms.length - last > 0.02) {
        markers.push(i / rms.length);
        last = i / rms.length;
      }
      loud = 0;
    }
  }
  return markers.slice(0, Math.max(0, maxChops - 1));
}
