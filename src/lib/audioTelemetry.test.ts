/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({ ctx: null as null | Record<string, unknown> }));

vi.mock('./audioEngine', () => ({
  audioEngine: { getContext: () => engine.ctx },
}));

import {
  describeContextState,
  formatLatency,
  formatSampleRate,
  readAudioTelemetry,
} from './audioTelemetry';

beforeEach(() => {
  engine.ctx = null;
});

describe('readAudioTelemetry', () => {
  it('reports unavailable with no context', () => {
    expect(readAudioTelemetry()).toEqual({ state: 'unavailable', sampleRateKHz: null, latencyMs: null });
  });

  it('sums base + output latency and converts the sample rate', () => {
    engine.ctx = { state: 'running', sampleRate: 48000, baseLatency: 0.005, outputLatency: 0.003 };
    expect(readAudioTelemetry()).toEqual({ state: 'running', sampleRateKHz: 48, latencyMs: 8 });
  });

  it('falls back to base latency when output latency is absent', () => {
    engine.ctx = { state: 'suspended', sampleRate: 44100, baseLatency: 0.01 };
    expect(readAudioTelemetry()).toEqual({ state: 'suspended', sampleRateKHz: 44.1, latencyMs: 10 });
  });

  it('reports null latency when the browser gives nothing', () => {
    engine.ctx = { state: 'running', sampleRate: 48000 };
    expect(readAudioTelemetry().latencyMs).toBeNull();
  });
});

describe('formatters', () => {
  it('formats latency at sensible precision', () => {
    expect(formatLatency(null)).toBe('—');
    expect(formatLatency(Number.NaN)).toBe('—');
    expect(formatLatency(8)).toBe('8.0 ms');
    expect(formatLatency(14.4)).toBe('14 ms');
  });

  it('formats sample rate', () => {
    expect(formatSampleRate(null)).toBe('—');
    expect(formatSampleRate(48)).toBe('48.0 kHz');
  });

  it('labels context state', () => {
    expect(describeContextState('running')).toEqual({ label: 'DSP ENGINE: RUNNING', ok: true });
    expect(describeContextState('suspended').ok).toBe(false);
    expect(describeContextState('closed').ok).toBe(false);
    expect(describeContextState('unavailable').ok).toBe(false);
  });
});
