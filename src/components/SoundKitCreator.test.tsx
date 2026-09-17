/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `SoundKitCreator` — kit metadata form, sample compilation table,
 * auditioning, auto-tagging, ZIP export and Port-to-Marketplace publish flow.
 * CoverArtGenerator / FolderUploadModal / db are stubbed for isolation.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundKitCreator } from './SoundKitCreator';
import { saveSoundKit } from '../lib/db';

vi.mock('./CoverArtGenerator', () => ({ CoverArtGenerator: () => <div data-testid="cover-art" /> }));
vi.mock('./FolderUploadModal', () => ({
  FolderUploadModal: ({ onAddSamplesToKit }: { onAddSamplesToKit: (s: unknown[]) => void }) => (
    <button
      onClick={() =>
        onAddSamplesToKit([
          {
            id: 's1',
            name: 'Kick_Sample',
            fileName: 'kick.wav',
            category: 'Kick',
            tags: ['kick'],
            gain: 0.8,
            pitch: 0,
          },
        ])
      }
    >
      ADD_TEST_SAMPLE
    </button>
  ),
}));
vi.mock('../lib/db', () => ({ saveSoundKit: vi.fn(async () => 'kit-1'), fetchFolderLinks: vi.fn(async () => []) }));

const createdSources: any[] = [];
class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    createdSources.push(this);
  }
}
class FakeGain {
  gain = { value: 1 };
  connect = vi.fn();
}
class FakeAudioContext {
  state = 'running';
  destination = {};
  resume = vi.fn();
  close = vi.fn();
  createBufferSource() {
    return new FakeSource();
  }
  createGain() {
    return new FakeGain();
  }
}

const renderCreator = (over: Record<string, unknown> = {}) => {
  const onPublishToMarketplace = vi.fn();
  const onNavigateToMarketplace = vi.fn();
  const result = render(
    <SoundKitCreator
      onPublishToMarketplace={onPublishToMarketplace}
      onNavigateToMarketplace={onNavigateToMarketplace}
      {...over}
    />,
  );
  return { ...result, onPublishToMarketplace, onNavigateToMarketplace };
};

const addOneSample = () => {
  fireEvent.click(screen.getByRole('button', { name: /Import \/ Audition Folder/i }));
  fireEvent.click(screen.getByText('ADD_TEST_SAMPLE'));
};

describe('SoundKitCreator', () => {
  beforeEach(() => {
    createdSources.length = 0;
    vi.clearAllMocks();
    (window as any).AudioContext = FakeAudioContext;
    (window as any).webkitAudioContext = FakeAudioContext;
    (URL as any).createObjectURL = vi.fn(() => 'blob:fake');
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('renders the default kit metadata form', () => {
    renderCreator();
    expect(screen.getByDisplayValue('OBSIDIAN ANALOG DRUMS & 808s')).toBeDefined();
    expect(screen.getByText('0 Samples')).toBeDefined();
    expect((screen.getByRole('button', { name: /Export ZIP/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Port to Marketplace/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits metadata fields and sets the kit free', () => {
    const { container } = renderCreator();
    fireEvent.change(screen.getByDisplayValue('OBSIDIAN ANALOG DRUMS & 808s'), {
      target: { value: 'NEW TITLE' },
    });
    expect(screen.getByDisplayValue('NEW TITLE')).toBeDefined();

    fireEvent.change(screen.getByDisplayValue('SONIK AUDIO LABS'), {
      target: { value: 'PRODUCER X' },
    });
    expect(screen.getByDisplayValue('PRODUCER X')).toBeDefined();

    fireEvent.change(screen.getByDisplayValue('Trap / Cyberpunk / Hip-Hop'), {
      target: { value: 'House' },
    });
    expect(screen.getByDisplayValue('House')).toBeDefined();

    const price = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(price, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Set Free'));
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('0');
  });

  it('compiles samples from the upload modal into the table', () => {
    renderCreator();
    addOneSample();
    expect(screen.getByText('1 Samples')).toBeDefined();
    expect(screen.getByDisplayValue('Kick_Sample')).toBeDefined();
  });

  it('auto-tags every compiled sample', () => {
    renderCreator();
    addOneSample();
    fireEvent.click(screen.getByText('Auto-Tag All'));
    expect(screen.getByDisplayValue(/analog_dsp/)).toBeDefined();
  });

  it('edits a compiled sample name and tags', () => {
    renderCreator();
    addOneSample();
    fireEvent.change(screen.getByDisplayValue('Kick_Sample'), { target: { value: 'Sub Kick' } });
    expect(screen.getByDisplayValue('Sub Kick')).toBeDefined();

    fireEvent.change(screen.getByDisplayValue('kick'), { target: { value: 'kick, analog' } });
    expect(screen.getByDisplayValue('kick, analog')).toBeDefined();
  });

  it('auditions and stops a sample with the shared context', () => {
    const { container } = renderCreator();
    addOneSample();

    const playBtn = container.querySelector('svg.lucide-play')?.closest('button') as HTMLElement;
    fireEvent.click(playBtn);
    expect(createdSources.length).toBe(1);
    expect(createdSources[0].start).toHaveBeenCalled();

    const stopBtn = container.querySelector('svg.lucide-square')?.closest('button') as HTMLElement;
    fireEvent.click(stopBtn);
    expect(createdSources[0].stop).toHaveBeenCalled();
  });

  it('removes a sample and clears the whole kit', () => {
    const { container } = renderCreator();
    addOneSample();

    fireEvent.click(container.querySelector('svg.lucide-trash2')!.closest('button') as HTMLElement);
    expect(screen.getByText(/No samples compiled in kit yet/i)).toBeDefined();

    addOneSample();
    fireEvent.click(screen.getByText('Clear All'));
    expect(screen.getByText(/No samples compiled in kit yet/i)).toBeDefined();
  });

  it('exports a ZIP archive of the compiled samples', async () => {
    renderCreator();
    addOneSample();
    fireEvent.click(screen.getByRole('button', { name: /Export ZIP/i }));
    await waitFor(() => expect((URL as any).createObjectURL).toHaveBeenCalled());
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
  });

  it('publishes the kit to the marketplace and shows the success banner', async () => {
    const { onPublishToMarketplace, onNavigateToMarketplace } = renderCreator();
    addOneSample();
    fireEvent.click(screen.getByRole('button', { name: /Port to Marketplace/i }));

    await waitFor(() => expect(onPublishToMarketplace).toHaveBeenCalledTimes(1));
    expect(saveSoundKit).toHaveBeenCalled();
    expect(screen.getByText(/Kit Ported/i)).toBeDefined();

    fireEvent.click(screen.getByText(/View in Marketplace/i));
    expect(onNavigateToMarketplace).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText(/Kit Ported/i)).toBeNull();
  });
});
