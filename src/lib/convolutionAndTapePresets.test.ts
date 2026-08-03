import { describe, it, expect } from 'vitest';
import { CONVOLUTION_REVERB_PRESETS, TAPE_DELAY_PRESETS } from './convolutionAndTapePresets';

describe('convolutionAndTapePresets', () => {
  it('defines valid convolution presets with correct properties', () => {
    expect(CONVOLUTION_REVERB_PRESETS).toBeInstanceOf(Array);
    expect(CONVOLUTION_REVERB_PRESETS.length).toBeGreaterThan(0);

    const first = CONVOLUTION_REVERB_PRESETS[0];
    expect(first.id).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.category).toBeDefined();
    expect(first.preEq).toBeDefined();
    expect(first.irProcessing).toBeDefined();
    expect(first.mix).toBeDefined();
    expect(first.postEq).toBeDefined();
    expect(first.nonlinearTail).toBeDefined();
  });

  it('defines valid tape delay presets with correct properties', () => {
    expect(TAPE_DELAY_PRESETS).toBeInstanceOf(Array);
    expect(TAPE_DELAY_PRESETS.length).toBeGreaterThan(0);

    const first = TAPE_DELAY_PRESETS[0];
    expect(first.id).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.category).toBeDefined();
    expect(first.preFilter).toBeDefined();
    expect(first.saturation).toBeDefined();
    expect(first.heads).toBeDefined();
    expect(first.modulation).toBeDefined();
    expect(first.feedback).toBeDefined();
    expect(first.mix).toBeDefined();
  });
});
