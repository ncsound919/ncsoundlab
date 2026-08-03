/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the stems bundle helpers (Phase 4.2).
 */

import { describe, expect, it } from 'vitest';
import {
  buildArrangementMarkers,
  buildBeatMarkers,
  buildMarkersCsv,
  buildReadme,
  encodeUtf8,
} from './stemsBundle';
import type { Arrangement } from '../types';

describe('stemsBundle — buildMarkersCsv', () => {
  it('emits the Pro Tools Markers-from-CSV header', () => {
    const csv = buildMarkersCsv([]);
    expect(csv.startsWith('Name,Start,Length,Timecode\n')).toBe(true);
  });

  it('quotes and escapes marker names', () => {
    const csv = buildMarkersCsv([{ name: 'Beat "1"', startSec: 0 }]);
    expect(csv).toContain('"Beat ""1"""');
  });

  it('collapses newlines in marker names so rows never split', () => {
    const csv = buildMarkersCsv([{ name: 'Beat\n1\r\nA', startSec: 0 }]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2); // header + one data row
    expect(lines[1]).toContain('Beat 1 A');
  });

  it('emits timecodes for each row', () => {
    const csv = buildMarkersCsv([
      { name: 'Intro', startSec: 0 },
      { name: 'Verse', startSec: 8 },
    ]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('00:00:00:00');
    expect(lines[2]).toContain('00:00:08:00');
  });

  it('respects fps', () => {
    const csv = buildMarkersCsv([{ name: 'X', startSec: 1 }], 60);
    expect(csv).toContain('00:00:01:00');
  });
});

describe('stemsBundle — buildBeatMarkers', () => {
  it('emits one marker per beat', () => {
    const rows = buildBeatMarkers(4, 120);
    expect(rows).toHaveLength(4);
    expect(rows[0].startSec).toBe(0);
    expect(rows[1].startSec).toBeCloseTo(0.5);
    expect(rows[3].startSec).toBeCloseTo(1.5);
  });

  it('marks every Nth beat as a bar', () => {
    const rows = buildBeatMarkers(8, 120, 0, 30, { barEvery: 4 });
    expect(rows[0].name).toBe('Beat 1');
    expect(rows[4].name).toBe('Beat 2'); // bar 2
    expect(rows[1].name).toBe('Beat 2'); // beat 2
  });

  it('respects startBeatSec', () => {
    const rows = buildBeatMarkers(2, 60, 5);
    expect(rows[0].startSec).toBe(5);
    expect(rows[1].startSec).toBe(6); // 5 + 1 beat at 60bpm
  });
});

describe('stemsBundle — buildArrangementMarkers', () => {
  it('emits one row per clip with start and length', () => {
    const arrangement: Arrangement = {
      totalBeats: 8,
      clips: [
        { id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false },
        { id: 'c2', patternId: 'B', startBeat: 4, beats: 4, loops: 1, muted: false },
      ],
      tempoMap: [],
    };
    const rows = buildArrangementMarkers(arrangement, 120);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Clip A');
    expect(rows[0].startSec).toBe(0);
    expect(rows[0].lengthSec).toBeCloseTo(2); // 4 beats at 120bpm = 2s
    expect(rows[1].name).toBe('Clip B');
  });
});

describe('stemsBundle — buildReadme', () => {
  it('includes the song title and stems directory', () => {
    const txt = buildReadme('My Song', { stemsDir: 'My-Song/Stems' });
    expect(txt).toContain('My Song');
    expect(txt).toContain('My-Song/Stems');
    expect(txt).toContain('NC Sound Lab');
  });

  it('mentions Pro Tools "Import As Session Tracks"', () => {
    const txt = buildReadme('X', { stemsDir: 'X/Stems' });
    expect(txt).toContain('Import As Session Tracks');
    expect(txt).toContain('Markers.csv');
  });
});

describe('stemsBundle — encodeUtf8', () => {
  it('encodes ASCII as expected', () => {
    const bytes = encodeUtf8('hello');
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });
});
