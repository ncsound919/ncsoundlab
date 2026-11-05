/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field Studio — the phone UI for the field-sound engine.
 *
 * A separate component tree and a separate HTML entry (`field.html` →
 * `src/field.tsx`) from the desktop workstation, built around one vertical flow:
 *
 *   source (record or import) → slices → cleanup → evolved variants → kit
 *
 * Two rules hold this file together:
 *
 *  1. Nothing here does DSP. Analysis, slicing, cleanup, rendering and pitch
 *     all come from `src/audio/mobile/*`, so what the phone plays is the same
 *     code the tests verify.
 *  2. The mic graph runs continuously once armed and feeds a pre-roll ring, so
 *     the sound that started *before* the user tapped Record is still in the
 *     take — the one thing a hardware field recorder does that a naive
 *     `getUserMedia` start does not.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { analyseSamples, toDb } from '../../audio/mobile/analysis';
import { decodeWav, encodeWavMono } from '../../audio/mobile/wavCodec';
import { cutSlice, sliceEvenly, sliceOnsets, type AudioSlice } from '../../audio/mobile/onsetSlicer';
import {
  DEFAULT_CLEANUP,
  applyCleanup,
  suggestCleanupParams,
  type CleanupParams,
  type CleanupReport,
} from '../../audio/mobile/dspCleanup';
import { renderGenome } from '../../audio/mobile/genomeRender';
import { PreRollBuffer, TakeAssembler } from '../../audio/mobile/preRoll';
import { detectRootFromSlices } from '../../audio/mobile/pitchDetection';
import {
  attachPreviews,
  breed,
  breedPool,
  createGrid,
  keep,
  keptGenomes,
  replaceSlotGenome,
  setMutationStrength,
  spawnRound,
  trash,
  visibleSlots,
  type VariantGrid,
  type VariantPreview,
} from '../../lib/mobile/variantGrid';
import {
  applyGenomeEdits,
  defaultParams,
  deriveSeed,
  describeGenome,
  genomeByteSize,
  makeGenome,
  mutate,
  type DeepPartial,
  type EvolutionTarget,
  type GeneLocks,
  type Genome,
  type GenomeParams,
} from '../../lib/mobile/genome';
import {
  addRoundRobinGroup,
  addSlice,
  createFieldKit,
  describeKit,
  kitFileName,
  kitManifestJson,
  makeSliceEntry,
  sliceFileName,
  type FieldKit,
} from '../../lib/mobile/fieldKit';
import {
  buildFieldMeta,
  coverArtParams,
  describeFieldMeta,
  takeSeed,
  type FieldMeta,
} from '../../lib/mobile/fieldMeta';
import { buildNcbeatPackage } from '../../lib/mobile/ncbeatBridge';
import FieldWaveform from './FieldWaveform';
import SliceEditor from './SliceEditor';
import VariantGridTouch from './VariantGridTouch';
import FieldAssistantModal from './FieldAssistantModal';
import FieldPadSampler from './FieldPadSampler';
import MicCalibrationPanel, { MIC_PROFILES, type MicProfileId } from './MicCalibrationPanel';
import { storageBytesUsed, storageTakeCount, webFieldStorage } from './fieldDb';

/** Surfaced as a data attribute so support and update checks can identify the build. */
const FIELD_BUILD = '2026-10-28.3';

interface SourceTake {
  id: string;
  name: string;
  place: string;
  timeISO: string;
  samples: Float32Array;
  sampleRate: number;
}

const CAPTURE_WORKLET = `
class NcCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('nc-capture', NcCaptureProcessor);
`;

const CAPTURE_PROCESSOR = 'nc-capture';

const uid = (): string =>
  `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Save a Blob as a file.
 *
 * iOS Safari begins the download asynchronously and cancels it when the object
 * URL is revoked on the same tick, so the anchor is attached to the document
 * and the URL is released on a timer instead of immediately after the click.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

/** Renders still needed by a visible slot, a keep, a bred child or the kit. */
function liveRenderIds(grid: VariantGrid, kit: FieldKit): Set<string> {
  const ids = new Set<string>();
  for (const slot of grid.slots) ids.add(slot.genome.id);
  for (const genome of grid.keptPool ?? []) ids.add(genome.id);
  for (const genome of grid.bred) ids.add(genome.id);
  for (const slice of kit.slices) ids.add(slice.genomeId);
  return ids;
}

/**
 * Drop rendered audio nothing refers to any more. Every evolve renders eight
 * buffers; keeping them forever is tens of megabytes on a phone.
 */
function pruneRenders(
  renders: Record<string, Float32Array>,
  live: Set<string>
): Record<string, Float32Array> {
  const next: Record<string, Float32Array> = {};
  for (const [id, samples] of Object.entries(renders)) {
    if (live.has(id)) next[id] = samples;
  }
  return next;
}

/** Minimal shape of a Screen Wake Lock sentinel. */
interface WakeLockHandle {
  release: () => Promise<void>;
}

/** Mono mixdown of any decoded buffer. */
function downmixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

interface CaptureGraph {
  ctx: AudioContext;
  preRoll: PreRollBuffer;
  assembler: TakeAssembler;
  ready: Promise<void>;
  /** Input-conditioning nodes, exposed so a profile change applies live. */
  filters?: { highPass: BiquadFilterNode; presence: BiquadFilterNode };
  /** Disconnects the capture graph and stops every microphone track. */
  teardown?: () => void;
  /** Set on unmount so a pending getUserMedia does not attach a stream. */
  cancelled?: boolean;
}

export default function FieldStudio(): React.ReactElement {
  const ctxRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<CaptureGraph | null>(null);
  /** Every voice currently sounding, so pads can overlap or choke. */
  const voicesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const micProfileRef = useRef<MicProfileId>('phone-builtin');
  const recordingActiveRef = useRef(false);
  const timerRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [take, setTake] = useState<SourceTake | null>(null);
  const [analysisText, setAnalysisText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  /** Surfaced next to Record: a denied mic otherwise only appeared in the log. */
  const [micError, setMicError] = useState<string | null>(null);

  const [slices, setSlices] = useState<AudioSlice[]>([]);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [working, setWorking] = useState<Float32Array | null>(null);

  const [cleanup, setCleanup] = useState<CleanupParams>({ ...DEFAULT_CLEANUP, denoise: false });
  const [lastReport, setLastReport] = useState<CleanupReport | null>(null);

  const [grid, setGrid] = useState<VariantGrid | null>(null);
  /** Rendered audio by genome id — kept across rounds so exports stay correct. */
  const [renders, setRenders] = useState<Record<string, Float32Array>>({});
  const [strength, setStrength] = useState(0.35);
  const [evolutionTarget, setEvolutionTarget] = useState<EvolutionTarget>('balanced');
  const [geneLocks, setGeneLocks] = useState<GeneLocks>({});

  const [kit, setKit] = useState<FieldKit>(() =>
    createFieldKit({ id: 'field-kit', name: 'Field Kit', createdAt: new Date(0).toISOString() })
  );
  const [kitPlace, setKitPlace] = useState('Field');
  const [storageNote, setStorageNote] = useState('');
  const [savedTakes, setSavedTakes] = useState<FieldMeta[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [micProfile, setMicProfile] = useState<MicProfileId>('phone-builtin');
  const [inputGainDb, setInputGainDb] = useState(0);
  const [softLimiter, setSoftLimiter] = useState(true);
  const inputGainRef = useRef(0);
  const softLimiterRef = useRef(true);

  useEffect(() => {
    inputGainRef.current = inputGainDb;
  }, [inputGainDb]);

  useEffect(() => {
    softLimiterRef.current = softLimiter;
  }, [softLimiter]);

  // Apply a mic-profile change to a graph that is already armed.
  useEffect(() => {
    micProfileRef.current = micProfile;
    const filters = graphRef.current?.filters;
    if (!filters) return;
    const profile = MIC_PROFILES.find((entry) => entry.id === micProfile) ?? MIC_PROFILES[0];
    filters.highPass.frequency.value = Math.max(20, profile.rumbleCutHz);
    filters.presence.gain.value = profile.presenceBoostDb;
  }, [micProfile]);

  const log = useCallback((message: string) => {
    const stamp = new Date().toTimeString().slice(0, 8);
    setLogLines((previous) => [`${stamp} ${message}`, ...previous].slice(0, 40));
  }, []);

  const ensureCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctor({ latencyHint: 'interactive' });
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const refreshStorage = useCallback(async () => {
    try {
      const [count, bytes] = await Promise.all([storageTakeCount(), storageBytesUsed()]);
      setStorageNote(`${count} saved · ${formatBytes(bytes)}`);
      const list = await webFieldStorage().listTakes();
      setSavedTakes([...list].sort((a, b) => b.timeISO.localeCompare(a.timeISO)));
    } catch {
      setStorageNote('storage unavailable');
    }
  }, []);

  useEffect(() => {
    void refreshStorage();
    return () => {
      window.clearInterval(timerRef.current);
      recordingActiveRef.current = false;
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      for (const voice of voicesRef.current) {
        try {
          voice.stop();
        } catch {
          // already finished
        }
      }
      voicesRef.current.clear();
      const graph = graphRef.current;
      graphRef.current = null;
      if (graph) {
        // Closing the AudioContext does not stop a MediaStream: without this
        // the microphone stayed live (and the browser indicator stayed on)
        // after leaving the Field tab, and a getUserMedia that resolved after
        // unmount was never tracked at all.
        graph.cancelled = true;
        try {
          graph.teardown?.();
        } catch {
          /* nodes may already be disconnected */
        }
        void graph.ready.catch(() => undefined);
        void graph.ctx.close().catch(() => undefined);
      }
    };
  }, [refreshStorage]);

  /** Stop every voice that is still sounding. */
  const stopAllAudio = useCallback(() => {
    for (const voice of voicesRef.current) {
      try {
        voice.stop();
      } catch {
        // already finished
      }
    }
    voicesRef.current.clear();
  }, []);

  /**
   * Play a buffer. `choke` (the default) stops whatever is sounding first, so
   * auditioning a variant never layers over the previous one; pads pass
   * `false` in polyphonic mode so hits ring out together.
   */
  const play = useCallback(
    (samples: Float32Array, sampleRate: number, gain = 1.0, choke = true) => {
      const ctx = ensureCtx();
      if (choke) stopAllAudio();
      const buffer = ctx.createBuffer(1, Math.max(1, samples.length), sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      if (gain !== 1.0) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.max(0, Math.min(2, gain));
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }
      source.onended = () => {
        voicesRef.current.delete(source);
      };
      voicesRef.current.add(source);
      source.start();
    },
    [ensureCtx, stopAllAudio]
  );

  const updateSliceBounds = useCallback(
    (slice: AudioSlice, newStartSample: number, newEndSample: number) => {
      if (!take) return;
      const updatedSlice: AudioSlice = {
        ...slice,
        startSample: newStartSample,
        endSample: newEndSample,
        startSec: newStartSample / take.sampleRate,
        durationMs: ((newEndSample - newStartSample) / take.sampleRate) * 1000,
      };
      setSlices((prev) =>
        prev.map((s) => (sliceKey(s) === sliceKey(slice) ? updatedSlice : s))
      );
      setSelectedSliceId(sliceKey(updatedSlice));
      const cut = cutSlice(take.samples, updatedSlice, take.sampleRate);
      setWorking(cut);
      play(cut, take.sampleRate);
      log(`adjusted slice #${slice.index + 1}: ${updatedSlice.durationMs.toFixed(0)}ms`);
    },
    [log, play, take]
  );

  const onScrub = useCallback(
    (sampleIndex: number) => {
      if (!take) return;
      const scrubLen = Math.min(2400, take.samples.length - sampleIndex);
      if (scrubLen > 0) {
        const grain = take.samples.slice(sampleIndex, sampleIndex + scrubLen);
        play(grain, take.sampleRate, 0.7);
      }
    },
    [play, take]
  );

  const installTake = useCallback(
    (samples: Float32Array, sampleRate: number, name: string, place: string) => {
      const timeISO = new Date().toISOString();
      const id = uid();
      // A take that is still auditioning must not overlap the new source.
      stopAllAudio();
      setTake({ id, name, place, timeISO, samples, sampleRate });
      const analysed = analyseSamples(samples, sampleRate);
      setAnalysisText(
        `${analysed.durationSec.toFixed(2)}s · ${(sampleRate / 1000).toFixed(1)} kHz · ` +
          `peak ${analysed.peakDb.toFixed(1)} dBFS · crest ${analysed.crest.toFixed(1)} · ` +
          `centroid ${analysed.centroidHz.toFixed(0)} Hz`
      );
      setSlices([]);
      setSelectedSliceId(null);
      setWorking(null);
      setGrid(null);
      setRenders({});
      setLastReport(null);
      log(
        `take "${name}" ${analysed.durationSec.toFixed(2)}s, peak ${analysed.peakDb.toFixed(1)} dBFS` +
          (analysed.clippingRatio > 0.001
            ? ` · ${(analysed.clippingRatio * 100).toFixed(2)}% clipped`
            : '')
      );
    },
    [log, stopAllAudio]
  );

  const onImport = useCallback(
    async (file: File) => {
      try {
        setIsBusy(true);
        const bytes = new Uint8Array(await file.arrayBuffer());
        let samples: Float32Array;
        let sampleRate: number;
        try {
          const decoded = decodeWav(bytes);
          sampleRate = decoded.sampleRate;
          samples =
            decoded.channels.length === 1
              ? decoded.channels[0]
              : (() => {
                  const mono = new Float32Array(decoded.frames);
                  for (const channel of decoded.channels) {
                    for (let i = 0; i < decoded.frames; i++) mono[i] += channel[i] / decoded.channels.length;
                  }
                  return mono;
                })();
          log(`imported WAV ${decoded.format} (${decoded.channels.length} ch)`);
        } catch {
          const ctx = ensureCtx();
          const decoded = await ctx.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
          samples = downmixToMono(decoded);
          sampleRate = decoded.sampleRate;
          log(`imported ${file.name} via decodeAudioData`);
        }
        installTake(samples, sampleRate, file.name.replace(/\.[^.]+$/, ''), kitPlace);
      } catch (error) {
        log(`import failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsBusy(false);
      }
    },
    [ensureCtx, installTake, kitPlace, log]
  );

  /**
   * Arm the mic. The graph stays up after this, filling the pre-roll ring, so a
   * later Record tap captures audio that predates the tap.
   */
  const ensureGraph = useCallback(
    async (ctx: AudioContext): Promise<CaptureGraph> => {
      if (graphRef.current && graphRef.current.ctx === ctx) {
        await graphRef.current.ready;
        return graphRef.current;
      }
      const preRoll = new PreRollBuffer(ctx.sampleRate, { windowMs: 1200 });
      const assembler = new TakeAssembler(preRoll, ctx.sampleRate, { maxSeconds: 15 * 60 });
      const graph: CaptureGraph = { ctx, preRoll, assembler, ready: Promise.resolve(), cancelled: false };
      graphRef.current = graph;

      graph.ready = (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (graph.cancelled || ctx.state === 'closed') {
          for (const track of stream.getTracks()) track.stop();
          if (graphRef.current === graph) graphRef.current = null;
          return;
        }
        let node: AudioNode;
        let teardown: () => void;
        const onChunk = (chunk: Float32Array) => {
          const linearGain = Math.pow(10, inputGainRef.current / 20);
          const processed = new Float32Array(chunk.length);
          for (let i = 0; i < chunk.length; i++) {
            let s = chunk[i] * linearGain;
            if (softLimiterRef.current) {
              if (s > 0.8) s = 0.8 + 0.2 * Math.tanh((s - 0.8) / 0.2);
              else if (s < -0.8) s = -0.8 + 0.2 * Math.tanh((s + 0.8) / 0.2);
            }
            processed[i] = s;
          }
          preRoll.push(processed);
          if (recordingActiveRef.current) assembler.append(processed);
        };
        // Muted sink: an AudioWorklet (and a ScriptProcessor) only runs when it
        // is pulled by a path to the destination, so without this the capture
        // silently records nothing.
        const sink = ctx.createGain();
        sink.gain.value = 0;
        sink.connect(ctx.destination);

        // The mic profile is real DSP, not a label: rumble cut plus a presence
        // lift sit between the microphone and the capture worklet.
        const profile =
          MIC_PROFILES.find((entry) => entry.id === micProfileRef.current) ?? MIC_PROFILES[0];
        const highPass = ctx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = Math.max(20, profile.rumbleCutHz);
        highPass.Q.value = 0.707;
        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 3200;
        presence.Q.value = 1;
        presence.gain.value = profile.presenceBoostDb;
        graph.filters = { highPass, presence };

        try {
          const url = URL.createObjectURL(
            new Blob([CAPTURE_WORKLET], { type: 'application/javascript' })
          );
          try {
            await ctx.audioWorklet.addModule(url);
          } finally {
            URL.revokeObjectURL(url);
          }
          const worklet = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR);
          worklet.port.onmessage = (event: MessageEvent) =>
            onChunk(new Float32Array(event.data as Float32Array));
          node = worklet;
          teardown = () => worklet.disconnect();
          log(`capture armed via AudioWorklet · ${profile.name}`);
        } catch {
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (event) =>
            onChunk(new Float32Array(event.inputBuffer.getChannelData(0)));
          node = processor;
          teardown = () => {
            processor.onaudioprocess = null;
            processor.disconnect();
          };
          log('capture armed via ScriptProcessor fallback');
        }

        const sourceNode = ctx.createMediaStreamSource(stream);
        sourceNode.connect(highPass);
        highPass.connect(presence);
        presence.connect(node);
        node.connect(sink);
        teardown = (() => {
          const inner = teardown;
          return () => {
            sourceNode.disconnect();
            highPass.disconnect();
            presence.disconnect();
            inner();
            sink.disconnect();
            stream.getTracks().forEach((track) => track.stop());
          };
        })();
        graph.teardown = teardown;
      })();

      try {
        await graph.ready;
      } catch (error) {
        graphRef.current = null;
        log(`mic unavailable: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
      return graph;
    },
    [log]
  );

  const startRecording = useCallback(async () => {
    const ctx = ensureCtx();
    try {
      await ctx.resume();
      const graph = await ensureGraph(ctx);
      setMicError(null);
      recordingActiveRef.current = true;
      graph.assembler.begin();
      setRecSeconds(0);
      setIsRecording(true);
      // Keep the screen awake for the take: a locked phone stops the UI timer
      // and some browsers suspend the audio graph.
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockHandle> };
        };
        if (!wakeLockRef.current && nav.wakeLock) {
          wakeLockRef.current = await nav.wakeLock.request('screen');
        }
      } catch {
        // Denied or unsupported — recording still works.
      }
      const startedAt = performance.now();
      timerRef.current = window.setInterval(
        () => setRecSeconds((performance.now() - startedAt) / 1000),
        200
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMicError(message);
      log(`recording unavailable: ${message}`);
    }
  }, [ensureCtx, ensureGraph, log]);

  const stopRecording = useCallback(() => {
    if (!recordingActiveRef.current) return;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    recordingActiveRef.current = false;
    window.clearInterval(timerRef.current);
    setIsRecording(false);
    setRecSeconds(0);
    const graph = graphRef.current;
    const assembled = graph?.assembler.finish();
    if (!assembled || assembled.durationSec < 0.05) {
      log('capture too short — nothing saved');
      return;
    }
    log(
      `captured ${assembled.durationSec.toFixed(2)}s` +
        (assembled.preRollFrames > 0
          ? ` (${((assembled.preRollFrames / assembled.sampleRate) * 1000).toFixed(0)} ms pre-roll)`
          : '')
    );
    installTake(
      assembled.samples,
      assembled.sampleRate,
      `Take ${new Date().toTimeString().slice(0, 5)}`,
      kitPlace
    );
  }, [installTake, kitPlace, log]);

  const runSlice = useCallback(() => {
    if (!take) return;
    const result = sliceOnsets(take.samples, take.sampleRate, {
      sensitivity: 0.9,
      preRollMs: 10,
      minSliceMs: 40,
      maxSliceMs: 4000,
    });
    setSlices(result.slices);
    log(`sliced into ${result.slices.length} (${result.rejected.length} rejected)`);
    if (result.slices.length > 0) {
      const first = result.slices[0];
      setSelectedSliceId(sliceKey(first));
      setWorking(cutSlice(take.samples, first, take.sampleRate));
      setCleanup((previous) => ({ ...previous, ...suggestCleanupParams(first.analysis) }));
    }
  }, [log, take]);

  const useWholeTake = useCallback(() => {
    if (!take) return;
    setSelectedSliceId(null);
    setWorking(Float32Array.from(take.samples));
    setSlices([]);
    setCleanup((previous) => ({
      ...previous,
      ...suggestCleanupParams(analyseSamples(take.samples, take.sampleRate)),
    }));
    log('using the whole take as the source');
  }, [log, take]);

  const selectSlice = useCallback(
    (slice: AudioSlice) => {
      if (!take) return;
      const cut = cutSlice(take.samples, slice, take.sampleRate);
      setSelectedSliceId(sliceKey(slice));
      setWorking(cut);
      setCleanup((previous) => ({ ...previous, ...suggestCleanupParams(slice.analysis) }));
      play(cut, take.sampleRate);
    },
    [play, take]
  );

  const chopEvenly = useCallback(
    (count: number) => {
      if (!take) return;
      const result = sliceEvenly(take.samples, take.sampleRate, count);
      setSlices(result);
      if (result.length === 0) {
        log(`take is too short to chop into ${count}`);
        return;
      }
      const first = result[0];
      const cut = cutSlice(take.samples, first, take.sampleRate);
      setSelectedSliceId(sliceKey(first));
      setWorking(cut);
      setCleanup((previous) => ({ ...previous, ...suggestCleanupParams(first.analysis) }));
      play(cut, take.sampleRate);
      log(`chopped evenly into ${result.length}`);
    },
    [log, play, take]
  );

  const mergeSelectedWithNext = useCallback(() => {
    if (!take || !selectedSliceId) return;
    const index = slices.findIndex((slice) => sliceKey(slice) === selectedSliceId);
    if (index < 0 || index >= slices.length - 1) return;
    const first = slices[index];
    const next = slices[index + 1];
    const startSample = first.startSample;
    const endSample = next.endSample;
    const analysis = analyseSamples(
      take.samples.subarray(startSample, endSample),
      take.sampleRate
    );
    const merged: AudioSlice = {
      ...first,
      endSample,
      durationMs: ((endSample - startSample) / take.sampleRate) * 1000,
      peak: analysis.peak,
      rms: analysis.rms,
      clipped: analysis.clippingRatio > 0.001,
      silent: false,
      analysis,
    };
    setSlices(
      [...slices.slice(0, index), merged, ...slices.slice(index + 2)].map((slice, i) => ({
        ...slice,
        index: i,
      }))
    );
    setSelectedSliceId(sliceKey(merged));
    const cut = cutSlice(take.samples, merged, take.sampleRate);
    setWorking(cut);
    setCleanup((previous) => ({ ...previous, ...suggestCleanupParams(analysis) }));
    play(cut, take.sampleRate);
    log(`merged slices #${index + 1}+#${index + 2} → ${merged.durationMs.toFixed(0)}ms`);
  }, [log, play, selectedSliceId, slices, take]);

  const deleteSelectedSlice = useCallback(() => {
    if (!take || !selectedSliceId) return;
    const index = slices.findIndex((slice) => sliceKey(slice) === selectedSliceId);
    if (index < 0) return;
    const remaining = slices
      .filter((_, i) => i !== index)
      .map((slice, i) => ({ ...slice, index: i }));
    setSlices(remaining);
    const fallback = remaining[Math.min(index, remaining.length - 1)];
    if (fallback) {
      const cut = cutSlice(take.samples, fallback, take.sampleRate);
      setSelectedSliceId(sliceKey(fallback));
      setWorking(cut);
      setCleanup((previous) => ({ ...previous, ...suggestCleanupParams(fallback.analysis) }));
      play(cut, take.sampleRate);
    } else {
      setSelectedSliceId(null);
      setWorking(Float32Array.from(take.samples));
      setCleanup((previous) => ({
        ...previous,
        ...suggestCleanupParams(analyseSamples(take.samples, take.sampleRate)),
      }));
      log('no slices left — using the whole take');
    }
    log(`deleted slice #${index + 1}`);
  }, [log, play, selectedSliceId, slices, take]);

  const runCleanup = useCallback(() => {
    if (!take || !working) return;
    const result = applyCleanup(working, take.sampleRate, cleanup);
    setWorking(result.samples);
    setLastReport(result.report);
    log(`cleanup: ${result.report.applied.join(', ') || 'nothing to do'}`);
    play(result.samples, take.sampleRate);
  }, [cleanup, log, play, take, working]);

  const toggleGeneLock = useCallback((key: keyof GeneLocks) => {
    setGeneLocks((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const evolve = useCallback(() => {
    if (!take || !working) return;
    setIsBusy(true);
    try {
      const parent: Genome = makeGenome(takeSeed(take.id, take.place, take.timeISO), {
        ...defaultParams(),
        pitch: { rootHz: 220, offsetCents: 0 },
        layers: [{ kind: 'recording', weight: 1 }],
        transientLockEnabled: true,
      });
      const base =
        grid ??
        createGrid(parent, {
          slots: 8,
          mutationStrength: strength,
          target: evolutionTarget,
          locks: geneLocks,
        });
      const { grid: nextGrid, children } = spawnRound(setMutationStrength(base, strength), {
        target: evolutionTarget,
        locks: geneLocks,
      });
      const nextRenders: Record<string, Float32Array> = {};
      const previews: VariantPreview[] = children.map((child) => {
        // Rendered once, then reused for both the measurement and the audition.
        const rendered = renderGenome(child, { sampleRate: take.sampleRate, source: working });
        nextRenders[child.id] = rendered.samples;
        return { genomeId: child.id, analysis: analyseSamples(rendered.samples, take.sampleRate) };
      });
      const measured = attachPreviews(nextGrid, previews);
      setGrid(measured);
      setRenders((previous) =>
        pruneRenders({ ...previous, ...nextRenders }, liveRenderIds(measured, kit))
      );
      const shown = visibleSlots(measured).length;
      log(
        `evolved ${children.length} variants (${evolutionTarget}) at strength ${strength.toFixed(2)} · ${shown} shown`
      );
    } finally {
      setIsBusy(false);
    }
  }, [evolutionTarget, geneLocks, grid, kit, log, strength, take, working]);

  const auditionVariant = useCallback(
    (genomeId: string) => {
      if (!take) return;
      const samples = renders[genomeId];
      if (samples) play(samples, take.sampleRate);
    },
    [play, renders, take]
  );

  const keepVariant = useCallback((genomeId: string) => {
    setGrid((current) => (current ? keep(current, genomeId) : current));
  }, []);

  const trashVariant = useCallback((genomeId: string) => {
    setGrid((current) => (current ? trash(current, genomeId) : current));
  }, []);

  const breedKeeps = useCallback(() => {
    if (!grid || !take || !working) return;
    const outcome = breed(grid);
    if (!outcome.child) {
      log(outcome.reason ?? 'nothing to breed');
      return;
    }
    const rendered = renderGenome(outcome.child, {
      sampleRate: take.sampleRate,
      source: working,
    });
    setRenders((previous) =>
      pruneRenders({ ...previous, [outcome.child!.id]: rendered.samples }, liveRenderIds(outcome.grid, kit))
    );
    setGrid(outcome.grid);
    log(`bred ${outcome.child.id} · ${describeGenome(outcome.child)}`);
  }, [grid, kit, log, take, working]);

  const breedPoolKeeps = useCallback(() => {
    if (!grid || !take || !working) return;
    const outcome = breedPool(grid);
    if (!outcome.child) {
      log(outcome.reason ?? 'nothing to breed');
      return;
    }
    const rendered = renderGenome(outcome.child, {
      sampleRate: take.sampleRate,
      source: working,
    });
    setRenders((previous) =>
      pruneRenders({ ...previous, [outcome.child!.id]: rendered.samples }, liveRenderIds(outcome.grid, kit))
    );
    setGrid(outcome.grid);
    log(`pool-bred Gen ${outcome.grid.generation} (${outcome.child.id}) · ${describeGenome(outcome.child)}`);
  }, [grid, kit, log, take, working]);

  /** Kept variants plus bred children, resolved to audio we can actually play. */
  const kitCandidates = useMemo(() => {
    if (!grid) return [] as { id: string; name: string; genome: Genome }[];
    const kept = keptGenomes(grid).map((genome) => ({
      id: genome.id,
      name: `${take?.name ?? 'take'} v${genome.id.slice(-4)}`,
      genome,
    }));
    const bred = grid.bred.map((genome) => ({
      id: genome.id,
      name: `${take?.name ?? 'take'} ×${genome.id.slice(-4)}`,
      genome,
    }));
    return [...kept, ...bred].filter(
      (candidate) =>
        renders[candidate.id] !== undefined &&
        !kit.slices.some((slice) => slice.genomeId === candidate.id)
    );
  }, [grid, kit.slices, renders, take]);

  const addToKit = useCallback(() => {
    if (!take) return;
    if (kitCandidates.length === 0) {
      log('nothing new to add — keep some variants first');
      return;
    }
    let next = kit;
    const memberIds: string[] = [];
    kitCandidates.forEach((candidate) => {
      const entry = makeSliceEntry({
        id: candidate.id,
        name: candidate.name,
        sourceId: take.id,
        genome: candidate.genome,
        rootHz: candidate.genome.params.pitch.rootHz,
        tags: ['field', 'variant'],
      });
      next = addSlice(next, entry);
      memberIds.push(entry.id);
    });
    next = addRoundRobinGroup(next, `RR_${take.name.replace(/\s+/g, '')}`, memberIds);
    next = { ...next, name: `${kitPlace} Kit`, place: kitPlace, createdAt: new Date().toISOString() };
    setKit(next);
    log(`kit now ${next.slices.length} slice(s), ${next.groups.length} group(s)`);
  }, [kit, kitCandidates, kitPlace, log, take]);

  const detectRoot = useCallback(() => {
    if (!take) return;
    const audio = kit.slices
      .map((slice) => renders[slice.genomeId])
      .filter((samples): samples is Float32Array => samples !== undefined);
    if (audio.length === 0) {
      log('add variants to the kit first — nothing to measure');
      return;
    }
    const estimate = detectRootFromSlices(audio, take.sampleRate);
    if (estimate.hz <= 0) {
      log('no clear root — the kit is percussive, leaving root at 0');
      setKit((current) => ({ ...current, rootHz: 0 }));
      return;
    }
    const hz = Math.round(estimate.hz * 10) / 10;
    setKit((current) => ({ ...current, rootHz: hz }));
    log(`kit root ${hz} Hz · ${(estimate.confidence * 100).toFixed(0)}% of slices agree`);
  }, [kit.slices, log, renders, take]);

  const exportKit = useCallback(async () => {
    if (!take || kit.slices.length === 0) {
      log('kit is empty');
      return;
    }
    // A new take clears `renders` but not the kit. Never substitute the new
    // take's audio for an old slice: that exports the wrong sound.
    const missing = kit.slices.filter((entry) => renders[entry.genomeId] === undefined);
    if (missing.length > 0) {
      log(`cannot export: ${missing.length} kit slice(s) have no audio for this take — rebuild the kit`);
      return;
    }
    try {
      setIsBusy(true);
      const zip = new JSZip();
      zip.file('manifest.json', kitManifestJson(kit));
      for (const [index, entry] of kit.slices.entries()) {
        const samples = renders[entry.genomeId]!;
        zip.file(`audio/${sliceFileName(entry, index)}`, encodeWavMono(samples, take.sampleRate));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const filename = kitFileName(kit).replace('.json', '.zip');
      downloadBlob(blob, filename);
      log(`exported ${filename} (${formatBytes(blob.size)})`);
    } catch (error) {
      log(`export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  }, [kit, log, renders, take, working]);

  const exportNcbeat = useCallback(async () => {
    if (!take || kit.slices.length === 0) {
      log('kit is empty');
      return;
    }
    const missing = kit.slices.filter((entry) => renders[entry.genomeId] === undefined);
    if (missing.length > 0) {
      log(`cannot export: ${missing.length} kit slice(s) have no audio for this take — rebuild the kit`);
      return;
    }
    try {
      setIsBusy(true);
      const zip = new JSZip();
      const sliceAudio = kit.slices.map((entry) => renders[entry.genomeId]!);
      const files = buildNcbeatPackage(kit, sliceAudio, take.sampleRate, {
        patternName: kit.name,
      });
      for (const file of files) {
        zip.file(file.path, file.data);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const filename = `${kit.name.replace(/\s+/g, '_')}.ncbeat`;
      // Chrome on Android appends ".zip" to a Blob labelled application/zip
      // when the filename uses the .ncbeat extension. Octet-stream preserves it.
      downloadBlob(new Blob([blob], { type: 'application/octet-stream' }), filename);
      log(`exported ${filename} for NC Phone Beat / NC Studio (${formatBytes(blob.size)})`);
    } catch (error) {
      log(`ncbeat export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  }, [kit, log, renders, take, working]);

  const injectSubLayer = useCallback((hz: number, weight: number) => {
    if (!take || !working) return;
    const currentGenome: Genome = grid?.parent ?? makeGenome(takeSeed(take.id, take.place, take.timeISO), {
      ...defaultParams(),
      layers: [{ kind: 'recording', weight: 1 }],
      transientLockEnabled: true,
    });
    const subLayer = { kind: 'sub' as const, weight, freqHz: hz, decayS: 0.35, waveform: 'sine' as const };
    const filtered = currentGenome.params.layers.filter((l) => l.kind !== 'sub');
    filtered.push(subLayer);
    const updated = applyGenomeEdits(currentGenome, { layers: filtered });
    const rendered = renderGenome(updated, { sampleRate: take.sampleRate, source: working });
    setWorking(rendered.samples);
    play(rendered.samples, take.sampleRate);
    log(`injected sub layer @ ${hz.toFixed(1)} Hz (weight ${(weight * 100).toFixed(0)}%)`);
  }, [grid?.parent, log, play, take, working]);

  const applySliceTuning = useCallback((tunedSamples: Float32Array, ratio: number, cents: number) => {
    if (!take) return;
    setWorking(tunedSamples);
    play(tunedSamples, take.sampleRate);
    log(`tuned slice: ${cents > 0 ? '+' : ''}${cents.toFixed(1)}¢ (ratio ${ratio.toFixed(3)})`);
  }, [play, take]);

  const applyAssistantGenome = useCallback((nextGenome: Genome, renderedAudio: Float32Array) => {
    if (!take) return;
    setWorking(renderedAudio);
    setRenders((prev) => ({ ...prev, [nextGenome.id]: renderedAudio }));
    play(renderedAudio, take.sampleRate);
    log(`assistant applied: ${describeGenome(nextGenome)}`);
  }, [play, take]);

  const updateGenomeParams = useCallback((genomeId: string, params: DeepPartial<GenomeParams>) => {
    if (!take || !working || !grid) return;
    const slot = grid.slots.find((s) => s.genome.id === genomeId);
    if (!slot) return;
    const updated = applyGenomeEdits(slot.genome, params);
    const rendered = renderGenome(updated, { sampleRate: take.sampleRate, source: working });
    setRenders((prev) => ({ ...prev, [genomeId]: rendered.samples }));
    // Persist the edit on the grid as well as the render: breeding and export
    // read genomes, so a render-only tweak would be silently discarded.
    setGrid((current) =>
      current
        ? replaceSlotGenome(
            current,
            genomeId,
            updated,
            analyseSamples(rendered.samples, take.sampleRate)
          )
        : current
    );
    play(rendered.samples, take.sampleRate);
    log(`tweaked ${genomeId}: ${describeGenome(updated)}`);
  }, [grid, log, play, take, working]);

  const refineVariant = useCallback(
    (genomeId: string) => {
      if (!take || !working || !grid) return;
      const slot = grid.slots.find((entry) => entry.genome.id === genomeId);
      if (!slot) return;
      const child = mutate(slot.genome, Math.max(0.15, strength * 0.6), {
        target: evolutionTarget,
        locks: geneLocks,
        seed: deriveSeed(slot.genome.seed, slot.genome.rev + 1),
      });
      const rendered = renderGenome(child, { sampleRate: take.sampleRate, source: working });
      const analysis = analyseSamples(rendered.samples, take.sampleRate);
      setRenders((previous) => ({ ...previous, [child.id]: rendered.samples }));
      setGrid((current) =>
        current ? replaceSlotGenome(current, genomeId, child, analysis) : current
      );
      play(rendered.samples, take.sampleRate);
      log(`reshaped ${genomeId} → ${describeGenome(child)}`);
    },
    [evolutionTarget, geneLocks, grid, log, play, strength, take, working]
  );

  const saveTake = useCallback(async () => {
    if (!take) return;
    try {
      const meta = buildFieldMeta({
        id: take.id,
        place: take.place || kitPlace,
        timeISO: take.timeISO,
        name: take.name,
        sampleRateHz: take.sampleRate,
        durationSec: take.samples.length / take.sampleRate,
        genomeIds: Object.keys(renders),
        device: 'browser capture',
      });
      await webFieldStorage().saveTake(meta, take.samples);
      log(`saved ${describeFieldMeta(meta)}`);
      await refreshStorage();
    } catch (error) {
      log(`save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [kitPlace, log, refreshStorage, renders, take]);

  const loadSaved = useCallback(
    async (meta: FieldMeta) => {
      try {
        setIsBusy(true);
        const loaded = await webFieldStorage().loadTake(meta.id);
        if (!loaded) {
          log(`${meta.name} has metadata but no audio`);
          return;
        }
        installTake(loaded.samples, loaded.sampleRate, loaded.meta.name, loaded.meta.place);
      } catch (error) {
        log(`load failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsBusy(false);
      }
    },
    [installTake, log]
  );

  const visible = useMemo(() => (grid ? visibleSlots(grid) : []), [grid]);
  const selectedSlice = useMemo(
    () => slices.find((slice) => sliceKey(slice) === selectedSliceId) ?? null,
    [slices, selectedSliceId]
  );
  const stage = !take ? 1 : !grid ? 2 : kit.slices.length > 0 ? 4 : 3;
  const takeSeconds = take ? take.samples.length / take.sampleRate : 0;

  return (
    <div className="min-h-screen bg-black text-white" data-build={FIELD_BUILD}>
      <header className="sticky top-0 z-20 border-b border-blue-900 bg-black/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl leading-none tracking-wide text-yellow-400">FIELD</h1>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right text-[10px] uppercase tracking-widest text-white/50">
                <div>{storageNote || 'loading…'}</div>
                <div className={isRecording ? 'font-bold text-red-400' : ''}>
                  {isBusy
                    ? 'working…'
                    : isRecording
                      ? 'recording'
                      : take
                        ? `${takeSeconds.toFixed(1)}s take`
                        : 'ready'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAssistantOpen(true)}
                disabled={!working && !take}
                className="min-h-11 rounded-full border border-yellow-400/50 bg-yellow-500/10 px-3 text-xs font-bold text-yellow-400 active:bg-yellow-500/20 disabled:opacity-40"
              >
                ✨ Assistant
              </button>
            </div>
          </div>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-blue-300/70">
            Capture → Slice → Evolve → Kit
          </p>
        </div>
        <ProgressRail stage={stage} />
      </header>

      <main
        className={`mx-auto flex max-w-xl flex-col gap-3 px-3 pt-4 ${
          isRecording ? 'pb-32' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
        }`}
      >
        <Section title="1 · Source & Calibration">
          <MicCalibrationPanel
            selectedProfile={micProfile}
            onSelectProfile={setMicProfile}
            inputGainDb={inputGainDb}
            onChangeInputGain={setInputGainDb}
            softLimiterEnabled={softLimiter}
            onToggleSoftLimiter={setSoftLimiter}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => (isRecording ? stopRecording() : void startRecording())}
              className={`h-14 rounded-lg text-base font-semibold transition ${
                isRecording
                  ? 'animate-pulse bg-red-600 text-white'
                  : 'bg-blue-600 text-white active:bg-blue-500'
              }`}
            >
              {isRecording ? `Stop ${recSeconds.toFixed(1)}s` : 'Record'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-14 rounded-lg bg-white/10 text-base font-semibold active:bg-white/20"
            >
              Import file
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav"
            aria-label="Import audio file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImport(file);
              event.target.value = '';
            }}
          />
          {micError && (
            <p
              role="alert"
              className="mt-2 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs leading-relaxed text-red-200"
            >
              Microphone unavailable: {micError}. Allow mic access in the browser, then tap Record
              again — or import a WAV instead.
            </p>
          )}
          <label className="mt-2 block text-xs text-white/60">
            Place name
            <input
              value={kitPlace}
              onChange={(event) => setKitPlace(event.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              className="mt-1 min-h-11 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-base text-white outline-none focus:border-blue-500"
              placeholder="Biscayne Bay"
            />
          </label>
          {!take && (
            <p className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-white/55">
              Record a take or import a WAV to begin. Everything stays on this device — no upload,
              no account.
            </p>
          )}
          {take && (
            <div className="mt-2 flex flex-col gap-2">
              <FieldWaveform
                samples={take.samples}
                sampleRate={take.sampleRate}
                slices={slices}
                selectedSliceId={selectedSliceId}
                onSelectSlice={selectSlice}
                onUpdateSliceBounds={updateSliceBounds}
                onScrub={onScrub}
              />
              <div className="rounded-md bg-white/5 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{take.name}</span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => play(take.samples, take.sampleRate)}
                      className="min-h-9 rounded bg-yellow-500 px-3 py-1 text-xs font-bold text-black"
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTake()}
                      className="min-h-9 rounded bg-white/15 px-3 py-1 text-xs"
                    >
                      Save take
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">{analysisText}</div>
              </div>
            </div>
          )}
          {savedTakes.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-widest text-white/40">Saved takes</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {savedTakes.slice(0, 6).map((meta) => (
                  <button
                    key={meta.id}
                    type="button"
                    onClick={() => void loadSaved(meta)}
                    disabled={isBusy}
                    className="min-h-9 rounded-full bg-white/10 px-3 py-1.5 text-xs active:bg-white/20 disabled:opacity-40"
                  >
                    {meta.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="2 · Slices & Cleanup">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={runSlice}
              disabled={!take}
              className="h-12 rounded-lg bg-blue-600 text-base font-semibold disabled:opacity-40"
            >
              Auto chop
            </button>
            <button
              type="button"
              onClick={useWholeTake}
              disabled={!take}
              className="h-12 rounded-lg bg-white/10 text-base font-semibold disabled:opacity-40"
            >
              Whole take
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-[10px] uppercase tracking-widest text-white/40">
              Even chop
            </span>
            <div className="flex flex-1 gap-1.5">
              {[4, 8, 16].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => chopEvenly(count)}
                  disabled={!take}
                  aria-label={`Chop into ${count} equal slices`}
                  className="min-h-10 flex-1 rounded-full bg-white/10 text-xs font-semibold text-white/80 active:bg-white/20 disabled:opacity-40"
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          {slices.length > 0 && (
            <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {slices.map((slice) => (
                <button
                  key={sliceKey(slice)}
                  type="button"
                  onClick={() => selectSlice(slice)}
                  aria-pressed={sliceKey(slice) === selectedSliceId}
                  className={`min-h-9 rounded-full px-3 py-1.5 text-xs ${
                    sliceKey(slice) === selectedSliceId
                      ? 'bg-yellow-500 font-bold text-black'
                      : 'bg-white/10 text-white/80'
                  }`}
                >
                  #{slice.index + 1} {slice.durationMs.toFixed(0)}ms {toDb(slice.peak).toFixed(0)}dB
                </button>
              ))}
            </div>
          )}
          {selectedSlice && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => selectSlice(selectedSlice)}
                className="min-h-10 rounded-lg bg-white/10 text-xs font-semibold active:bg-white/20"
              >
                Audition
              </button>
              <button
                type="button"
                onClick={mergeSelectedWithNext}
                disabled={selectedSlice.index >= slices.length - 1}
                className="min-h-10 rounded-lg bg-white/10 text-xs font-semibold active:bg-white/20 disabled:opacity-40"
              >
                Merge next
              </button>
              <button
                type="button"
                onClick={deleteSelectedSlice}
                disabled={slices.length <= 1}
                className="min-h-10 rounded-lg bg-red-950/40 text-xs font-semibold text-red-200 active:bg-red-900/50 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          )}
          {working && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="rounded-md bg-white/5 px-3 py-2 text-xs text-white/70">
                working buffer {working.length} samples
                {selectedSlice ? ` · ${selectedSlice.durationMs.toFixed(0)} ms` : ' · whole take'}
              </div>
              <SliceEditor
                slice={selectedSlice}
                samples={working}
                sampleRate={take?.sampleRate ?? 48000}
                kitRootHz={kit.rootHz}
                cleanup={cleanup}
                onUpdateCleanup={setCleanup}
                onApplyCleanup={runCleanup}
                onApplyTuning={applySliceTuning}
                onInjectSubLayer={injectSubLayer}
                lastReport={lastReport}
              />
            </div>
          )}
        </Section>

        <Section title="3 · Variants">
          <VariantGridTouch
            grid={grid}
            slots={visible}
            renders={renders}
            mutationStrength={strength}
            onUpdateStrength={setStrength}
            onAudition={auditionVariant}
            onKeep={keepVariant}
            onTrash={trashVariant}
            onBreed={breedKeeps}
            onBreedPool={breedPoolKeeps}
            onEvolve={evolve}
            isBusy={isBusy}
            canEvolve={Boolean(working)}
            onUpdateGenomeParams={updateGenomeParams}
            onRefineVariant={refineVariant}
            evolutionTarget={evolutionTarget}
            onSelectTarget={setEvolutionTarget}
            locks={geneLocks}
            onToggleLock={toggleGeneLock}
          />
          {grid && grid.bred.length > 0 && (
            <div className="mt-2 rounded-lg border border-fuchsia-500/40 bg-white/5 p-2">
              <p className="text-[10px] uppercase tracking-widest text-white/40">Bred children</p>
              {grid.bred.map((child) => (
                <div key={child.id} className="mt-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => auditionVariant(child.id)}
                    className="truncate text-left text-xs"
                  >
                    {describeGenome(child)}
                  </button>
                  <span className="shrink-0 text-[10px] text-white/40">
                    {genomeByteSize(child)} B
                  </span>
                </div>
              ))}
            </div>
          )}
          {grid && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={addToKit}
                disabled={kitCandidates.length === 0}
                className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold disabled:opacity-40"
              >
                Add kept to kit ({kitCandidates.length})
              </button>
            </div>
          )}
        </Section>

        <Section title="4 · Kit & Live Sampler">
          <div className="flex flex-col gap-3 rounded-lg bg-white/5 p-3">
            {kit.slices.length > 0 && (
              <FieldPadSampler
                kit={kit}
                renders={renders}
                sampleRate={take?.sampleRate ?? 48000}
                playAudio={play}
              />
            )}
            <div className="flex items-center gap-3">
              <CoverArt seed={`${kitPlace}_${take?.timeISO.slice(0, 10) ?? ''}`} timeISO={take?.timeISO ?? ''} />
              <div>
                <p className="text-sm font-semibold">{describeKit(kit)}</p>
                <p className="text-xs text-white/50">{kitPlace} Kit</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={detectRoot}
                disabled={kit.slices.length === 0}
                className="h-10 flex-1 rounded bg-white/10 text-xs font-semibold disabled:opacity-40"
              >
                {kit.rootHz > 0 ? `Root ${kit.rootHz.toFixed(1)} Hz` : 'Detect root'}
              </button>
              <button
                type="button"
                onClick={() => void exportKit()}
                disabled={kit.slices.length === 0 || isBusy}
                className="h-10 flex-1 rounded bg-blue-600 text-xs font-semibold disabled:opacity-40"
              >
                Export .zip
              </button>
              <button
                type="button"
                onClick={() => void exportNcbeat()}
                disabled={kit.slices.length === 0 || isBusy}
                className="h-10 flex-1 rounded bg-yellow-500 text-xs font-bold text-black active:bg-yellow-400 disabled:opacity-40"
              >
                Export .ncbeat
              </button>
            </div>
          </div>
        </Section>

        <Section title="Log">
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-white/5 p-2 text-[11px] leading-relaxed text-white/70">
            {logLines.length > 0 ? logLines.join('\n') : 'no events yet'}
          </pre>
        </Section>
      </main>

      {isRecording && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-red-900/60 bg-black/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
              <span className="font-mono text-lg tabular-nums text-white">{recSeconds.toFixed(1)}s</span>
              <span className="text-[10px] uppercase tracking-widest text-white/50">recording</span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="min-h-11 rounded-lg bg-red-600 px-6 text-sm font-bold text-white active:bg-red-500"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {isAssistantOpen && (
        <FieldAssistantModal
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
          currentGenome={
            grid?.parent ??
            makeGenome(take ? takeSeed(take.id, take.place, take.timeISO) : 101, {
              ...defaultParams(),
              layers: [{ kind: 'recording', weight: 1 }],
              transientLockEnabled: true,
            })
          }
          workingAudio={working ?? take?.samples ?? new Float32Array(0)}
          sampleRate={take?.sampleRate ?? 48000}
          analysis={working && take ? analyseSamples(working, take.sampleRate) : undefined}
          onApplyGenome={applyAssistantGenome}
          playAudio={play}
        />
      )}
    </div>
  );
}

/** Stable key for a slice within one take. */
const sliceKey = (slice: AudioSlice): string => `${slice.startSample}-${slice.endSample}`;

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="rounded-xl border border-white/10 bg-[#0b1020] p-3">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-300/80">{title}</h2>
      {children}
    </section>
  );
}

const FIELD_STAGES = ['Source', 'Slices', 'Variants', 'Kit'] as const;

/** Four-step rail: the one screen shows the whole pipeline, so show position. */
function ProgressRail({ stage }: { stage: number }): React.ReactElement {
  return (
    <div className="flex gap-1 px-4 pb-2" aria-label="Field workflow progress">
      {FIELD_STAGES.map((label, index) => {
        const step = index + 1;
        const done = step < stage;
        const current = step === stage;
        return (
          <span
            key={label}
            aria-current={current ? 'step' : undefined}
            className={`flex-1 rounded-full px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-wider ${
              current
                ? 'bg-yellow-400 text-black'
                : done
                  ? 'bg-yellow-400/20 text-yellow-300'
                  : 'bg-white/5 text-white/35'
            }`}
          >
            {step} {label}
          </span>
        );
      })}
    </div>
  );
}

/** Deterministic cover art: the same take draws the same sleeve everywhere. */
function CoverArt({ seed, timeISO }: { seed: string; timeISO: string }): React.ReactElement {
  const params = useMemo(() => coverArtParams(seed, timeISO), [seed, timeISO]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const size = canvas.width;
    context.clearRect(0, 0, size, size);
    context.fillStyle = params.palette[0];
    context.fillRect(0, 0, size, size);
    context.save();
    context.translate(size / 2, size / 2);
    context.rotate((params.rotation * Math.PI) / 180);
    for (let band = 0; band < params.bands; band++) {
      context.fillStyle = params.palette[band % params.palette.length];
      context.globalAlpha = 0.35 + (band / params.bands) * 0.5;
      const height = (size / params.bands) * 0.6;
      context.fillRect(-size, -size / 2 + (band * size) / params.bands, size * 2, height);
    }
    context.restore();
    context.globalAlpha = 1;
  }, [params]);

  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={96}
      role="img"
      aria-label="cover art seeded by place and time"
      className="h-24 w-24 rounded-md"
    />
  );
}