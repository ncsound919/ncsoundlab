import type { Pattern, SongChain, SoundLayer } from '../../types';
import { DEFAULT_SYNTH } from '../../types';
import { PATTERN_IDS } from '../../store/patternStore';
import { generateChaosSynthBuffer } from '../../lib/chaosSynth';

export type MixdownCellTiming = {
  patternId: string;
  layerId: string;
  stepIdx: number;
  timeSec: number;
  /** Melodic content, so mixdown matches what the sequencer triggers. */
  note?: number;
  notes?: number[];
  velocity?: number;
  duration?: number;
};

const noteFrequency = (midiNote: number): number => 440 * Math.pow(2, (midiNote - 69) / 12);

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
        const cell = row[i];
        if (cell.on) {
          cellTimings.push({
            patternId: pid,
            layerId,
            stepIdx: i,
            timeSec: cursor + i * stepDur,
            note: cell.note,
            notes: cell.notes,
            velocity: cell.velocity,
            duration: cell.duration,
          });
        }
      }
    }
    cursor += calculatePatternDurationSec(p.stepLength, p.bpm, p.timeSignature);
  }
  return { durationSec: cursor, cellTimings };
}

/**
 * Render the pattern/song-chain to a stereo AudioBuffer using an
 * OfflineAudioContext. Each cell is scheduled at its planned time and honours
 * the cell's note(s), velocity and duration. Sample layers play their buffer
 * (crop + transposition); synth layers are rendered from their synth settings
 * (so they are no longer silently dropped). Renders straight to the offline
 * destination — the offline master-rack FX is not rebuilt here (see
 * `AudioEngine.exportWav` for the full-chain offline path).
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
    if (!layer || layer.muted === true || layer.enabled === false) continue;

    const pattern = opts.patterns[cell.patternId];
    const stepDur = pattern ? secPer16th(pattern.bpm) : 0.125;
    const velocity = typeof cell.velocity === 'number' ? Math.max(0, Math.min(1, cell.velocity / 127)) : 1;
    const gateSec = typeof cell.duration === 'number' && cell.duration > 0 ? cell.duration * stepDur : undefined;
    const release = layer.envelope?.release ?? 0.1;
    const notes = cell.notes && cell.notes.length > 0 ? cell.notes : cell.note !== undefined ? [cell.note] : [null];

    for (const note of notes) {
      let buffer = layer.audioBuffer;
      let playbackRate = 1;
      let startOffset = 0;

      if (layer.type === 'synth' && !buffer) {
        const settings = {
          ...DEFAULT_SYNTH,
          ...(layer.synth || {}),
          frequency: note !== null ? noteFrequency(note) : (layer.synth?.frequency ?? 440),
        };
        buffer = generateChaosSynthBuffer(offlineCtx, settings, (gateSec ?? 1.5) + release + 0.1);
      } else if (layer.type === 'sample' && buffer) {
        startOffset = (layer.playStartPct ?? 0) * buffer.duration;
        const semis = (note !== null ? note - 60 : 0) + (layer.pitch || 0);
        playbackRate = Math.pow(2, semis / 12);
      } else if (layer.type === 'sample') {
        continue; // sample with no buffer can't render
      }

      const src = offlineCtx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = playbackRate;
      const g = offlineCtx.createGain();
      g.gain.value = (layer.gain ?? 1) * velocity;
      src.connect(g);
      g.connect(master);
      const naturalDur = buffer.duration / playbackRate;
      src.start(cell.timeSec, startOffset);
      src.stop(cell.timeSec + (gateSec ?? naturalDur) + release + 0.005);
    }
  }
  return await offlineCtx.startRendering();
}

void PATTERN_IDS;