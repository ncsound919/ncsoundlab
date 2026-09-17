/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Live audio-engine telemetry for the status bar.
 *
 * The footer used to claim "LATENCY: 0.8ms" and "DSP ENGINE: ONLINE" as static
 * strings; those were decoration. These helpers read the real AudioContext so
 * the readout is honest: context state, hardware sample rate, and the summed
 * base + output latency the browser reports.
 */

import { useEffect, useState } from 'react';
import { audioEngine } from './audioEngine';

export type AudioContextState = 'running' | 'suspended' | 'closed' | 'unavailable';

export interface AudioTelemetry {
  state: AudioContextState;
  /** Sample rate in kHz, or null when there is no context. */
  sampleRateKHz: number | null;
  /** Round-trip latency in ms, or null when the browser does not report it. */
  latencyMs: number | null;
}

const EMPTY: AudioTelemetry = { state: 'unavailable', sampleRateKHz: null, latencyMs: null };

/** Read the current context telemetry. Pure apart from the engine singleton. */
export function readAudioTelemetry(): AudioTelemetry {
  const ctx = audioEngine.getContext?.() ?? null;
  if (!ctx) return EMPTY;

  const base = typeof ctx.baseLatency === 'number' ? ctx.baseLatency : 0;
  const output = typeof (ctx as AudioContext & { outputLatency?: number }).outputLatency === 'number'
    ? (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0
    : 0;
  const latency = base + output;

  return {
    state: (ctx.state as AudioContextState) ?? 'suspended',
    sampleRateKHz: ctx.sampleRate ? ctx.sampleRate / 1000 : null,
    latencyMs: latency > 0 ? latency * 1000 : null,
  };
}

export function formatLatency(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

export function formatSampleRate(kHz: number | null): string {
  if (kHz == null || !Number.isFinite(kHz)) return '—';
  return `${kHz.toFixed(1)} kHz`;
}

export function describeContextState(state: AudioContextState): { label: string; ok: boolean } {
  switch (state) {
    case 'running':
      return { label: 'DSP ENGINE: RUNNING', ok: true };
    case 'suspended':
      return { label: 'DSP ENGINE: SUSPENDED', ok: false };
    case 'closed':
      return { label: 'DSP ENGINE: CLOSED', ok: false };
    default:
      return { label: 'DSP ENGINE: OFFLINE', ok: false };
  }
}

/** Poll the engine for telemetry so the footer tracks context changes. */
export function useAudioTelemetry(intervalMs = 1000): AudioTelemetry {
  const [telemetry, setTelemetry] = useState<AudioTelemetry>(() => readAudioTelemetry());
  useEffect(() => {
    const id = setInterval(() => setTelemetry(readAudioTelemetry()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return telemetry;
}
