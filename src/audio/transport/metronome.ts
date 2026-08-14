import { audioEngine } from '../../lib/audioEngine';
import { createClickNodes } from './clickNodes';

export const ACCENT_FREQ = 'C5';
export const TICK_FREQ = 'C3';

export interface ClickHit {
  freq: string;
  accent: boolean;
}

/**
 * Given beat position within a bar and the total beats in the bar, returns
 * the click sound to play. Beat 0 = accent, all others = tick.
 * Pure function — exported for testing.
 */
export function clickBeat(beatInBar: number, _bar: number, beatsPerBar: number): ClickHit {
  const isAccent = beatInBar % beatsPerBar === 0;
  return isAccent
    ? { freq: ACCENT_FREQ, accent: true }
    : { freq: TICK_FREQ, accent: false };
}

export interface Metronome {
  setEnabled(enabled: boolean): void;
  setVolume(v: number): void;
  scheduleAtBeat(beatInBar: number, bar: number, beatsPerBar: number, time: number): void;
  dispose(): void;
}

export function createMetronome(): Metronome {
  const { accent, tick, out } = createClickNodes();
  const rackIn = audioEngine.getMasterRackInput();
  if (rackIn) {
    (out as unknown as { connect: (n: AudioNode) => void }).connect(rackIn as unknown as AudioNode);
  }

  let enabled = true;
  let volume = 0.5;

  function updateVolume(): void {
    out.gain.rampTo(volume, 0.01);
  }
  updateVolume();

  return {
    setEnabled(on: boolean) {
      enabled = on;
    },
    setVolume(v: number) {
      volume = Math.min(1, Math.max(0, v));
      updateVolume();
    },
    scheduleAtBeat(beatInBar: number, bar: number, beatsPerBar: number, time: number) {
      if (!enabled) return;
      const hit = clickBeat(beatInBar, bar, beatsPerBar);
      if (hit.accent) {
        accent.triggerAttackRelease(hit.freq, '32n', time);
      } else {
        tick.triggerAttackRelease('32n', time);
      }
    },
    dispose() {
      accent.dispose();
      tick.dispose();
      out.dispose();
    },
  };
}
