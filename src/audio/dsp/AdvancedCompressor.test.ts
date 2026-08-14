/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/dsp/AdvancedCompressor.ts` — the advanced compressor
 * preset model. This module is configuration-only (the real-time DSP graph is
 * built elsewhere), so coverage is: preset merging semantics, immutability,
 * and preset/default integrity (values must stay in ranges the DynamicsCompressor
 * wrapper and UI can consume).
 */

import { describe, expect, it } from 'vitest';
import {
  COMPRESSOR_PRESETS,
  DEFAULT_COMPRESSOR_SETTINGS,
  applyCompressorPreset,
  type CompressorMode,
} from './AdvancedCompressor';

const VALID_MODES: CompressorMode[] = ['vca', 'opto', 'fet', 'clean'];

describe('applyCompressorPreset', () => {
  it('overlays preset settings on top of current settings', () => {
    const result = applyCompressorPreset(DEFAULT_COMPRESSOR_SETTINGS, COMPRESSOR_PRESETS[0]);
    expect(result.threshold).toBe(-18);
    expect(result.ratio).toBe(2);
    expect(result.mode).toBe('vca');
    // Fields not in the preset are inherited from the current settings.
    expect(result.topology).toBe(DEFAULT_COMPRESSOR_SETTINGS.topology);
    expect(result.detector).toBe(DEFAULT_COMPRESSOR_SETTINGS.detector);
    expect(result.oversampling).toBe(DEFAULT_COMPRESSOR_SETTINGS.oversampling);
  });

  it('does not mutate the current settings object', () => {
    const before = { ...DEFAULT_COMPRESSOR_SETTINGS };
    applyCompressorPreset(DEFAULT_COMPRESSOR_SETTINGS, COMPRESSOR_PRESETS[2]);
    expect(DEFAULT_COMPRESSOR_SETTINGS).toEqual(before);
  });

  it('handles a partial preset (only threshold) and keeps the rest', () => {
    const result = applyCompressorPreset(DEFAULT_COMPRESSOR_SETTINGS, {
      id: 'partial',
      label: 'Partial',
      settings: { threshold: -30 },
    });
    expect(result.threshold).toBe(-30);
    expect(result.ratio).toBe(DEFAULT_COMPRESSOR_SETTINGS.ratio);
    expect(result.mixPercent).toBe(DEFAULT_COMPRESSOR_SETTINGS.mixPercent);
  });
});

describe('COMPRESSOR_PRESETS', () => {
  it('has unique ids and non-empty labels', () => {
    const ids = COMPRESSOR_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of COMPRESSOR_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('keeps every preset within usable compressor ranges', () => {
    for (const p of COMPRESSOR_PRESETS) {
      const s = p.settings;
      expect(s.mode).toBeDefined();
      expect(VALID_MODES).toContain(s.mode);
      expect(s.threshold!).toBeLessThanOrEqual(0);
      expect(s.ratio!).toBeGreaterThanOrEqual(1);
      expect(s.attackMs!).toBeGreaterThan(0);
      expect(s.releaseMs!).toBeGreaterThan(0);
      expect(s.makeupGain!).toBeGreaterThan(0);
      expect(s.mixPercent!).toBeGreaterThanOrEqual(0);
      expect(s.mixPercent!).toBeLessThanOrEqual(100);
      expect(Number.isFinite(s.threshold!)).toBe(true);
      expect(Number.isFinite(s.ratio!)).toBe(true);
    }
  });
});

describe('DEFAULT_COMPRESSOR_SETTINGS', () => {
  it('is complete and within usable ranges', () => {
    const s = DEFAULT_COMPRESSOR_SETTINGS;
    expect(VALID_MODES).toContain(s.mode);
    expect(s.threshold).toBeLessThanOrEqual(0);
    expect(s.ratio).toBeGreaterThanOrEqual(1);
    expect(s.attackMs).toBeGreaterThan(0);
    expect(s.releaseMs).toBeGreaterThan(0);
    expect(s.makeupGain).toBeGreaterThan(0);
    expect(s.mixPercent).toBeGreaterThanOrEqual(0);
    expect(s.mixPercent).toBeLessThanOrEqual(100);
    for (const key of ['topology', 'detector', 'kneeMode', 'oversampling'] as const) {
      expect(s[key]).toBeDefined();
    }
  });
});
