// @vitest-environment node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTE (audit fix): this suite used to carry a CONSTRAINED_ENV=1 skip switch for
 * an environment-sensitive worker crash ("Committing semi space failed"). The
 * real root cause was a test mock: MockOfflineAudioContext.createBuffer returned
 * a fresh Float32Array on every getChannelData() call, and the evolution reverb
 * impulse loop calls getChannelData() ~176k times, churning ~62 GB of off-heap
 * ArrayBuffers until the worker died. The mock now returns stable per-channel
 * arrays (see src/tests/setup.ts), so this test runs everywhere. The skip
 * switch and its CI wiring were removed.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateEvolutionVariations } from './evolutionEngine';

describe('EvolutionEngine', () => {
  it('should generate requested number of variations', async () => {
    const mockBuffer = {
      numberOfChannels: 1,
      length: 100,
      sampleRate: 44100,
      getChannelData: vi.fn(() => new Float32Array(100)),
      duration: 100 / 44100,
    } as any;

    const mockCtx = {
      sampleRate: 44100,
    } as any;

    const result = await generateEvolutionVariations(mockCtx, mockBuffer, 3, 0.6);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBeDefined();
    expect(result[0].name).toContain(result[0].role);
    expect(result[0].role).toBeDefined();
    expect(result[0].chaosLevel).toBeGreaterThan(0);
    expect(result[0].spectralDensity).toBeGreaterThanOrEqual(0);
    expect(result[0].temporalBehavior).toBeGreaterThanOrEqual(0);
    expect(result[0].routingPath).toBeInstanceOf(Array);
    expect(result[0].buffer).toBeDefined();
  });

  const makeSource = (): AudioBuffer =>
    ({
      numberOfChannels: 1,
      length: 100,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(100),
      duration: 100 / 44100,
    }) as unknown as AudioBuffer;
  const ctx = { sampleRate: 44100 } as unknown as BaseAudioContext;

  it('uses kit role names in kit mode', async () => {
    const res = await generateEvolutionVariations(ctx, makeSource(), 4, 0.5, 'kit');
    expect(res).toHaveLength(4);
    for (const v of res) {
      expect(['Kick', 'Snare', 'Hi-Hat', 'Percussion']).toContain(v.role);
    }
  });

  it('uses melodic role names in melodic mode', async () => {
    const res = await generateEvolutionVariations(ctx, makeSource(), 5, 0.5, 'melodic');
    expect(res).toHaveLength(5);
    for (const v of res) {
      expect(['Root', 'Fifth', 'Octave Up', 'Octave Down', 'Major Third']).toContain(v.role);
    }
  });

  it('freeze strips all FX from the routing path and labels the variation', async () => {
    const fx = ['bitcrush', 'distortion', 'delay', 'reverb', 'spectral_fold', 'aliasing'];
    const res = await generateEvolutionVariations(ctx, makeSource(), 3, 0.8, 'mutations', 'freeze');
    for (const v of res) {
      expect(v.name).toContain('(FX Frozen)');
      expect(v.routingPath.length).toBeGreaterThan(0);
      for (const effect of v.routingPath) expect(fx).not.toContain(effect);
    }
  });

  it('fx_only strips pitch shifts, keeps FX and labels the variation', async () => {
    const pitch = ['pitch_down', 'pitch_down_2', 'pitch_up', 'pitch_up_2', 'pitch_up_fifth', 'pitch_up_third'];
    const res = await generateEvolutionVariations(ctx, makeSource(), 3, 0.6, 'mutations', 'fx_only');
    for (const v of res) {
      expect(v.name).toContain('(FX Only)');
      expect(v.routingPath.length).toBeGreaterThanOrEqual(1);
      for (const effect of v.routingPath) expect(pitch).not.toContain(effect);
    }
  });

  it('clamps chaosLevel to 1 at high base chaos', async () => {
    const res = await generateEvolutionVariations(ctx, makeSource(), 2, 0.9);
    for (const v of res) {
      expect(v.chaosLevel).toBeLessThanOrEqual(1);
      expect(v.chaosLevel).toBeGreaterThan(0);
    }
  });
});
