/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Component tests for `AafExportPanel` — Tauri-only AAF export/import flow.
 * Tauri's invoke/dialog plugins and the audio engine are mocked; the Tauri
 * flag is toggled via `window.__TAURI_INTERNALS__`.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { AafExportPanel, pcmToAudioBuffer } from './AafExportPanel';
import { useReferenceTrackStore } from '../store/referenceTrackStore';
import type { SoundLayer } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('../lib/audioEngine', () => ({ audioEngine: { exportLayerStem: vi.fn() } }));

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { audioEngine } from '../lib/audioEngine';

const makeBuffer = (channels = 2) => {
  const chans = Array.from({ length: channels }, () => new Float32Array(4800));
  return {
    numberOfChannels: channels,
    length: 4800,
    sampleRate: 48000,
    duration: 0.1,
    getChannelData: (c: number) => chans[c] ?? chans[0],
  };
};

const makeLayer = (name = 'Kick', enabled = true): SoundLayer =>
  ({
    id: name,
    name,
    type: 'sample',
    enabled,
    audioBuffer: makeBuffer(),
  }) as SoundLayer;

const renderPanel = (over: Partial<Parameters<typeof AafExportPanel>[0]> = {}) => {
  const props = {
    layers: [makeLayer('Kick'), makeLayer('Snare')],
    songName: 'My Song',
    bpm: 90,
    onToast: vi.fn(),
    ...over,
  };
  render(<AafExportPanel {...props} />);
  return props;
};

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /AAF/i }));

describe('AafExportPanel', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset().mockResolvedValue({ path: 'C:/x.aaf', bytes: 1000, tracks: 2 });
    vi.mocked(save).mockReset().mockResolvedValue('C:/out.aaf');
    vi.mocked(open).mockReset().mockResolvedValue('C:/in.aaf');
    vi.mocked(audioEngine.exportLayerStem as any).mockReset().mockResolvedValue(makeBuffer());
    delete (window as any).__TAURI_INTERNALS__;
    useReferenceTrackStore.setState({ buffer: null, name: '', sourceSampleRate: 0, durationSec: 0, channels: 0, sizeBytes: 0, importedAt: '', formatLabel: '' } as never);
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('shows the desktop-only badge on the web build', () => {
    const props = renderPanel();
    openPanel();
    expect(screen.getByText(/desktop app/i)).toBeDefined();
    expect(screen.queryByText(/Export to Pro Tools AAF/i)).toBeNull();
    expect(props.onToast).not.toHaveBeenCalled();
  });

  it('renders export/import controls in the Tauri desktop build', () => {
    (window as any).__TAURI_INTERNALS__ = {};
    renderPanel();
    openPanel();
    expect(screen.getByText(/Export to Pro Tools AAF/i)).toBeDefined();
    expect(screen.getByText(/Open an \.aaf file/i)).toBeDefined();
    expect(screen.getByText(/2 stems/)).toBeDefined();
  });

  it('switches the export length between 4/8/16 bars', () => {
    (window as any).__TAURI_INTERNALS__ = {};
    renderPanel();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(screen.getByText(/· 4 bars/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '16' }));
    expect(screen.getByText(/· 16 bars/)).toBeDefined();
  });

  it('exports stems to an AAF and reports the result', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const props = renderPanel();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /Export to Pro Tools AAF/i }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('export_aaf_session', expect.anything());
    });
    expect(save).toHaveBeenCalled();
    expect(audioEngine.exportLayerStem).toHaveBeenCalled();
    expect(props.onToast).toHaveBeenCalledWith('Exported AAF: 2 tracks', 'success');
    await waitFor(() => expect(screen.getByText(/C:\/x\.aaf/)).toBeDefined());
  });

  it('does not invoke the backend when the save dialog is cancelled', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(save).mockResolvedValue(null as never);
    renderPanel();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /Export to Pro Tools AAF/i }));
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('toasts an error when the backend export throws', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockRejectedValueOnce(new Error('disk full'));
    const props = renderPanel();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /Export to Pro Tools AAF/i }));
    await waitFor(() => {
      expect(props.onToast).toHaveBeenCalledWith(expect.stringContaining('AAF export failed'), 'error');
    });
  });

  it('imports an AAF, lists recovered tracks and loads one as a reference', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValue({
      song_name: 'Session A',
      tracks: [
        { name: 'Kick', sample_rate: 48000, channels: 1, bits_per_sample: 16, frames: 100, pcm_base64: '//8AAAAA' },
      ],
    });
    const props = renderPanel();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /Open an \.aaf file/i }));
    await waitFor(() => expect(screen.getByText(/Session A — 1 track/)).toBeDefined());
    expect(screen.getByText('Kick')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Reference/i }));
    await waitFor(() => {
      expect(props.onToast).toHaveBeenCalledWith(expect.stringContaining('loaded as reference'), 'success');
    });
    const state = useReferenceTrackStore.getState();
    expect((state as { buffer: unknown }).buffer).toBeTruthy();
  });

  it('toasts an error when import fails', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockRejectedValueOnce(new Error('bad aaf'));
    const props = renderPanel();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /Open an \.aaf file/i }));
    await waitFor(() => {
      expect(props.onToast).toHaveBeenCalledWith(expect.stringContaining('AAF import failed'), 'error');
    });
  });

  it('closes the panel via the X button', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    renderPanel();
    openPanel();
    const xBtn = screen
      .getAllByRole('button')
      .find((b) => b.innerHTML.includes('lucide-x')) as HTMLElement;
    fireEvent.click(xBtn);
    await waitFor(
      () => expect(screen.queryByText(/AAF Interchange/i)).toBeNull(),
      { timeout: 2000 },
    );
  });

  it('keeps the panel open when clicking inside and closes on the backdrop', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    renderPanel();
    openPanel();
    const panel = screen.getByText(/AAF Interchange/i).closest('.w-full.max-w-lg') as HTMLElement;
    fireEvent.click(panel);
    expect(screen.getByText(/AAF Interchange/i)).toBeDefined();
    const backdrop = panel.parentElement as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(
      () => expect(screen.queryByText(/AAF Interchange/i)).toBeNull(),
      { timeout: 2000 },
    );
  });
});
