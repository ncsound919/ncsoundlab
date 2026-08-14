/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Component tests for `AddToKitModal` — the export/finalize form: kit
 * selection, new-kit flow, validation, metadata editing, tag suggestions and
 * the success auto-close.
 */

import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { AddToKitModal } from './AddToKitModal';
import type { SoundKit } from '../types';

const kits = [
  { id: 'k1', title: 'OBSIDIAN', samples: [] },
  { id: 'k2', title: 'ANALOG', samples: [1, 2] },
] as unknown as SoundKit[];

const renderModal = (over: Record<string, unknown> = {}) => {
  const onConfirmAdd = vi.fn();
  const onClose = vi.fn();
  render(
    <AddToKitModal
      isOpen={true}
      availableKits={kits}
      defaultSampleName="kick_01"
      onConfirmAdd={onConfirmAdd}
      onClose={onClose}
      {...over}
    />,
  );
  return { onConfirmAdd, onClose };
};

const kitSelect = () => screen.getByText('+ Create New Sound Kit...').closest('select') as HTMLSelectElement;
const sampleNameInput = () => screen.getByDisplayValue('kick_01') as HTMLInputElement;
const submitBtn = () => screen.getByRole('button', { name: /Finalize & Save Sample/i }) as HTMLButtonElement;
const selects = () => screen.getAllByRole('combobox') as HTMLSelectElement[];

describe('AddToKitModal', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders nothing when closed', () => {
    render(<AddToKitModal isOpen={false} availableKits={kits} onConfirmAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText(/Finalize & Export One-Shot/i)).toBeNull();
  });

  it('renders the form with kits and the default sample name', () => {
    renderModal();
    expect(screen.getByText(/Finalize & Export One-Shot/i)).toBeDefined();
    expect(screen.getByText(/OBSIDIAN \(0 Samples\)/i)).toBeDefined();
    expect(screen.getByText(/ANALOG \(2 Samples\)/i)).toBeDefined();
    expect(screen.getByDisplayValue('kick_01')).toBeDefined();
  });

  it('reveals the new-kit title field and requires it on submit', () => {
    renderModal();
    fireEvent.change(kitSelect(), { target: { value: 'new' } });
    const titleInput = screen.getByPlaceholderText(/OBSIDIAN ANALOG DRUMS/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: '' } });
    fireEvent.click(submitBtn());
    expect(screen.getByText('New kit title is required.')).toBeDefined();
  });

  it('normalizes the sample name via the button', () => {
    renderModal();
    fireEvent.change(sampleNameInput(), { target: { value: 'my kick !!!' } });
    fireEvent.click(screen.getByRole('button', { name: /Normalize Name/i }));
    expect(screen.getByDisplayValue('MY_KICK')).toBeDefined();
  });

  it('validates the sample name length on submit', () => {
    const { onConfirmAdd } = renderModal();
    fireEvent.change(sampleNameInput(), { target: { value: 'ab' } });
    fireEvent.click(submitBtn());
    expect(screen.getByText(/at least 3 valid characters/i)).toBeDefined();
    expect(onConfirmAdd).not.toHaveBeenCalled();
  });

  it('submits a valid form to an existing kit with cleaned data', () => {
    const { onConfirmAdd } = renderModal();
    fireEvent.change(sampleNameInput(), { target: { value: ' punchy kick ' } });
    fireEvent.click(screen.getByRole('button', { name: /Snare/i }));
    fireEvent.change(selects()[2], { target: { value: '32' } });
    fireEvent.click(submitBtn());
    expect(onConfirmAdd).toHaveBeenCalledTimes(1);
    const [kitId, name, category, newKitTitle, opts] = onConfirmAdd.mock.calls[0];
    expect(kitId).toBe('k1');
    expect(name).toBe('PUNCHY_KICK');
    expect(category).toBe('Snare');
    expect(newKitTitle).toBeUndefined();
    expect(opts.bitDepth).toBe('32');
    expect(opts.overwriteMode).toBe('duplicate');
    expect(screen.getByText(/One-Shot Successfully Finalized/i)).toBeDefined();
  });

  it('submits with a new-kit title and root key N/A excluded', () => {
    const { onConfirmAdd } = renderModal();
    fireEvent.change(kitSelect(), { target: { value: 'new' } });
    fireEvent.change(screen.getByPlaceholderText(/OBSIDIAN ANALOG DRUMS/i), { target: { value: 'My New Kit' } });
    fireEvent.change(selects()[4], { target: { value: 'N/A' } });
    fireEvent.click(submitBtn());
    const [, , , newKitTitle, opts] = onConfirmAdd.mock.calls[0];
    expect(newKitTitle).toBe('MY_NEW_KIT');
    expect(opts.rootKey).toBeUndefined();
  });

  it('toggles overwrite mode, channels and normalization', () => {
    const { onConfirmAdd } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^replace$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Mono$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Raw$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Enabled$/i }));
    fireEvent.click(submitBtn());
    const opts = onConfirmAdd.mock.calls[0][4];
    expect(opts.overwriteMode).toBe('replace');
    expect(opts.stereoMode).toBe('mono');
    expect(opts.normalize).toBe(false);
    expect(opts.peakCeilingDb).toBeUndefined();
    expect(opts.trimSilence).toBe(false);
  });

  it('parses tags and adds suggested tags', () => {
    const { onConfirmAdd } = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/dark, analog/i), { target: { value: ' dark , analog , dark ' } });
    expect(screen.getByText('dark')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /one-shot/i }));
    fireEvent.click(submitBtn());
    const opts = onConfirmAdd.mock.calls[0][4];
    expect(opts.tags).toContain('analog');
    expect(opts.tags).toContain('one-shot');
  });

  it('closes via the Cancel button', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the Escape key', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via a backdrop mousedown', () => {
    const { onClose } = renderModal();
    const backdrop = screen
      .getByText(/Finalize & Export One-Shot/i)
      .closest('.fixed') as HTMLElement;
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after the success animation', () => {
    vi.useFakeTimers();
    const { onConfirmAdd, onClose } = renderModal();
    fireEvent.click(submitBtn());
    expect(onConfirmAdd).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets the form when reopened', () => {
    const { rerender } = render(
      <AddToKitModal isOpen={true} availableKits={kits} defaultSampleName="kick_01" onConfirmAdd={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.change(sampleNameInput(), { target: { value: 'edited' } });
    rerender(
      <AddToKitModal isOpen={true} availableKits={kits} defaultSampleName="new_default" onConfirmAdd={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByDisplayValue('new_default')).toBeDefined();
  });
});
