/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReferenceTrack } from '../types';
import { safeAudioValue } from '../lib/audioUtils';
import { analyzeLoudness, type LoudnessResult } from 'bravoh-loudness';

export class CompareEngine {
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

  // Per-channel taps for real stereo correlation/width. A ChannelSplitterNode
  // is a pure tap — it feeds the L/R analysers without touching the audible
  // path (the bus analyser still carries the signal to the destination).
  private refSplitter: ChannelSplitterNode | null = null;
  private mixSplitter: ChannelSplitterNode | null = null;
  private refAnalyserL: AnalyserNode | null = null;
  private refAnalyserR: AnalyserNode | null = null;
  private mixAnalyserL: AnalyserNode | null = null;
  private mixAnalyserR: AnalyserNode | null = null;

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
  private analysisBufferL: Float32Array | null = null;
  private analysisBufferR: Float32Array | null = null;

  constructor() {
    // Lazy audio context setup
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      // 'playback' latencyHint: the Compare Engine is sustained A/B reference
      // listening — favor glitch-free rendering over the tightest latency.
      this.ctx = new AudioCtx({ latencyHint: 'playback' });
      this.refGainNode = this.ctx.createGain();
      this.mixGainNode = this.ctx.createGain();

      this.refAnalyser = this.ctx.createAnalyser();
      this.mixAnalyser = this.ctx.createAnalyser();
      this.refAnalyser.fftSize = 1024;
      this.mixAnalyser.fftSize = 1024;

      this.refSplitter = this.ctx.createChannelSplitter(2);
      this.mixSplitter = this.ctx.createChannelSplitter(2);
      this.refAnalyserL = this.ctx.createAnalyser();
      this.refAnalyserR = this.ctx.createAnalyser();
      this.mixAnalyserL = this.ctx.createAnalyser();
      this.mixAnalyserR = this.ctx.createAnalyser();
      this.refAnalyserL.fftSize = 2048;
      this.refAnalyserR.fftSize = 2048;
      this.mixAnalyserL.fftSize = 2048;
      this.mixAnalyserR.fftSize = 2048;
      this.refGainNode.connect(this.refSplitter);
      this.mixGainNode.connect(this.mixSplitter);
      this.refSplitter.connect(this.refAnalyserL, 0);
      this.refSplitter.connect(this.refAnalyserR, 1);
      this.mixSplitter.connect(this.mixAnalyserL, 0);
      this.mixSplitter.connect(this.mixAnalyserR, 1);
      
      this.analysisBuffer = new Float32Array(1024);
      this.analysisBufferL = new Float32Array(2048);
      this.analysisBufferR = new Float32Array(2048);

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

    // Real stereo correlation/width from the per-bus splitter taps. NaN only
    // when there is genuinely nothing to measure (no context/nodes yet) —
    // the panel renders that as "—".
    const refStereo = this.stereoStats(this.refAnalyserL, this.refAnalyserR);
    const mixStereo = this.stereoStats(this.mixAnalyserL, this.mixAnalyserR);
    return {
      refPeak,
      refRms,
      refLufs,
      refCorr: refStereo.corr,
      refWidth: refStereo.width,
      mixPeak,
      mixRms,
      mixLufs,
      mixCorr: mixStereo.corr,
      mixWidth: mixStereo.width,
    };
  }

  /**
   * Pearson correlation + stereo width from two channel analysers.
   * Silence on both channels -> NaN (nothing to measure). Silence on one
   * channel (mono/dual-mono source) -> perfectly correlated, zero width.
   * Width is RMS(side)/RMS(mid) clamped to 0..1: 0 mono, ~1 wide.
   */
  private stereoStats(
    analyserL: AnalyserNode | null,
    analyserR: AnalyserNode | null
  ): { corr: number; width: number } {
    const silent = { corr: Number.NaN, width: Number.NaN };
    if (!analyserL || !analyserR || !this.analysisBufferL || !this.analysisBufferR) return silent;
    const bufL = this.analysisBufferL;
    const bufR = this.analysisBufferR;
    analyserL.getFloatTimeDomainData(bufL);
    analyserR.getFloatTimeDomainData(bufR);
    const n = Math.min(bufL.length, bufR.length);
    let sumL = 0;
    let sumR = 0;
    let sumLL = 0;
    let sumRR = 0;
    let sumLR = 0;
    for (let i = 0; i < n; i++) {
      const l = bufL[i];
      const r = bufR[i];
      sumL += l;
      sumR += r;
      sumLL += l * l;
      sumRR += r * r;
      sumLR += l * r;
    }
    const rmsL = Math.sqrt(sumLL / n);
    const rmsR = Math.sqrt(sumRR / n);
    if (rmsL <= 1e-9 && rmsR <= 1e-9) return silent;
    if (rmsL <= 1e-9 || rmsR <= 1e-9) return { corr: 1, width: 0 };
    const meanL = sumL / n;
    const meanR = sumR / n;
    const cov = sumLR / n - meanL * meanR;
    const varL = sumLL / n - meanL * meanL;
    const varR = sumRR / n - meanR * meanR;
    const denom = Math.sqrt(varL * varR);
    const corr = denom <= 1e-12 ? 1 : Math.max(-1, Math.min(1, cov / denom));
    // Width via mid/side energy (DC-removed like the correlation above).
    let sumM = 0;
    let sumS = 0;
    for (let i = 0; i < n; i++) {
      const m = (bufL[i] + bufR[i]) / 2 - (meanL + meanR) / 2;
      const s = (bufL[i] - bufR[i]) / 2 - (meanL - meanR) / 2;
      sumM += m * m;
      sumS += s * s;
    }
    const width = sumM <= 1e-18 ? (sumS <= 1e-18 ? 0 : 1) : Math.min(1, Math.sqrt(sumS / sumM));
    return { corr, width };
  }
}

export const compareEngine = new CompareEngine();
