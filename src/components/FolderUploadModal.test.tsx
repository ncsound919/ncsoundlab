/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FolderUploadModal } from './FolderUploadModal';

describe('FolderUploadModal', () => {
  it('renders the import workspace', () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    expect(screen.getByText(/Drum Folder Import & Audition Workspace/i)).toBeDefined();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
