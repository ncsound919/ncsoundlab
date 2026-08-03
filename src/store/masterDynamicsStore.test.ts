/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the master dynamics + sidechain store (Phase 3.5).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useMasterDynamicsStore } from './masterDynamicsStore';

describe('masterDynamicsStore', () => {
  beforeEach(() => {
    useMasterDynamicsStore.getState().reset();
  });

  it('starts with default settings and no sidechains', () => {
    const s = useMasterDynamicsStore.getState();
    expect(s.settings.thresholdDb).toBe(-0.5);
    expect(s.settings.ratio).toBe(20);
    expect(s.sidechains).toEqual([]);
  });

  it('setSettings merges partial updates', () => {
    useMasterDynamicsStore.getState().setSettings({ thresholdDb: -10, ratio: 4 });
    const s = useMasterDynamicsStore.getState();
    expect(s.settings.thresholdDb).toBe(-10);
    expect(s.settings.ratio).toBe(4);
    expect(s.settings.attackSec).toBe(0.002);
  });

  it('addSidechain appends and assigns an id', () => {
    const id = useMasterDynamicsStore.getState().addSidechain({
      source: 'layer-1',
      target: 'reverb',
      amount: 0.5,
      attackSec: 0.005,
      releaseSec: 0.15,
      enabled: true,
    });
    expect(id).toBeTruthy();
    expect(useMasterDynamicsStore.getState().sidechains).toHaveLength(1);
    expect(useMasterDynamicsStore.getState().sidechains[0].id).toBe(id);
  });

  it('updateSidechain mutates fields', () => {
    const id = useMasterDynamicsStore.getState().addSidechain({
      source: 'layer-1',
      target: 'reverb',
      amount: 0.5,
      attackSec: 0.005,
      releaseSec: 0.15,
      enabled: true,
    });
    useMasterDynamicsStore.getState().updateSidechain(id, { amount: 0.9, enabled: false });
    const route = useMasterDynamicsStore.getState().sidechains[0];
    expect(route.amount).toBe(0.9);
    expect(route.enabled).toBe(false);
  });

  it('removeSidechain drops the route', () => {
    const id = useMasterDynamicsStore.getState().addSidechain({
      source: 'layer-1',
      target: 'reverb',
      amount: 0.5,
      attackSec: 0.005,
      releaseSec: 0.15,
      enabled: true,
    });
    useMasterDynamicsStore.getState().removeSidechain(id);
    expect(useMasterDynamicsStore.getState().sidechains).toEqual([]);
  });

  it('reset clears settings and routes', () => {
    useMasterDynamicsStore.getState().setSettings({ thresholdDb: -30 });
    useMasterDynamicsStore.getState().addSidechain({
      source: 'layer-1',
      target: 'reverb',
      amount: 0.5,
      attackSec: 0.005,
      releaseSec: 0.15,
      enabled: true,
    });
    useMasterDynamicsStore.getState().reset();
    expect(useMasterDynamicsStore.getState().settings.thresholdDb).toBe(-0.5);
    expect(useMasterDynamicsStore.getState().sidechains).toEqual([]);
  });
});
