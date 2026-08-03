import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tone so the metronome tests don't need a real AudioContext.
// MembraneSynth + NoiseSynth both expose triggerAttackRelease + dispose.
vi.mock('tone', () => {
  const accent = {
    connect: vi.fn(),
    triggerAttackRelease: vi.fn(),
    dispose: vi.fn(),
  };
  const tick = {
    connect: vi.fn(),
    triggerAttackRelease: vi.fn(),
    dispose: vi.fn(),
  };
  const out = {
    connect: vi.fn(),
    gain: { value: 0.5, rampTo: vi.fn() },
    dispose: vi.fn(),
  };
  return {
    setContext: vi.fn(),
    Transport: { state: 'stopped' },
    MembraneSynth: vi.fn(function () { return accent; }),
    NoiseSynth: vi.fn(function () { return tick; }),
    Gain: vi.fn(function () { return out; }),
    getContext: vi.fn(() => ({ rawContext: null })),
  };
});

import * as Tone from 'tone';
import { createMetronome, clickBeat, ACCENT_FREQ, TICK_FREQ } from './metronome';

describe('metronome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports accent and tick frequency constants', () => {
    expect(ACCENT_FREQ).toBe('C5');
    expect(TICK_FREQ).toBe('C3');
  });

  it('clickBeat returns accent freq on bar start (beat 0) and tick on others', () => {
    expect(clickBeat(0, 0, 4)).toEqual({ freq: ACCENT_FREQ, accent: true });
    expect(clickBeat(1, 0, 4)).toEqual({ freq: TICK_FREQ, accent: false });
    expect(clickBeat(2, 0, 4)).toEqual({ freq: TICK_FREQ, accent: false });
    expect(clickBeat(3, 0, 4)).toEqual({ freq: TICK_FREQ, accent: false });
  });

  it('clickBeat handles 3/4 and 6/8 correctly', () => {
    expect(clickBeat(0, 0, 3).accent).toBe(true);
    expect(clickBeat(2, 0, 3).accent).toBe(false);
    expect(clickBeat(0, 0, 6).accent).toBe(true);
    expect(clickBeat(3, 0, 6).accent).toBe(false);
  });

  it('createMetronome returns a Metronome with the expected methods', () => {
    const m = createMetronome();
    expect(typeof m.setEnabled).toBe('function');
    expect(typeof m.setVolume).toBe('function');
    expect(typeof m.scheduleAtBeat).toBe('function');
    expect(typeof m.dispose).toBe('function');
    m.dispose();
  });

  it('scheduleAtBeat calls accent synth on accent beats and tick on others', () => {
    const m = createMetronome();
    m.scheduleAtBeat(0, 0, 4, 0);
    expect((Tone.MembraneSynth as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value.triggerAttackRelease).toHaveBeenCalled();
    m.scheduleAtBeat(1, 0, 4, 0);
    expect((Tone.NoiseSynth as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value.triggerAttackRelease).toHaveBeenCalled();
    m.dispose();
  });

  it('scheduleAtBeat does nothing when disabled', () => {
    const m = createMetronome();
    m.setEnabled(false);
    m.scheduleAtBeat(0, 0, 4, 0);
    m.scheduleAtBeat(1, 0, 4, 0);
    const accent = (Tone.MembraneSynth as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const tick = (Tone.NoiseSynth as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(accent.triggerAttackRelease).not.toHaveBeenCalled();
    expect(tick.triggerAttackRelease).not.toHaveBeenCalled();
    m.dispose();
  });

  it('setVolume clamps to 0..1', () => {
    const m = createMetronome();
    const out = (Tone.Gain as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    m.setVolume(2);
    expect(out.gain.rampTo).toHaveBeenLastCalledWith(1, expect.any(Number));
    m.setVolume(-1);
    expect(out.gain.rampTo).toHaveBeenLastCalledWith(0, expect.any(Number));
    m.dispose();
  });
});
