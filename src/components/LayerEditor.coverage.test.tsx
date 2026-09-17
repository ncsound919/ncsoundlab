/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deep coverage for `LayerEditor`. The existing `LayerEditor.test.tsx` only
 * smoke-tests mount + one chaos toggle, leaving the synth/FX tabs, preset
 * persistence, the smart randomizer, the 808 sub-designer and the sample
 * warper largely unexercised. This file drives every interactive control on
 * both workspace tabs so the inline JSX handlers are actually invoked.
 *
 * No source changes: the component's many inline arrow handlers are the bulk
 * of the uncovered function count, so the strategy is enumeration — query all
 * selects / checkboxes / text + range inputs / Knob sliders / buttons in a
 * rendered tree and fire an event at each. Stateful surfaces (preset save,
 * chaos toggle, layerfx tab) get targeted tests because they re-render and
 * therefore detach nodes mid-enumeration.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LayerEditor } from './LayerEditor';
import {
  DEFAULT_ENVELOPE,
  DEFAULT_FX,
  DEFAULT_SYNTH,
  type FXPreset,
  type FXSettings,
  type SoundLayer,
  type SubDesignSettings,
  type SynthSettings,
  type VelocityLayer,
} from '../types';

const fakeBuffer = (): AudioBuffer =>
  ({
    length: 2048,
    sampleRate: 44100,
    duration: 2048 / 44100,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(2048),
    copyToChannel: vi.fn(),
    copyFromChannel: vi.fn(),
  }) as unknown as AudioBuffer;

const synthLayer = (overrides: Partial<SoundLayer> = {}): SoundLayer => ({
  id: 'l1',
  name: 'Lead',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  synth: { ...DEFAULT_SYNTH },
  ...overrides,
});

const chaosLayer = (): SoundLayer =>
  synthLayer({
    chaosMode: true,
    synth: {
      ...DEFAULT_SYNTH,
      phaseChaos: 0.5,
      cycleStretch: 0.25,
      fractalHarmonics: 0.3,
      lorenzRate: 0.4,
      logisticChaos: 0.2,
      macroChaos: 0.6,
      grainCount: 12,
      textureLevel: 0.3,
    },
  });

const sampleLayer = (overrides: Partial<SoundLayer> = {}): SoundLayer => ({
  id: 's1',
  name: 'Kick',
  type: 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  audioBuffer: fakeBuffer(),
  fileName: 'kick.wav',
  ...overrides,
});

const subDesignLayer = (subDesign: SubDesignSettings): SoundLayer =>
  synthLayer({ subDesign });

// Only the required SynthSettings fields — forces every optional `??`/`||`
// fallback in the synth UI and in savePreset/loadPreset to evaluate.
const MINIMAL_SYNTH: SynthSettings = {
  oscType: 'sine',
  detune: 0,
  frequency: 440,
  pitchEnvAmount: 0,
  pitchEnvDecay: 0.1,
  subLevel: 0,
};

// Only the required FXSettings fields — forces every optional fallback in the
// LFO / texture / dual-filter sections and leaves every enable flag undefined
// (which the UI treats as "on").
const MINIMAL_FX: FXSettings = {
  distortion: 0,
  bitcrush: 0,
  filterFreq: 20000,
  filterRes: 1,
  filterType: 'lowpass',
  delayTime: 0.3,
  delayFeedback: 0.2,
  reverbMix: 0,
  chorusMix: 0,
  compressorThreshold: -24,
  compressorRatio: 4,
};

const minimalSynthLayer = (): SoundLayer => synthLayer({ synth: MINIMAL_SYNTH });

const minimalFxLayer = (): SoundLayer => synthLayer({ fx: MINIMAL_FX });

const allFxOffLayer = (): SoundLayer =>
  synthLayer({
    fx: {
      ...DEFAULT_FX,
      distortionEnabled: false,
      bitcrushEnabled: false,
      filterEnabled: false,
      transientEnabled: false,
      delayEnabled: false,
      chorusEnabled: false,
      compressorEnabled: false,
      reverbEnabled: false,
      lfoEnabled: false,
    },
  });

const allFxOnLayer = (): SoundLayer =>
  synthLayer({
    fx: {
      ...DEFAULT_FX,
      distortionEnabled: true,
      bitcrushEnabled: true,
      filterEnabled: true,
      transientEnabled: true,
      delayEnabled: true,
      chorusEnabled: true,
      compressorEnabled: true,
      reverbEnabled: true,
      lfoEnabled: true,
    },
  });

const lfoSyncLayer = (): SoundLayer =>
  synthLayer({
    fx: {
      ...MINIMAL_FX,
      lfoEnabled: true,
      lfoSync: true,
      ...{ lfoDivision: undefined },
    },
  });

const activeFlagsLayer = (): SoundLayer =>
  synthLayer({
    muted: true,
    soloed: true,
    polarityInvert: true,
    chaosMode: true,
    pitch: -5,
  });

// ---------------------------------------------------------------------------
// DOM enumeration helpers
// ---------------------------------------------------------------------------

const q = <T extends Element>(root: HTMLElement, selector: string): T[] =>
  Array.from(root.querySelectorAll(selector)) as unknown as T[];

const openDetails = (root: HTMLElement) => {
  q<HTMLDetailsElement>(root, 'details').forEach((d) => {
    d.open = true;
  });
};

const tabSelect = (root: HTMLElement): HTMLSelectElement =>
  root.querySelector('select') as HTMLSelectElement;

const switchToLayerFx = (root: HTMLElement) => {
  fireEvent.change(tabSelect(root), { target: { value: 'layerfx' } });
};

const driveSelects = (root: HTMLElement) => {
  const tab = tabSelect(root);
  q<HTMLSelectElement>(root, 'select').forEach((s) => {
    if (s === tab) return;
    const options = Array.from(s.options);
    const next = options.find((o) => o.value !== s.value) ?? options[0];
    if (next) fireEvent.change(s, { target: { value: next.value } });
  });
};

const driveTextInputs = (root: HTMLElement, value = 'coverage') => {
  q<HTMLInputElement>(root, 'input[type="text"]').forEach((el) => {
    fireEvent.change(el, { target: { value } });
  });
};

const driveCheckboxes = (root: HTMLElement) => {
  q<HTMLInputElement>(root, 'input[type="checkbox"]').forEach((el) => {
    fireEvent.click(el);
  });
};

const driveRanges = (root: HTMLElement) => {
  q<HTMLInputElement>(root, 'input[type="range"]').forEach((el) => {
    const min = parseFloat(el.min || '0');
    const max = parseFloat(el.max || '1');
    fireEvent.change(el, { target: { value: String(min + (max - min) * 0.4) } });
  });
};

const driveKnobs = (root: HTMLElement) => {
  const knobs = q<HTMLElement>(root, '[role="slider"]');
  knobs.forEach((k) => fireEvent.keyDown(k, { key: 'ArrowUp' }));
  if (knobs[0]) {
    fireEvent.keyDown(knobs[0], { key: 'ArrowDown' });
    fireEvent.keyDown(knobs[0], { key: 'ArrowLeft' });
    fireEvent.keyDown(knobs[0], { key: 'ArrowRight' });
    fireEvent.keyDown(knobs[0], { key: 'Home' });
    fireEvent.keyDown(knobs[0], { key: 'End' });
    fireEvent.keyDown(knobs[0], { key: 'ArrowUp', shiftKey: true });
    fireEvent.doubleClick(knobs[0]);
    fireEvent.focus(knobs[0]);
    fireEvent.blur(knobs[0]);
  }
};

const isModalOpener = (b: HTMLButtonElement) => /Smart Rnd|Smart Locks/i.test(b.textContent ?? '');

const driveButtons = (root: HTMLElement, skipModalOpeners = true) => {
  q<HTMLButtonElement>(root, 'button').forEach((b) => {
    if (skipModalOpeners && isModalOpener(b)) return;
    fireEvent.click(b);
  });
};

const driveModuleLabels = (root: HTMLElement) => {
  q<HTMLElement>(root, 'span[class*="cursor-help"]').forEach((s) => fireEvent.doubleClick(s));
};

const exerciseTree = (root: HTMLElement, { skipModalOpeners = true } = {}) => {
  openDetails(root);
  driveTextInputs(root);
  driveCheckboxes(root);
  openDetails(root);
  driveSelects(root);
  driveRanges(root);
  driveKnobs(root);
  driveModuleLabels(root);
  driveButtons(root, skipModalOpeners);
  openDetails(root);
  driveKnobs(root);
};

// A persisted custom synth preset (already-valid shape for the localStorage load path).
const storedSynthPreset = (name: string, chaos: boolean): Record<string, unknown> => ({
  name,
  isCustom: true,
  oscType: 'sawtooth',
  frequency: 220,
  subLevel: 0.2,
  pitchEnvAmount: 0,
  pitchEnvDecay: 0.1,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  chaosEnabled: chaos,
  synth: { phaseChaos: chaos ? 0.4 : 0, detune: 3 },
});

const storedFxPreset = (id: string, name: string): FXPreset => ({
  id,
  name,
  settings: { ...DEFAULT_FX, distortion: 0.5 },
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('LayerEditor coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('drives every interactive control on the synth tab', () => {
    const onUpdate = vi.fn();
    const onPlay = vi.fn();
    const { container } = render(
      <LayerEditor
        selectedLayer={synthLayer()}
        onUpdate={onUpdate}
        onPlay={onPlay}
        onEvolve={vi.fn()}
        onBounceLayer={vi.fn()}
      />,
    );

    exerciseTree(container);

    expect(onUpdate).toHaveBeenCalled();
    expect(onPlay).toHaveBeenCalled();
  });

  it('updates header transport + identity controls', () => {
    const onUpdate = vi.fn();
    const onEvolve = vi.fn();
    const onPlay = vi.fn();
    render(
      <LayerEditor
        selectedLayer={synthLayer()}
        onUpdate={onUpdate}
        onPlay={onPlay}
        onEvolve={onEvolve}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Lead'), { target: { value: 'Rename' } });
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Rename' });

    fireEvent.click(screen.getByRole('button', { name: /^MUTE$/ }));
    expect(onUpdate).toHaveBeenCalledWith({ muted: true });

    fireEvent.click(screen.getByRole('button', { name: /^SOLO$/ }));
    expect(onUpdate).toHaveBeenCalledWith({ soloed: true });

    fireEvent.click(screen.getByRole('button', { name: 'Ø' }));
    expect(onUpdate).toHaveBeenCalledWith({ polarityInvert: true });

    fireEvent.click(screen.getByRole('button', { name: /Chaos/i }));
    expect(onUpdate).toHaveBeenCalledWith({ chaosMode: true });

    fireEvent.click(screen.getByRole('button', { name: /Evolve/i }));
    expect(onEvolve).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole('button', { name: /Audition/i })[0]);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('switches tabs and drives every control on the layerfx tab', () => {
    const onUpdate = vi.fn();
    const onBounceLayer = vi.fn();
    const { container } = render(
      <LayerEditor
        selectedLayer={synthLayer()}
        onUpdate={onUpdate}
        onPlay={vi.fn()}
        onBounceLayer={onBounceLayer}
      />,
    );

    switchToLayerFx(container);
    openDetails(container);

    // Empty FX preset name should early-return and persist nothing.
    fireEvent.click(screen.getByRole('button', { name: /Save FX Chain/i }));
    expect(localStorage.getItem('sonik_fx_presets')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('New FX Preset Name...'), {
      target: { value: 'My Chain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save FX Chain/i }));
    const stored = JSON.parse(localStorage.getItem('sonik_fx_presets') ?? '[]') as FXPreset[];
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('My Chain');

    // Load then delete the persisted FX preset (delete stops propagation).
    openDetails(container);
    fireEvent.click(screen.getByText('My Chain'));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fxPresetId: stored[0].id }),
    );

    const fxCard = screen.getByText('My Chain').closest('div[class*="group"]') as HTMLElement;
    const trash = within(fxCard).getByRole('button');
    fireEvent.click(trash);
    expect(JSON.parse(localStorage.getItem('sonik_fx_presets') ?? '[]')).toHaveLength(0);

    // Bypass All / Enable All / Randomize FX / RND / Bounce.
    exerciseTree(container);
    expect(onBounceLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('saves, loads and deletes custom synth presets (chaos on and off)', async () => {
    const onUpdate = vi.fn();
    const onPlay = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={onPlay} />,
    );
    openDetails(container);

    const nameInput = screen.getByPlaceholderText('Enter preset name...');
    fireEvent.change(nameInput, { target: { value: 'MyPatch' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(screen.getByText('MyPatch')).toBeDefined();
    expect(JSON.parse(localStorage.getItem('sonik_custom_synth_presets') ?? '[]')).toHaveLength(1);

    // Loading the custom preset (chaosEnabled false -> clears chaos values).
    fireEvent.click(screen.getByText('MyPatch'));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        synth: expect.objectContaining({ phaseChaos: 0, macroChaos: 0 }),
      }),
    );

    // Deleting the custom preset (stopPropagation path).
    const customRow = screen.getByText('MyPatch').closest('div[class*="group"]') as HTMLElement;
    fireEvent.click(within(customRow).getByRole('button'));
    await waitFor(() => expect(screen.queryByText('MyPatch')).toBeNull());

    // A factory preset that carries chaos + a synth block (chaosEnabled true).
    const chaosPreset = screen.getAllByText('Reese Bass Heavy')[0];
    fireEvent.click(chaosPreset);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ synth: expect.objectContaining({ phaseChaos: 0.2 }) }),
    );

    // A non-chaos factory preset.
    fireEvent.click(screen.getAllByText('Analog Pluck')[0]);
    await waitFor(() => expect(onPlay).toHaveBeenCalled());
  });

  it('randomizes each style and reports the sample early-return surface', () => {
    const onUpdate = vi.fn();
    const { container, rerender } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(container);

    const styles = [
      'Melodic Lead / Pluck',
      'Fat Analog Bass',
      'Ethereal Pad / Sweep',
      'Cyber Chaos FX',
    ];
    styles.forEach((title) => {
      fireEvent.click(screen.getByText(title));
      fireEvent.click(screen.getByRole('button', { name: /Quick Roll/i }));
    });

    expect(onUpdate).toHaveBeenCalledTimes(4);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ synth: expect.objectContaining({ fractalHarmonics: expect.anything() }) }),
    );

    rerender(
      <LayerEditor selectedLayer={sampleLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />,
    );
    expect(screen.getByText(/Synth Randomizer Locked/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Quick Roll/i })).toBeNull();
  });

  it('runs the timer-scheduled playback paths (loadPreset, randomize, analog personality)', async () => {
    const onPlay = vi.fn();
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={onPlay} />,
    );
    openDetails(container);

    fireEvent.click(screen.getByText('Analog Pluck'));
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Quick Roll/i }));
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: /Randomize Analog Personality/i }));
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(3));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ synth: expect.objectContaining({ voiceAge: expect.anything() }) }),
    );
  });

  it('toggles chaos off and clears every chaos value', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={chaosLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(container);

    const chaosCheckbox = container.querySelector('#enableChaos') as HTMLInputElement;
    expect(chaosCheckbox.checked).toBe(true);
    fireEvent.click(chaosCheckbox);

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        synth: expect.objectContaining({
          phaseChaos: 0,
          cycleStretch: 0,
          fractalHarmonics: 0,
          lorenzRate: 0,
          logisticChaos: 0,
          macroChaos: 0,
          grainCount: 0,
        }),
      }),
    );
  });

  it('enabling chaos from a clean synth does not clear values', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(container);

    const chaosCheckbox = container.querySelector('#enableChaos') as HTMLInputElement;
    fireEvent.click(chaosCheckbox);
    // Checking only flips local state; no synth payload is emitted.
    expect(onUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ synth: expect.anything() }),
    );
  });

  it('opens and closes the Smart Randomizer modal', () => {
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />,
    );
    openDetails(container);

    fireEvent.click(screen.getByRole('button', { name: /Smart Rnd/i }));
    expect(screen.getByRole('heading', { name: /Smart Selective Randomizer/i })).toBeDefined();
  });

  it('restores persisted presets from localStorage', () => {
    localStorage.setItem(
      'sonik_custom_synth_presets',
      JSON.stringify([storedSynthPreset('SavedSynth', true)]),
    );
    localStorage.setItem('sonik_fx_presets', JSON.stringify([storedFxPreset('fx1', 'SavedFX')]));

    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />,
    );
    openDetails(container);

    expect(screen.getByText('SavedSynth')).toBeDefined();

    switchToLayerFx(container);
    openDetails(container);
    expect(screen.getByText('SavedFX')).toBeDefined();
  });

  it('warns and survives corrupt persisted presets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('sonik_custom_synth_presets', '{ not valid json');

    render(<LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />);

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders and drives the 808 sub-designer (with and without subDesign)', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor
        selectedLayer={subDesignLayer({
          subEnabled: true,
          subLevel: 0.9,
          subType: 'triangle',
          harmonicSaturation: 0.5,
          harmonic2nd: 40,
          harmonic3rd: 30,
          xSubMix: 0.2,
          drive: 0.4,
          dynamicTracking: true,
          phase: 90,
        })}
        onUpdate={onUpdate}
        onPlay={vi.fn()}
      />,
    );
    openDetails(container);

    const section = Array.from(document.querySelectorAll('details')).find((d) =>
      d.textContent?.includes('808 Sub Designer'),
    ) as HTMLElement;

    fireEvent.click(within(section).getByRole('button', { name: 'sine' }));
    fireEvent.click(within(section).getByRole('button', { name: 'square' }));
    fireEvent.click(within(section).getByRole('button', { name: /AUTO TRACKING/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subDesign: expect.objectContaining({ subType: 'square' }) }),
    );

    // Exercise the sub-designer knobs + power toggle.
    const knobs = within(section).getAllByRole('slider');
    knobs.forEach((k) => fireEvent.keyDown(k, { key: 'ArrowUp' }));
    const checkboxes = within(section).getAllByRole('checkbox');
    checkboxes.forEach((c) => fireEvent.click(c));

    // Square shape + harmonics > 0 in the visualizer.
    expect(within(section).getByText(/808 SUB OSCILLOSCOPE/i)).toBeDefined();

    // No subDesign: visualizer runs its fallback defaults and power toggle seeds one.
    const { container: bare } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(bare);
    const bareSection = Array.from(bare.querySelectorAll('details')).find((d) =>
      d.textContent?.includes('808 Sub Designer'),
    ) as HTMLElement;
    expect(within(bareSection).getByText('DISABLED')).toBeDefined();
    fireEvent.click(within(bareSection).getAllByRole('checkbox')[0]);
    expect(onUpdate).toHaveBeenCalledWith({
      subDesign: expect.objectContaining({ subEnabled: true }),
    });
  });

  it('renders the Sub808 visualizer across waveform shapes', () => {
    (['sine', 'triangle', 'square'] as const).forEach((subType) => {
      const { unmount } = render(
        <LayerEditor
          selectedLayer={subDesignLayer({
            subEnabled: true,
            subLevel: 1.2,
            subType,
            harmonicSaturation: 0.8,
            harmonic2nd: 60,
            harmonic3rd: 20,
            xSubMix: 0.3,
            drive: 0.7,
            dynamicTracking: false,
          })}
          onUpdate={vi.fn()}
          onPlay={vi.fn()}
        />,
      );
      expect(screen.getByText(/808 SUB OSCILLOSCOPE/i)).toBeDefined();
      unmount();
    });
  });

  it('drives sample-warping controls on both tabs', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor
        selectedLayer={sampleLayer()}
        onUpdate={onUpdate}
        onPlay={vi.fn()}
        onEvolve={vi.fn()}
        onBounceLayer={vi.fn()}
      />,
    );
    exerciseTree(container);

    // Factory preset load on a sample layer exercises the non-synth load branch.
    fireEvent.click(screen.getAllByText('Analog Pluck')[0]);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ envelope: expect.anything() }));

    // Layer FX tab on a sample layer; boundary guards live in this tab.
    switchToLayerFx(container);
    openDetails(container);

    const start = screen.getByRole('slider', { name: 'Start' });
    const end = screen.getByRole('slider', { name: 'End' });
    fireEvent.keyDown(start, { key: 'End' });
    fireEvent.keyDown(start, { key: 'ArrowUp' });
    fireEvent.keyDown(end, { key: 'Home' });
    fireEvent.keyDown(end, { key: 'ArrowDown' });
    expect(onUpdate).toHaveBeenCalledWith({ playEndPct: expect.any(Number) });

    exerciseTree(container);
  });

  it('renders a sample layer without an envelope fallback crash', () => {
    const onUpdate = vi.fn();
    const layer = sampleLayer({ envelope: undefined as unknown as SoundLayer['envelope'] });
    const { container } = render(
      <LayerEditor selectedLayer={layer} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    switchToLayerFx(container);
    openDetails(container);
    const attack = screen.getByRole('slider', { name: 'Attack' });
    fireEvent.keyDown(attack, { key: 'ArrowUp' });
    expect(onUpdate).toHaveBeenCalledWith({
      envelope: expect.objectContaining({ attack: expect.any(Number) }),
    });
  });

  it('omits the bounce button when no handler is supplied', () => {
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />,
    );
    switchToLayerFx(container);
    openDetails(container);
    expect(screen.queryByRole('button', { name: /Bounce Layer/i })).toBeNull();
  });

  it('seeds a deterministic random for preset id / FX randomize paths', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42);
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    switchToLayerFx(container);
    openDetails(container);

    fireEvent.change(screen.getByPlaceholderText('New FX Preset Name...'), {
      target: { value: 'Seeded' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save FX Chain/i }));
    expect(JSON.parse(localStorage.getItem('sonik_fx_presets') ?? '[]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Randomize FX/i }));
    expect(onUpdate).toHaveBeenCalled();

    const rndButtons = screen.getAllByTitle('Randomize Module Settings');
    rndButtons.forEach((b) => fireEvent.click(b));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('honours the LFO sync toggle and division select', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(container);

    const syncButton = screen.getByRole('button', { name: /^HZ$/ });
    fireEvent.click(syncButton);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fx: expect.objectContaining({ lfoSync: true }) }));
  });

  it('activates each filter family option', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(container);

    ['ZDF Ladder', 'Moog 24dB', 'SEM 12dB', 'MS-20', 'Juno', 'Prophet', 'OB-X'].forEach((label) => {
      fireEvent.click(screen.getByRole('button', { name: label }));
    });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ synth: expect.objectContaining({ filterFamily: 'oberheim_multimode' }) }),
    );
  });

  it('auditions synth-visualizer internals that call updateSynthSettings', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(container);

    fireEvent.click(screen.getByRole('button', { name: 'Slot A' }));
    fireEvent.click(screen.getByRole('button', { name: /Slot B/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A↔B' }));
    fireEvent.click(screen.getByRole('button', { name: /C4 Lead/ }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ synth: expect.anything() }));
  });

  it('renders the envelope fallback shape controls while a synth mounts', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    switchToLayerFx(container);
    openDetails(container);

    ['Pluck', 'Pad', 'Keys', 'Perc'].forEach((preset) => {
      fireEvent.click(screen.getByRole('button', { name: preset }));
    });
    expect(onUpdate).toHaveBeenCalledWith({
      envelope: { attack: 0.002, decay: 0.05, sustain: 0, release: 0.05 },
    });

    const sustain = screen.getByRole('slider', { name: 'Sustain' });
    fireEvent.keyDown(sustain, { key: 'ArrowUp' });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ envelope: expect.anything() }));
  });

  it('covers optional synth + fx field fallbacks with minimal layers', () => {
    const onUpdate = vi.fn();
    const first = render(
      <LayerEditor selectedLayer={minimalSynthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(first.container);
    exerciseTree(first.container);
    // savePreset reads many optional synth fields through fallbacks.
    fireEvent.change(screen.getByPlaceholderText('Enter preset name...'), {
      target: { value: 'Minimal' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(onUpdate).toHaveBeenCalled();
    first.unmount();

    const second = render(
      <LayerEditor selectedLayer={minimalFxLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    switchToLayerFx(second.container);
    openDetails(second.container);
    exerciseTree(second.container);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('renders the FX rack with every module toggled on and off', () => {
    const onUpdate = vi.fn();
    const off = render(
      <LayerEditor selectedLayer={allFxOffLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    switchToLayerFx(off.container);
    openDetails(off.container);
    exerciseTree(off.container);
    off.unmount();

    const on = render(
      <LayerEditor selectedLayer={allFxOnLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    switchToLayerFx(on.container);
    openDetails(on.container);
    exerciseTree(on.container);

    expect(onUpdate).toHaveBeenCalled();
  });

  it('covers the tempo-synced LFO select and division fallback', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor selectedLayer={lfoSyncLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
    );
    openDetails(container);

    // lfoSync true renders the "SYNC ON" label + division <select>.
    expect(screen.getByRole('button', { name: /SYNC ON/i })).toBeDefined();
    const division = Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === '1/8'),
    ) as HTMLSelectElement;
    fireEvent.change(division, { target: { value: '1/8' } });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fx: expect.objectContaining({ lfoDivision: '1/8' }) }),
    );

    exerciseTree(container);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('covers active header flag styles and a negative pitch readout', () => {
    const { container } = render(
      <LayerEditor selectedLayer={activeFlagsLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />,
    );
    openDetails(container);

    expect(screen.getByRole('button', { name: 'MUTE' })).toBeDefined();
    expect(screen.getByText(/-5ST/)).toBeDefined();
    expect(screen.getByText(/Active:/)).toBeDefined();
  });

  it('covers active sample reverse/loop styles and tweak knobs', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor
        selectedLayer={sampleLayer({
          sampleReverse: true,
          sampleLoop: true,
          sampleSpeed: 1.5,
          samplePitchCoarse: 3,
          samplePitchFine: 10,
          startTimeOffset: 0.1,
          playStartPct: 0.2,
          playEndPct: 0.8,
        })}
        onUpdate={onUpdate}
        onPlay={vi.fn()}
      />,
    );
    openDetails(container);
    expect(screen.getByText('REVERSED')).toBeDefined();
    expect(screen.getByText('LOOPING')).toBeDefined();
    exerciseTree(container);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('renders a seamless loop crossfade for sample layers', async () => {
    const { audioEngine } = await import('../lib/audioEngine');
    const channelData = [new Float32Array(2048)];
    const fakeCtx = {
      createBuffer: vi.fn((_ch: number, len: number, rate: number) => ({
        numberOfChannels: 1,
        length: len,
        sampleRate: rate,
        getChannelData: () => channelData[0],
      })),
    };
    (audioEngine.getContext as any).mockReturnValue(fakeCtx);
    try {
      const onUpdate = vi.fn();
      const { container } = render(
        <LayerEditor selectedLayer={sampleLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
      );
      openDetails(container);
      fireEvent.change(screen.getByLabelText('Loop crossfade seconds'), { target: { value: '0.05' } });
      fireEvent.click(screen.getByRole('button', { name: 'Render seamless loop' }));
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        playStartPct: 0,
        playEndPct: 1,
        sampleLoop: true,
      }));
      const arg = onUpdate.mock.calls[0][0] as { audioBuffer: AudioBuffer };
      expect(arg.audioBuffer.length).toBe(2048);
    } finally {
      (audioEngine.getContext as any).mockReset();
    }
  });

  it('builds a keygroup velocity layer stack', async () => {
    const { audioEngine } = await import('../lib/audioEngine');
    const fakeCtx = { decodeAudioData: vi.fn(async () => fakeBuffer()) };
    (audioEngine.getContext as any).mockReturnValue(fakeCtx);
    try {
      const onUpdate = vi.fn();
      const { container } = render(
        <LayerEditor selectedLayer={sampleLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
      );
      openDetails(container);

      // Add the current sample → one full-range band.
      fireEvent.click(screen.getByRole('button', { name: 'Add current sample' }));
      let list = onUpdate.mock.calls.at(-1)![0].velocityLayers as VelocityLayer[];
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ minVelocity: 1, maxVelocity: 127 });

      // Add a file → decode → a velocity layer from the decoded buffer.
      onUpdate.mockClear();
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3])], 'hard.wav', { type: 'audio/wav' });
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      expect(fakeCtx.decodeAudioData).toHaveBeenCalled();
      list = onUpdate.mock.calls.at(-1)![0].velocityLayers as VelocityLayer[];
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: 'hard', fileName: 'hard.wav', minVelocity: 1, maxVelocity: 127 });
    } finally {
      (audioEngine.getContext as any).mockReset();
    }
  });

  it('edits, evenly splits and removes velocity layers', () => {
    const onUpdate = vi.fn();
    const layer = sampleLayer({
      velocityLayers: [
        { id: 'a', minVelocity: 1, maxVelocity: 40, audioBuffer: fakeBuffer(), name: 'Soft' },
        { id: 'b', minVelocity: 90, maxVelocity: 127, audioBuffer: fakeBuffer(), name: 'Hard' },
      ],
    });
    const { container } = render(<LayerEditor selectedLayer={layer} onUpdate={onUpdate} onPlay={vi.fn()} />);
    openDetails(container);

    expect(container.querySelector('[data-velocity-layers]')).toBeTruthy();
    expect(screen.getByText(/Soft \(v40\)/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Velocity layer Soft min'), { target: { value: '10' } });
    let list = onUpdate.mock.calls.at(-1)![0].velocityLayers as VelocityLayer[];
    expect(list.find((l) => l.id === 'a')?.minVelocity).toBe(10);

    onUpdate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Even split' }));
    list = onUpdate.mock.calls.at(-1)![0].velocityLayers as VelocityLayer[];
    expect(list[0].minVelocity).toBe(1);
    expect(list[1].maxVelocity).toBe(127);
    expect(list[1].minVelocity).toBe(list[0].maxVelocity + 1);

    onUpdate.mockClear();
    fireEvent.click(screen.getByTitle('Remove Hard'));
    list = onUpdate.mock.calls.at(-1)![0].velocityLayers as VelocityLayer[];
    expect(list.map((l) => l.id)).toEqual(['a']);

    // Appending the current sample re-splits the bands across all layers.
    onUpdate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Add current sample' }));
    list = onUpdate.mock.calls.at(-1)![0].velocityLayers as VelocityLayer[];
    expect(list).toHaveLength(3);
    expect(list[2].maxVelocity).toBe(127);
  });

  it('covers both sides of the randomizer probability branches', () => {
    const onUpdate = vi.fn();
    const styles = [
      'Melodic Lead / Pluck',
      'Fat Analog Bass',
      'Ethereal Pad / Sweep',
      'Cyber Chaos FX',
    ];

    const rand = vi.spyOn(Math, 'random');
    [0.9, 0.1].forEach((roll) => {
      rand.mockReturnValue(roll);
      const { container, unmount } = render(
        <LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />,
      );
      openDetails(container);
      styles.forEach((title) => {
        fireEvent.click(screen.getByText(title));
        fireEvent.click(screen.getByRole('button', { name: /Quick Roll/i }));
      });
      expect(onUpdate).toHaveBeenCalled();
      unmount();
    });
  });

  it('covers the selected FX-preset card style', () => {
    localStorage.setItem('sonik_fx_presets', JSON.stringify([storedFxPreset('fx-sel', 'SelectedFX')]));
    const { container } = render(
      <LayerEditor
        selectedLayer={synthLayer({ fxPresetId: 'fx-sel' })}
        onUpdate={vi.fn()}
        onPlay={vi.fn()}
      />,
    );
    switchToLayerFx(container);
    openDetails(container);
    expect(screen.getByText('SelectedFX')).toBeDefined();
  });

  it('survives localStorage write failures while saving and deleting presets', () => {
    localStorage.setItem(
      'sonik_custom_synth_presets',
      JSON.stringify([storedSynthPreset('DelMe', false)]),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />,
    );
    openDetails(container);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    fireEvent.change(screen.getByPlaceholderText('Enter preset name...'), {
      target: { value: 'CannotPersist' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    const row = screen.getByText('DelMe').closest('div[class*="group"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('loads a preset onto a synth-typed layer that has no synth block', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <LayerEditor
        selectedLayer={synthLayer({ synth: undefined })}
        onUpdate={onUpdate}
        onPlay={vi.fn()}
      />,
    );
    openDetails(container);
    fireEvent.click(screen.getAllByText('Analog Pluck')[0]);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ synth: expect.objectContaining({ oscType: 'square' }) }),
    );
  });

  it('opens the randomizer from the Smart Locks button and closes it', () => {
    const { container } = render(
      <LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />,
    );
    openDetails(container);

    fireEvent.click(screen.getByRole('button', { name: /Smart Locks/i }));
    expect(screen.getByRole('heading', { name: /Smart Selective Randomizer/i })).toBeDefined();

    fireEvent.click(screen.getByTitle('Close Randomizer'));
    expect(screen.queryByRole('heading', { name: /Smart Selective Randomizer/i })).toBeNull();
  });

  it('uses act() to flush scheduled playback under fake timers', () => {
    vi.useFakeTimers();
    try {
      const onPlay = vi.fn();
      const { container } = render(
        <LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={onPlay} />,
      );
      openDetails(container);

      fireEvent.click(screen.getByText('Analog Pluck'));
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(onPlay).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: /Quick Roll/i }));
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onPlay).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
