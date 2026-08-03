import * as Tone from 'tone';
import { audioEngine } from '../../lib/audioEngine';

type Listener = (info: { type: 'tick' | 'bar'; position: number }) => void;

class TransportHost {
  private initialized = false;
  private listeners = new Set<Listener>();

  init(): void {
    if (this.initialized) return;
    const shared = audioEngine.getContext();
    if (!shared) {
      throw new Error('audioEngine.getContext() returned null — call init after AudioEngine boots');
    }
    Tone.setContext(shared);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setBpm(bpm: number): void {
    Tone.Transport.bpm.value = bpm;
  }

  setTimeSignature(beats: 3 | 4 | 6, _noteValue: 4 | 8): void {
    Tone.Transport.timeSignature = beats;
  }

  setSwing(swing: number): void {
    const clamped = Math.min(0.66, Math.max(0, swing));
    Tone.Transport.swing = clamped;
    Tone.Transport.swingSubdivision = '16n';
  }

  play(): void {
    Tone.Transport.start();
  }

  pause(): void {
    Tone.Transport.pause();
  }

  stop(): void {
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
  }

  getPosition(): number {
    return Tone.Transport.seconds;
  }

  onTick(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const host = new TransportHost();

export function initTransport(): void {
  host.init();
}

export function getTransport(): TransportHost {
  if (!host.isInitialized()) {
    throw new Error('Transport not initialized — call initTransport() first');
  }
  return host;
}

export function resetTransport(): void {
  (host as any).initialized = false;
  (host as any).listeners = new Set();
}
