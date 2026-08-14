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
});
