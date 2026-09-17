/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FXChainPresetsPanel } from './FXChainPresetsPanel';
import type { RackModule } from '../types';

const mod = (): RackModule => ({ id: 'm1', type: 'eq', enabled: true, settings: {} });

describe('FXChainPresetsPanel', () => {
  it('renders and resets the rack', () => {
    const onClearRack = vi.fn();
    render(<FXChainPresetsPanel modules={[]} onLoad={vi.fn()} onClearRack={onClearRack} />);
    expect(screen.getByText(/FX Chain Presets/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Reset Rack/i }));
    expect(onClearRack).toHaveBeenCalledTimes(1);
  });

  it('disables saving an empty rack and enables it once modules exist', () => {
    const { rerender } = render(<FXChainPresetsPanel modules={[]} onLoad={vi.fn()} onClearRack={vi.fn()} />);
    expect((screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<FXChainPresetsPanel modules={[mod()]} onLoad={vi.fn()} onClearRack={vi.fn()} />);
    expect((screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
