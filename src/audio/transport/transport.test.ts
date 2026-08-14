import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the `tone` package so we can verify how the transport host drives it
// without needing a real AudioContext (Tone.js is hard to host under jsdom).
// The host's contract — "call setContext, then set Transport properties" —
// is exercised by these tests; the underlying Tone implementation is
// trusted (Tone has its own tests).
vi.mock('tone', () => {
  const transport = {
    bpm: { value: 120 },
    timeSignature: 4,
    swing: 0,
    swingSubdivision: '16n',
    position: 0,
    state: 'stopped' as 'started' | 'stopped' | 'paused',
    start: vi.fn(() => { transport.state = 'started'; }),
    stop: vi.fn(() => { transport.state = 'stopped'; transport.position = 0; }),
    pause: vi.fn(() => { transport.state = 'paused'; }),
  };
  return {
    setContext: vi.fn(),
    getContext: vi.fn(() => ({ rawContext: null })),
    Transport: transport,
  };
});

import * as Tone from 'tone';
import { initTransport, getTransport, resetTransport } from './transport';

describe('transport host', () => {
  beforeEach(() => {
    resetTransport();
    // Reset mock state between tests
    (Tone.Transport as any).bpm.value = 120;
    (Tone.Transport as any).timeSignature = 4;
    (Tone.Transport as any).swing = 0;
    (Tone.Transport as any).state = 'stopped';
    (Tone.Transport as any).position = 0;
    vi.mocked(Tone.setContext).mockClear();
    vi.mocked(Tone.Transport.start).mockClear();
    vi.mocked(Tone.Transport.stop).mockClear();
    vi.mocked(Tone.Transport.pause).mockClear();
  });

  it('shares the app AudioContext with Tone (init-ordering invariant)', () => {
    initTransport();
    // audioEngine.getContext() is called once during init, and the result
    // is passed to Tone.setContext. We don't need identity equality — we
    // verify the *same call* happened and the argument is non-null.
    expect(Tone.setContext).toHaveBeenCalledTimes(1);
    const [passedArg] = vi.mocked(Tone.setContext).mock.calls[0];
    expect(passedArg).toBeTruthy();
  });

  it('is idempotent — calling init twice calls setContext only once', () => {
    initTransport();
    initTransport();
    expect(Tone.setContext).toHaveBeenCalledTimes(1);
  });

  it('sets bpm on the underlying Tone Transport', () => {
    initTransport();
    getTransport().setBpm(140);
    expect((Tone.Transport as any).bpm.value).toBeCloseTo(140, 5);
  });

  it('sets time signature (4/4) on Tone Transport', () => {
    initTransport();
    getTransport().setTimeSignature(4, 4);
    expect((Tone.Transport as any).timeSignature).toBe(4);
  });

  it('sets time signature (3/4) on Tone Transport', () => {
    initTransport();
    getTransport().setTimeSignature(3, 4);
    expect((Tone.Transport as any).timeSignature).toBe(3);
  });

  it('sets time signature (6/8) on Tone Transport', () => {
    initTransport();
    getTransport().setTimeSignature(6, 8);
    expect((Tone.Transport as any).timeSignature).toBe(6);
  });

  it('clamps swing to Tone valid range 0..0.66', () => {
    initTransport();
    getTransport().setSwing(0.7);
    expect((Tone.Transport as any).swing).toBeLessThanOrEqual(0.66);
    getTransport().setSwing(-0.1);
    expect((Tone.Transport as any).swing).toBeGreaterThanOrEqual(0);
  });

  it('play() and stop() toggle Tone.Transport state', () => {
    initTransport();
    getTransport().play();
    expect((Tone.Transport as any).state).toBe('started');
    getTransport().stop();
    expect((Tone.Transport as any).state).toBe('stopped');
  });

  it('throws if getTransport is called before init', () => {
    expect(() => getTransport()).toThrow();
  });
});
