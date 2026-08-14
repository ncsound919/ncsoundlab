/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal', () => {
  it('renders nothing when closed', () => {
    render(<KeyboardShortcutsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders shortcut categories, key labels, and closes via both buttons', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    expect(dialog).toBeDefined();
    expect(screen.getByText('Playback & Preview')).toBeDefined();
    expect(screen.getByText('Layer Management')).toBeDefined();
    expect(screen.getByText('Workflow & History')).toBeDefined();
    expect(screen.getByText('Play / Stop the master mix')).toBeDefined();
    expect(screen.getByText('Undo last sound layer change')).toBeDefined();

    const headerClose = dialog.querySelector('button') as HTMLElement;
    fireEvent.click(headerClose);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
