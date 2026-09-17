/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Microphone capture (getUserMedia + MediaRecorder) with optional input
 * monitoring and threshold (auto-record) gating.
 *
 * Monitoring routes the live input through a monitor gain into the context
 * destination. It is OFF by default (feedback safety) and enabled explicitly
 * via `enableMonitor` or per-take `start({ monitor })`.
 *
 * Threshold gating holds the MediaRecorder until the measured input level
 * reaches `thresholdDb` (MPC-style auto-record: the take starts on the hit).
 * Measurement needs an AudioContext for the analyser — pass one via
 * `monitor: { context }` (a `level` of 0 keeps the monitor silent while still
 * measuring). Without a context the take starts immediately.
 */

import { analyserLevelDb, meetsThreshold } from './inputLevel';

export interface AudioCapture {
  isSupported(): boolean;
  start(opts?: CaptureStartOptions): Promise<MediaStream>;
  stop(_stream?: MediaStream): Promise<Blob>;
  decodeBlobToBuffer(blob: Blob, ctx: BaseAudioContext): Promise<AudioBuffer>;
  dispose(): void;
  /**
   * Route live input to the context destination through a monitor gain.
   * Safe to call before `start()` — the preference applies to the next take.
   */
  enableMonitor(context: AudioContext, level?: number): void;
  setMonitorLevel(level: number): void;
  disableMonitor(): void;
  isMonitorEnabled(): boolean;
  /** Current input level in dBFS, or null when unavailable. */
  getInputLevelDb(): number | null;
}

export interface CaptureMonitorOptions {
  context: AudioContext;
  /**
   * Monitor gain 0..1 (default 0.5). Pass 0 for silent measurement (e.g.
   * threshold gating without hearing the input).
   */
  level?: number;
}

export interface CaptureStartOptions {
  monitor?: CaptureMonitorOptions;
  /**
   * Auto-start the take when the input reaches this level in dBFS (e.g. -30).
   * Omit (or pass undefined) to start immediately. Requires a monitor context
   * for measurement; without one the take starts immediately.
   */
  thresholdDb?: number;
  /** Give up waiting for the threshold after this long and start anyway. */
  thresholdTimeoutMs?: number;
  /** Test seam: override the measured input level. */
  sampleLevelDb?: () => number | null;
  /** Test seam: wait primitive (defaults to setTimeout). */
  waitMs?: (ms: number) => Promise<void>;
}

export function isMediaRecorderSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
}

const DEFAULT_THRESHOLD_TIMEOUT_MS = 15000;
const THRESHOLD_POLL_MS = 30;

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

interface MonitorChain {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  gain: GainNode;
}

export function createAudioCapture(): AudioCapture {
  let activeStream: MediaStream | null = null;
  let activeRecorder: MediaRecorder | null = null;
  let monitorPref: { context: AudioContext; level: number } | null = null;
  let monitorChain: MonitorChain | null = null;

  const teardownMonitorChain = (): void => {
    const chain = monitorChain;
    monitorChain = null;
    if (!chain) return;
    try {
      chain.gain.disconnect();
    } catch {
      /* already torn down */
    }
    try {
      chain.analyser.disconnect();
    } catch {
      /* already torn down */
    }
    try {
      chain.source.disconnect();
    } catch {
      /* already torn down */
    }
  };

  /** Build source → analyser → monitorGain → destination (gain may be 0). */
  const buildMonitorChain = (context: AudioContext, stream: MediaStream, level: number): void => {
    teardownMonitorChain();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const gain = context.createGain();
    gain.gain.value = clamp01(level);
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(context.destination);
    monitorChain = { context, source, analyser, gain };
  };

  const getInputLevelDb = (): number | null =>
    monitorChain ? analyserLevelDb(monitorChain.analyser) : null;

  const waitForThreshold = async (
    thresholdDb: number,
    timeoutMs: number,
    sampleLevelDb?: () => number | null,
    waitMs?: (ms: number) => Promise<void>
  ): Promise<void> => {
    const wait = waitMs ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
    const deadline = Date.now() + Math.max(0, timeoutMs);
    for (;;) {
      const level = sampleLevelDb ? sampleLevelDb() : getInputLevelDb();
      if (meetsThreshold(level, thresholdDb)) return;
      if (Date.now() >= deadline) return;
      await wait(THRESHOLD_POLL_MS);
    }
  };

  return {
    isSupported: isMediaRecorderSupported,

    async start(opts: CaptureStartOptions = {}) {
      if (!isMediaRecorderSupported()) throw new Error('MediaRecorder not available');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStream = stream;

      // Monitor preference: explicit per-take options win, otherwise reuse a
      // previously enabled monitor (e.g. toggled on before recording).
      if (opts.monitor) {
        monitorPref = {
          context: opts.monitor.context,
          level: clamp01(opts.monitor.level ?? 0.5),
        };
      }
      const measureContext = opts.monitor?.context ?? monitorPref?.context ?? null;
      const audibleLevel = opts.monitor ? clamp01(opts.monitor.level ?? 0.5) : (monitorPref?.level ?? 0);
      if (measureContext) {
        buildMonitorChain(measureContext, stream, monitorPref ? audibleLevel : 0);
      }

      // Threshold (auto-record) gating: hold the take until the input speaks.
      // Without a measurement context there is nothing to gate on, so the
      // take starts immediately (documented fallback, not silent waiting).
      if (opts.thresholdDb !== undefined && opts.thresholdDb !== null && measureContext) {
        await waitForThreshold(
          opts.thresholdDb,
          opts.thresholdTimeoutMs ?? DEFAULT_THRESHOLD_TIMEOUT_MS,
          opts.sampleLevelDb,
          opts.waitMs
        );
      }

      const rec = new MediaRecorder(stream);
      activeRecorder = rec;
      rec.start();
      return stream;
    },

    async stop(_stream) {
      if (!activeRecorder) throw new Error('No active recorder');
      const rec = activeRecorder;
      const blob = await new Promise<Blob>((res, rej) => {
        const onError = () => rej(new Error('MediaRecorder error during stop'));
        const off = () => {
          if (typeof rec.removeEventListener === 'function') {
            rec.removeEventListener('error', onError);
          }
        };
        // Safety net: if the recorder never emits dataavailable (already
        // stopped, never started, or a browser quirk), fail rather than hang
        // the caller with the mic left active.
        const hangTimer = setTimeout(() => {
          off();
          rej(new Error('MediaRecorder stop timed out'));
        }, 3000);
        if (typeof rec.addEventListener === 'function') {
          rec.addEventListener('error', onError, { once: true });
          rec.addEventListener('dataavailable', (e: BlobEvent) => {
            clearTimeout(hangTimer);
            off();
            res(e.data);
          }, { once: true });
          rec.addEventListener('stop', () => clearTimeout(hangTimer), { once: true });
        }
        try {
          rec.stop();
        } catch (err) {
          clearTimeout(hangTimer);
          off();
          rej(err as Error);
        }
      }).finally(() => {
        teardownMonitorChain();
        if (activeStream) {
          for (const t of activeStream.getTracks()) t.stop();
          activeStream = null;
        }
        activeRecorder = null;
      });
      return blob;
    },

    async decodeBlobToBuffer(blob, ctx) {
      const arr = await blob.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    },

    dispose() {
      teardownMonitorChain();
      if (activeStream) {
        for (const t of activeStream.getTracks()) t.stop();
        activeStream = null;
      }
      activeRecorder = null;
    },

    enableMonitor(context: AudioContext, level = 0.5) {
      monitorPref = { context, level: clamp01(level) };
      if (activeStream) {
        buildMonitorChain(context, activeStream, monitorPref.level);
      }
    },

    setMonitorLevel(level: number) {
      const clamped = clamp01(level);
      if (monitorPref) monitorPref.level = clamped;
      if (monitorChain) {
        try {
          monitorChain.gain.gain.value = clamped;
        } catch {
          /* ignore */
        }
      }
    },

    disableMonitor() {
      monitorPref = null;
      if (monitorChain) {
        try {
          monitorChain.gain.gain.value = 0;
        } catch {
          /* ignore */
        }
      }
    },

    isMonitorEnabled() {
      return monitorPref !== null && monitorPref.level > 0;
    },

    getInputLevelDb,
  };
}

/** Slice a buffer into N equal-length pads. */
export function sliceBufferIntoPads(buffer: AudioBuffer, n: number): AudioBuffer[] {
  const out: AudioBuffer[] = [];
  const sliceLen = Math.floor(buffer.length / n);
  for (let i = 0; i < n; i++) {
    const start = i * sliceLen;
    const end = i === n - 1 ? buffer.length : start + sliceLen;
    const newBuf = new AudioBuffer({
      length: end - start,
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
    });
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      newBuf.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
    }
    out.push(newBuf);
  }
  return out;
}
