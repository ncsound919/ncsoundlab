/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { ToastContainer } from './ToastContainer';

describe('ToastContainer', () => {
  it('renders toasts with default (success) styling and dismisses on button click', () => {
    const onDismiss = vi.fn();
    render(
      <ToastContainer
        toasts={[{ id: '1', message: 'Saved' }]}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText('Saved')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onDismiss).toHaveBeenCalledWith('1');
  });

  it('renders warn and error toasts', () => {
    render(
      <ToastContainer
        toasts={[
          { id: '2', message: 'Watch out', type: 'warn' },
          { id: '3', message: 'Boom', type: 'error' },
          { id: '4', message: 'Heads up', type: 'info' },
        ]}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Watch out')).toBeDefined();
    expect(screen.getByText('Boom')).toBeDefined();
    expect(screen.getByText('Heads up')).toBeDefined();
  });

  it('only shows the most recent 4 toasts', () => {
    render(
      <ToastContainer
        toasts={Array.from({ length: 6 }, (_, i) => ({ id: String(i), message: `toast-${i}` }))}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('toast-5')).toBeDefined();
    expect(screen.getByText('toast-2')).toBeDefined();
    expect(screen.queryByText('toast-0')).toBeNull();
    expect(screen.queryByText('toast-1')).toBeNull();
  });
});
