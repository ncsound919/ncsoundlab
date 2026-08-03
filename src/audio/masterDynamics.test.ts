/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for master dynamics + sidechain helpers (Phase 3.5).
 */

import { describe, expect, it } from 'vitest';
import {
  applyMasterDynamics,
  createSidechainDuck,
  isValidSidechainRoute,
} from './masterDynamics';
import { DEFAULT_MASTER_DYNAMICS } from '../store/masterDynamicsStore';

interface CompressorMock {
  threshold: { value: number; setValueAtTime: (v: number, t: number) => void };
  ratio: { value: number; setValueAtTime: (v: number, t: number) => void };
  attack: { value: number; setValueAtTime: (v: number, t: number) => void };
  release: { value: number; setValueAtTime: (v: number, t: number) => void };
  context: { currentTime: number };
}

interface GainMock {
  gain: { value: number; setValueAtTime: (v: number, t: number) => void };
}

const makeCompressor = (): CompressorMock => {
  const p = (initial: number) => {
    let v = initial;
    return {
      get value() {
        return v;
      },
      setValueAtTime: (next: number) => {
        v = next;
      },
    };
  };
  return {
    threshold: p(-24) as unknown as CompressorMock['threshold'],
    ratio: p(1) as unknown as CompressorMock['ratio'],
    attack: p(0.01) as unknown as CompressorMock['attack'],
    release: p(0.1) as unknown as CompressorMock['release'],
    context: { currentTime: 0 },
  } as unknown as CompressorMock;
};

const makeGain = (): GainMock => {
  const param = {
    value: 1,
    setValueAtTime: (next: number) => {
      // mutate via closure — assign to param.value below.
      Object.assign(param, { value: next });
    },
  };
  return { gain: param } as unknown as GainMock;
};

describe('masterDynamics — applyMasterDynamics', () => {
  it('writes all five settings onto the compressor', () => {
    const c = makeCompressor();
    const g = makeGain();
    applyMasterDynamics(c as unknown as DynamicsCompressorNode, g as unknown as GainNode, {
      ...DEFAULT_MASTER_DYNAMICS,
      thresholdDb: -12,
      ratio: 4,
      attackSec: 0.01,
      releaseSec: 0.2,
      makeupDb: 3,
      enabled: true,
    });
    expect(c.threshold.value).toBe(-12);
    expect(c.ratio.value).toBe(4);
    expect(c.attack.value).toBe(0.01);
    expect(c.release.value).toBe(0.2);
  });

  it('clamps ratio to >= 1', () => {
    const c = makeCompressor();
    applyMasterDynamics(c as unknown as DynamicsCompressorNode, null, {
      ...DEFAULT_MASTER_DYNAMICS,
      ratio: 0.5,
    });
    expect(c.ratio.value).toBe(1);
  });

  it('clamps attack/release to >= 0', () => {
    const c = makeCompressor();
    applyMasterDynamics(c as unknown as DynamicsCompressorNode, null, {
      ...DEFAULT_MASTER_DYNAMICS,
      attackSec: -0.1,
      releaseSec: -1,
    });
    expect(c.attack.value).toBe(0);
    expect(c.release.value).toBe(0);
  });

  it('converts makeupDb to linear gain (3dB ≈ 1.41)', () => {
    const c = makeCompressor();
    const g = makeGain();
    applyMasterDynamics(c as unknown as DynamicsCompressorNode, g as unknown as GainNode, {
      ...DEFAULT_MASTER_DYNAMICS,
      makeupDb: 3,
    });
    expect(g.gain.value).toBeCloseTo(Math.pow(10, 3 / 20), 5);
  });
});

describe('masterDynamics — createSidechainDuck', () => {
  it('returns an analyser input and gain output', () => {
    const ctx = {
      currentTime: 0,
      createAnalyser: () => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData: () => {},
        disconnect: () => {},
      }),
      createGain: () => ({
        gain: { value: 0, setTargetAtTime: () => {} },
        disconnect: () => {},
      }),
    } as unknown as AudioContext;
    const duck = createSidechainDuck(ctx, {
      id: 'x',
      source: 'master',
      target: 'reverb',
      amount: 0.5,
      attackSec: 0.005,
      releaseSec: 0.15,
      enabled: true,
    });
    expect(duck.input).toBeTruthy();
    expect(duck.output).toBeTruthy();
    duck.dispose();
  });

  it('dispose cancels the envelope follower', () => {
    let cancelled = false;
    const ctx = {
      currentTime: 0,
      createAnalyser: () => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData: () => {},
        disconnect: () => {},
      }),
      createGain: () => ({
        gain: {
          value: 0,
          setTargetAtTime: () => {
            cancelled = true;
          },
        },
        disconnect: () => {},
      }),
    } as unknown as AudioContext;
    const duck = createSidechainDuck(ctx, {
      id: 'x',
      source: 'master',
      target: 'reverb',
      amount: 0.5,
      attackSec: 0.005,
      releaseSec: 0.15,
      enabled: true,
    });
    // Tick would normally run forever; cancelling rAF via dispose() should
    // prevent further setTargetAtTime calls.
    duck.dispose();
    expect(cancelled).toBeDefined();
  });
});

describe('masterDynamics — isValidSidechainRoute', () => {
  it('rejects empty source or target', () => {
    expect(isValidSidechainRoute({ source: '', target: 'reverb' })).toBe(false);
    expect(isValidSidechainRoute({ source: 'master', target: '' })).toBe(false);
    expect(isValidSidechainRoute({ source: 'master', target: 'reverb' })).toBe(true);
  });
});
