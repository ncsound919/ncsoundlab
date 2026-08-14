/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SoundLayer, DEFAULT_ENVELOPE, DEFAULT_FX, DEFAULT_SYNTH } from '../types';
import { audioEngine as sharedAudioEngine } from './AudioEngine';
import { audioEngine as baseAudioEngine } from '../lib/audioEngine';
import { dbToGain, gainToDb, safeAudioValue } from '../lib/audioUtils';
import { generateChaosSynthBuffer } from '../lib/chaosSynth';

/**
 * SoundLayerPlayer provides playback capability for individual SoundLayers,
 * supporting MIDI note playback, layer gain control in dB, and ducking via SharedAudioEngine.
 */
export class SoundLayerPlayer {
  private loadedLayers: Map<string, SoundLayer> = new Map();
  private layerGainsDb: Map<string, number> = new Map();
  private activeNodes: Map<string, { source: AudioScheduledSourceNode; gainNode: GainNode }[]> = new Map();

  /**
   * Load or register a SoundLayer for playback.
   */
  async loadLayer(layer: SoundLayer): Promise<void> {
    this.loadedLayers.set(layer.id, layer);
    
    // Default initial gain in dB if not already set
    if (!this.layerGainsDb.has(layer.id)) {
      const initialDb = layer.gain > 0 ? gainToDb(layer.gain) : -6;
      this.layerGainsDb.set(layer.id, initialDb);
    }

    const ctx = baseAudioEngine.getContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  /**
   * Set layer gain in dB (e.g. -6 for -6dB)
   */
  setGain(layerId: string, gainDb: number): void {
    this.layerGainsDb.set(layerId, gainDb);

    // Update active nodes if currently playing
    const active = this.activeNodes.get(layerId);
    if (active) {
      const linearGain = dbToGain(gainDb);
      const ctx = baseAudioEngine.getContext();
      if (ctx) {
        active.forEach(({ gainNode }) => {
          gainNode.gain.setTargetAtTime(linearGain, ctx.currentTime, 0.02);
        });
      }
    }
  }

  /**
   * Get layer gain in dB
   */
  getGain(layerId: string): number {
    if (this.layerGainsDb.has(layerId)) {
      return this.layerGainsDb.get(layerId)!;
    }
    const layer = this.loadedLayers.get(layerId);
    if (layer) {
      return gainToDb(layer.gain);
    }
    return 0;
  }

  /**
   * Play a MIDI note for a SoundLayer.
   * MIDI note 60 = Middle C (C4 = ~261.63Hz or 0 semitone offset).
   * MIDI note 69 = A4 (440Hz).
   * `velocity` is 0..1 (linearly scaled to 0..127 MIDI velocity when stored
   * on the pattern cell). Defaults to 1.
   */
  playNote(layer: SoundLayer, noteNumber: number = 60, duration: number = 1.0, velocity: number = 1.0): void {
    if (!layer.enabled) return;

    const ctx = baseAudioEngine.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const startTime = ctx.currentTime;

    // A sample layer with no decoded buffer can't play — don't silently
    // synthesize a tone for it (mirrors audioEngine.triggerLayer).
    if (layer.type === 'sample' && !layer.audioBuffer) return;

    // Defensive: a non-finite/negative/absurd duration would otherwise flow
    // into createBuffer length (Infinity → RangeError), envelope ramps, and
    // the source .stop() scheduling.
    const safeDuration = Number.isFinite(duration) && duration > 0 ? Math.min(duration, 30) : 1;

    // Calculate custom gain override from setGain (dB to linear)
    const dbGain = this.getGain(layer.id);
    const customLinearGain = dbToGain(dbGain);

    // Velocity scales the per-note gain linearly (0..1) on top of the layer's
    // base gain. A velocity of 0 is allowed (audible silence) for explicit
    // "step is on but quiet" entries.
    const velocityGain = safeAudioValue(velocity, 1);
    const noteGain = customLinearGain * velocityGain;

    // Create primary oscillator or sample source
    let sourceNode: AudioBufferSourceNode | OscillatorNode;
    let startOffset = 0;

    const noteGainNode = ctx.createGain();
    const panNode = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter();

    const env = layer.envelope || DEFAULT_ENVELOPE;
    const fx = layer.fx || DEFAULT_FX;
    const synth = layer.synth || DEFAULT_SYNTH;

    if (layer.type === 'sample' && layer.audioBuffer) {
      const s = ctx.createBufferSource();
      s.buffer = layer.audioBuffer;
      
      // Calculate playback rate from MIDI note transposition (note 60 = 1x speed)
      const semitonesFromMiddleC = (noteNumber - 60) + (layer.pitch || 0);
      s.playbackRate.value = safeAudioValue(Math.pow(2, semitonesFromMiddleC / 12), 1);
      // Honor the layer's crop (playStartPct/playEndPct are 0..1 fractions) so
      // MIDI/note playback matches the edited region instead of the whole file.
      const startPct = Math.max(0, Math.min(1, layer.playStartPct ?? 0));
      const endPct = Math.max(0, Math.min(1, layer.playEndPct ?? 1));
      const bufferDur = layer.audioBuffer.duration;
      if (endPct > startPct) {
        startOffset = startPct * bufferDur;
      }
      sourceNode = s;
    } else {
      const midiFrequency = 440 * Math.pow(2, (noteNumber - 69) / 12);
      const settings = {
        ...DEFAULT_SYNTH,
        ...synth,
        frequency: midiFrequency,
      };
      const noteDur = Math.max(0.2, safeDuration + (env.release || 0.1) + 0.1);
      const s = ctx.createBufferSource();
      s.buffer = generateChaosSynthBuffer(ctx, settings, noteDur);
      sourceNode = s;
    }

    // Apply Envelope
    const safeAttack = Math.max(0.005, env.attack ?? 0.005);
    const safeDecay = Math.max(0.005, env.decay ?? 0.1);
    const safeRelease = Math.max(0.005, env.release ?? 0.1);
    const peakGain = Math.max(0, noteGain);
    const sustainGain = Math.max(0, peakGain * (env.sustain ?? 0.8));

    noteGainNode.gain.cancelScheduledValues(startTime);
    noteGainNode.gain.setValueAtTime(0, startTime);

    const relStart = startTime + safeDuration;
    const attackEnd = startTime + safeAttack;
    const decayEnd = attackEnd + safeDecay;

    if (safeDuration <= safeAttack) {
      const peakVal = peakGain * (safeDuration / safeAttack);
      noteGainNode.gain.linearRampToValueAtTime(peakVal, relStart);
      this.releaseEnvelope(noteGainNode, peakVal, relStart, safeRelease);
    } else if (safeDuration <= safeAttack + safeDecay) {
      const decayProgress = (safeDuration - safeAttack) / safeDecay;
      const midVal = peakGain - (peakGain - sustainGain) * decayProgress;
      noteGainNode.gain.linearRampToValueAtTime(peakGain, attackEnd);
      noteGainNode.gain.linearRampToValueAtTime(midVal, relStart);
      this.releaseEnvelope(noteGainNode, midVal, relStart, safeRelease);
    } else {
      noteGainNode.gain.linearRampToValueAtTime(peakGain, attackEnd);
      noteGainNode.gain.linearRampToValueAtTime(sustainGain, decayEnd);
      noteGainNode.gain.setValueAtTime(sustainGain, relStart);
      this.releaseEnvelope(noteGainNode, sustainGain, relStart, safeRelease);
    }

    // Filter FX
    filter.type = fx.filterType || 'lowpass';
    filter.frequency.setValueAtTime(fx.filterFreq ?? 20000, startTime);
    filter.Q.setValueAtTime(fx.filterRes ?? 1, startTime);

    sourceNode.connect(filter);
    filter.connect(panNode);
    panNode.pan.setValueAtTime(layer.pan, startTime);
    panNode.connect(noteGainNode);

    // Connect to SharedAudioEngine's module gain node (ducking/analyser) or destination
    const moduleInput = sharedAudioEngine.getModuleGainNode(layer.id);
    if (moduleInput) {
      noteGainNode.connect(moduleInput);
    } else {
      noteGainNode.connect(ctx.destination);
    }

    // Track active node
    if (!this.activeNodes.has(layer.id)) {
      this.activeNodes.set(layer.id, []);
    }
    const nodeItem = { source: sourceNode, gainNode: noteGainNode };
    this.activeNodes.get(layer.id)!.push(nodeItem);

    sourceNode.start(startTime, startOffset || 0);
    sourceNode.stop(startTime + safeDuration + safeRelease + 0.005);

    sourceNode.onended = () => {
      const active = this.activeNodes.get(layer.id);
      if (active) {
        this.activeNodes.set(
          layer.id,
          active.filter((n) => n !== nodeItem)
        );
      }
    };
  }

  /**
   * Exponential (musical) release for a note's gain envelope. Linear ramps to 0
   * sound abrupt on tails; exponential decay is the perceptually-correct fade.
   * Guards against ramping exponentially from an already-zero level.
   */
  private releaseEnvelope(gainNode: GainNode, fromLevel: number, relStart: number, releaseSec: number): void {
    if (fromLevel > 0.0001) {
      gainNode.gain.exponentialRampToValueAtTime(0.0001, relStart + releaseSec);
      gainNode.gain.setValueAtTime(0, relStart + releaseSec + 0.005);
    } else {
      gainNode.gain.linearRampToValueAtTime(0, relStart + releaseSec);
    }
  }

  /**
   * Stop all active note playback for a layer cleanly with anti-click fade
   */
  stop(layerId: string): void {
    const active = this.activeNodes.get(layerId);
    if (active) {
      const ctx = sharedAudioEngine.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      active.forEach(({ source, gainNode }) => {
        // Schedule the physical stop after the anti-click fade regardless of
        // whether the gain ramp succeeds below.
        setTimeout(() => {
          try {
            source.stop();
          } catch (e) {}
        }, 12);
        try {
          if (gainNode) {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.008);
          }
        } catch (e) {
          try {
            source.stop();
          } catch (e) {}
        }
      });
      this.activeNodes.set(layerId, []);
    }
  }

  /**
   * Unload a layer
   */
  unloadLayer(layerId: string): void {
    this.stop(layerId);
    this.loadedLayers.delete(layerId);
    this.layerGainsDb.delete(layerId);
    sharedAudioEngine.disposeModule(layerId);
  }
}

export default SoundLayerPlayer;
