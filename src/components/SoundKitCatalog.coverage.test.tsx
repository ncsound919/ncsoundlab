/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `SoundKitCatalog` — search + tag pills + price filters,
 * kit selection, favorites (load / toggle / failure), cloud-kit merge +
 * dedup, sample preview transport (play / stop / switch / ended / suspended
 * / missing context / synth cache), ZIP download in both modes (license
 * files, cover art, deduped filenames), rating vs NEW badges, and the
 * optional Load-Kit callback. `db` + `audioUtils` + `jszip` are stubbed;
 * the global `audioEngine` mock is driven per-test (never re-mocked).
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoundKitCatalog } from './SoundKitCatalog';
import { audioEngine } from '../audio/AudioEngine';
import type { SoundKit, SoundKitSample } from '../types';

const h = vi.hoisted(() => ({
  db: {
    fetchSoundKits: vi.fn(),
    fetchUserFavorites: vi.fn(),
    toggleFavorite: vi.fn(),
    fetchFolderLinks: vi.fn(),
  },
  audio: {
    synthesizeSampleBuffer: vi.fn(),
    audioBufferToWav: vi.fn(),
  },
  zipFiles: [] as string[],
}));

vi.mock('../lib/db', () => h.db);
vi.mock('../lib/audioUtils', async (importOriginal: () => Promise<Record<string, unknown>>) => ({
  ...(await importOriginal()),
  synthesizeSampleBuffer: (...a: unknown[]) => h.audio.synthesizeSampleBuffer(...a),
  audioBufferToWav: (...a: unknown[]) => h.audio.audioBufferToWav(...a),
}));
vi.mock('jszip', () => ({
  default: class {
    file = (name: string) => {
      h.zipFiles.push(name);
      return this;
    };
    folder = (name: string) => ({
      file: (fname: string) => {
        h.zipFiles.push(`${name}/${fname}`);
      },
    });
    generateAsync = async () => new Blob(['zip-bytes']);
  },
}));

const makeSample = (over: Partial<SoundKitSample> = {}): SoundKitSample =>
  ({
    id: 's1',
    name: 'KICK_A',
    fileName: 'KICK_A.wav',
    category: 'Kick',
    tags: ['kick'],
    gain: 0.8,
    pitch: 0,
    ...over,
  }) as SoundKitSample;

const makeKit = (over: Partial<SoundKit> = {}): SoundKit =>
  ({
    id: 'custom-1',
    title: 'CUSTOM KIT',
    producer: 'ME',
    description: 'mine',
    genre: 'House',
    tags: ['house'],
    price: 29.99,
    rating: 4.5,
    isPublished: true,
    samples: [makeSample()],
    createdAt: new Date().toISOString(),
    ...over,
  }) as SoundKit;

const sources: any[] = [];
const makeCtx = (over: Record<string, unknown> = {}) => ({
  state: 'running',
  resume: vi.fn(),
  createBufferSource: vi.fn(() => {
    const s: any = {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    sources.push(s);
    return s;
  }),
  destination: {},
  ...over,
});

const fakeBuffer = (over: Record<string, unknown> = {}) =>
  ({ duration: 1, sampleRate: 44100, numberOfChannels: 2, ...over }) as unknown as AudioBuffer;

const playButtons = () =>
  Array.from(document.querySelectorAll('button')).filter((b) =>
    b.querySelector('svg.lucide-play, svg.lucide-square'),
  );

describe('SoundKitCatalog coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.zipFiles.length = 0;
    sources.length = 0;
    h.db.fetchSoundKits.mockResolvedValue([]);
    h.db.fetchUserFavorites.mockResolvedValue([]);
    h.db.toggleFavorite.mockResolvedValue(undefined);
    h.audio.synthesizeSampleBuffer.mockImplementation(() => fakeBuffer());
    h.audio.audioBufferToWav.mockImplementation(() => new Blob(['wav']));
    (audioEngine.getContext as any).mockReturnValue(makeCtx());
    (URL as any).createObjectURL = vi.fn(() => 'blob:fake');
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the factory kits with the result-count badge', () => {
    render(<SoundKitCatalog customKits={[]} />);
    expect(screen.getByText(/Catalog & Sound Library Search/i)).toBeDefined();
    // Titles repeat across card + inspector, so count the card footers.
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(3);
    const badge = document.querySelector('.hidden.lg\\:flex');
    expect(badge?.textContent).toBe('3 / 3 Kits');
  });

  it('selects a kit card into the inspector', () => {
    render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(screen.getAllByText('VINTAGE LO-FI TAPE VAULT')[0]);
    expect(screen.getByText(/Included Audio Samples \(2\)/)).toBeDefined();
  });

  it('filters by search text and clears it', () => {
    render(<SoundKitCatalog customKits={[]} />);
    const search = screen.getByPlaceholderText('Search kits, producers, tags...');
    fireEvent.change(search, { target: { value: 'lo-fi' } });
    // The inspector keeps showing the selected kit; only the card grid filters.
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(1);
    expect(screen.getAllByText('VINTAGE LO-FI TAPE VAULT').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTitle('Clear Search'));
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(3);
  });

  it('matches search against producer and genre too', () => {
    render(<SoundKitCatalog customKits={[]} />);
    const search = screen.getByPlaceholderText('Search kits, producers, tags...');
    fireEvent.change(search, { target: { value: 'retro magnetics' } });
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(1);
    fireEvent.change(search, { target: { value: 'synthwave' } });
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(1);
    expect(screen.getAllByText('CYBERPUNK NEON VOX & FX').length).toBeGreaterThan(0);
  });

  it('sets the query from tag pills and resets with All Tags', () => {
    render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(screen.getByText('Lo-Fi'));
    expect(
      (screen.getByPlaceholderText('Search kits, producers, tags...') as HTMLInputElement).value,
    ).toBe('Lo-Fi');
    fireEvent.click(screen.getByText('All Tags'));
    expect(
      (screen.getByPlaceholderText('Search kits, producers, tags...') as HTMLInputElement).value,
    ).toBe('');
  });

  it('filters free vs paid kits', () => {
    render(<SoundKitCatalog customKits={[makeKit({ title: 'PAID KIT', price: 29.99 })]} />);
    fireEvent.click(screen.getByText('Paid'));
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(1);
    expect(screen.getAllByText('PAID KIT').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Free'));
    expect(screen.queryByText('PAID KIT')).toBeNull();
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(3);
    fireEvent.click(screen.getByText('All'));
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(4);
  });

  it('merges cloud kits and deduplicates by id (custom > cloud > factory)', async () => {
    const cloud = makeKit({ id: 'cloud-9', title: 'CLOUD KIT' });
    const dupe = makeKit({ id: 'factory-1', title: 'SHOULD NOT APPEAR' });
    const idless = makeKit({ id: '', title: 'NO ID KIT' });
    const customOverride = makeKit({ id: 'factory-2', title: 'CUSTOM WINS' });
    h.db.fetchSoundKits.mockResolvedValue([cloud, dupe, idless]);
    render(<SoundKitCatalog customKits={[customOverride]} />);
    await waitFor(() => expect(screen.getAllByText('CLOUD KIT').length).toBeGreaterThan(0));
    // Cloud beats factory for the same id; custom beats both.
    expect(screen.getAllByText('SHOULD NOT APPEAR').length).toBeGreaterThan(0);
    expect(screen.queryByText('OBSIDIAN 808 & TRAP DRUMS V2')).toBeNull();
    expect(screen.getAllByText('CUSTOM WINS').length).toBeGreaterThan(0);
    expect(screen.queryByText('VINTAGE LO-FI TAPE VAULT')).toBeNull();
    // Id-less kits are skipped: custom(1) + cloud(2) + factory-3(1).
    expect(screen.getAllByText(/Inspect Kit/).length).toBe(4);
    expect(screen.queryByText('NO ID KIT')).toBeNull();
    const badge = document.querySelector('.hidden.lg\\:flex');
    expect(badge?.textContent).toBe('4 / 4 Kits');
  });

  it('warns but still renders when the local sync fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.db.fetchSoundKits.mockRejectedValue(new Error('db down'));
    render(<SoundKitCatalog customKits={[]} />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.getAllByText('OBSIDIAN 808 & TRAP DRUMS V2').length).toBeGreaterThan(0);
  });

  it('marks favorites loaded from storage', async () => {
    h.db.fetchUserFavorites.mockResolvedValue(['factory-1']);
    const { container } = render(<SoundKitCatalog customKits={[]} />);
    await waitFor(() => expect(container.querySelector('.fill-amber-400')).toBeTruthy());
  });

  it('toggles a favorite off and on', async () => {
    render(<SoundKitCatalog customKits={[]} />);
    const star = screen.getAllByTitle('Save to Favorites')[0];
    fireEvent.click(star);
    expect(h.db.toggleFavorite).toHaveBeenCalledWith('factory-1', true);
    fireEvent.click(star);
    expect(h.db.toggleFavorite).toHaveBeenCalledWith('factory-1', false);
  });

  it('keeps the optimistic toggle when persisting fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.db.toggleFavorite.mockRejectedValue(new Error('disk full'));
    const { container } = render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(screen.getAllByTitle('Save to Favorites')[0]);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(container.querySelector('.fill-amber-400')).toBeTruthy();
  });

  it('plays and stops a sample preview', () => {
    render(<SoundKitCatalog customKits={[]} />);
    const [first] = playButtons();
    fireEvent.click(first);
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalled();
    expect(h.audio.synthesizeSampleBuffer).toHaveBeenCalledWith('808');
    // Clicking the same sample stops it.
    fireEvent.click(playButtons()[0]);
    expect(sources[0].stop).toHaveBeenCalled();
  });

  it('switches preview between samples, stopping the previous source', () => {
    render(<SoundKitCatalog customKits={[]} />);
    const buttons = playButtons();
    fireEvent.click(buttons[0]);
    fireEvent.click(playButtons()[1]);
    expect(sources[0].stop).toHaveBeenCalled();
    expect(sources[1].start).toHaveBeenCalled();
  });

  it('clears the playing state when the preview source ends', () => {
    const { container } = render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(playButtons()[0]);
    act(() => {
      sources[0].onended();
    });
    // Back to the Play icon (no Square icons left).
    expect(container.querySelector('svg.lucide-square')).toBeNull();
  });

  it('resumes a suspended context before previewing', () => {
    (audioEngine.getContext as any).mockReturnValue(makeCtx({ state: 'suspended', resume: vi.fn() }));
    render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(playButtons()[0]);
    expect((audioEngine.getContext as any)().resume).toHaveBeenCalled();
  });

  it('does nothing when the audio context is missing', () => {
    (audioEngine.getContext as any).mockReturnValue(null);
    render(<SoundKitCatalog customKits={[]} />);
    expect(() => fireEvent.click(playButtons()[0])).not.toThrow();
    expect(sources).toHaveLength(0);
  });

  it('uses an embedded audioBuffer instead of synthesizing', () => {
    const buf = fakeBuffer();
    render(<SoundKitCatalog customKits={[makeKit({ samples: [makeSample({ audioBuffer: buf })] })]} />);
    fireEvent.click(screen.getAllByText('CUSTOM KIT')[0]);
    fireEvent.click(playButtons()[0]);
    expect(h.audio.synthesizeSampleBuffer).not.toHaveBeenCalled();
    expect(sources[0].buffer).toBe(buf);
  });

  it('reuses the synthesis cache for identical category+id across kits', () => {
    const kitA = makeKit({ id: 'a', title: 'KIT A', samples: [makeSample({ id: 'dup-1', name: 'A1' })] });
    const kitB = makeKit({ id: 'b', title: 'KIT B', samples: [makeSample({ id: 'dup-1', name: 'B1' })] });
    render(<SoundKitCatalog customKits={[kitA, kitB]} />);
    fireEvent.click(screen.getAllByText('KIT A')[0]);
    fireEvent.click(playButtons()[0]);
    fireEvent.click(screen.getAllByText('KIT B')[0]);
    fireEvent.click(playButtons()[0]);
    expect(h.audio.synthesizeSampleBuffer).toHaveBeenCalledTimes(1);
  });

  it('downloads a kit as a plain zip', async () => {
    render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Download Kit \(\.zip\)/ }));
    await waitFor(() => expect((URL as any).createObjectURL).toHaveBeenCalled());
    expect(h.zipFiles).toContain('manifest.json');
    expect(h.zipFiles).toContain('808s/OBSIDIAN_808_C1.wav');
    expect(h.zipFiles).not.toContain('LICENSE.txt');
    expect((URL as any).revokeObjectURL).toHaveBeenCalled();
    const anchor = vi.mocked(HTMLAnchorElement.prototype.click);
    expect(anchor).toHaveBeenCalled();
    expect(h.zipFiles.filter((f) => f.endsWith('.wav'))).toHaveLength(3);
  });

  it('exports the commercial bundle with license files', async () => {
    render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Export for External Sale/i }));
    await waitFor(() => expect((URL as any).createObjectURL).toHaveBeenCalled());
    expect(h.zipFiles).toContain('LICENSE.txt');
    expect(h.zipFiles).toContain('READ_ME.txt');
    expect(h.zipFiles).toContain('Samples/808s/OBSIDIAN_808_C1.wav');
  });

  it('embeds cover art and dedupes colliding sample names', async () => {
    const kit = makeKit({
      title: 'COVER KIT',
      coverArtDataUrl: 'data:image/png;base64,AAAABBBB',
      samples: [
        makeSample({ id: 'd1', name: 'Same Name', category: 'Kick' }),
        makeSample({ id: 'd2', name: 'Same Name', category: 'Kick' }),
        makeSample({ id: 'd3', name: '   ', category: 'Snare' }),
      ],
    });
    render(<SoundKitCatalog customKits={[kit]} />);
    fireEvent.click(screen.getAllByText('COVER KIT')[0]);
    // Card cover + inspector cover share the alt text.
    expect(screen.getAllByAltText('COVER KIT').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /Download Kit \(\.zip\)/ }));
    await waitFor(() => expect((URL as any).createObjectURL).toHaveBeenCalled());
    expect(h.zipFiles).toContain('cover.png');
    expect(h.zipFiles).toContain('Kicks/Same_Name.wav');
    expect(h.zipFiles).toContain('Kicks/Same_Name_2.wav');
    expect(h.zipFiles).toContain('Snares/sample.wav');
  });

  it('alerts and resets when the download fails', async () => {
    h.audio.audioBufferToWav.mockImplementation(() => {
      throw new Error('encode boom');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SoundKitCatalog customKits={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Download Kit \(\.zip\)/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to download sound kit package.'));
    expect((screen.getByRole('button', { name: /Download Kit \(\.zip\)/ }) as HTMLButtonElement).disabled).toBe(false);
    err.mockRestore();
  });

  it('shows rating, NEW and price badges per kit', () => {
    render(
      <SoundKitCatalog
        customKits={[
          makeKit({ id: 'r', title: 'RATED KIT', rating: 4.5 }),
          makeKit({ id: 'n', title: 'UNRATED KIT', rating: undefined }),
        ]}
      />,
    );
    expect(screen.getByText('4.5')).toBeDefined();
    expect(screen.getByText('NEW')).toBeDefined();
    expect(screen.getAllByText('$29.99').length).toBeGreaterThan(0);
  });

  it('loads the selected kit into Sound Lab when the callback exists', () => {
    const onLoad = vi.fn();
    render(<SoundKitCatalog customKits={[]} onLoadKitToSoundLab={onLoad} />);
    fireEvent.click(screen.getByText(/Load Kit into One-Shot Sound Lab/i));
    expect(onLoad).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 's1' })]));
  });

  it('hides the load-kit button when no callback is provided', () => {
    render(<SoundKitCatalog customKits={[]} />);
    expect(screen.queryByText(/Load Kit into One-Shot Sound Lab/i)).toBeNull();
    // The inspector still renders for the default factory kit.
    expect(screen.getByText(/Kit Inspection Vault/i)).toBeDefined();
  });

  it('renders the inspector sample categories and keys', () => {
    render(<SoundKitCatalog customKits={[]} />);
    // Card grid never renders keys/badges, so these are inspector-only.
    expect(screen.getByText('C1')).toBeDefined();
    expect(screen.getAllByText('808').length).toBeGreaterThan(1);
  });
});
