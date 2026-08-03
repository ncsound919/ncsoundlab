/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { audioEngine as baseAudioEngine } from '../lib/audioEngine';
import { SoundLayerPlayer } from './SoundLayerPlayer';
import { dbToGain, gainToDb, safeAudioValue } from '../lib/audioUtils';

export { SoundLayerPlayer };

/**
 * SharedAudioEngine provides high‑level audio features built on top of a base audio engine.
 * - Microphone capture with real‑time frequency analysis
 * - Per‑module AnalyserNodes for visualisation / monitoring
 * - Per‑module gain control (gain reduction in dB) for e.g. ducking
 */
class SharedAudioEngine {
  private base = baseAudioEngine;

  // ---- Microphone ----
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micStartPromise: Promise<void> | null = null;

  // ---- Module processing ----
  private moduleNodes: Map<string, { analyser: AnalyserNode; gain: GainNode }> = new Map();

  getContext(): AudioContext | null {
    return this.base.getContext();
  }

  // ---------------------------------------------------------------------------
  //  Microphone
  // ---------------------------------------------------------------------------

  /**
   * Request microphone access and start feeding the analyser.
   * The audio is *not* routed to the speakers – it is only used for analysis.
   */
  async startMicrophone(): Promise<void> {
    if (this.micStream) {
      // Already running
      return;
    }

    // Lock to prevent concurrent acquire attempts
    if (this.micStartPromise) {
      return this.micStartPromise;
    }

    this.micStartPromise = (async () => {
      try {
        const ctx = this.base.getContext();
        if (!ctx) {
          throw new Error('AudioContext not available');
        }

        // Ensure the context is allowed to run (user gesture may be required)
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.micStream = stream;

        this.micAnalyser = ctx.createAnalyser();
        this.micAnalyser.fftSize = 2048; // reasonable default for visualisation

        this.micSource = ctx.createMediaStreamSource(stream);
        this.micSource.connect(this.micAnalyser);
        // Analyser is intentionally not connected to destination → no feedback
      } catch (err) {
        console.error('Failed to start microphone:', err);
        this.stopMicrophone(); // Cleanup partial state
        throw err;
      } finally {
        this.micStartPromise = null;
      }
    })();

    return this.micStartPromise;
  }

  /**
   * Stop the microphone and release the hardware.
   */
  stopMicrophone(): void {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.micAnalyser) {
      this.micAnalyser.disconnect();
      this.micAnalyser = null;
    }
  }

  /**
   * Returns the current frequency data from the microphone analyser.
   * Returns an empty array if the microphone is not active.
   */
  getAnalyserData(): Uint8Array {
    if (!this.micAnalyser) {
      return new Uint8Array(0);
    }
    const data = new Uint8Array(this.micAnalyser.frequencyBinCount);
    this.micAnalyser.getByteFrequencyData(data);
    return data;
  }

  // ---------------------------------------------------------------------------
  //  Module analyser & gain
  // ---------------------------------------------------------------------------

  /**
   * Retrieve (or lazily create) an AnalyserNode for the given module.
   * A corresponding GainNode is also created and connected **before** the
   * analyser so that gain reduction can be applied and still measured.
   *
   * Connection order: `source → [GainNode] → AnalyserNode`
   * The module is responsible for connecting its audio source to the GainNode
   * (use `getModuleGainNode()` for that purpose).
   */
  getModuleAnalyser(moduleId: string, fftSize: number = 1024): AnalyserNode | null {
    const ctx = this.base.getContext();
    if (!ctx) return null;

    let entry = this.moduleNodes.get(moduleId);
    if (!entry) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;

      const gain = ctx.createGain();
      // Use the helper to initialize gain value
      gain.gain.value = dbToGain(this.defaultGainReduction);

      // Internal chain: gain → analyser → destination
      // Analyser is connected to destination so we can monitor output
      gain.connect(analyser);
      analyser.connect(ctx.destination);

      entry = { analyser, gain };
      this.moduleNodes.set(moduleId, entry);
    } else {
      // Update fftSize if it changed
      if (entry.analyser.fftSize !== fftSize) {
        entry.analyser.fftSize = fftSize;
      }
    }

    return entry.analyser;
  }

  /**
   * Returns the GainNode that should be used as the input for a module's
   * audio chain. Call `getModuleGainNode(id)` and connect your source to it.
   */
  getModuleGainNode(moduleId: string): GainNode | null {
    // Trigger lazy creation if not yet present
    this.getModuleAnalyser(moduleId);
    const entry = this.moduleNodes.get(moduleId);
    return entry ? entry.gain : null;
  }

  /**
   * Disposes of the nodes associated with a module to prevent memory leaks.
   */
  disposeModule(moduleId: string): void {
    const entry = this.moduleNodes.get(moduleId);
    if (entry) {
      entry.gain.disconnect();
      entry.analyser.disconnect();
      this.moduleNodes.delete(moduleId);
    }
  }

  private defaultGainReduction = -2.5; // dB

  /**
   * Get the current gain reduction for a module in dB.
   */
  getModuleGainReduction(moduleId: string): number {
    const entry = this.moduleNodes.get(moduleId);
    if (!entry) return this.defaultGainReduction;
    return gainToDb(entry.gain.gain.value);
  }

  /**
   * Set the gain reduction for a module in dB (negative values reduce volume).
   * This updates the internal GainNode immediately.
   */
  setModuleGainReduction(moduleId: string, db: number): void {
    // Sanitize input
    if (isNaN(db)) return;
    const clampedDb = Math.max(-100, Math.min(12, db));

    // Ensure the module nodes exist
    this.getModuleAnalyser(moduleId);
    const entry = this.moduleNodes.get(moduleId);
    if (entry) {
      entry.gain.gain.setTargetAtTime(dbToGain(clampedDb), this.base.getContext()?.currentTime || 0, 0.01);
    }
  }
}

export const audioEngine = new SharedAudioEngine();