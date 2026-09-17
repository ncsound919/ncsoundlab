/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Mpd226Layout } from './Mpd226Layout';
import { createDefaultMpd226Profile } from '../../lib/controller/defaultMpd226';
import { SURFACES } from '../../lib/controller/surface';
import { useControllerStore } from '../../store/controllerStore';
import { DEFAULT_CHORD_SETTINGS } from '../../lib/controller/chordPads';

const renderLayout = (over: Partial<ComponentProps<typeof Mpd226Layout>> = {}) => {
  const props = {
    profile: createDefaultMpd226Profile(),
    padPage: 0,
    controlPage: 0,
    selected: null,
    learnTarget: null,
    onSelect: vi.fn(),
    onStartLearn: vi.fn(),
    onPadPageChange: vi.fn(),
    onControlPageChange: vi.fn(),
    ...over,
  };
  const utils = render(<Mpd226Layout {...props} />);
  return { ...utils, props };
};

beforeEach(() => {
  useControllerStore.getState().setChord({ ...DEFAULT_CHORD_SETTINGS });
});

describe('Mpd226Layout', () => {
  it('renders every control on the current bank pages', () => {
    const { container } = renderLayout();
    expect(container.querySelectorAll('[data-control]')).toHaveLength(16 + 4 + 4 + 4 + 4);
  });

  it('selects a pad when clicked', () => {
    const { container, props } = renderLayout();
    fireEvent.click(container.querySelector('[data-control="pad:0:0"]')!);
    expect(props.onSelect).toHaveBeenCalledWith('pad:0:0');
  });

  it('arms MIDI-learn from the learn dot', () => {
    const { container, props } = renderLayout();
    const pad = container.querySelector('[data-control="pad:0:0"]')!.parentElement!;
    fireEvent.click(pad.querySelector('button[title="MIDI-learn this pad"]')!);
    expect(props.onStartLearn).toHaveBeenCalledWith('pad:0:0');
  });

  it('switches pad and control banks', () => {
    const { props } = renderLayout();
    fireEvent.click(screen.getByText('B'));
    expect(props.onPadPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText('3'));
    expect(props.onControlPageChange).toHaveBeenCalledWith(2);
  });

  it('shows chord names on the chord pad bank', () => {
    const { container } = renderLayout({ padPage: 3 });
    expect(container.querySelector('[data-control="pad:3:0"]')!.textContent).toContain('Cm');
    expect(container.querySelector('[data-control="pad:3:1"]')!.textContent).toContain('dim');
  });

  it('marks the selected control and shows binding signatures', () => {
    const { container } = renderLayout({ selected: 'knob:0:0' });
    const knob = container.querySelector('[data-control="knob:0:0"]')!;
    expect(knob.className).toContain('border-yellow-400');
    expect(knob.textContent).toContain('CC 3');
  });

  it('renders an MPD218 surface without faders, switches or transport', () => {
    const { container } = renderLayout({ surface: SURFACES.mpd218 });
    expect(container.querySelector('[data-surface="mpd218"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-control]')).toHaveLength(16 + 4);
    expect(container.querySelector('[data-control="fader:0:0"]')).toBeNull();
    expect(container.querySelector('[data-control="transport:0:play"]')).toBeNull();
  });

  it('renders a generic surface with pads, knobs, faders and basic transport', () => {
    const { container } = renderLayout({ surface: SURFACES.generic });
    expect(container.querySelectorAll('[data-control]')).toHaveLength(16 + 4 + 4 + 3);
    expect(container.querySelector('[data-control="switch:0:0"]')).toBeNull();
  });

  it('highlights the armed control in learn mode', () => {
    const { container } = renderLayout({ learnMode: true, learnTarget: 'pad:0:0' });
    expect(container.querySelector('[data-control="pad:0:0"]')!.className).toContain('ring-fuchsia-400');
  });
});
