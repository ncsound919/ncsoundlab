/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full-message-stream tests for `midiService.subscribe()` (CC, transport,
 * program change, pitch bend, aftertouch) and per-device filtering.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('webmidi', () => ({
  WebMidi: {
    inputs: [],
    enable: vi.fn(() => Promise.resolve({})),
    disable: vi.fn(() => Promise.resolve()),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import { WebMidi } from 'webmidi';
import { createMidiService } from './midiService';

interface FakeInput {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

const makeInput = (id: string): FakeInput => ({
  id,
  name: `Dev ${id}`,
  manufacturer: 'Akai',
  state: 'connected',
  addListener: vi.fn(),
  removeListener: vi.fn(),
});

const listenerFor = (input: FakeInput, event: string) =>
  input.addListener.mock.calls.find((c) => c[0] === event)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  (WebMidi as any).inputs = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: { requestMIDIAccess: vi.fn(() => Promise.resolve({})) },
    configurable: true,
  });
});

describe('midiService.subscribe', () => {
  it('forwards CC, program, pitch bend, aftertouch and transport', async () => {
    const input = makeInput('in-1');
    (WebMidi as any).inputs = [input];
    const onMessage = vi.fn();
    const svc = createMidiService();
    expect(await svc.subscribe({ onMessage })).toBe(true);

    listenerFor(input, 'controlchange')({ controller: { number: 3 }, rawValue: 100, channel: 1 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'cc', controller: 3, value: 100, channel: 1 });

    listenerFor(input, 'programchange')({ rawValue: 7, channel: 2 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'program', program: 7, channel: 2 });

    listenerFor(input, 'pitchbend')({ rawValue: 64, channel: 1 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'pitchbend', value: 64, channel: 1 });

    listenerFor(input, 'channelaftertouch')({ rawValue: 20, channel: 4 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'aftertouch', value: 20, channel: 4 });

    listenerFor(input, 'start')({});
    listenerFor(input, 'continue')({});
    listenerFor(input, 'stop')({});
    expect(onMessage).toHaveBeenCalledWith({ type: 'realtime', code: 0, channel: 1 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'realtime', code: 1, channel: 1 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'realtime', code: 2, channel: 1 });
  });

  it('normalizes values that only expose the 0..1 shorthand', async () => {
    const input = makeInput('in-1');
    (WebMidi as any).inputs = [input];
    const onMessage = vi.fn();
    await createMidiService().subscribe({ onMessage });

    listenerFor(input, 'controlchange')({ controller: 9, value: 0.5, channel: 1 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'cc', controller: 9, value: 64, channel: 1 });

    // Tolerates a bare controller number (webmidi shape drift).
    listenerFor(input, 'controlchange')({ controller: 12, value: 0, channel: 1 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'cc', controller: 12, value: 0, channel: 1 });
  });

  it('filters inputs by id', async () => {
    const used = makeInput('used');
    const ignored = makeInput('ignored');
    (WebMidi as any).inputs = [used, ignored];
    const onMessage = vi.fn();
    const svc = createMidiService();
    await svc.subscribe({ onMessage }, { inputIds: ['used'] });

    expect(used.addListener).toHaveBeenCalledWith('noteon', expect.any(Function));
    expect(ignored.addListener).not.toHaveBeenCalled();

    // Changing the filter re-subscribes.
    svc.setInputFilter(['ignored']);
    expect(ignored.addListener).toHaveBeenCalledWith('noteon', expect.any(Function));
  });

  it('setInputFilter is a no-op before enable', () => {
    const svc = createMidiService();
    expect(() => svc.setInputFilter(['x'])).not.toThrow();
  });

  it('reports state changes on subscribe', async () => {
    const input = makeInput('in-1');
    (WebMidi as any).inputs = [input];
    const onStateChange = vi.fn();
    await createMidiService().subscribe({ onMessage: vi.fn(), onStateChange });
    expect(onStateChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'in-1', name: 'Dev in-1' }),
    ]);
  });

  it('subscribe returns false when Web MIDI is unsupported', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    expect(await createMidiService().subscribe({ onMessage: vi.fn() })).toBe(false);
  });
});
