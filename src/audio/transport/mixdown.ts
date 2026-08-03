import type { Pattern, SongChain, SoundLayer } from '../../types';
import { PATTERN_IDS } from '../../store/patternStore';

export type MixdownCellTiming = { patternId: string; layerId: string; stepIdx: number; timeSec: number };

export interface MixdownOptions {
  patterns: Record<string, Pattern>;
  chain: SongChain;
  /** Full layer list so mixdown can locate each cell's audio buffer by id. */
  layers?: SoundLayer[];
  sampleRate?: number;
}

const secPer16th = (bpm: number) => 60 / bpm / 4;

export function calculatePatternDurationSec(steps: number, bpm: number, _timeSignature: [number, number]): number {
  return steps * secPer16th(bpm);
}

export function calculateSongDurationSec(patterns: Record<string, Pattern>, chain: SongChain): number {
  let total = 0;
  for (const pid of chain.order) {
    const p = patterns[pid];
    if (!p) continue;
    total += calculatePatternDurationSec(p.stepLength, p.bpm, p.timeSignature);
  }
  return total;
}

export function planMixdown(opts: MixdownOptions): { durationSec: number; cellTimings: MixdownCellTiming[] } {
  const cellTimings: MixdownCellTiming[] = [];
  let cursor = 0;
  for (const pid of opts.chain.order) {
    const p = opts.patterns[pid];
    if (!p) continue;
    const stepDur = secPer16th(p.bpm);
    for (const [layerId, row] of Object.entries(p.layerRows)) {
      for (let i = 0; i < row.length; i++) {
        if (row[i].on) {
          cellTimings.push({ patternId: pid, layerId, stepIdx: i, timeSec: cursor + i * stepDur });
        }
      }
    }
    cursor += calculatePatternDurationSec(p.stepLength, p.bpm, p.timeSignature);
  }
  return { durationSec: cursor, cellTimings };
}

/**
 * Render the pattern/song-chain to a stereo AudioBuffer using an
 * OfflineAudioContext. Each cell's layer audio buffer is scheduled at its
 * planned time. v1 renders straight to the offline destination (FX-bypass is
 * acceptable); no Tone.Offline is used — this mirrors the engine's own
 * offline path.
 */
export async function renderMixdown(opts: MixdownOptions): Promise<AudioBuffer> {
  const plan = planMixdown(opts);
  const sampleRate = opts.sampleRate ?? 44100;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * Math.max(0.05, plan.durationSec)), sampleRate);
  const master = offlineCtx.createGain();
  master.gain.value = 1;
  master.connect(offlineCtx.destination);
  const layers = opts.layers || [];
  for (const cell of plan.cellTimings) {
    const layer = layers.find((l) => l.id === cell.layerId);
    if (!layer || !layer.audioBuffer) continue;
    const src = offlineCtx.createBufferSource();
    src.buffer = layer.audioBuffer;
    const g = offlineCtx.createGain();
    g.gain.value = layer.gain ?? 1;
    src.connect(g);
    g.connect(master);
    src.start(cell.timeSec);
  }
  return await offlineCtx.startRendering();
}

void PATTERN_IDS;