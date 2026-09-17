/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import type { Command } from '../lib/commands';

const makeCommands = (): Command[] => [
  { id: 'nav', label: 'Go to Beat Studio', group: 'Navigate', run: vi.fn() },
  { id: 'add', label: 'Add Synth Layer', group: 'Layers', run: vi.fn() },
  { id: 'mute', label: 'Mute Selected Layer', group: 'Layers', hint: 'M', run: vi.fn() },
];

let onClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onClose = vi.fn();
});

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    render(<CommandPalette isOpen={false} onClose={onClose} commands={makeCommands()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('filters as you type', () => {
    render(<CommandPalette isOpen onClose={onClose} commands={makeCommands()} />);
    const input = screen.getByLabelText('Command palette search');
    fireEvent.change(input, { target: { value: 'mute' } });
    expect(screen.getByText('Mute Selected Layer')).toBeDefined();
    expect(screen.queryByText('Go to Beat Studio')).toBeNull();
  });

  it('runs the active command on Enter and closes', () => {
    const commands = makeCommands();
    render(<CommandPalette isOpen onClose={onClose} commands={commands} />);
    const input = screen.getByLabelText('Command palette search');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(commands[1].run).toHaveBeenCalledTimes(1);
  });

  it('runs a clicked command and closes', () => {
    const commands = makeCommands();
    render(<CommandPalette isOpen onClose={onClose} commands={commands} />);
    fireEvent.click(screen.getByText('Add Synth Layer'));
    expect(commands[1].run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    render(<CommandPalette isOpen onClose={onClose} commands={makeCommands()} />);
    fireEvent.keyDown(screen.getByLabelText('Command palette search'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
