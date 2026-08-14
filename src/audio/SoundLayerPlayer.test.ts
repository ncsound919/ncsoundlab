/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import SoundLayerPlayer from './SoundLayerPlayer';
import { audioEngine as baseAudioEngine } from '../lib/audioEngine';
import { audioEngine as sharedAudioEngine } from './AudioEngine';
import { DEFAULT_FX, DEFAULT_SYNTH, type SoundLayer } from '../types';

const makeGain = () => ({
  value: 1,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});

const makeCtx = (state = 'running') => ({
  currentTime: 0.5,
  state,
  resume: vi.fn(() => Promise.resolve()),
  destination: {},
  createGain: vi.fn(() => ({ gain: makeGain(), connect: vi.fn() })),
  createStereoPanner: vi.fn(() => ({ pan: { setValueAtTime: vi.fn() }, connect: vi.fn() })),
  createBiquadFilter: vi.fn(() => ({
    type: 'lowpass',
    frequency: { setValueAtTime: vi.fn() },
    Q: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
  })),
  createBufferSource: vi.fn(() => ({
    buffer: null,
    playbackRate: { value: 1 },
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    onended: null,
  })),
});

const makeBuffer = (duration = 2): AudioBuffer =>
  ({ duration, length: Math.floor(44100 * duration), sampleRate: 44100, numberOfChannels: 1, getChannelData: () => new Float32Array(100) }) as unknown as AudioBuffer;

const makeSampleLayer = (over: Partial<SoundLayer> = {}): SoundLayer => ({
  id: 's1',
  name: 'Sample',
  type: 'sample',
  enabled: true,
  gain: 1,
  pan: 0,
  pitch: 0,
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2 },
  fx: DEFAULT_FX,
  audioBuffer: makeBuffer(2),
  ...over,
});

describe('SoundLayerPlayer', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
    (baseAudioEngine.getContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(ctx);
    (sharedAudioEngine.getContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(ctx);
  });

  it('returns early for a sample layer without a decoded buffer (no tone synthesized)', () => {
    const player = new SoundLayerPlayer();
    player.playNote(makeSampleLayer({ audioBuffer: undefined }));
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    expect(ctx.createGain).not.toHaveBeenCalled();
  });

  it('plays a sample layer with a buffer and honors the crop region (startOffset)', () => {
    const player = new SoundLayerPlayer();
    player.playNote(makeSampleLayer({ playStartPct: 0.25, playEndPct: 1 }));
    const source = ctx.createBufferSource.mock.results[0].value;
    // startOffset = playStartPct * bufferDuration = 0.25 * 2 = 0.5
    expect(source.start).toHaveBeenCalledWith(0.5, 0.5);
  });

  it('clamps a non-finite duration to a safe value', () => {
    const player = new SoundLayerPlayer();
    player.playNote(makeSampleLayer(), 60, Number.NaN);
    const source = ctx.createBufferSource.mock.results[0].value;
    // stop(startTime + safeDuration(1) + release(0.2) + 0.005)
    expect(source.stop).toHaveBeenCalledWith(0.5 + 1 + 0.2 + 0.005);
  });

  it('caps an absurd duration at 30s', () => {
    const player = new SoundLayerPlayer();
    player.playNote(makeSampleLayer(), 60, 500);
    const source = ctx.createBufferSource.mock.results[0].value;
    expect(source.stop).toHaveBeenCalledWith(0.5 + 30 + 0.2 + 0.005);
  });

  it('uses the linear release fallback when the note level is ~zero', () => {
    const player = new SoundLayerPlayer();
    player.playNote(makeSampleLayer(), 60, 0.01, 0); // velocity 0 -> noteGain 0
    const gain = ctx.createGain.mock.results[0].value.gain;
    expect(gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(gain.exponentialRampToValueAtTime).not.toHaveBeenCalled();
  });

  it('stops active notes with an anti-click fade', () => {
    const player = new SoundLayerPlayer();
    player.playNote(makeSampleLayer(), 60, 1, 1);
    player.stop('s1');
    const gain = ctx.createGain.mock.results[0].value.gain;
    expect(gain.cancelScheduledValues).toHaveBeenCalled();
    expect(gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(player.getGain('s1')).toBe(0);
  });

  it('loads a layer, resumes a suspended context, and tracks gain in dB', async () => {
    const suspendedCtx = makeCtx('suspended');
    (baseAudioEngine.getContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(suspendedCtx);
    const player = new SoundLayerPlayer();
    await player.loadLayer(makeSampleLayer());
    expect(suspendedCtx.resume).toHaveBeenCalled();
    player.setGain('s1', -6);
    expect(player.getGain('s1')).toBe(-6);
  });
});
