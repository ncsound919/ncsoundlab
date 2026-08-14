/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/theory/quality.ts` (the smart-randomizer scoring rubric)
 * and the Monte Carlo progression generator in `progression.ts`.
 *
 * The statistical sweep at the bottom is the "are we making sonically viable
 * progressions?" check: it generates across every key × scale × mode and
 * asserts the generator stays in-key, varied, and cadential/resolved.
 */

import { describe, expect, it } from 'vitest';
import {
  scoreProgression,
  progressionMetrics,
  progressionEnergy,
  isSonicallyViable,
} from './quality';
import { generateProgression, generateBestProgression } from './progression';
import { makeProgression, progressionChords, voiceChords } from '../musicTheory';
import { NOTE_NAMES_SHARP, getScalePitchClasses } from './pitch';
import type { ScaleType } from './pitch';

const chord = (root: string, type: string, duration = 4): { root: string; type: string; duration: number } =>
  ({ root, type, duration });

describe('scoreProgression (smart-randomizer rubric)', () => {
  it('rewards a V → I authentic cadence', () => {
    const cadence = scoreProgression([chord('G', '7'), chord('C', 'maj')], 'C');
    const staticPair = scoreProgression([chord('G', '7'), chord('G', '7')], 'C');
    expect(cadence).toBeGreaterThan(staticPair);
    // True dominant quality earns the +2 extension.
    expect(cadence).toBeGreaterThan(scoreProgression([chord('G', 'm'), chord('C', 'maj')], 'C'));
  });

  it('rewards a full ii → V → I turnaround above a plain ending', () => {
    const full = scoreProgression([chord('D', 'm7'), chord('G', '7'), chord('C', 'maj')], 'C');
    const plain = scoreProgression([chord('C', 'maj'), chord('F', 'maj'), chord('C', 'maj')], 'C');
    expect(full).toBeGreaterThan(plain);
  });

  it('rewards a plagal IV → I cadence', () => {
    const plagal = scoreProgression([chord('F', 'maj'), chord('C', 'maj')], 'C');
    const aimless = scoreProgression([chord('F', 'maj'), chord('F#', 'maj')], 'C'); // tritone
    expect(plagal).toBeGreaterThan(aimless);
  });

  it('penalizes aimless tritone root motion', () => {
    const tritone = scoreProgression([chord('C', 'maj'), chord('F#', 'maj'), chord('C', 'maj')], 'C');
    const fifths = scoreProgression([chord('C', 'maj'), chord('G', 'maj'), chord('C', 'maj')], 'C');
    expect(fifths).toBeGreaterThan(tritone);
  });

  it('rewards starting and ending on the tonic', () => {
    const anchored = scoreProgression([chord('C', 'maj'), chord('F', 'maj'), chord('C', 'maj')], 'C');
    const unanchored = scoreProgression([chord('D', 'm'), chord('G', '7'), chord('E', 'm')], 'C');
    expect(anchored).toBeGreaterThan(unanchored);
  });

  it('gives no credit for single-chord or empty input', () => {
    expect(scoreProgression([], 'C')).toBe(0);
    expect(scoreProgression([chord('C', 'maj')], 'C')).toBe(0);
  });

  it('works in minor keys (V→i still detected)', () => {
    const minorCadence = scoreProgression([chord('G', '7'), chord('A', 'm')], 'A');
    const minorStatic = scoreProgression([chord('G', '7'), chord('G', '7')], 'A');
    expect(minorCadence).toBeGreaterThan(minorStatic);
  });
});

describe('progressionMetrics / progressionEnergy', () => {
  const prog = [chord('C', 'maj'), chord('F', 'maj'), chord('G', '7'), chord('C', 'maj')];

  it('reports structural facts about a classic I–IV–V–I', () => {
    const m = progressionMetrics(prog, 'C');
    expect(m.startsOnTonic).toBe(true);
    expect(m.endsOnTonic).toBe(true);
    expect(m.hasDominant).toBe(true);
    expect(m.hasCadence).toBe(true);
    expect(m.cadences).toBeGreaterThanOrEqual(1);
    expect(m.uniqueChords).toBe(3);
    expect(m.inKeyRatio).toBe(1);
  });

  it('voice-leading cost is finite and non-negative', () => {
    const m = progressionMetrics(prog, 'C');
    expect(m.voiceLeadingCost).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(m.voiceLeadingCost)).toBe(true);
  });

  it('harmonic energy rewards extensions and variety', () => {
    const plain = progressionEnergy([chord('C', 'maj'), chord('C', 'maj'), chord('C', 'maj')]);
    const rich = progressionEnergy([chord('C', 'maj9'), chord('A', 'm7'), chord('D', '7#9')]);
    expect(rich).toBeGreaterThan(plain);
  });
});

describe('isSonicallyViable', () => {
  it('accepts a resolving, varied progression', () => {
    const prog = [chord('C', 'maj'), chord('F', 'maj'), chord('G', '7'), chord('C', 'maj')];
    expect(isSonicallyViable(prog, 'C')).toBe(true);
  });

  it('rejects a one-chord vamp', () => {
    const vamp = [chord('C', 'maj'), chord('C', 'maj'), chord('C', 'maj'), chord('C', 'maj')];
    expect(isSonicallyViable(vamp, 'C')).toBe(false);
  });

  it('rejects a progression that never resolves and is not anchored', () => {
    const wandering = [chord('D', 'm'), chord('E', 'm'), chord('A', '7'), chord('B', 'm')];
    // B minor is the leading-tone chord in C; never reaches C, no cadence to it.
    expect(isSonicallyViable(wandering, 'C')).toBe(false);
  });

  it('rejects progressions that are mostly out of key', () => {
    const outOfKey = [chord('C#', 'maj'), chord('F#', 'maj'), chord('C', 'maj'), chord('G', '7')];
    expect(isSonicallyViable(outOfKey, 'C')).toBe(false);
  });
});

describe('generateBestProgression (Monte Carlo)', () => {
  it('is deterministic for the same seed and trial count', () => {
    const a = generateBestProgression({ key: 'C', scaleType: 'major', bars: 8, seed: 42, trials: 8 });
    const b = generateBestProgression({ key: 'C', scaleType: 'major', bars: 8, seed: 42, trials: 8 });
    expect(a).toEqual(b);
  });

  it('with trials=1 degrades exactly to generateProgression', () => {
    const opts = { key: 'C', scaleType: 'major' as ScaleType, bars: 8, seed: 42, mode: 'functional' as const };
    expect(generateBestProgression({ ...opts, trials: 1 })).toEqual(generateProgression(opts));
  });

  it('is monotonic: more trials never scores lower (best-of-N superset)', () => {
    const opts = { key: 'G', scaleType: 'major' as ScaleType, bars: 8, seed: 7, mode: 'functional' as const };
    let prevScore = -Infinity;
    for (const trials of [1, 2, 4, 8]) {
      const best = generateBestProgression({ ...opts, trials });
      const s = scoreProgression(best, 'G', 'major');
      expect(s).toBeGreaterThanOrEqual(prevScore);
      prevScore = s;
    }
  });

  it('keeps the output sonically viable and in-key', () => {
    const best = generateBestProgression({ key: 'C', scaleType: 'major', bars: 8, seed: 3, trials: 8 });
    expect(isSonicallyViable(best, 'C', 'major')).toBe(true);
    const cMajor = new Set(getScalePitchClasses(0, 'major'));
    for (const c of best) {
      expect(cMajor.has(NOTE_NAMES_SHARP.indexOf(c.root))).toBe(true);
    }
  });
});

describe('makeProgression wrapper with trials', () => {
  it('accepts trials through the public wrapper and stays deterministic', () => {
    const a = makeProgression('C', { scaleType: 'major', bars: 8, seed: 42, trials: 6 });
    const b = makeProgression('C', { scaleType: 'major', bars: 8, seed: 42, trials: 6 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });

  it('defaults (no trials) to the plain single-draw behavior', () => {
    const plain = makeProgression('C', { scaleType: 'major', bars: 8, seed: 42 });
    const viaBest = makeProgression('C', { scaleType: 'major', bars: 8, seed: 42, trials: 1 });
    expect(plain).toEqual(viaBest);
  });
});

// ---------------------------------------------------------------------------
// Statistical sweep — "is the engine producing sonically viable progressions?"
// Generates across every key × scale × mode × complexity and asserts the
// generator stays in-key, varied, and resolves. Also shows that Monte Carlo
// selection measurably raises the mean quality score and viability rate.
// ---------------------------------------------------------------------------

const KEYS = NOTE_NAMES_SHARP; // 12 keys
const SCALES: ScaleType[] = [
  'major', 'natural_minor', 'harmonic_minor', 'melodic_minor',
  'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
];
const MODES = ['functional', 'section'] as const;
const COMPLEXITIES = [0, 1, 2] as const;
const SEEDS = [1, 2, 3];

function sweep(trials: number) {
  let total = 0;
  let inKey = 0;
  let varied = 0;
  let viable = 0;
  let cadencedOrResolved = 0;
  let scoreSum = 0;
  let worst: { key: string; scale: ScaleType; mode: string; score: number; prog: string[] } | null = null;

  for (const key of KEYS) {
    for (const scale of SCALES) {
      const scalePcs = getScalePitchClasses(NOTE_NAMES_SHARP.indexOf(key), scale);
      for (const mode of MODES) {
        for (const complexity of COMPLEXITIES) {
          for (const seed of SEEDS) {
            const prog = generateBestProgression({ key, scaleType: scale, bars: 8, mode, complexity, seed, trials });
            total++;
            const m = progressionMetrics(prog, key, scale);
            const allInKey = prog.every((c) => scalePcs.includes(NOTE_NAMES_SHARP.indexOf(c.root)));
            if (allInKey) inKey++;
            if (m.uniqueChords >= 2) varied++;
            if (isSonicallyViable(prog, key, scale)) viable++;
            if (m.hasCadence || m.endsOnTonic) cadencedOrResolved++;
            scoreSum += m.score;
            if (!worst || m.score < worst.score) {
              worst = { key, scale, mode, score: m.score, prog: prog.map((c) => `${c.root}${c.type}`) };
            }
          }
        }
      }
    }
  }
  return {
    total,
    inKeyPct: (inKey / total) * 100,
    variedPct: (varied / total) * 100,
    viablePct: (viable / total) * 100,
    resolvedPct: (cadencedOrResolved / total) * 100,
    meanScore: scoreSum / total,
    worst,
  };
}

describe('statistical sweep over keys × scales × modes', () => {
  const single = sweep(1);
  const monte = sweep(8);

  it('every generated progression stays in the requested key', () => {
    expect(single.inKeyPct).toBe(100);
    expect(monte.inKeyPct).toBe(100);
  });

  it('every progression has at least two distinct chords', () => {
    expect(single.variedPct).toBe(100);
    expect(monte.variedPct).toBe(100);
  });

  it('almost every progression resolves (cadence or ends on tonic)', () => {
    expect(single.resolvedPct).toBeGreaterThanOrEqual(85);
    expect(monte.resolvedPct).toBeGreaterThanOrEqual(85);
  });

  it('the large majority are sonically viable', () => {
    expect(single.viablePct).toBeGreaterThanOrEqual(80);
    expect(monte.viablePct).toBeGreaterThanOrEqual(80);
  });

  it('Monte Carlo selection raises the mean quality score', () => {
    // Log so the improvement is visible in the test output.
    console.log(`[theory sweep] trials=1  → mean score ${single.meanScore.toFixed(2)}, viable ${single.viablePct.toFixed(1)}%`);
    console.log(`[theory sweep] trials=8  → mean score ${monte.meanScore.toFixed(2)}, viable ${monte.viablePct.toFixed(1)}%`);
    console.log(`[theory sweep] worst trials=1:`, single.worst);
    expect(monte.meanScore).toBeGreaterThan(single.meanScore);
  });

  it('makeProgression + voiceChords still produce smooth, playable voicings', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 8, mode: 'functional', seed: 42, trials: 6 });
    const voicings = voiceChords(progressionChords(prog), 4);
    expect(voicings.length).toBe(prog.length);
    for (const v of voicings) {
      expect(v.notes.length).toBeGreaterThan(0);
      for (let i = 1; i < v.notes.length; i++) expect(v.notes[i]).toBeGreaterThan(v.notes[i - 1]);
    }
  });
});
