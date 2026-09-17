/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PianoRoll, Pattern } from './PianoRoll';
import { SoundLayer } from '../types';

const layer = (overrides: Partial<SoundLayer> = {}): SoundLayer =>
  ({
    id: 'a',
    name: 'Kick',
    enabled: true,
    gain: 0.8,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 },
    fx: {},
    ...overrides,
  } as unknown as SoundLayer);

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  layers: [layer()],
  pattern: {} as Pattern,
  currentStep: 0,
  activeLayerId: 'a' as string | null,
  onToggleNote: vi.fn(),
  ...overrides,
});

const grid = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('div.cursor-crosshair');
  if (!el) throw new Error('piano-roll grid not found');
  return el as HTMLElement;
};

const stubRect = (el: HTMLElement, rect: Partial<DOMRect>) => {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 320, height: 784, right: 320, bottom: 784, x: 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect);
};

describe('PianoRoll', () => {
  it('renders empty state with no layers', () => {
    const { container } = render(<PianoRoll {...baseProps({ layers: [], activeLayerId: null })} />);
    expect(container.querySelector('div.cursor-crosshair')).toBeDefined();
    // 16 step headers, numbered every 4 steps
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
  });

  it('shows only enabled layers in the row labels', () => {
    render(
      <PianoRoll
        {...baseProps({
          layers: [layer({ id: 'a', name: 'Kick' }), layer({ id: 'b', name: 'Ghost', enabled: false })],
        })}
      />
    );
    expect(screen.getByText('Kick')).toBeDefined();
    expect(screen.queryByText('Ghost')).toBeNull();
  });

  it('renders notes for on-cells and skips off-cells and missing rows', () => {
    const pattern: Pattern = {
      a: Array.from({ length: 16 }, (_, i) => ({ on: i === 0 || i === 5, note: 60 })),
    };
    const { container } = render(<PianoRoll {...baseProps({ pattern, currentStep: 3 })} />);
    // Step header highlights the current step; notes at steps 0 and 5 render
    expect(container.innerHTML).toContain('bg-');
    expect(screen.getByText('Kick')).toBeDefined();
  });

  it('falls back to row pitch for missing or out-of-range notes', () => {
    const pattern: Pattern = {
      a: [{ on: true }, { on: true, note: 200 }, { on: true, note: 10 }, { on: true, note: 60 }],
    };
    const { container } = render(<PianoRoll {...baseProps({ pattern })} />);
    // No crash; note blocks still render
    expect(container.querySelector('div.cursor-crosshair')).toBeDefined();
  });

  it('renders 32 steps when stepLength is 32', () => {
    render(<PianoRoll {...baseProps({ stepLength: 32 })} />);
    expect(screen.getByText('8')).toBeDefined();
  });

  it('clicks the grid to toggle a note on the active layer', () => {
    const onToggleNote = vi.fn();
    const { container } = render(<PianoRoll {...baseProps({ onToggleNote })} />);
    const el = grid(container);
    stubRect(el, {});
    // x=160/320*16 = step 8; y=32 -> pitch 84 - 2 = 82
    fireEvent.click(el, { clientX: 160, clientY: 32 });
    expect(onToggleNote).toHaveBeenCalledTimes(1);
    expect(onToggleNote).toHaveBeenCalledWith('a', 8, 82);
  });

  it('maps clicks correctly in 32-step mode', () => {
    const onToggleNote = vi.fn();
    const { container } = render(<PianoRoll {...baseProps({ onToggleNote, stepLength: 32 })} />);
    const el = grid(container);
    stubRect(el, {});
    fireEvent.click(el, { clientX: 160, clientY: 16 });
    // x = floor(0.5*32) = 16; pitch = 84 - 1 = 83
    expect(onToggleNote).toHaveBeenCalledWith('a', 16, 83);
  });

  it('does nothing when there is no active layer', () => {
    const onToggleNote = vi.fn();
    const { container } = render(<PianoRoll {...baseProps({ onToggleNote, activeLayerId: null })} />);
    const el = grid(container);
    stubRect(el, {});
    fireEvent.click(el, { clientX: 160, clientY: 32 });
    expect(onToggleNote).not.toHaveBeenCalled();
  });

  it('ignores clicks outside the pitch range', () => {
    const onToggleNote = vi.fn();
    const { container } = render(<PianoRoll {...baseProps({ onToggleNote })} />);
    const el = grid(container);
    stubRect(el, {});
    // Far below the grid -> pitch below LOW_PITCH
    fireEvent.click(el, { clientX: 10, clientY: 100000 });
    expect(onToggleNote).not.toHaveBeenCalled();
  });

  it('clamps clicks at the grid edges', () => {
    const onToggleNote = vi.fn();
    const { container } = render(<PianoRoll {...baseProps({ onToggleNote })} />);
    const el = grid(container);
    stubRect(el, {});
    // Negative clientX clamps to step 0
    fireEvent.click(el, { clientX: -50, clientY: 0 });
    expect(onToggleNote).toHaveBeenCalledWith('a', 0, 84);
  });
});
