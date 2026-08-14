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
});
