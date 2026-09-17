/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `SoundKitCreator` — description/genre edits, price edge
 * cases, auditioning with embedded buffers and missing gains, per-row
 * category/key/tag edits, analysis display, Clear-All-while-playing, ZIP
 * export with and without cover art, the offline publish banner, the
 * double-publish guard, and both upload entry points. `CoverArtGenerator`,
 * `FolderUploadModal` and `db` are stubbed; playback uses a fake
 * AudioContext (mirroring SoundKitCreator.test.tsx).
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoundKitCreator } from './SoundKitCreator';
import { saveSoundKit } from '../lib/db';

vi.mock('./CoverArtGenerator', () => ({
  CoverArtGenerator: ({ options, onExportDataUrl }: any) => (
    <div data-testid="cover-art">
      <span data-testid="cover-badge">{options.badgeText}</span>
      <button onClick={() => onExportDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')}>SET_COVER</button>
      <button onClick={() => onExportDataUrl('no-comma-payload')}>SET_COVER_NO_COMMA</button>
    </div>
  ),
}));
vi.mock('./FolderUploadModal', () => ({
  FolderUploadModal: ({ onAddSamplesToKit, onClose }: any) => (
    <div>
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
      <button
        onClick={() =>
          onAddSamplesToKit([
            {
              id: 's2',
              name: 'Analyzed_Hat',
              fileName: 'hat.wav',
              category: 'HiHat',
              tags: ['hat'],
              gain: undefined,
              pitch: 0,
              analysis: { peakDb: -3, rmsDb: -12, transientSharpness: 7 },
            },
          ])
        }
      >
        ADD_ANALYZED_SAMPLE
      </button>
      <button onClick={onClose}>CLOSE_MODAL</button>
    </div>
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

const openModal = () =>
  fireEvent.click(screen.getByRole('button', { name: /Import \/ Audition Folder/i }));

const addOneSample = () => {
  openModal();
  fireEvent.click(screen.getByText('ADD_TEST_SAMPLE'));
};

describe('SoundKitCreator coverage', () => {
  beforeEach(() => {
    createdSources.length = 0;
    vi.clearAllMocks();
    (window as any).AudioContext = FakeAudioContext;
    (window as any).webkitAudioContext = FakeAudioContext;
    (URL as any).createObjectURL = vi.fn(() => 'blob:fake');
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('edits description and genre', () => {
    renderCreator();
    const desc = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: 'New description' } });
    expect(desc.value).toBe('New description');
    fireEvent.change(screen.getByDisplayValue('Trap / Cyberpunk / Hip-Hop'), {
      target: { value: 'Ambient' },
    });
    expect(screen.getByDisplayValue('Ambient')).toBeDefined();
  });

  it('coerces invalid and negative prices to zero', () => {
    const { container } = renderCreator();
    const price = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(price, { target: { value: 'abc' } });
    expect(price.value).toBe('0');
    expect(screen.getByTestId('cover-badge').textContent).toBe('FREE DOWNLOAD');
    fireEvent.change(price, { target: { value: '-5' } });
    expect(price.value).toBe('0');
  });

  it('keeps the free badge when Set Free is clicked while already free', () => {
    const { container } = renderCreator();
    const price = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(price, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Set Free'));
    expect(price.value).toBe('0');
    expect(screen.getByTestId('cover-badge').textContent).toBe('FREE DOWNLOAD');
  });

  it('updates the cover badge for a premium price', () => {
    const { container } = renderCreator();
    const price = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(price, { target: { value: '19' } });
    expect(screen.getByTestId('cover-badge').textContent).toBe('$19.00 PREMIUM');
  });

  it('auditions a second sample by stopping the first source', () => {
    const { container } = renderCreator();
    openModal();
    fireEvent.click(screen.getByText('ADD_TEST_SAMPLE'));
    // The modal closes itself once samples are compiled into the kit.
    openModal();
    fireEvent.click(screen.getByText('ADD_ANALYZED_SAMPLE'));

    const plays = Array.from(container.querySelectorAll('svg.lucide-play')).map(
      (svg) => svg.closest('button') as HTMLElement,
    );
    expect(plays).toHaveLength(2);
    fireEvent.click(plays[0]);
    expect(createdSources).toHaveLength(1);
    fireEvent.click(plays[1]);
    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].stop).toHaveBeenCalled();
  });

  it('falls back to the default gain for samples without one', () => {
    const { container } = renderCreator();
    openModal();
    fireEvent.click(screen.getByText('ADD_ANALYZED_SAMPLE'));
    const play = container.querySelector('svg.lucide-play')?.closest('button') as HTMLElement;
    expect(() => fireEvent.click(play)).not.toThrow();
    expect(createdSources).toHaveLength(1);
  });

  it('clears the playing state when the audition source ends', () => {
    const { container } = renderCreator();
    addOneSample();
    fireEvent.click(container.querySelector('svg.lucide-play')?.closest('button') as HTMLElement);
    act(() => {
      createdSources[0].onended?.();
    });
    expect(container.querySelector('svg.lucide-square')).toBeNull();
  });

  it('changes a sample category through the row select', () => {
    const { container } = renderCreator();
    addOneSample();
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Snare' } });
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('Snare');
  });

  it('edits and clears the sample key', () => {
    const { container } = renderCreator();
    addOneSample();
    const keyInput = container.querySelector('input[placeholder="—"]') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'C3' } });
    expect(keyInput.value).toBe('C3');
    fireEvent.change(keyInput, { target: { value: '' } });
    expect(keyInput.value).toBe('');
  });

  it('drops empty tag fragments when editing tags', () => {
    renderCreator();
    addOneSample();
    fireEvent.change(screen.getByDisplayValue('kick'), {
      target: { value: 'kick, , 808, ' },
    });
    expect(screen.getByDisplayValue('kick, 808')).toBeDefined();
  });

  it('shows analysis values or dashes per row', () => {
    const { container } = renderCreator();
    addOneSample();
    // No analysis on the plain sample: dashes in peak/RMS/transient cells.
    expect(container.textContent).toContain('—');
    // Analyzed sample renders its measured values.
    openModal();
    fireEvent.click(screen.getByText('ADD_ANALYZED_SAMPLE'));
    expect(screen.getByText('-3 dB')).toBeDefined();
    expect(screen.getByText('-12 dB')).toBeDefined();
    expect(screen.getByText('7/10')).toBeDefined();
  });

  it('stops playback when removing the playing sample', () => {
    const { container } = renderCreator();
    addOneSample();
    fireEvent.click(container.querySelector('svg.lucide-play')?.closest('button') as HTMLElement);
    fireEvent.click(container.querySelector('svg.lucide-trash2')!.closest('button') as HTMLElement);
    expect(createdSources[0].stop).toHaveBeenCalled();
    expect(screen.getByText(/No samples compiled in kit yet/i)).toBeDefined();
  });

  it('opens the upload workspace from Import More Sounds and the empty state', () => {
    renderCreator();
    fireEvent.click(screen.getByText('Import More Sounds'));
    expect(screen.getByText('ADD_TEST_SAMPLE')).toBeDefined();
    fireEvent.click(screen.getByText('CLOSE_MODAL'));
    fireEvent.click(screen.getByText('Open Folder Audition Workspace'));
    expect(screen.getByText('ADD_TEST_SAMPLE')).toBeDefined();
  });

  it('exports a zip embedding cover art', async () => {
    renderCreator();
    addOneSample();
    fireEvent.click(screen.getByText('SET_COVER'));
    fireEvent.click(screen.getByRole('button', { name: /Export ZIP/i }));
    await waitFor(() => expect((URL as any).createObjectURL).toHaveBeenCalled());
  });

  it('exports a zip when the cover payload has no data-url prefix', async () => {
    renderCreator();
    addOneSample();
    fireEvent.click(screen.getByText('SET_COVER_NO_COMMA'));
    fireEvent.click(screen.getByRole('button', { name: /Export ZIP/i }));
    await waitFor(() => expect((URL as any).createObjectURL).toHaveBeenCalled());
  });

  it('shows the offline banner when local save fails', async () => {
    vi.mocked(saveSoundKit).mockRejectedValueOnce(new Error('indexeddb locked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderCreator();
    addOneSample();
    fireEvent.click(screen.getByRole('button', { name: /Port to Marketplace/i }));
    await waitFor(() => expect(screen.getByText(/Offline Mode/i)).toBeDefined());
    warn.mockRestore();
  });

  it('omits the marketplace shortcut when no navigate callback is given', async () => {
    const { onPublishToMarketplace } = renderCreator({ onNavigateToMarketplace: undefined });
    addOneSample();
    fireEvent.click(screen.getByRole('button', { name: /Port to Marketplace/i }));
    await waitFor(() => expect(onPublishToMarketplace).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/View in Marketplace/i)).toBeNull();
  });

  it('guards against double-publishing on rapid clicks', async () => {
    const { onPublishToMarketplace } = renderCreator();
    addOneSample();
    const port = screen.getByRole('button', { name: /Port to Marketplace/i });
    fireEvent.click(port);
    fireEvent.click(port);
    await waitFor(() => expect(onPublishToMarketplace).toHaveBeenCalledTimes(1));
  });

  it('publishes kit metadata derived from the form', async () => {
    const { onPublishToMarketplace } = renderCreator();
    fireEvent.change(screen.getByDisplayValue('OBSIDIAN ANALOG DRUMS & 808s'), {
      target: { value: 'MY KIT' },
    });
    addOneSample();
    fireEvent.click(screen.getByRole('button', { name: /Port to Marketplace/i }));
    await waitFor(() => expect(onPublishToMarketplace).toHaveBeenCalledTimes(1));
    const kit = onPublishToMarketplace.mock.calls[0][0];
    expect(kit.title).toBe('MY KIT');
    expect(kit.isPublished).toBe(true);
    expect(kit.samples).toHaveLength(1);
    expect(screen.getByText(/Kit Ported/i)).toBeDefined();
    expect(screen.getByText('Dismiss')).toBeDefined();
  });
});
