import { describe, expect, it } from 'vitest';
import { synthLayerFor, patternFor, isRecoursePiece, RecoursePiece } from './recourseBridge';

const piece: RecoursePiece = {
  format: 'recourse-soundlab-piece',
  version: 1,
  style: 'steely-dan',
  title: 'test loop',
  bpm: 96,
  bars: 8,
  headChord: { rootPc: 9, quality: 'm11', rootName: 'A' },
  layers: [
    { id: 'keys0', name: 'Keys voice 1', role: 'keysVoice', kind: 'synth', midi: 57 },
    { id: 'keys1', name: 'Keys voice 2', role: 'keysVoice', kind: 'synth', midi: 60 },
    { id: 'bass', name: 'Bass', role: 'bass', kind: 'synth', midi: 33 },
    { id: 'kick', name: 'kick', role: 'kick', kind: 'synth' },
  ],
  pattern: {
    keys0: Array.from({ length: 16 }, (_, i) => ({ on: i === 0, note: 57, duration: 16 })),
    keys1: Array.from({ length: 16 }, (_, i) => ({ on: i === 0, note: 60, duration: 16 })),
    bass: Array.from({ length: 16 }, (_, i) => ({ on: i === 0, note: 33, duration: 16 })),
    kick: Array.from({ length: 16 }, (_, i) => ({ on: i % 4 === 0 })),
  },
  chainBars: 8,
};

describe('recourse bridge hydrate (pure)', () => {
  it('builds synth SoundLayers with stable ids and a valid synth patch', () => {
    for (const pl of piece.layers) {
      const layer = synthLayerFor(pl);
      expect(layer.id).toBe(pl.id);
      expect(layer.type).toBe('synth');
      expect(layer.enabled).toBe(true);
      expect(layer.synth?.oscType).toBeTruthy(); // role preset applied over defaults
    }
  });

  it('builds a 16-step Pattern A keyed by the layer ids', () => {
    const p = patternFor(piece);
    expect(p.id).toBe('A');
    expect(p.stepLength).toBe(16);
    expect(p.bpm).toBe(96);
    expect(Object.keys(p.layerRows).sort()).toEqual(['bass', 'keys0', 'keys1', 'kick'].sort());
    expect(p.layerRows.bass).toHaveLength(16);
    expect(p.layerRows.keys0[0]).toMatchObject({ on: true, note: 57 });
  });

  it('clamps bpm into SoundLab range', () => {
    expect(patternFor({ ...piece, bpm: 12 }).bpm).toBe(60);
    expect(patternFor({ ...piece, bpm: 500 }).bpm).toBe(240);
  });

  it('recognises the contract', () => {
    expect(isRecoursePiece(piece)).toBe(true);
    expect(isRecoursePiece({ hello: 'world' })).toBe(false);
    expect(isRecoursePiece(null)).toBe(false);
  });
});
