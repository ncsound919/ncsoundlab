/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chordLabelsToProgression,
  fetchRecourseSong,
  fetchRecourseStyles,
  parseChordLabel,
  recourseSongUrl,
} from './recourseSong';
import { DEFAULT_RECOURSE_BASE, RECOURSE_STYLES } from './recourseEvolution';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recourseSongUrl', () => {
  it('builds the song URL with mode and seed', () => {
    const url = recourseSongUrl(DEFAULT_RECOURSE_BASE, { style: 'jasper-ballad', seed: 3, bars: 8, mode: 'loop' });
    expect(url).toContain('/api/recourse/compose/song.json?');
    expect(url).toContain('style=jasper-ballad');
    expect(url).toContain('seed=3');
    expect(url).toContain('mode=loop');
    expect(url).not.toContain('key=');
  });

  it('includes key and major when provided and trims the base', () => {
    const url = recourseSongUrl('http://box:3050/', { style: 'airplane', seed: 1, mode: 'arr', key: 5, major: true });
    expect(url.startsWith('http://box:3050/api/recourse')).toBe(true);
    expect(url).toContain('key=5');
    expect(url).toContain('major=true');
  });
});

describe('fetchRecourseSong', () => {
  it('returns a validated song', async () => {
    const song = { mode: 'loop', style: 'x', seed: 1, bars: 8, bpm: 90, key: 'Cm', keyPc: 0, major: false, chords: ['Cm7'], events: 10 };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => song })));
    await expect(fetchRecourseSong('http://x')).resolves.toEqual(song);
  });

  it('throws on HTTP errors and bad shapes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(fetchRecourseSong('http://x')).rejects.toThrow(/HTTP 503/);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ nope: 1 }) })));
    await expect(fetchRecourseSong('http://x')).rejects.toThrow(/not a recourse song/i);
  });
});

describe('fetchRecourseStyles', () => {
  it('returns the server list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ styles: ['a', 'b'] }) })));
    await expect(fetchRecourseStyles('http://x')).resolves.toEqual(['a', 'b']);
  });

  it('falls back to the known styles on error or bad payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(fetchRecourseStyles('http://x')).resolves.toEqual([...RECOURSE_STYLES]);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ styles: [1, 2] }) })));
    await expect(fetchRecourseStyles('http://x')).resolves.toEqual([...RECOURSE_STYLES]);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(fetchRecourseStyles('http://x')).resolves.toEqual([...RECOURSE_STYLES]);
  });
});

describe('chord parsing', () => {
  it('splits root and quality', () => {
    expect(parseChordLabel('Cmaj7')).toEqual({ root: 'C', quality: 'maj7' });
    expect(parseChordLabel('F#m7b5')).toEqual({ root: 'F#', quality: 'm7b5' });
    expect(parseChordLabel('Bb')).toEqual({ root: 'Bb', quality: '' });
    expect(parseChordLabel('???')).toEqual({ root: 'C', quality: '' });
  });

  it('converts labels into a progression', () => {
    expect(chordLabelsToProgression(['Cmaj7', 'Am7'], 4)).toEqual([
      { root: 'C', type: 'maj7', duration: 4 },
      { root: 'A', type: 'm7', duration: 4 },
    ]);
  });
});
