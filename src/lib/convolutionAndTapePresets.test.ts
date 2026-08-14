import { describe, it, expect } from 'vitest';
import { CONVOLUTION_REVERB_PRESETS, TAPE_DELAY_PRESETS } from './convolutionAndTapePresets';

const CONV_CATEGORIES = ['room', 'hall', 'plate', 'special', 'fx'] as const;
const TAPE_CATEGORIES = ['utility', 'space', 'character', 'fx'] as const;
const TAPE_FILTER_TYPES = ['lp', 'hp', 'band'] as const;

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

  it('all preset ids are unique (across both arrays)', () => {
    const convIds = CONVOLUTION_REVERB_PRESETS.map((p) => p.id);
    const tapeIds = TAPE_DELAY_PRESETS.map((p) => p.id);
    expect(new Set(convIds).size).toBe(convIds.length);
    expect(new Set(tapeIds).size).toBe(tapeIds.length);
    // No cross-collision between convolution and tape ids either.
    const all = [...convIds, ...tapeIds];
    expect(new Set(all).size).toBe(all.length);
  });

  it('convolution preset categories are valid enum values', () => {
    for (const p of CONVOLUTION_REVERB_PRESETS) {
      expect(CONV_CATEGORIES).toContain(p.category);
    }
  });

  it('convolution IR processing params are in safe ranges', () => {
    for (const p of CONVOLUTION_REVERB_PRESETS) {
      expect(p.irProcessing.stretchFactor).toBeGreaterThanOrEqual(0.2);
      expect(p.irProcessing.stretchFactor).toBeLessThanOrEqual(3.0);
      expect(Number.isFinite(p.irProcessing.irLowShelfDb)).toBe(true);
      expect(Number.isFinite(p.irProcessing.irHighShelfDb)).toBe(true);
      expect(['fullband', 'multiband']).toContain(p.irProcessing.mode);
    }
  });

  it('multiband convolution presets always define all three IRs', () => {
    const multiband = CONVOLUTION_REVERB_PRESETS.filter((p) => p.irProcessing.mode === 'multiband');
    expect(multiband.length).toBeGreaterThan(0);
    for (const p of multiband) {
      expect(p.irProcessing.multibandIRs).toBeDefined();
      const irs = p.irProcessing.multibandIRs!;
      expect(typeof irs.low).toBe('string');
      expect(typeof irs.mid).toBe('string');
      expect(typeof irs.high).toBe('string');
      expect(irs.low.length).toBeGreaterThan(0);
      expect(irs.mid.length).toBeGreaterThan(0);
      expect(irs.high.length).toBeGreaterThan(0);
    }
  });

  it('fullband convolution presets do not carry multiband IRs', () => {
    for (const p of CONVOLUTION_REVERB_PRESETS) {
      if (p.irProcessing.mode === 'fullband') {
        expect(p.irProcessing.multibandIRs).toBeUndefined();
      }
    }
  });

  it('convolution mix dry/wet are in [0, 1]', () => {
    for (const p of CONVOLUTION_REVERB_PRESETS) {
      expect(p.mix.dry).toBeGreaterThanOrEqual(0);
      expect(p.mix.dry).toBeLessThanOrEqual(1);
      expect(p.mix.wet).toBeGreaterThanOrEqual(0);
      expect(p.mix.wet).toBeLessThanOrEqual(1);
    }
  });

  it('convolution preEq hpFreq and postEq dampingFreq are positive', () => {
    for (const p of CONVOLUTION_REVERB_PRESETS) {
      expect(p.preEq.hpFreq).toBeGreaterThan(0);
      expect(p.postEq.dampingFreq).toBeGreaterThan(0);
    }
  });

  it('tape delay categories are valid enum values', () => {
    for (const p of TAPE_DELAY_PRESETS) {
      expect(TAPE_CATEGORIES).toContain(p.category);
    }
  });

  it('tape head count matches times/levels/pans array lengths', () => {
    for (const p of TAPE_DELAY_PRESETS) {
      expect(p.heads.count).toBe(p.heads.timesMs.length);
      expect(p.heads.count).toBe(p.heads.levels.length);
      expect(p.heads.count).toBe(p.heads.pans.length);
      expect(p.heads.count).toBeGreaterThan(0);
      // times must be positive, levels in (0, 1], pans in [-1, 1]
      for (const t of p.heads.timesMs) expect(t).toBeGreaterThan(0);
      for (const l of p.heads.levels) expect(l).toBeGreaterThan(0);
      for (const l of p.heads.levels) expect(l).toBeLessThanOrEqual(1);
      for (const pan of p.heads.pans) {
        expect(pan).toBeGreaterThanOrEqual(-1);
        expect(pan).toBeLessThanOrEqual(1);
      }
      expect(['free', 'tempo']).toContain(p.heads.syncMode);
    }
  });

  it('tape feedback amount is in (0, 1) and filterType valid', () => {
    for (const p of TAPE_DELAY_PRESETS) {
      expect(p.feedback.amount).toBeGreaterThan(0);
      expect(p.feedback.amount).toBeLessThan(1);
      expect(TAPE_FILTER_TYPES).toContain(p.feedback.filterType);
      expect(p.feedback.filterFreq).toBeGreaterThan(0);
    }
  });

  it('tape mix dry/wet are in [0, 1]', () => {
    for (const p of TAPE_DELAY_PRESETS) {
      expect(p.mix.dry).toBeGreaterThanOrEqual(0);
      expect(p.mix.dry).toBeLessThanOrEqual(1);
      expect(p.mix.wet).toBeGreaterThanOrEqual(0);
      expect(p.mix.wet).toBeLessThanOrEqual(1);
    }
  });

  it('tape modulation depths are non-negative', () => {
    for (const p of TAPE_DELAY_PRESETS) {
      expect(p.modulation.wowDepthMs).toBeGreaterThanOrEqual(0);
      expect(p.modulation.wowRateHz).toBeGreaterThanOrEqual(0);
      expect(p.modulation.flutterDepthMs).toBeGreaterThanOrEqual(0);
      expect(p.modulation.flutterRateHz).toBeGreaterThanOrEqual(0);
    }
  });

  it('convolution presets with reverse IR have higher wet mix (design intent)', () => {
    const reversed = CONVOLUTION_REVERB_PRESETS.filter((p) => p.irProcessing.reverse);
    if (reversed.length) {
      for (const p of reversed) {
        expect(p.mix.wet).toBeGreaterThanOrEqual(0.4);
      }
    }
  });
});
