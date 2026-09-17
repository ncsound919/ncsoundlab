/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreeDSoundSpace } from './ThreeDSoundSpace';
import { DEFAULT_ENVELOPE, DEFAULT_FX, type SoundLayer } from '../types';

type Mock = ReturnType<typeof vi.fn>;

const makeLayer = (
  id: string,
  name: string,
  overrides: Partial<SoundLayer> = {}
): SoundLayer => ({
  id,
  name,
  type: 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  ...overrides,
});

interface RenderSpaceOptions {
  onSelectLayer?: Mock;
  onUpdateLayer?: Mock;
}

const renderSpace = (
  layers: SoundLayer[],
  selectedLayerId: string | null = null,
  opts: RenderSpaceOptions = {}
) => {
  const onSelectLayer = opts.onSelectLayer ?? vi.fn();
  const onUpdateLayer = opts.onUpdateLayer ?? vi.fn();

  const utils = render(
    <ThreeDSoundSpace
      layers={layers}
      selectedLayerId={selectedLayerId}
      onSelectLayer={onSelectLayer}
      onUpdateLayer={onUpdateLayer}
    />
  );
  return { ...utils, onSelectLayer, onUpdateLayer };
};

const kickNode = () => screen.getByLabelText(/Spatial position for layer Kick/i);

describe('ThreeDSoundSpace drag gesture', () => {
  it('commits pan, gain and filter on window mouse-up', () => {
    const onSelectLayer = vi.fn();
    const onUpdateLayer = vi.fn();
    renderSpace([makeLayer('l1', 'Kick')], 'l1', { onSelectLayer, onUpdateLayer });

    fireEvent.mouseDown(kickNode(), { clientX: 0, clientY: 0 });
    expect(onSelectLayer).toHaveBeenCalledWith('l1');

    fireEvent.mouseMove(window, { clientX: 300, clientY: 100 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 100 });

    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [id, updates] = onUpdateLayer.mock.calls[0] as [string, Partial<SoundLayer>];
    expect(id).toBe('l1');
    expect(typeof updates.pan).toBe('number');
    expect(typeof updates.gain).toBe('number');
    expect(updates.fx?.filterFreq).toBe(500 + (updates.gain as number) * 10000);
  });
});

describe('ThreeDSoundSpace fullscreen toggle', () => {
  it('enters and exits fullscreen mode', () => {
    renderSpace([makeLayer('l1', 'Kick')], 'l1');

    expect(screen.getByLabelText('Enter Fullscreen Mode')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Enter Fullscreen Mode'));
    expect(screen.queryByLabelText('Enter Fullscreen Mode')).toBeNull();

    fireEvent.click(screen.getByLabelText('Exit Fullscreen Mode'));
    expect(screen.getByLabelText('Enter Fullscreen Mode')).toBeTruthy();
  });
});

describe('ThreeDSoundSpace reverb badge', () => {
  it('shows the badge for a selected layer with reverb enabled and mix', () => {
    const layer = makeLayer('l1', 'Kick', {
      fx: { ...DEFAULT_FX, reverbEnabled: true, reverbMix: 0.5 },
    });
    renderSpace([layer], 'l1');
    expect(screen.getByText('REVERB ACTIVE')).toBeTruthy();
  });

  it('shows the badge when reverbEnabled is omitted but mix is set', () => {
    const layer = makeLayer('l1', 'Kick', {
      fx: { ...DEFAULT_FX, reverbEnabled: undefined, reverbMix: 0.4 },
    });
    renderSpace([layer], 'l1');
    expect(screen.getByText('REVERB ACTIVE')).toBeTruthy();
  });

  it('hides the badge when reverb is explicitly disabled', () => {
    const layer = makeLayer('l1', 'Kick', {
      fx: { ...DEFAULT_FX, reverbEnabled: false, reverbMix: 0.5 },
    });
    renderSpace([layer], 'l1');
    expect(screen.queryByText('REVERB ACTIVE')).toBeNull();
  });

  it('hides the badge when no layer is selected', () => {
    renderSpace([makeLayer('l1', 'Kick')], null);
    expect(screen.queryByText('REVERB ACTIVE')).toBeNull();
    expect(screen.getByText('No Layer Selected')).toBeTruthy();
  });
});

describe('ThreeDSoundSpace keyboard nudging', () => {
  it('nudges pan and gain with arrows and ignores other keys', () => {
    const onUpdateLayer = vi.fn();
    renderSpace([makeLayer('l1', 'Kick')], 'l1', { onUpdateLayer });

    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown']) {
      fireEvent.keyDown(kickNode(), { key });
    }
    expect(onUpdateLayer).toHaveBeenCalledTimes(3);

    onUpdateLayer.mockClear();
    fireEvent.keyDown(kickNode(), { key: 'a' });
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });
});

describe('ThreeDSoundSpace layer visibility', () => {
  it('does not render disabled layers', () => {
    renderSpace([makeLayer('l1', 'Kick', { enabled: false })], null);
    expect(screen.queryByLabelText(/Spatial position for layer Kick/i)).toBeNull();
  });
});

describe('ThreeDSoundSpace layers without fx', () => {
  const noFxLayer = {
    id: 'l1',
    name: 'Kick',
    type: 'sample',
    enabled: true,
    gain: 0.5,
    pan: 0,
    pitch: 0,
    envelope: { ...DEFAULT_ENVELOPE },
  } as unknown as SoundLayer;

  it('spreads an empty fx object on keyboard nudges', () => {
    const onUpdateLayer = vi.fn();
    renderSpace([noFxLayer], 'l1', { onUpdateLayer });

    fireEvent.keyDown(kickNode(), { key: 'ArrowUp' });

    const [, updates] = onUpdateLayer.mock.calls[0] as [string, Partial<SoundLayer>];
    expect(updates.fx?.filterFreq).toBeCloseTo(500 + 0.55 * 10000, 6);
  });

  it('spreads an empty fx object on drag release', () => {
    const onUpdateLayer = vi.fn();
    renderSpace([noFxLayer], 'l1', { onUpdateLayer });

    fireEvent.mouseDown(kickNode(), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 100 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 100 });

    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, updates] = onUpdateLayer.mock.calls[0] as [string, Partial<SoundLayer>];
    expect(updates.fx?.filterFreq).toBeDefined();
  });
});

describe('ThreeDSoundSpace selection styling', () => {
  it('styles selected and unselected nodes differently', () => {
    renderSpace([makeLayer('l1', 'Kick'), makeLayer('l2', 'Snare')], 'l1');

    const selected = kickNode();
    const unselected = screen.getByLabelText(/Spatial position for layer Snare/i);

    expect(selected.className).toContain('scale-110');
    expect(unselected.className).toContain('bg-[#0f172a]');
  });
});
