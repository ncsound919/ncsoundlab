/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Master dynamics + sidechain ducking helpers (Phase 3.5).
 *
 * `applyMasterDynamics` writes the user's threshold/ratio/attack/release
 * onto a `DynamicsCompressorNode`. `createSidechainDuck` builds the small
 * analyser → envelope follower → gain-node subgraph used by the audio
 * engine to duck one bus when another source rises.
 */

import type { MasterDynamicsSettings, SidechainRoute } from '../store/masterDynamicsStore';

/**
 * Apply a `MasterDynamicsSettings` snapshot to a `DynamicsCompressorNode`.
 * `makeupDb` is implemented as a sibling gain node so the helper can be
 * reused with the existing engine (which already has a fixed makeup path).
 */
export const applyMasterDynamics = (
  compressor: DynamicsCompressorNode,
  makeupGain: GainNode | null,
  settings: MasterDynamicsSettings,
  atTime?: number
): void => {
  const t = atTime ?? compressor.context.currentTime;
  const safe = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  compressor.threshold.setValueAtTime(safe(settings.thresholdDb, -0.5), t);
  compressor.ratio.setValueAtTime(Math.max(1, safe(settings.ratio, 1)), t);
  compressor.attack.setValueAtTime(Math.max(0, safe(settings.attackSec, 0.002)), t);
  compressor.release.setValueAtTime(Math.max(0, safe(settings.releaseSec, 0.1)), t);
  if (makeupGain) {
    const makeupLinear = Math.pow(10, safe(settings.makeupDb, 0) / 20);
    makeupGain.gain.setValueAtTime(makeupLinear, t);
  }
  // The `enabled` flag is consumed by the engine when constructing the
  // master chain (it bypasses the compressor by setting ratio=1).
};

/**
 * Build the analyser/envelope/gain subgraph for a sidechain route.
 * The caller is expected to wire `input` to the source's output (or a
 * dedicated analyser tap) and connect `output` to the *sidechain* input
 * of the target compressor's `DynamicsCompressorNode` (so the target
 * ducks proportionally to `output.gain`).
 */
export interface SidechainDuck {
  input: AudioNode;
  output: GainNode;
  envelopeTimer: number;
  dispose: () => void;
}

export const createSidechainDuck = (
  ctx: BaseAudioContext,
  route: SidechainRoute,
  envelopeFollowerHz = 30
): SidechainDuck => {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0;
  const buffer = new Float32Array(analyser.fftSize);
  const output = ctx.createGain();
  output.gain.value = 0;

  const attackSec = Math.max(0, route.attackSec);
  const releaseSec = Math.max(0, route.releaseSec);
  const amount = Math.max(0, Math.min(1, route.amount));

  // Polling-based envelope follower. We compute peak amplitude each
  // animation frame and set `output.gain` toward (1 - amount * peak).
  // Doing it this way avoids the Web Audio limitation that AnalyserNode
  // time-domain data isn't accessible from AudioWorklets / setValueAtTime.
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    analyser.getFloatTimeDomainData(buffer);
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const a = buffer[i] < 0 ? -buffer[i] : buffer[i];
      if (a > peak) peak = a;
    }
    const target = Math.max(0, 1 - amount * Math.min(1, peak));
    const smoothing = peak > output.gain.value ? attackSec : releaseSec;
    output.gain.setTargetAtTime(target, ctx.currentTime, Math.max(0.001, smoothing));
    timer = requestAnimationFrame(tick);
  };
  let timer = requestAnimationFrame(tick);

  const dispose = () => {
    cancelled = true;
    cancelAnimationFrame(timer);
    try {
      analyser.disconnect();
    } catch { /* already disconnected */ }
    try {
      output.disconnect();
    } catch { /* already disconnected */ }
  };

  // The follower runs at envelopeFollowerHz; we use rAF which is fine for
  // visual + duck smoothness in the 60–120 Hz range.
  void envelopeFollowerHz;

  return {
    input: analyser,
    output,
    envelopeTimer: 0,
    dispose,
  };
};

/**
 * Validate that a sidechain route's `source` and `target` are sensible
 * (non-empty strings). Used by the store and the UI to reject bad input.
 */
export const isValidSidechainRoute = (route: Pick<SidechainRoute, 'source' | 'target'>): boolean =>
  typeof route.source === 'string' &&
  route.source.length > 0 &&
  typeof route.target === 'string' &&
  route.target.length > 0;
