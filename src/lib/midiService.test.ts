/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/midiService.ts` (Phase 6.3).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMidiService } from './midiService';

// Fake navigator with requestMIDIAccess present.
const fakeNavigator = (withMidi = true) => {
  const nav: any = {
    requestMIDIAccess: withMidi ? vi.fn(() => Promise.resolve({})) : undefined,
  };
  return nav;
};

// We mock webmidi so the service runs deterministically without hardware.
vi.mock('webmidi', () => {
  return {
    WebMidi: {
      inputs: [],
      enable: vi.fn(() => Promise.resolve({})),
      disable: vi.fn(() => Promise.resolve()),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };
});

import { WebMidi } from 'webmidi';

describe('midiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the shared inputs array.
    (WebMidi as any).inputs = [];
    // jsdom has no navigator.requestMIDIAccess; stub it.
    Object.defineProperty(globalThis, 'navigator', { value: fakeNavigator(), configurable: true });
  });

  it('reports unsupported when requestMIDIAccess is missing', () => {
    // Temporarily remove requestMIDIAccess from navigator.
    const nav: any = navigator;
    const had = 'requestMIDIAccess' in nav;
    const prev = nav.requestMIDIAccess;
    delete nav.requestMIDIAccess;
    const svc = createMidiService();
    expect(svc.isSupported()).toBe(false);
    if (had) nav.requestMIDIAccess = prev;
  });

  it('enable() subscribes noteon/noteoff on each input', async () => {
    const input = {
      id: 'in-1',
      name: 'Fake Keyboard',
      manufacturer: 'Test',
      state: 'connected',
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    (WebMidi as any).inputs = [input];
    const svc = createMidiService();
    const onOn = vi.fn();
    const onOff = vi.fn();
    const ok = await svc.enable(onOn, onOff);
    expect(ok).toBe(true);
    // noteon + noteoff subscribed.
    expect(input.addListener).toHaveBeenCalledWith('noteon', expect.any(Function));
    expect(input.addListener).toHaveBeenCalledWith('noteoff', expect.any(Function));
  });

  it('lists connected inputs', async () => {
    (WebMidi as any).inputs = [{
      id: 'in-1', name: 'Fake Keyboard', manufacturer: 'Test', state: 'connected', addListener: vi.fn(), removeListener: vi.fn(),
    }];
    const svc = createMidiService();
    await svc.enable(vi.fn(), vi.fn());
    const inputs = svc.listInputs();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].name).toBe('Fake Keyboard');
  });

  it('returns [] before enable', () => {
    const svc = createMidiService();
    expect(svc.listInputs()).toEqual([]);
  });

  it('enable() returns false when Web MIDI is unsupported', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    const svc = createMidiService();
    expect(await svc.enable(vi.fn(), vi.fn())).toBe(false);
  });

  it('enable() returns false and warns when WebMidi.enable rejects', async () => {
    (WebMidi.enable as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = createMidiService();
    expect(await svc.enable(vi.fn(), vi.fn())).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('forwards normalized noteon/noteoff events to the handlers', async () => {
    const input = {
      id: 'in-1', name: 'Keys', manufacturer: 'Test', state: 'connected',
      addListener: vi.fn(), removeListener: vi.fn(),
    };
    (WebMidi as any).inputs = [input];
    const svc = createMidiService();
    const onOn = vi.fn();
    const onOff = vi.fn();
    await svc.enable(onOn, onOff);

    const onCb = input.addListener.mock.calls.find((c) => c[0] === 'noteon')![1];
    const offCb = input.addListener.mock.calls.find((c) => c[0] === 'noteoff')![1];
    onCb({ note: { number: 64 }, velocity: 0.8, channel: 1 });
    offCb({ note: 64, channel: 2 });

    expect(onOn).toHaveBeenCalledWith({ note: 64, velocity: 0.8, channel: 1 });
    expect(onOff).toHaveBeenCalledWith({ note: 64, velocity: 0, channel: 2 });
  });

  it('fills missing input metadata with defaults', async () => {
    (WebMidi as any).inputs = [{ id: 'in-bare', addListener: vi.fn(), removeListener: vi.fn() }];
    const svc = createMidiService();
    await svc.enable(vi.fn(), vi.fn());
    const [info] = svc.listInputs();
    expect(info.name).toBe('Unknown');
    expect(info.manufacturer).toBe('');
    expect(info.state).toBe('connected');
  });

  it('re-subscribes inputs when the port list changes', async () => {
    const input = {
      id: 'in-1', name: 'Keys', manufacturer: 'Test', state: 'connected',
      addListener: vi.fn(), removeListener: vi.fn(),
    };
    (WebMidi as any).inputs = [input];
    const svc = createMidiService();
    await svc.enable(vi.fn(), vi.fn());

    const connectedCb = (WebMidi.addListener as unknown as ReturnType<typeof vi.fn>).mock.calls
      .find((c) => c[0] === 'connected')![1];
    input.addListener.mockClear();
    input.removeListener.mockClear();
    connectedCb();

    expect(input.removeListener).toHaveBeenCalledWith('noteon');
    expect(input.addListener).toHaveBeenCalledWith('noteon', expect.any(Function));
  });

  it('disable() removes port listeners and disables WebMidi', async () => {
    const input = {
      id: 'in-1', name: 'Keys', manufacturer: 'Test', state: 'connected',
      addListener: vi.fn(), removeListener: vi.fn(),
    };
    (WebMidi as any).inputs = [input];
    const svc = createMidiService();
    await svc.enable(vi.fn(), vi.fn());
    await svc.disable();

    expect(WebMidi.removeListener).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(WebMidi.removeListener).toHaveBeenCalledWith('disconnected', expect.any(Function));
    expect(WebMidi.disable).toHaveBeenCalled();
  });

  it('re-scans ports shortly after enable so late enumeration is not missed', async () => {
    vi.useFakeTimers();
    try {
      const svc = createMidiService();
      (WebMidi as any).inputs = [];
      await svc.enable(vi.fn(), vi.fn());
      expect(svc.listInputs()).toEqual([]);

      // The real unit reports its ports a tick after enable() resolves, with no
      // 'connected' event — the delayed re-scan must pick them up.
      const input = {
        id: 'in-2', name: 'MPD226', manufacturer: '', state: 'connected',
        addListener: vi.fn(), removeListener: vi.fn(),
      };
      (WebMidi as any).inputs = [input];
      vi.advanceTimersByTime(300);

      expect(input.addListener).toHaveBeenCalledWith('noteon', expect.any(Function));
      expect(svc.listInputs().map((i) => i.name)).toContain('MPD226');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-scan ports after disable()', async () => {
    vi.useFakeTimers();
    try {
      const input = {
        id: 'in-1', name: 'Keys', manufacturer: 'Test', state: 'connected',
        addListener: vi.fn(), removeListener: vi.fn(),
      };
      (WebMidi as any).inputs = [input];
      const svc = createMidiService();
      await svc.enable(vi.fn(), vi.fn());
      await svc.disable();

      input.addListener.mockClear();
      vi.advanceTimersByTime(300);
      expect(input.addListener).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
