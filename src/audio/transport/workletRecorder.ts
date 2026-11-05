/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AudioWorklet-based microphone recorder.
 *
 * The platform `MediaRecorder` path in `audioCapture.ts` captures a compressed
 * webm/opus blob that then has to be decoded, adding latency and a lossy step
 * (and `stop()` can hang, which is why it carries a 3 s safety timer). The
 * AudioWorklet path runs on the audio thread, buffers 128-frame quanta and
 * posts raw PCM to the main thread, so a take comes back as an `AudioBuffer`
 * with no decode step and no compression.
 *
 * The processor is inlined as a Blob URL so there is no extra asset to ship
 * and no build step. When `AudioWorklet` is unavailable (older browsers, jsdom)
 * callers fall back to `createAudioCapture`.
 */

export function isAudioWorkletSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).AudioContext !== 'undefined' &&
    typeof (window as any).AudioWorkletNode !== 'undefined' &&
    typeof (window as any).Blob !== 'undefined' &&
    typeof (window as any).URL !== 'undefined' &&
    typeof (window as any).URL.createObjectURL === 'function'
  );
}

const PROCESSOR_NAME = 'nc-worklet-recorder';

const PROCESSOR_SOURCE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (e) => {
      if (e.data === 'start') this.recording = true;
      else if (e.data === 'stop') this.recording = false;
    };
  }
  process(inputs) {
    if (!this.recording) return true;
    const input = inputs && inputs[0];
    if (!input || !input.length) return true;
    const channels = new Array(input.length);
    const transfer = [];
    for (let c = 0; c < input.length; c++) {
      const copy = new Float32Array(input[c].length);
      copy.set(input[c]);
      channels[c] = copy;
      transfer.push(copy.buffer);
    }
    this.port.postMessage({ type: 'data', channels, frameCount: input[0].length }, transfer);
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', RecorderProcessor);
`;

let moduleUrl: string | null = null;
function getModuleUrl(): string {
  if (moduleUrl) return moduleUrl;
  const blob = new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' });
  moduleUrl = URL.createObjectURL(blob);
  return moduleUrl;
}

export interface WorkletRecorder {
  /** Begin capturing PCM into the internal buffer. */
  start(): void;
  /** Stop capturing and resolve with the assembled AudioBuffer. */
  stop(): Promise<AudioBuffer>;
  /** Release the AudioContext and underlying stream. */
  dispose(): void;
  /** Whether capture is currently running. */
  readonly recording: boolean;
}

export interface WorkletRecorderOptions {
  /** Sample rate for the captured buffer (default 48000). */
  sampleRate?: number;
  /** Number of channels (default 1). */
  channels?: number;
}

/**
 * Build a recorder over an existing stream. The caller owns the stream's
 * tracks and is responsible for stopping them.
 */
export async function createWorkletRecorder(
  context: AudioContext,
  stream: MediaStream,
  options: WorkletRecorderOptions = {},
): Promise<WorkletRecorder> {
  if (!isAudioWorkletSupported()) {
    throw new Error('AudioWorklet is not available');
  }
  const sampleRate = options.sampleRate ?? context.sampleRate;
  const channelCount = Math.max(1, options.channels ?? (stream.getAudioTracks().length || 1));

  await context.audioWorklet.addModule(getModuleUrl());
  const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount,
  });
  const source = context.createMediaStreamSource(stream);
  source.connect(node);

  const chunks: Float32Array[][] = [];
  let recording = false;
  node.port.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; channels?: Float32Array[] } | null;
    if (data && data.type === 'data' && Array.isArray(data.channels) && recording) {
      chunks.push(data.channels);
    }
  };

  return {
    start() {
      chunks.length = 0;
      recording = true;
      node.port.postMessage('start');
    },
    async stop() {
      recording = false;
      node.port.postMessage('stop');
      // Give the audio thread one block to flush the last chunk.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      source.disconnect();
      node.disconnect();

      const totalFrames = chunks.reduce((sum, c) => sum + (c[0]?.length ?? 0), 0);
      const buffer = context.createBuffer(channelCount, Math.max(1, totalFrames), sampleRate);
      let offset = 0;
      for (const chunk of chunks) {
        for (let ch = 0; ch < channelCount; ch++) {
          const src = chunk[ch];
          if (src) buffer.copyToChannel(src, ch, offset);
        }
        offset += chunk[0]?.length ?? 0;
      }
      return buffer;
    },
    dispose() {
      recording = false;
      try { node.port.postMessage('stop'); } catch { /* ignore */ }
      try { source.disconnect(); } catch { /* ignore */ }
      try { node.disconnect(); } catch { /* ignore */ }
    },
    get recording() {
      return recording;
    },
  };
}

/**
 * Pure helper: assemble an AudioBuffer-shaped result from collected chunks.
 * Exported so the assembly logic can be unit-tested without an AudioContext.
 */
export function assembleWorkletBuffer(
  chunks: Float32Array[][],
  channelCount: number,
  sampleRate: number,
  createContext: (length: number, channels: number, rate: number) => {
    copyToChannel: (src: Float32Array, channel: number, offset: number) => void;
    length: number;
  },
): { length: number; sampleRate: number; channels: number } {
  const totalFrames = chunks.reduce((sum, c) => sum + (c[0]?.length ?? 0), 0);
  const length = Math.max(1, totalFrames);
  const buffer = createContext(length, channelCount, sampleRate);
  let offset = 0;
  for (const chunk of chunks) {
    for (let ch = 0; ch < channelCount; ch++) {
      const src = chunk[ch];
      if (src) buffer.copyToChannel(src, ch, offset);
    }
    offset += chunk[0]?.length ?? 0;
  }
  return { length: buffer.length, sampleRate, channels: channelCount };
}
