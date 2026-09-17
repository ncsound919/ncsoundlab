/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Seamless-loop rendering: copy the loop region and equal-power crossfade its
 * tail into its head, so `sampleLoop` playback doesn't click at the wrap
 * point. Live `AudioBufferSourceNode` looping has no crossfade parameter, so
 * the honest implementation is this offline render — the layer keeps
 * `sampleLoop: true` over the rendered buffer.
 */

/** Fraction bounds + crossfade for the loop render. */
export interface XfadeLoopOptions {
  /** Loop start as a 0..1 fraction of the buffer (default 0). */
  startPct?: number;
  /** Loop end as a 0..1 fraction of the buffer (default 1). */
  endPct?: number;
  /** Crossfade length in seconds (clamped to half the loop, default 0.02). */
  xfadeSec?: number;
}

/**
 * Render the `[startPct, endPct]` region into a NEW buffer whose first
 * `xfade` samples blend from the region tail (equal-power), making the
 * end→start wrap continuous. Pure DSP apart from `ctx.createBuffer`.
 */
export function renderXfadeLoop(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  opts: XfadeLoopOptions = {}
): AudioBuffer {
  const sr = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const start = Math.max(0, Math.min(buffer.length - 1, Math.floor((opts.startPct ?? 0) * buffer.length)));
  const end = Math.max(start + 1, Math.min(buffer.length, Math.floor((opts.endPct ?? 1) * buffer.length)));
  const len = end - start;
  const xfade = Math.max(1, Math.min(Math.floor(len / 2), Math.floor((opts.xfadeSec ?? 0.02) * sr)));

  const out = ctx.createBuffer(channels, len, sr);
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[start + i] ?? 0;
    // Equal-power blend: out[i] morphs from the tail (i=0, continuous with
    // the loop end) to the head (i=xfade).
    for (let i = 0; i < xfade; i++) {
      const t = i / xfade;
      const headGain = Math.sin((t * Math.PI) / 2);
      const tailGain = Math.cos((t * Math.PI) / 2);
      const head = dst[i];
      const tail = dst[len - xfade + i] ?? 0;
      dst[i] = head * headGain * headGain + tail * tailGain * tailGain;
    }
  }
  return out;
}
