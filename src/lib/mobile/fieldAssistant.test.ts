/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  interpretSoundDesignPrompt,
  applyAssistantPrompt,
  SOUND_DESIGN_PRESETS,
} from './fieldAssistant';
import { makeGenome } from './genome';

describe('interpretSoundDesignPrompt', () => {
  const baseGenome = makeGenome(100);

  it('recognizes 808 sub kick intent and configures sub layer + lowpass filter', () => {
    const res = interpretSoundDesignPrompt('give me a heavy 808 sub kick', baseGenome);
    expect(res.matchedKeywords).toContain('sub-kick');
    expect(res.edits.layers).toBeDefined();
    expect(res.edits.layers?.some((l) => l.kind === 'sub')).toBe(true);
    expect(res.edits.filter?.type).toBe('lowpass');
    expect(res.edits.transientLockEnabled).toBe(true);
  });

  it('recognizes snare / crack intent and configures noise + body layers', () => {
    const res = interpretSoundDesignPrompt('make it crack like a snare', baseGenome);
    expect(res.matchedKeywords).toContain('snare-crack');
    expect(res.edits.layers?.some((l) => l.kind === 'noise')).toBe(true);
    expect(res.edits.layers?.some((l) => l.kind === 'body')).toBe(true);
    expect(res.edits.filter?.type).toBe('highpass');
  });

  it('recognizes lofi grit intent and applies bitcrush', () => {
    const res = interpretSoundDesignPrompt('crunchy lofi sp1200 texture', baseGenome);
    expect(res.matchedKeywords).toContain('lo-fi');
    expect(res.edits.crush?.bits).toBe(10);
    expect(res.edits.filter?.type).toBe('lohi');
  });

  it('recognizes granular scatter ambient intent', () => {
    const res = interpretSoundDesignPrompt('cloudy ambient grain scatter on tail', baseGenome);
    expect(res.matchedKeywords).toContain('granular-texture');
    expect(res.edits.grain?.scatter).toBeGreaterThan(0.5);
    expect(res.edits.tremolo?.depth).toBeGreaterThan(0);
  });

  it('recognizes cyberpunk slam and underwater sub intents', () => {
    const cyber = interpretSoundDesignPrompt('heavy cyberpunk industrial movie slam', baseGenome);
    expect(cyber.matchedKeywords).toContain('cyberpunk-slam');
    expect(cyber.edits.drive?.amount).toBeGreaterThanOrEqual(0.5);

    const under = interpretSoundDesignPrompt('muffled underwater sub bubble', baseGenome);
    expect(under.matchedKeywords).toContain('underwater-sub');
    expect(under.edits.filter?.highHz).toBeLessThanOrEqual(150);
  });

  it('pitches up and down correctly', () => {
    const up = interpretSoundDesignPrompt('pitch up', baseGenome);
    expect(up.matchedKeywords).toContain('pitch-up');
    expect(up.edits.pitch?.offsetCents).toBe(300);

    const down = interpretSoundDesignPrompt('drop pitch down', baseGenome);
    expect(down.matchedKeywords).toContain('pitch-down');
    expect(down.edits.pitch?.offsetCents).toBe(-300);
  });

  it('has valid predefined presets', () => {
    expect(SOUND_DESIGN_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const preset of SOUND_DESIGN_PRESETS) {
      const res = interpretSoundDesignPrompt(preset.prompt, baseGenome);
      expect(res.matchedKeywords.length).toBeGreaterThan(0);
    }
  });
});

describe('applyAssistantPrompt', () => {
  it('applies edits without violating genome schema bounds', () => {
    const baseGenome = makeGenome(200);
    const result = applyAssistantPrompt('heavy 808 sub kick with warm drive', baseGenome);

    expect(result.updatedGenome.rev).toBe(baseGenome.rev + 1);
    expect(result.updatedGenome.params.layers.some((l) => l.kind === 'sub')).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(result.explanation).toContain('sub');
  });
});
