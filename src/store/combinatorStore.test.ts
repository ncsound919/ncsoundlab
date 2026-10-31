import { describe, it, expect } from 'vitest';
import { useCombinatorStore } from './combinatorStore';

describe('combinatorStore', () => {
  it('adds and removes slots', () => {
    // use store via getState
    const store = useCombinatorStore.getState();
    store.reset();
    store.addSlot('a');
    store.addSlot('b');
    expect(useCombinatorStore.getState().slots.map((s) => s.id)).toEqual(['a', 'b']);
    store.removeSlot('a');
    expect(useCombinatorStore.getState().slots.map((s) => s.id)).toEqual(['b']);
  });

  it('updates slot fields', () => {
    const store = useCombinatorStore.getState();
    store.reset();
    store.addSlot('x');
    store.updateSlot('x', { mix: 0.5, locked: true });
    const s = useCombinatorStore.getState().slots[0];
    expect(s.mix).toBe(0.5);
    expect(s.locked).toBe(true);
  });

  it('reorders slots', () => {
    const store = useCombinatorStore.getState();
    store.reset();
    store.addSlot('a');
    store.addSlot('b');
    store.addSlot('c');
    store.reorderSlots(['c', 'a', 'b']);
    expect(useCombinatorStore.getState().slots.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('sets masterMix, bpm, tightMode', () => {
    const store = useCombinatorStore.getState();
    store.reset();
    store.setMasterMix(0.25);
    store.setBpm(140);
    store.setTightMode(false);
    const s = useCombinatorStore.getState();
    expect(s.masterMix).toBe(0.25);
    expect(s.bpm).toBe(140);
    expect(s.tightMode).toBe(false);
  });

  it('loadState replaces state', () => {
    const store = useCombinatorStore.getState();
    store.reset();
    store.loadState({
      slots: [],
      routes: [],
      masterMix: 0.5,
      bpm: 100,
      tightMode: true,
      xyAssign: { x: 'a', y: 'b' },
      morphAmount: 0,
    });
    const s = useCombinatorStore.getState();
    expect(s.masterMix).toBe(0.5);
    expect(s.bpm).toBe(100);
    expect(s.xyAssign).toEqual({ x: 'a', y: 'b' });
  });
});
