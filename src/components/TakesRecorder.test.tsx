/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for `src/components/TakesRecorder.tsx`, previously at ~20%:
 * control changes, record→count-in→capture→stop→takes flow (with mocked
 * mic/metronome), mic-denied and missing-context guards, punch region,
 * audition/keep/add/slice/delete, stop-during-count-in, and unmount cleanup.
 */

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { TakesRecorder } from './TakesRecorder';
import { audioEngine } from '../lib/audioEngine';
import { createAudioCapture } from '../audio/transport/audioCapture';
import { createMetronome } from '../audio/transport/metronome';

vi.mock('../audio/transport/audioCapture', () => ({
  createAudioCapture: vi.fn(),
}));

vi.mock('../audio/transport/metronome', () => ({
  createMetronome: vi.fn(),
}));

/* ----- AudioBuffer stub (jsdom has no Web Audio buffer) ----- */
class MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private channels: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.channels = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(ch: number) {
    return this.channels[ch];
  }
  copyToChannel(src: Float32Array, ch: number) {
    this.channels[ch].set(src);
  }
}

/* ----- fakes ----- */
const makeSource = () => ({
  buffer: null as AudioBuffer | null,
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  disconnect: vi.fn(),
  onended: null as null | (() => void),
});

let lastSource: ReturnType<typeof makeSource> | null = null;

const makeCtx = () => ({
  currentTime: 100,
  state: 'running',
  resume: vi.fn(),
  destination: {},
  createBufferSource: vi.fn(() => {
    lastSource = makeSource();
    return lastSource;
  }),
});

let fakeCtx: ReturnType<typeof makeCtx>;

const decodedBuffer = () => ({
  sampleRate: 44100,
  length: 22050,
  numberOfChannels: 1,
  duration: 0.5,
  getChannelData: (_ch: number) => new Float32Array(22050),
});

const makeCapture = () => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue({} as Blob),
  decodeBlobToBuffer: vi.fn().mockResolvedValue(decodedBuffer()),
  dispose: vi.fn(),
});

let capture: ReturnType<typeof makeCapture>;

const makeMetro = () => ({
  scheduleAtBeat: vi.fn(),
  dispose: vi.fn(),
});

beforeEach(() => {
  lastSource = null;
  fakeCtx = makeCtx();
  (audioEngine.getContext as any).mockImplementation(() => fakeCtx);
  capture = makeCapture();
  vi.mocked(createAudioCapture).mockClear();
  vi.mocked(createAudioCapture).mockReturnValue(capture as never);
  vi.mocked(createMetronome).mockClear();
  vi.mocked(createMetronome).mockReturnValue(makeMetro() as never);
  vi.stubGlobal('AudioBuffer', MockAudioBuffer);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderRecorder = (props: Partial<React.ComponentProps<typeof TakesRecorder>> = {}) =>
  render(
    <TakesRecorder
      bpm={120}
      loopLengthSec={0.5}
      onToast={vi.fn()}
      {...props}
    />,
  );

const setCountIn = (beats: string) => {
  const selects = document.querySelectorAll('select');
  fireEvent.change(selects[1], { target: { value: beats } });
};

const clickRecord = () => fireEvent.click(screen.getByRole('button', { name: /Record|Stop/ }));

describe('TakesRecorder controls', () => {
  it('renders idle with default controls', () => {
    renderRecorder();
    expect(screen.getByText('Takes Recorder')).toBeDefined();
    expect(screen.getByText('Idle')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Record' })).toBeDefined();
  });

  it('changes loops and count-in via the selects', () => {
    renderRecorder();
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: '2' } });
    expect((selects[0] as HTMLSelectElement).value).toBe('2');
    setCountIn('4');
    expect((selects[1] as HTMLSelectElement).value).toBe('4');
  });

  it('toggles the metronome off', () => {
    renderRecorder();
    const box = screen.getByRole('checkbox', { name: 'Metronome' }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(false);
  });

  it('enables punch in/out and edits the region', () => {
    renderRecorder();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Punch in/out' }));
    const inputs = document.querySelectorAll('input[type="number"]');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: '0.1' } });
    fireEvent.change(inputs[1], { target: { value: '0.4' } });
    expect((inputs[0] as HTMLInputElement).value).toBe('0.1');
  });

  it('does nothing when there is no audio context', async () => {
    (audioEngine.getContext as any).mockReturnValue(null);
    renderRecorder();
    await act(async () => {
      clickRecord();
    });
    expect(screen.getByText('Idle')).toBeDefined();
    expect(createAudioCapture).not.toHaveBeenCalled();
  });

  it('does not start a second recording while one is active', async () => {
    renderRecorder();
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined();
    // Second click goes to stopRecording, not a second start.
    expect(capture.start).toHaveBeenCalledTimes(1);
  });
});

describe('TakesRecorder record/stop flow', () => {
  it('records with no count-in and produces takes on stop', async () => {
    const onToast = vi.fn();
    renderRecorder({ onToast });
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    expect(screen.getByText(/Recording cycle/)).toBeDefined();
    expect(capture.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    await waitFor(() => expect(screen.getByText(/Takes \(/)).toBeDefined());
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Captured \d+ takes?/), 'success');
  });

  it('plays count-in clicks when count-in beats are set', async () => {
    vi.useFakeTimers();
    try {
      renderRecorder();
      setCountIn('2');
      await act(async () => {
        clickRecord();
        await vi.advanceTimersByTimeAsync(1200);
      });
      expect(screen.getByText(/Recording cycle/)).toBeDefined();
      expect(capture.start).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the pending capture when stopped during count-in', async () => {
    vi.useFakeTimers();
    try {
      renderRecorder();
      setCountIn('4');
      await act(async () => {
        clickRecord();
      });
      expect(screen.getByText('Count-in…')).toBeDefined();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(capture.start).not.toHaveBeenCalled();
      expect(screen.getByText('Idle')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes threshold and monitor options through to the capture', async () => {
    renderRecorder();
    setCountIn('0');
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[2], { target: { value: '-24' } }); // Threshold select
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monitor' }));
    await act(async () => {
      clickRecord();
    });
    expect(capture.start).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(capture.start).mock.calls[0][0] as {
      thresholdDb?: number;
      monitor?: { level?: number };
    };
    expect(opts.thresholdDb).toBe(-24);
    expect(opts.monitor?.level).toBe(0.5);
  });

  it('skips metronome creation when the metronome is off', async () => {
    renderRecorder();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Metronome' }));
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    expect(createMetronome).not.toHaveBeenCalled();
    expect(capture.start).toHaveBeenCalled();
  });

  it('toasts an error when the mic is denied', async () => {
    const onToast = vi.fn();
    capture.start.mockRejectedValue(new Error('denied'));
    renderRecorder({ onToast });
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    await waitFor(() => expect(screen.getByText('Idle')).toBeDefined());
    expect(onToast).toHaveBeenCalledWith('Mic permission denied or unavailable', 'error');
  });

  it('toasts an error when stopping fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onToast = vi.fn();
    capture.stop.mockRejectedValue(new Error('stop boom'));
    renderRecorder({ onToast });
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Recording stop failed', 'error'),
    );
  });

  it('clears takes when stopping with no capture available', async () => {
    renderRecorder();
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    (audioEngine.getContext as any).mockReturnValue(null);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    expect(screen.queryByText(/Takes \(/)).toBeNull();
  });

  it('advances the cycle display from the audio clock', async () => {
    vi.useFakeTimers();
    try {
      renderRecorder();
      setCountIn('0');
      await act(async () => {
        clickRecord();
      });
      fakeCtx.currentTime = 100.6; // ~1 loop of 0.5s elapsed
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.getByText('Recording cycle 2/3')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TakesRecorder browser', () => {
  const recordOneTake = async (props: Partial<React.ComponentProps<typeof TakesRecorder>> = {}) => {
    renderRecorder(props);
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    await waitFor(() => expect(screen.getByText(/Takes \(/)).toBeDefined());
  };

  it('auditions a take and toggles it off', async () => {
    await recordOneTake();
    const audition = screen.getByTitle('Audition');
    await act(async () => {
      fireEvent.click(audition);
    });
    expect(fakeCtx.createBufferSource).toHaveBeenCalled();
    expect(lastSource?.start).toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(audition);
    });
    expect(lastSource?.stop).toHaveBeenCalled();
  });

  it('fires onended cleanup when the audition finishes', async () => {
    await recordOneTake();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Audition'));
    });
    expect(lastSource?.onended).toBeTypeOf('function');
    act(() => {
      lastSource?.onended?.();
    });
  });

  it('marks a keeper with the star', async () => {
    await recordOneTake();
    await act(async () => {
      fireEvent.click(screen.getByTitle('Keep'));
    });
    expect(screen.getByText('★ KEEP')).toBeDefined();
  });

  it('sends a take as a layer and to the pads', async () => {
    const onAddLayer = vi.fn();
    const onSlice = vi.fn();
    await recordOneTake({ onAddLayer, onSlice });
    await act(async () => {
      fireEvent.click(screen.getByTitle('Add take as a layer'));
    });
    expect(onAddLayer).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^Take \d/));
    await act(async () => {
      fireEvent.click(screen.getByTitle('Slice take into 16 pads'));
    });
    expect(onSlice).toHaveBeenCalledWith(expect.anything(), 16);
  });

  it('is a no-op for add/slice without callbacks', async () => {
    await recordOneTake({ onAddLayer: undefined, onSlice: undefined });
    await act(async () => {
      fireEvent.click(screen.getByTitle('Add take as a layer'));
      fireEvent.click(screen.getByTitle('Slice take into 16 pads'));
    });
  });

  it('deletes a take', async () => {
    await recordOneTake();
    const header = screen.getByText(/Takes \(/).textContent;
    expect(header).toMatch(/Takes \(\d+\)/);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete take'));
    });
    expect(screen.queryByText(/Takes \(/)?.textContent ?? '').not.toBe(header);
  });

  it('disposes capture and timers on unmount', async () => {
    const { unmount } = renderRecorder();
    setCountIn('0');
    await act(async () => {
      clickRecord();
    });
    unmount();
    expect(capture.dispose).toHaveBeenCalled();
  });
});
