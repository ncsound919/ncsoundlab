/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendsPanel } from './SendsPanel';
import { useMixerStore } from '../store/mixerStore';

const card = (container: HTMLElement, busId: string): HTMLElement => {
  const el = container.querySelector(`[data-bus="${busId}"]`);
  if (!el) throw new Error(`bus card ${busId} not found`);
  return el as HTMLElement;
};

describe('SendsPanel', () => {
  beforeEach(() => {
    useMixerStore.getState().reset();
  });

  it('renders the default reverb and delay return cards', () => {
    const { container } = render(<SendsPanel />);
    expect(screen.getByText('FX Bus Returns')).toBeDefined();
    expect(card(container, 'reverb')).toBeDefined();
    expect(card(container, 'delay')).toBeDefined();
    // Each card has Gain and Pan knobs
    for (const bus of ['reverb', 'delay']) {
      const c = card(container, bus);
      expect(within(c).getByRole('slider', { name: 'Gain' })).toBeDefined();
      expect(within(c).getByRole('slider', { name: 'Pan' })).toBeDefined();
    }
  });

  it('toggles a bus off and on', () => {
    const { container } = render(<SendsPanel />);
    const c = card(container, 'reverb');
    const off = within(c).getByRole('button', { name: 'Disable reverb bus' });
    expect(off.textContent).toBe('On');
    fireEvent.click(off);
    expect(useMixerStore.getState().buses['reverb'].enabled).toBe(false);
    expect(within(card(container, 'reverb')).getByRole('button', { name: 'Enable reverb bus' }).textContent).toBe('Off');
    fireEvent.click(within(card(container, 'reverb')).getByRole('button', { name: 'Enable reverb bus' }));
    expect(useMixerStore.getState().buses['reverb'].enabled).toBe(true);
  });

  it('adjusts return gain via the Gain knob and writes through to the store', () => {
    const { container } = render(<SendsPanel />);
    const before = useMixerStore.getState().buses['delay'].gain;
    fireEvent.keyDown(within(card(container, 'delay')).getByRole('slider', { name: 'Gain' }), { key: 'ArrowUp' });
    const after = useMixerStore.getState().buses['delay'].gain;
    expect(after).toBeGreaterThan(before);
  });

  it('adjusts return pan via the Pan knob', () => {
    const { container } = render(<SendsPanel />);
    const before = useMixerStore.getState().buses['reverb'].pan;
    fireEvent.keyDown(within(card(container, 'reverb')).getByRole('slider', { name: 'Pan' }), { key: 'ArrowUp' });
    expect(useMixerStore.getState().buses['reverb'].pan).toBeGreaterThan(before);
  });

  it('falls back to defaults for unknown bus ids', () => {
    const { container } = render(<SendsPanel buses={['weird-bus']} />);
    const c = card(container, 'weird-bus');
    expect(c).toBeDefined();
    expect(within(c).getByRole('button', { name: 'Disable weird-bus bus' })).toBeDefined();
    fireEvent.keyDown(within(c).getByRole('slider', { name: 'Gain' }), { key: 'ArrowUp' });
    expect(useMixerStore.getState().buses['weird-bus'].gain).toBeGreaterThan(1);
  });

  it('renders a dimmed card for a bus disabled in the store', () => {
    useMixerStore.getState().setBus('delay', { enabled: false });
    const { container } = render(<SendsPanel />);
    const c = card(container, 'delay');
    expect(within(c).getByRole('button', { name: 'Enable delay bus' }).textContent).toBe('Off');
    expect(c.className).toContain('opacity-50');
  });

  it('renders no cards for an empty bus list', () => {
    const { container } = render(<SendsPanel buses={[]} />);
    expect(screen.getByText('FX Bus Returns')).toBeDefined();
    expect(container.querySelectorAll('[data-bus]').length).toBe(0);
  });

  it('reflects store-driven gain set before render', () => {
    useMixerStore.getState().setBus('reverb', { gain: 1.5 });
    const { container } = render(<SendsPanel />);
    expect(within(card(container, 'reverb')).getByRole('slider', { name: 'Gain' }).getAttribute('aria-valuenow')).toBe('1.5');
    void vi;
  });

  // NOTE: updateBus also calls audioEngine.syncSendBuses(), but the global
  // audioEngine mock is a Proxy that returns a fresh vi.fn() per property
  // access, so the call cannot be asserted on — store write-through above is
  // the observable contract under test.
});
