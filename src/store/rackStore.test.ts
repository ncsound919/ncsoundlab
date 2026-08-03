/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useRackStore } from './rackStore';

describe('rackStore', () => {
  beforeEach(() => {
    useRackStore.setState({
      modules: [],
      history: { past: [], future: [] },
      activeAbState: 'A',
      snapshotA: [],
      snapshotB: [],
      routingMode: 'serial',
      zeroLatency: false,
    });
  });

  it('adds and removes modules correctly', () => {
    const store = useRackStore.getState();
    expect(store.modules.length).toBe(0);

    store.addModule('eq');
    expect(useRackStore.getState().modules.length).toBe(1);
    const addedId = useRackStore.getState().modules[0].id;

    store.removeModule(addedId);
    expect(useRackStore.getState().modules.length).toBe(0);
  });

  it('updates module settings', () => {
    const store = useRackStore.getState();
    store.addModule('compressor');
    const modId = useRackStore.getState().modules[0].id;

    store.updateModule(modId, { enabled: false });
    expect(useRackStore.getState().modules[0].enabled).toBe(false);
  });

  it('duplicates module correctly', () => {
    const store = useRackStore.getState();
    store.addModule('delay');
    const modId = useRackStore.getState().modules[0].id;

    store.duplicateModule(modId);
    const modules = useRackStore.getState().modules;
    expect(modules.length).toBe(2);
    expect(modules[0].type).toBe('delay');
    expect(modules[1].type).toBe('delay');
    expect(modules[0].id).not.toBe(modules[1].id);
  });

  it('handles undo and redo correctly', () => {
    const store = useRackStore.getState();
    
    // Add first module
    store.addModule('saturator');
    expect(useRackStore.getState().modules.length).toBe(1);

    // Add second module
    store.addModule('tape');
    expect(useRackStore.getState().modules.length).toBe(2);

    // Undo should go back to 1 module
    store.undo();
    expect(useRackStore.getState().modules.length).toBe(1);
    expect(useRackStore.getState().modules[0].type).toBe('saturator');

    // Redo should go back to 2 modules
    store.redo();
    expect(useRackStore.getState().modules.length).toBe(2);
    expect(useRackStore.getState().modules[1].type).toBe('tape');
  });

  it('supports A/B switching and copying to A and B', () => {
    const store = useRackStore.getState();
    store.addModule('limiter');
    
    store.copyToA();
    expect(useRackStore.getState().snapshotA.length).toBe(1);

    store.switchToB();
    expect(useRackStore.getState().activeAbState).toBe('B');

    store.addModule('exciter');
    store.copyToB();
    expect(useRackStore.getState().snapshotB.length).toBe(1);

    store.switchToA();
    expect(useRackStore.getState().activeAbState).toBe('A');
    expect(useRackStore.getState().modules[0].type).toBe('limiter');
  });

  it('supports routing mode and zero latency toggles', () => {
    const store = useRackStore.getState();
    store.setRoutingMode('parallel');
    expect(useRackStore.getState().routingMode).toBe('parallel');

    store.setZeroLatency(true);
    expect(useRackStore.getState().zeroLatency).toBe(true);
  });

  it('verifies default settings for various module types', () => {
    const store = useRackStore.getState();
    const types = [
      'eq', 'compressor', 'limiter', 'clipper', 'saturator',
      'tape', 'exciter', 'delay', 'reverb', 'chorus',
      'flanger', 'phaser', 'tremolo', 'imager'
    ] as const;

    types.forEach(type => {
      store.addModule(type);
    });

    const modules = useRackStore.getState().modules;
    expect(modules.length).toBe(types.length);
    modules.forEach((mod, index) => {
      expect(mod.type).toBe(types[index]);
      expect(mod.settings).toBeDefined();
    });
  });
});
