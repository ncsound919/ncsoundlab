/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReferenceTrack } from '../types';
import { safeAudioValue } from '../lib/audioUtils';
import { analyzeLoudness, type LoudnessResult } from 'bravoh-loudness';

class CompareEngine {
  private ctx: AudioContext | null = null;
  private refSourceNode: AudioBufferSourceNode | null = null;
  private mixSourceNode: AudioBufferSourceNode | null = null;
  private mixBuffer: AudioBuffer | null = null;

  // Cached EBU R128 (BS.1770-4) loudness per loaded buffer.
  private refLoudness: LoudnessResult | null = null;
  private mixLoudness: LoudnessResult | null = null;

  private refGainNode: GainNode | null = null;
  private mixGainNode: GainNode | null = null;

  private refAnalyser: AnalyserNode | null = null;
  private mixAnalyser: AnalyserNode | null = null;

  private activeSource: 'A' | 'B' = 'A';
  private refStartTime = 0;
  private refOffset = 0;
  private mixStartTime = 0;
  private mixOffset = 0;

  private isPlayingRef = false;
  private isPlayingMix = false;

  private loopA = { start: 0, end: 0, enabled: false };
  private loopB = { start: 0, end: 0, enabled: false };

  private analysisBuffer: Float32Array | null = null;

  constructor() {
    // Lazy audio context setup
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.refGainNode = this.ctx.createGain();
      this.mixGainNode = this.ctx.createGain();

      this.refAnalyser = this.ctx.createAnalyser();
      this.mixAnalyser = this.ctx.createAnalyser();
      this.refAnalyser.fftSize = 1024;
      this.mixAnalyser.fftSize = 1024;
      
      this.analysisBuffer = new Float32Array(1024);

      this.refGainNode.connect(this.refAnalyser);
      this.mixGainNode.connect(this.mixAnalyser);

      this.refGainNode.connect(this.ctx.destination);
      this.mixGainNode.connect(this.ctx.destination);

      this.updateGainStates();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setSource(source: 'A' | 'B') {
    this.activeSource = source;
    this.updateGainStates();
  }

  private updateGainStates() {
    if (!this.refGainNode || !this.mixGainNode) return;
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (this.activeSource === 'A') {
      this.refGainNode.gain.setTargetAtTime(1, now, 0.01);
      this.mixGainNode.gain.setTargetAtTime(0, now, 0.01);
    } else {
      this.refGainNode.gain.setTargetAtTime(0, now, 0.01);
      this.mixGainNode.gain.setTargetAtTime(1, now, 0.01);
    }
  }

  setRefGain(db: number) {
    if (!this.refGainNode || !this.ctx) return;
    const safeDb = safeAudioValue(db, -100);
    const linear = Math.pow(10, safeDb / 20);
    this.refGainNode.gain.setTargetAtTime(
      this.activeSource === 'A' ? linear : 0,
      this.ctx.currentTime,
      0.01
    );
  }

  private computeLoudness(buffer: AudioBuffer): LoudnessResult | null {
    try {
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        channels.push(buffer.getChannelData(c));
      }
      // truePeak disabled: integrated/short-term/momentary LUFS are unaffected
      // and this keeps long-buffer analysis well under real-time.
      return analyzeLoudness(channels, { sampleRateHz: buffer.sampleRate, truePeak: false });
    } catch (err) {
      console.warn('Loudness analysis notice:', err);
      return null;
    }
  }

  async loadTrackFromFile(file: File): Promise<ReferenceTrack> {
    this.initContext();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await this.ctx!.decodeAudioData(arrayBuffer);

    this.refLoudness = this.computeLoudness(buffer);

    const peakMap: number[] = [];
    const numPoints = 150;
    const data = buffer.getChannelData(0);
    const step = Math.floor(data.length / numPoints);

    for (let i = 0; i < numPoints; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, data.length);
      for (let j = start; j < end; j++) {
        const val = Math.abs(data[j]);
        if (val > max) max = val;
      }
      peakMap.push(max);
    }

    return {
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      duration: buffer.duration,
      channels: buffer.numberOfChannels,
      buffer,
      peakMap,
    };
  }

  setMixBuffer(buffer: AudioBuffer) {
    this.mixBuffer = buffer;
    this.mixLoudness = this.computeLoudness(buffer);
  }

  getMixTrackBuffer(): AudioBuffer | null {
    return this.mixBuffer;
  }

  playReference(buffer: AudioBuffer, startSeconds = 0) {
    this.initContext();
    this.stopReference();

    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.connect(this.refGainNode!);

    if (this.loopA.enabled && this.loopA.end > this.loopA.start) {
      src.loop = true;
      src.loopStart = this.loopA.start;
      src.loopEnd = this.loopA.end;
    }

    src.start(0, startSeconds);
    this.refSourceNode = src;
    this.refStartTime = this.ctx!.currentTime;
    this.refOffset = startSeconds;
    this.isPlayingRef = true;
  }

  pauseReference() {
    if (this.refSourceNode) {
      this.refOffset = this.getRefPlaybackPosition();
      this.stopReference();
    }
    this.isPlayingRef = false;
  }

  stopReference() {
    if (this.refSourceNode) {
      try {
        this.refSourceNode.stop();
        this.refSourceNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.refSourceNode = null;
    }
    this.isPlayingRef = false;
  }

  playMixFile(startSeconds = 0) {
    if (!this.mixBuffer) return;
    this.initContext();
    this.stopMixFile();

    const src = this.ctx!.createBufferSource();
    src.buffer = this.mixBuffer;
    src.connect(this.mixGainNode!);

    if (this.loopB.enabled && this.loopB.end > this.loopB.start) {
      src.loop = true;
      src.loopStart = this.loopB.start;
      src.loopEnd = this.loopB.end;
    }

    src.start(0, startSeconds);
    this.mixSourceNode = src;
    this.mixStartTime = this.ctx!.currentTime;
    this.mixOffset = startSeconds;
    this.isPlayingMix = true;
  }

  pauseMixFile() {
    if (this.mixSourceNode) {
      this.mixOffset = this.getMixPlaybackPosition();
      this.stopMixFile();
    }
    this.isPlayingMix = false;
  }

  stopMixFile() {
    if (this.mixSourceNode) {
      try {
        this.mixSourceNode.stop();
        this.mixSourceNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.mixSourceNode = null;
    }
    this.isPlayingMix = false;
  }

  getRefPlaybackPosition(): number {
    if (!this.isPlayingRef || !this.ctx) return this.refOffset;
    return Math.max(0, this.ctx.currentTime - this.refStartTime + this.refOffset);
  }

  getMixPlaybackPosition(): number {
    if (!this.isPlayingMix || !this.ctx) return this.mixOffset;
    return Math.max(0, this.ctx.currentTime - this.mixStartTime + this.mixOffset);
  }

  setLoopA(start: number, end: number, enabled: boolean) {
    this.loopA = { start, end, enabled };
  }

  setLoopB(start: number, end: number, enabled: boolean) {
    this.loopB = { start, end, enabled };
  }

  getLoopB() {
    return this.loopB;
  }

  getMeterData() {
    let refPeak = -100;
    let refRms = -100;
    let refLufs = -100;

    let mixPeak = -100;
    let mixRms = -100;
    let mixLufs = -100;

    if (this.refAnalyser && this.analysisBuffer) {
      const data = this.analysisBuffer;
      this.refAnalyser.getFloatTimeDomainData(data);
      let sum = 0;
      let p = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > p) p = v;
        sum += v * v;
      }
      if (p > 0) refPeak = 20 * Math.log10(p);
      const rms = Math.sqrt(sum / data.length);
      if (rms > 0) {
        refRms = 20 * Math.log10(rms);
        // Prefer real EBU R128 integrated LUFS when the buffer has been analyzed.
        const integrated = this.refLoudness?.integratedLufs;
        refLufs = integrated !== undefined && Number.isFinite(integrated)
          ? integrated
          : refRms - 0.6; // fallback approximation while live
      }
    }

    if (this.mixAnalyser && this.analysisBuffer) {
      const data = this.analysisBuffer;
      this.mixAnalyser.getFloatTimeDomainData(data);
      let sum = 0;
      let p = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > p) p = v;
        sum += v * v;
      }
      if (p > 0) mixPeak = 20 * Math.log10(p);
      const rms = Math.sqrt(sum / data.length);
      if (rms > 0) {
        mixRms = 20 * Math.log10(rms);
        const integrated = this.mixLoudness?.integratedLufs;
        mixLufs = integrated !== undefined && Number.isFinite(integrated)
          ? integrated
          : mixRms - 0.6;
      }
    }

    return {
      refPeak,
      refRms,
      refLufs,
      refCorr: 0.92,
      refWidth: 100,
      mixPeak,
      mixRms,
      mixLufs,
      mixCorr: 0.88,
      mixWidth: 100,
    };
  }
}

export const compareEngine = new CompareEngine();
