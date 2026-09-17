/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { detectSkin, SURFACES, surfaceFor } from './surface';

describe('detectSkin', () => {
  it('detects Akai MPD controllers from port names', () => {
    expect(detectSkin(['MPD226'])).toBe('mpd226');
    expect(detectSkin(['MIDIIN4 (MPD226)', 'MIDIIN2 (MPD226)'])).toBe('mpd226');
    expect(detectSkin(['Akai MPD218'])).toBe('mpd218');
  });

  it('treats the MPD232 like the MPD226 control surface', () => {
    expect(detectSkin(['MPD232'])).toBe('mpd226');
  });

  it('falls back to generic for unknown or empty devices', () => {
    expect(detectSkin(['Some Keys'])).toBe('generic');
    expect(detectSkin([])).toBe('generic');
  });
});

describe('SURFACES', () => {
  it('describes the MPD226 control surface', () => {
    expect(SURFACES.mpd226).toMatchObject({
      padBanks: 4, controlBanks: 3, knobs: 4, faders: 4, switches: 4,
    });
    expect(SURFACES.mpd226.transport).toEqual(['play', 'stop', 'record', 'tap']);
  });

  it('describes the MPD218 as pads + knobs only', () => {
    expect(SURFACES.mpd218.faders).toBe(0);
    expect(SURFACES.mpd218.switches).toBe(0);
    expect(SURFACES.mpd218.transport).toEqual([]);
  });

  it('describes a generic controller', () => {
    expect(SURFACES.generic.switches).toBe(0);
    expect(surfaceFor('generic').label).toMatch(/generic/i);
  });
});
