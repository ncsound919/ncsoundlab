import { describe, it, expect } from 'vitest';
import { COMBINATOR_PRESETS, searchPresets } from './combinatorPresets';

describe('combinatorPresets', () => {
  it('has deep variety (>=70)', () => {
    expect(COMBINATOR_PRESETS.length).toBeGreaterThanOrEqual(70);
  });

  it('each preset has required fields', () => {
    for (const p of COMBINATOR_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.theoryNote).toBeTruthy();
      expect(p.state).toBeTruthy();
      expect(Array.isArray(p.state.slots)).toBe(true);
      expect(typeof p.state.masterMix).toBe('number');
      expect(typeof p.state.bpm).toBe('number');
    }
  });

  it('search works', () => {
    const r = searchPresets('wobble');
    expect(r.length).toBeGreaterThan(0);
  });

  it('ids unique', () => {
    const ids = COMBINATOR_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
