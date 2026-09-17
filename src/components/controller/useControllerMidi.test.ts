/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ControllerHandlers } from '../../lib/controller/actions';

const hoisted = vi.hoisted(() => {
  const svc = {
    isSupported: vi.fn(() => true),
    subscribe: vi.fn(async (_handlers: unknown, _opts?: unknown) => true),
    setInputFilter: vi.fn(),
    listInputs: vi.fn(() => []),
    disable: vi.fn(async () => undefined),
    enable: vi.fn(async () => true),
  };
  return { svc };
});

vi.mock('../../lib/midiService', () => ({
  createMidiService: () => hoisted.svc,
}));

import { useControllerMidi } from './useControllerMidi';
import { useControllerStore } from '../../store/controllerStore';
import { createDefaultMpd226Profile } from '../../lib/controller/defaultMpd226';

const makeHandlers = (): ControllerHandlers => ({
  triggerPad: vi.fn(),
  playNote: vi.fn(),
  stopNote: vi.fn(),
  playChord: vi.fn(),
  stopChord: vi.fn(),
  transport: vi.fn(),
  setBpm: vi.fn(),
  setSwing: vi.fn(),
  setMaster: vi.fn(),
  setLayerGain: vi.fn(),
  setLayerPan: vi.fn(),
  setLayerTune: vi.fn(),
  setLayerSend: vi.fn(),
  setFxParam: vi.fn(),
  setSynthParam: vi.fn(),
  setChordParam: vi.fn(),
  chordCommand: vi.fn(),
  padCommand: vi.fn(),
  patternCommand: vi.fn(),
  selectBank: vi.fn(),
  nextBank: vi.fn(),
  grooveCommand: vi.fn(),
});

const lastOnMessage = () =>
  (hoisted.svc.subscribe.mock.calls.at(-1)![0] as { onMessage: (e: unknown) => void }).onMessage;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  hoisted.svc.isSupported.mockReturnValue(true);
  hoisted.svc.subscribe.mockResolvedValue(true);
  useControllerStore.getState().setProfile(createDefaultMpd226Profile());
  useControllerStore.getState().cancelLearn();
  useControllerStore.getState().setMode('beat');
  useControllerStore.getState().setSection('produce');
});

describe('useControllerMidi', () => {
  it('enables the service and dispatches mapped messages', async () => {
    const handlers = makeHandlers();
    const { result } = renderHook(() => useControllerMidi(handlers));

    await act(async () => { await result.current.enable(); });
    expect(result.current.active).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.supported).toBe(true);

    const onMessage = lastOnMessage();
    act(() => { onMessage({ type: 'cc', controller: 3, value: 100, channel: 1 }); });
    expect(handlers.setFxParam).toHaveBeenCalledWith('filterFreq', expect.any(Number));

    act(() => { onMessage({ type: 'noteon', note: 36, velocity: 100, channel: 1 }); });
    expect(handlers.triggerPad).toHaveBeenCalledWith('A', 0, expect.any(Number));

    act(() => { onMessage({ type: 'realtime', code: 0, channel: 1 }); });
    expect(handlers.transport).toHaveBeenCalledWith('play');
  });

  it('records the last message for the monitor', async () => {
    const { result } = renderHook(() => useControllerMidi(makeHandlers()));
    await act(async () => { await result.current.enable(); });
    act(() => { lastOnMessage()({ type: 'cc', controller: 7, value: 5, channel: 2 }); });
    expect(useControllerStore.getState().lastMessage).toMatchObject({ messageType: 'cc', number: 7, channel: 2 });
  });

  it('learns a control from the next message', async () => {
    const { result } = renderHook(() => useControllerMidi(makeHandlers()));
    await act(async () => { await result.current.enable(); });
    useControllerStore.getState().startLearn('knob:0:1');
    act(() => { lastOnMessage()({ type: 'cc', controller: 42, value: 88, channel: 3 }); });
    const learned = useControllerStore.getState().profile.bindings['knob:0:1'];
    expect(learned).toMatchObject({ messageType: 'cc', number: 42, channel: 3 });
    expect(useControllerStore.getState().learnTarget).toBeNull();
  });

  it('reports unsupported browsers', async () => {
    hoisted.svc.isSupported.mockReturnValue(false);
    const { result } = renderHook(() => useControllerMidi(makeHandlers()));
    let ok = true;
    await act(async () => { ok = await result.current.enable(); });
    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/no Web MIDI support/i);
  });

  it('reports permission failures', async () => {
    hoisted.svc.subscribe.mockResolvedValue(false);
    const { result } = renderHook(() => useControllerMidi(makeHandlers()));
    await act(async () => { await result.current.enable(); });
    expect(result.current.active).toBe(false);
    expect(result.current.error).toMatch(/permission denied/i);
  });

  it('disables and toggles', async () => {
    const { result } = renderHook(() => useControllerMidi(makeHandlers()));
    await act(async () => { await result.current.enable(); });
    await act(async () => { await result.current.toggle(); });
    expect(hoisted.svc.disable).toHaveBeenCalled();
    expect(result.current.active).toBe(false);

    await act(async () => { await result.current.toggle(); });
    expect(result.current.active).toBe(true);
  });

  it('re-applies the input filter when the profile changes', async () => {
    const { result } = renderHook(() => useControllerMidi(makeHandlers()));
    await act(async () => { await result.current.enable(); });
    act(() => { useControllerStore.getState().setEnabledInputIds(['dev-9']); });
    expect(hoisted.svc.setInputFilter).toHaveBeenCalledWith(['dev-9']);
  });

  it('disables on unmount', async () => {
    const { result, unmount } = renderHook(() => useControllerMidi(makeHandlers()));
    await act(async () => { await result.current.enable(); });
    unmount();
    expect(hoisted.svc.disable).toHaveBeenCalled();
  });

  it('re-targets bank-0 controls to the visible screen in beat mode', async () => {
    const handlers = { ...makeHandlers(), sectionChannel: vi.fn(), sectionLayer: vi.fn(), sectionPad: vi.fn() };
    const { result } = renderHook(() => useControllerMidi(handlers));
    await act(async () => { await result.current.enable(); });
    useControllerStore.getState().setSection('mixer');

    // K1 (CC 3) drives channel pan in the mixer, not the filter cutoff.
    act(() => { lastOnMessage()({ type: 'cc', controller: 3, value: 100, channel: 1 }); });
    expect(handlers.sectionChannel).toHaveBeenCalledWith(0, 'pan', expect.any(Number));
    expect(handlers.setFxParam).not.toHaveBeenCalled();

    // F1 (CC 20) drives channel gain with the section range (0..1.5).
    act(() => { lastOnMessage()({ type: 'cc', controller: 20, value: 127, channel: 1 }); });
    expect(handlers.sectionChannel).toHaveBeenCalledWith(0, 'gain', 1.5);

    // Pad bank A is re-targeted too: in the mixer, pad 1 mutes channel 1.
    act(() => { lastOnMessage()({ type: 'noteon', note: 36, velocity: 100, channel: 1 }); });
    expect(handlers.sectionPad).toHaveBeenCalledWith('mute', 0, true, expect.any(Number));
    expect(handlers.triggerPad).not.toHaveBeenCalled();
  });

  it('does not remap sampler or recourse modes', async () => {
    const handlers = { ...makeHandlers(), sectionChannel: vi.fn(), sampleParam: vi.fn() };
    const { result } = renderHook(() => useControllerMidi(handlers));
    await act(async () => { await result.current.enable(); });
    useControllerStore.getState().setSamplerMode(true);
    useControllerStore.getState().setSection('mixer');

    act(() => { lastOnMessage()({ type: 'cc', controller: 3, value: 90, channel: 1 }); });
    expect(handlers.sampleParam).toHaveBeenCalledWith('zoom', expect.any(Number));
    expect(handlers.sectionChannel).not.toHaveBeenCalled();
  });
});
