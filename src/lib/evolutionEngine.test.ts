// @vitest-environment node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Environment-sensitive: this test forks a Vitest worker that, on some Windows
 * sessions with constrained virtual-memory commit (small/disabled pagefile,
 * Memory Integrity + Mandatory ASLR, Defender scanning, or a parent job
 * object with a per-process commit cap), is denied its first semi-space
 * VirtualAlloc and aborts with:
 *
 *   FATAL ERROR: Committing semi space failed.
 *   Allocation failed - JavaScript heap out of memory
 *
 * That's an OS-level commit denial, not a V8 / Vitest issue. Set
 * CONSTRAINED_ENV=1 in the shell that runs `npm test` to skip this suite on
 * the affected machine; on a healthy dev box or CI, leave it unset and the
 * test runs normally.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateEvolutionVariations } from './evolutionEngine';

const isConstrainedEnv = process.env.CONSTRAINED_ENV === '1';

(isConstrainedEnv ? describe.skip : describe)('EvolutionEngine', () => {
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
