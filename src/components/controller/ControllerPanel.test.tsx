/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ControllerPanel } from './ControllerPanel';
import { createDefaultMpd226Profile } from '../../lib/controller/defaultMpd226';
import { DEFAULT_CHORD_SETTINGS } from '../../lib/controller/chordPads';
import { useControllerStore } from '../../store/controllerStore';
import type { ControllerHandlers } from '../../lib/controller/actions';
import { WebMidi } from 'webmidi';

vi.mock('webmidi', () => ({
  WebMidi: {
    inputs: [],
    enable: vi.fn(() => Promise.resolve({})),
    disable: vi.fn(() => Promise.resolve()),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
}));

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

beforeEach(() => {
  localStorage.clear();
  useControllerStore.getState().setProfile(createDefaultMpd226Profile());
  useControllerStore.getState().setChord({ ...DEFAULT_CHORD_SETTINGS });
  useControllerStore.getState().cancelLearn();
  useControllerStore.getState().setLearnMode(false);
  useControllerStore.getState().setSamplerMode(false);
});

describe('ControllerPanel', () => {
  it('renders the device layout, monitor, and profile toolbar', () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    expect(container.querySelector('[data-controller-panel]')).toBeTruthy();
    expect(container.querySelector('[data-mpd226-layout]')).toBeTruthy();
    expect(container.querySelector('[data-midi-monitor]')).toBeTruthy();
    expect(container.querySelector('[data-surface="mpd226"]')).toBeTruthy();
  });

  it('previews a chord pad and stops it after a beat', () => {
    vi.useFakeTimers();
    const handlers = makeHandlers();
    const { container } = render(<ControllerPanel handlers={handlers} />);
    fireEvent.click(container.querySelector('[data-chord-pad="2"]')!);
    expect(handlers.playChord).toHaveBeenCalledWith(2, 0.8);
    act(() => { vi.advanceTimersByTime(1300); });
    expect(handlers.stopChord).toHaveBeenCalledWith(2);
    vi.useRealTimers();
  });

  it('edits chord settings in the store', () => {
    render(<ControllerPanel handlers={makeHandlers()} />);
    const scaleSelect = screen.getByDisplayValue('minor');
    fireEvent.change(scaleSelect, { target: { value: 'dorian' } });
    expect(useControllerStore.getState().chord.scale).toBe('dorian');
  });

  it('resets and blanks the profile', () => {
    useControllerStore.getState().clearBinding('knob:0:0');
    render(<ControllerPanel handlers={makeHandlers()} />);
    fireEvent.click(screen.getByRole('button', { name: /mpd226 defaults/i }));
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].action).toBe('fx:filterFreq');
    fireEvent.click(screen.getByRole('button', { name: /blank/i }));
    expect(useControllerStore.getState().profile.id).toBe('blank');
  });

  it('exports the profile as JSON', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ControllerPanel handlers={makeHandlers()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(createObjectURL).toHaveBeenCalled();
    clickSpy.mockRestore();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('imports a profile from JSON', async () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    const file = new File(
      [JSON.stringify({ profile: { id: 'z', name: 'Imported', bindings: { 'pad:0:0': { messageType: 'note', number: 36, action: 'pad:A:0' } } } })],
      'profile.json',
      { type: 'application/json' }
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(useControllerStore.getState().profile.name).toBe('Imported'));
  });

  it('shows a Web MIDI warning and reports connect failures', async () => {
    render(<ControllerPanel handlers={makeHandlers()} />);
    await waitFor(() => expect(screen.getByText(/Web MIDI not available/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /connect midi/i }));
    await waitFor(() => expect(screen.getByText(/no Web MIDI support/i)).toBeTruthy());
  });

  it('arms learn on a control and shows the listening state', () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    const knobButton = container.querySelector('[data-control="knob:0:0"]')!;
    fireEvent.click(knobButton);
    fireEvent.click(knobButton.parentElement!.querySelector('button[title="MIDI-learn this control"]')!);
    expect(useControllerStore.getState().learnTarget).toBe('knob:0:0');
    expect(screen.getByText('Listening…')).toBeTruthy();
  });

  it('collapses the chord section', () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    expect(container.querySelector('[data-chord-pad="0"]')).toBeTruthy();
    fireEvent.click(screen.getByText(/Chord Pads/));
    expect(container.querySelector('[data-chord-pad="0"]')).toBeNull();
  });

  it('follows the selected controller surface', () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    expect(container.querySelector('[data-surface="mpd226"]')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Controller surface'), { target: { value: 'mpd218' } });
    expect(container.querySelector('[data-surface="mpd218"]')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Akai MPD218' })).toBeTruthy();
  });

  it('arms a control when tapped in learn mode', () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    expect(container.querySelector('[data-learn-banner]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /midi learn/i }));
    expect(container.querySelector('[data-learn-banner]')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-control="pad:0:0"]')!);
    expect(useControllerStore.getState().learnTarget).toBe('pad:0:0');
    expect(useControllerStore.getState().learnMode).toBe(true);
  });

  it('switches the unit between Beat and Sampler modes', () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    expect(container.querySelector('[data-controller-mode]')).toBeTruthy();
    expect(container.querySelector('[data-sampler-status]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^sampler$/i }));
    expect(useControllerStore.getState().samplerMode).toBe(true);
    expect(useControllerStore.getState().profile.id).toBe('mpd226-sampler');
    expect(container.querySelector('[data-sampler-status]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^beat$/i }));
    expect(useControllerStore.getState().samplerMode).toBe(false);
    expect(container.querySelector('[data-sampler-status]')).toBeNull();
  });

  it('switches to the Recourse mode', () => {
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    fireEvent.click(screen.getByRole('button', { name: /^recourse$/i }));
    expect(useControllerStore.getState().mode).toBe('recourse');
    expect(useControllerStore.getState().profile.id).toBe('mpd226-recourse');
    expect(container.querySelector('[data-recourse-status]')).toBeTruthy();
  });

  it('edits every chord field', () => {
    render(<ControllerPanel handlers={makeHandlers()} />);
    fireEvent.change(screen.getByDisplayValue('C'), { target: { value: 'G' } });
    expect(useControllerStore.getState().chord.key).toBe('G');
    fireEvent.click(screen.getByLabelText(/7th chords/i));
    expect(useControllerStore.getState().chord.seventh).toBe(true);
    fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '3' } });
    expect(useControllerStore.getState().chord.octave).toBe(3);
    fireEvent.change(screen.getByLabelText(/Strum/i), { target: { value: '40' } });
    expect(useControllerStore.getState().chord.strumMs).toBe(40);
  });

  it('renames the profile and toggles pad-bank following', () => {
    render(<ControllerPanel handlers={makeHandlers()} />);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'My Rig' } });
    expect(useControllerStore.getState().profile.name).toBe('My Rig');
    fireEvent.click(screen.getByLabelText(/Pad bank follows/i));
    expect(useControllerStore.getState().profile.followPadBank).toBe(false);
  });

  it('ignores malformed imported JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<ControllerPanel handlers={makeHandlers()} />);
    const file = new File(['{not json'], 'bad.json', { type: 'application/json' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it('connects to a device, filters inputs, and disconnects', async () => {
    Object.defineProperty(globalThis.navigator, 'requestMIDIAccess', {
      value: vi.fn(() => Promise.resolve({})),
      configurable: true,
    });
    const input = {
      id: 'mpd-1', name: 'MPD226', manufacturer: 'Akai', state: 'connected',
      addListener: vi.fn(), removeListener: vi.fn(),
    };
    (WebMidi as unknown as { inputs: unknown[] }).inputs = [input];

    render(<ControllerPanel handlers={makeHandlers()} />);
    fireEvent.click(screen.getByRole('button', { name: /connect midi/i }));
    await waitFor(() => expect(screen.getByText('MPD226')).toBeTruthy());

    const checkbox = screen.getByText('MPD226').closest('label')!.querySelector('input')!;
    fireEvent.click(checkbox);
    expect(useControllerStore.getState().profile.enabledInputIds).toEqual(['mpd-1']);
    fireEvent.click(screen.getByText(/use all/i));
    expect(useControllerStore.getState().profile.enabledInputIds).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /connected/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /connect midi/i })).toBeTruthy());
    (WebMidi as unknown as { inputs: unknown[] }).inputs = [];
  });
});
