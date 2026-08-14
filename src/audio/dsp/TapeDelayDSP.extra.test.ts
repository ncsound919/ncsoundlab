/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for `src/audio/dsp/TapeDelayDSP.ts` — the node-graph constructor,
 * preset sanitization, head routing, feedback soft-ceiling, mini-IR swapping
 * and dispose lifecycle, all against a rich fake AudioContext.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TapeDelayDSP } from './TapeDelayDSP';
import { irCache } from './ConvolutionReverbDSP';
import { TAPE_DELAY_PRESETS } from '../../lib/convolutionAndTapePresets';

const makeParam = () => ({
  value: 1,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  setTargetAtTime: vi.fn(),
});

const makeNode = (over: Record<string, unknown> = {}): any => {
  const node: any = {
    connect: vi.fn(() => undefined),
    disconnect: vi.fn(() => undefined),
    gain: makeParam(),
    frequency: makeParam(),
    Q: makeParam(),
    pan: makeParam(),
    delayTime: makeParam(),
    type: 'lowpass',
    curve: null,
    buffer: null,
    oversample: 'none',
    start: vi.fn(),
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...over,
  };
  return node;
};

const makeCtx = (): any => {
  const ctx: any = {
    sampleRate: 48000,
    currentTime: 0,
  };
  ctx.createGain = vi.fn(() => makeNode());
  ctx.createBiquadFilter = vi.fn(() => makeNode());
  ctx.createWaveShaper = vi.fn(() => makeNode());
  ctx.createDelay = vi.fn(() => makeNode());
  ctx.createStereoPanner = vi.fn(() => makeNode());
  ctx.createOscillator = vi.fn(() => makeNode());
  ctx.createConvolver = vi.fn(() => makeNode());
  ctx.createBuffer = vi.fn((channels: number, length: number, rate: number) => {
    const channelData = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      duration: length / rate,
      getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
      copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
    } as unknown as AudioBuffer;
  });
  return ctx;
};

const clonePreset = (over: Record<string, unknown> = {}): any => ({
  ...TAPE_DELAY_PRESETS[0],
  ...over,
});

describe('TapeDelayDSP', () => {
  beforeEach(() => {
    irCache.clear();
  });

  it('constructs the full graph with 4 heads, LFOs and default mini IRs', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    expect(ctx.createDelay).toHaveBeenCalled();
    expect(ctx.createStereoPanner).toHaveBeenCalledTimes(4);
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect((dsp as any).wowLfo.start).toHaveBeenCalled();
    expect((dsp as any).flutterLfo.start).toHaveBeenCalled();
    expect((dsp as any).heads).toHaveLength(4);
    expect((dsp as any).heads[0].active).toBe(true);
    expect((dsp as any).feedbackMiniConvolverA.buffer).toBeTruthy();
    expect((dsp as any).feedbackMiniConvolverB.buffer).toBeTruthy();
    expect((dsp as any).tapeSaturator.curve).toBeInstanceOf(Float32Array);
    expect((dsp as any).feedbackSaturator.curve).toBeInstanceOf(Float32Array);
  });

  it('applyPreset applies a real preset through every stage', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    (dsp as any).applyPreset(clonePreset());
    // Head 0 active; heads 1..3 muted.
    expect((dsp as any).heads[0].active).toBe(true);
    expect((dsp as any).heads[1].active).toBe(false);
    expect((dsp as any).preHpFilter.frequency.setTargetAtTime).toHaveBeenCalled();
    expect((dsp as any).feedbackGainNode.gain.setTargetAtTime).toHaveBeenCalled();
    expect((dsp as any).dryGain.gain.setTargetAtTime).toHaveBeenCalled();
    expect((dsp as any).wetGain.gain.setTargetAtTime).toHaveBeenCalled();
    expect((dsp as any).feedbackFilter.type).toBe('lowpass');
  });

  it('applyPreset handles hp and band feedback filter types', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    (dsp as any).applyPreset(clonePreset({ feedback: { ...clonePreset().feedback, filterType: 'hp' } }));
    expect((dsp as any).feedbackFilter.type).toBe('highpass');
    (dsp as any).applyPreset(clonePreset({ feedback: { ...clonePreset().feedback, filterType: 'bp' as any } }));
    expect((dsp as any).feedbackFilter.type).toBe('bandpass');
  });

  it('applyPreset compresses feedback above the soft ceiling', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    (dsp as any).applyPreset(clonePreset({ feedback: { ...clonePreset().feedback, amount: 2.0 } }));
    const args = (dsp as any).feedbackGainNode.gain.setTargetAtTime.mock.calls;
    const last = args[args.length - 1][0];
    // 2.0 is compressed to well below the raw value but still > 0.8.
    expect(last).toBeGreaterThan(0.8);
    expect(last).toBeLessThan(0.96);
  });

  it('applyPreset sanitizes NaN / out-of-range preset values', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    const messy = clonePreset({
      heads: { ...clonePreset().heads, count: NaN, timesMs: [Number.NaN, 100000, -5, 250], levels: [9, -2, Number.NaN, 0.5], pans: [5, -5, Number.NaN, 0] },
      preFilter: { hpFreq: Number.NaN, lpFreq: 0, midBumpDb: 999 },
      modulation: { wowDepthMs: Number.NaN, wowRateHz: -1, flutterDepthMs: 999, flutterRateHz: Number.NaN },
      saturation: { drive: -1, biasTilt: 50 },
      feedback: { ...clonePreset().feedback, filterFreq: Number.NaN, extraSaturation: 99, miniIRId: 'plate_verb' },
      mix: { dry: -2, wet: 3 },
    });
    expect(() => (dsp as any).applyPreset(messy)).not.toThrow();
    expect((dsp as any).currentMiniIRId).toBe('plate_verb');
  });

  it('swapMiniIR fades both convolver mixes when the IR id changes', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    (dsp as any).applyPreset(clonePreset({ feedback: { ...clonePreset().feedback, miniIRId: 'plate_verb' } }));
    expect((dsp as any).currentMiniIRId).toBe('plate_verb');
    expect((dsp as any).feedbackMiniConvolverB.buffer).toBeTruthy();
    // Switch back — now the other convolver becomes active (else branch).
    (dsp as any).applyPreset(clonePreset({ feedback: { ...clonePreset().feedback, miniIRId: 'room_short' } }));
    expect((dsp as any).currentMiniIRId).toBe('room_short');
    expect((dsp as any).feedbackMiniConvolverA.buffer).toBeTruthy();
  });

  it('applyPreset is a no-op after dispose', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    (dsp as any).dispose();
    const calls = (dsp as any).preHpFilter.frequency.setTargetAtTime.mock.calls.length;
    (dsp as any).applyPreset(clonePreset());
    expect((dsp as any).preHpFilter.frequency.setTargetAtTime.mock.calls.length).toBe(calls);
  });

  it('dispose stops all LFOs, disconnects nodes and is idempotent', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    (dsp as any).dispose();
    expect((dsp as any).wowLfo.stop).toHaveBeenCalled();
    expect((dsp as any).flutterLfo.stop).toHaveBeenCalled();
    expect((dsp as any).heads).toHaveLength(0);
    // Second dispose is a harmless no-op.
    (dsp as any).dispose();
  });

  it('tolerates stop/disconnect throwing during dispose', () => {
    const ctx = makeCtx();
    const dsp = new TapeDelayDSP(ctx);
    (dsp as any).wowLfo.stop = vi.fn(() => {
      throw new Error('already stopped');
    });
    ((dsp as any).inputNode as any).disconnect = vi.fn(() => {
      throw new Error('disconnect');
    });
    expect(() => (dsp as any).dispose()).not.toThrow();
  });
});
