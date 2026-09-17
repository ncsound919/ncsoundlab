/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `LayerEQPanel` — default-band fallback, per-band toggle / type /
 * frequency / gain / Q edits, Bypass All, the response-curve SVG and the
 * bands-on counter. No mocks needed; the real `eqBands` helpers are used.
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LayerEQPanel } from './LayerEQPanel';
import { DEFAULT_EQ_BANDS, type EQBand } from '../audio/eqBands';

const makeBands = (): EQBand[] => [
  { type: 'peaking', frequency: 440.456, gainDb: 3, q: 1, enabled: true },
  { type: 'highpass', frequency: 30, gainDb: 0, q: 0.7, enabled: false },
];

const renderPanel = (bands: EQBand[] | undefined, onChange = vi.fn()) => {
  const utils = render(<LayerEQPanel bands={bands} onChange={onChange} />);
  return { ...utils, onChange };
};

const bandRow = (index: number) =>
  document.querySelector(`[data-eq-band="${index}"]`) as HTMLElement;

const numberInputs = (index: number) =>
  bandRow(index).querySelectorAll('input[type="number"]');

describe('LayerEQPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to the default 5 bands when bands is undefined', () => {
    const { onChange } = renderPanel(undefined);
    expect(document.querySelectorAll('[data-eq-band]')).toHaveLength(
      DEFAULT_EQ_BANDS.length,
    );
    expect(screen.getByText(/0 bands on/i)).toBeDefined();
    expect(document.querySelector('svg polyline')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to defaults for an empty array too', () => {
    renderPanel([]);
    expect(document.querySelectorAll('[data-eq-band]')).toHaveLength(
      DEFAULT_EQ_BANDS.length,
    );
  });

  it('shows the enabled-band count', () => {
    renderPanel(makeBands());
    expect(screen.getByText(/1 bands on/i)).toBeDefined();
  });

  it('enables a bypassed band via its toggle dot', () => {
    const { onChange } = renderPanel(makeBands());
    fireEvent.click(screen.getByLabelText('Toggle band 2'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as EQBand[];
    expect(next[1].enabled).toBe(true);
    expect(next[0]).toEqual(makeBands()[0]);
  });

  it('bypasses an enabled band via its toggle dot', () => {
    const { onChange } = renderPanel(makeBands());
    fireEvent.click(screen.getByLabelText('Toggle band 1'));
    const next = onChange.mock.calls[0][0] as EQBand[];
    expect(next[0].enabled).toBe(false);
  });

  it('bypasses every band with Bypass All', () => {
    const bands: EQBand[] = makeBands().map((b) => ({ ...b, enabled: true }));
    const { onChange } = renderPanel(bands);
    fireEvent.click(screen.getByText('Bypass All'));
    const next = onChange.mock.calls[0][0] as EQBand[];
    expect(next).toHaveLength(2);
    expect(next.every((b) => b.enabled === false)).toBe(true);
    // Other fields are preserved.
    expect(next[0].frequency).toBe(440.456);
  });

  it('changes the band filter type', () => {
    const { onChange } = renderPanel(makeBands());
    const select = within(bandRow(0)).getByLabelText('Band type');
    fireEvent.change(select, { target: { value: 'lowshelf' } });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'lowshelf' }),
      makeBands()[1],
    ]);
  });

  it('edits frequency, gain and Q through the number cells', () => {
    const { onChange } = renderPanel(makeBands());
    const [hz, db, q] = Array.from(numberInputs(0));
    fireEvent.change(hz, { target: { value: '880' } });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ frequency: 880 }),
      makeBands()[1],
    ]);
    fireEvent.change(db, { target: { value: '-6' } });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ gainDb: -6 }),
      makeBands()[1],
    ]);
    fireEvent.change(q, { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ q: 2.5 }),
      makeBands()[1],
    ]);
  });

  it('edits only the targeted band row', () => {
    const { onChange } = renderPanel(makeBands());
    const [hz] = Array.from(numberInputs(1));
    fireEvent.change(hz, { target: { value: '60' } });
    const next = onChange.mock.calls[0][0] as EQBand[];
    expect(next[1].frequency).toBe(60);
    expect(next[0]).toEqual(makeBands()[0]);
  });

  it('displays rounded values and coerces non-finite values to 0', () => {
    renderPanel([
      { type: 'peaking', frequency: 440.456, gainDb: 3.14159, q: 1, enabled: true },
      { type: 'highpass', frequency: NaN, gainDb: Infinity, q: 0.7, enabled: false },
    ]);
    expect(
      (numberInputs(0)[0] as HTMLInputElement).value,
    ).toBe('440.46');
    expect((numberInputs(1)[0] as HTMLInputElement).value).toBe('0');
    expect((numberInputs(1)[1] as HTMLInputElement).value).toBe('0');
  });

  it('dims bypassed bands and highlights enabled ones', () => {
    const { container } = renderPanel(makeBands());
    expect(bandRow(0).className).toContain('border-emerald-500/40');
    expect(bandRow(1).className).toContain('opacity-60');
    expect(container.querySelector('[data-layer-eq]')).toBeTruthy();
  });

  it('renders a 48-point response curve polyline', () => {
    renderPanel(makeBands());
    const points = document
      .querySelector('svg polyline')
      ?.getAttribute('points');
    expect(points).toBeTruthy();
    expect(points!.split(' ')).toHaveLength(48);
  });
});
