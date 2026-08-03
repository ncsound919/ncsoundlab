import { describe, it, expect } from 'vitest';
import { runCoverArtPipeline, hashStringToSeed, deriveCoverSeed, runPaletteAgent, runLayoutAgent, runTypographyAgent } from './coverArtAgents';

describe('coverArtAgents', () => {
  it('hashStringToSeed should be deterministic and output number', () => {
    const s1 = hashStringToSeed('test');
    const s2 = hashStringToSeed('test');
    const s3 = hashStringToSeed('other');
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
    expect(typeof s1).toBe('number');
  });

  it('deriveCoverSeed handles seed overrides and hashes', () => {
    const seed1 = deriveCoverSeed({ title: 'A', producer: 'B', era: 'trap' });
    const seed2 = deriveCoverSeed({ title: 'A', producer: 'B', era: 'trap', seedOverride: 42 });
    expect(typeof seed1).toBe('number');
    expect(seed2).toBe(42);
  });

  it('runCoverArtPipeline generates deterministic palette, layout, typography', () => {
    const result1 = runCoverArtPipeline({
      title: 'Midnight Beats',
      producer: 'EchoSmith',
      era: 'trap',
    });

    const result2 = runCoverArtPipeline({
      title: 'Midnight Beats',
      producer: 'EchoSmith',
      era: 'trap',
    });

    const resultOther = runCoverArtPipeline({
      title: 'Jazz Chords',
      producer: 'EchoSmith',
      era: 'conscious_jazz',
    });

    // Deterministic match
    expect(result1).toEqual(result2);

    // Variation check
    expect(result1.palette).toBeDefined();
    expect(result1.layout).toBeDefined();
    expect(result1.typography).toBeDefined();
    expect(resultOther.palette).toBeDefined();

    expect(result1.palette.bg).toHaveLength(3);
    expect(result1.layout.textureDensity).toBeGreaterThanOrEqual(0.35);
    expect(result1.layout.textureDensity).toBeLessThanOrEqual(0.85);
    expect(result1.typography.titleSizePx).toBeGreaterThanOrEqual(38);
    expect(result1.typography.titleSizePx).toBeLessThanOrEqual(46);
  });
});
