/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for stem export helpers (Phase 4.1).
 */

import { describe, expect, it } from 'vitest';
import {
  buildStemBundleLayout,
  buildStemFilename,
  DEFAULT_STEM_OPTIONS,
  sanitizeStemOptions,
  sanitiseTrackName,
  secondsToTimecode,
} from './stemExport';

describe('stemExport — sanitiseTrackName', () => {
  it('replaces unsupported characters with dashes', () => {
    expect(sanitiseTrackName('Kick Drum 808!')).toBe('Kick-Drum-808');
  });

  it('collapses repeated dashes and trims edges', () => {
    expect(sanitiseTrackName('---hi---there---')).toBe('hi-there');
  });

  it('strips leading digits so the track name starts with a letter', () => {
    expect(sanitiseTrackName('808 kick')).toBe('kick');
  });

  it('falls back to Untitled for empty/invalid names', () => {
    expect(sanitiseTrackName('')).toBe('Untitled');
    expect(sanitiseTrackName('!!!')).toBe('Untitled');
  });
});

describe('stemExport — buildStemFilename', () => {
  it('produces a Pro Tools-style Track filename', () => {
    expect(buildStemFilename('Kick', 0, 1)).toBe('Kick_01_Take01.wav');
  });

  it('zero-pads index and take', () => {
    expect(buildStemFilename('Bass', 11, 3)).toBe('Bass_12_Take03.wav');
  });

  it('sanitises the layer name', () => {
    expect(buildStemFilename('Snare (Top)', 0, 1)).toBe('Snare-Top_01_Take01.wav');
  });
});

describe('stemExport — buildStemBundleLayout', () => {
  it('lays out the standard Pro Tools import directory', () => {
    const layout = buildStemBundleLayout('My Song');
    expect(layout.rootDir).toBe('My-Song');
    expect(layout.stemsDir).toBe('My-Song/Stems');
    expect(layout.masterFilename).toBe('My-Song_Master.wav');
    expect(layout.markersFilename).toBe('My-Song/Markers.csv');
    expect(layout.readmeFilename).toBe('My-Song/README.txt');
  });
});

describe('stemExport — sanitizeStemOptions', () => {
  it('returns defaults when nothing provided', () => {
    const opt = sanitizeStemOptions(undefined);
    expect(opt.sampleRate).toBe(DEFAULT_STEM_OPTIONS.sampleRate);
    expect(opt.bitDepth).toBe(DEFAULT_STEM_OPTIONS.bitDepth);
  });

  it('falls back to defaults for unsupported values', () => {
    const opt = sanitizeStemOptions({ sampleRate: 22050 as never, bitDepth: 8 as never });
    expect(opt.sampleRate).toBe(48000);
    expect(opt.bitDepth).toBe(24);
  });

  it('preserves valid overrides', () => {
    const opt = sanitizeStemOptions({ sampleRate: 96000, bitDepth: 32 });
    expect(opt.sampleRate).toBe(96000);
    expect(opt.bitDepth).toBe(32);
  });
});

describe('stemExport — secondsToTimecode', () => {
  it('formats at 30fps by default', () => {
    expect(secondsToTimecode(1)).toBe('00:00:01:00');
    expect(secondsToTimecode(65.5)).toBe('00:01:05:15');
  });

  it('clamps negative input', () => {
    expect(secondsToTimecode(-10)).toBe('00:00:00:00');
  });

  it('respects fps', () => {
    expect(secondsToTimecode(1, 60)).toBe('00:00:01:00');
    expect(secondsToTimecode(2, 60)).toBe('00:00:02:00');
  });
});
