/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage-focused tests for `CoverArtGenerator.tsx`. The era-background
 * renderer is mocked (its own suite covers the drawing math); these tests
 * drive every interaction handler + canvas-effect branch in the component.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoverArtGenerator } from './CoverArtGenerator';
import type { CoverArtOptions } from '../types';

vi.mock('./coverArtRenderers', () => ({
  drawEraBackground: vi.fn(),
}));

const OriginalImage = window.Image;

afterEach(() => {
  window.Image = OriginalImage;
});

const base: CoverArtOptions = {
  title: 'CYBER VAULT',
  subtitle: 'SUB',
  producer: 'NC SOUND LAB',
  accentColor: '#f97316',
  theme: 'cyberpunk',
};

const ERA_LABELS: Array<[string, string]> = [
  ['Boom Bap', 'boom_bap'],
  ['Golden Era', 'golden_era'],
  ['Trap', 'trap'],
  ['Drill', 'drill'],
  ['G-Funk', 'g_funk'],
  ['Vinyl Press', 'vinyl_press'],
  ['Conscious Jazz', 'conscious_jazz'],
  ['Crunk', 'crunk'],
  ['Cloud Rap', 'cloud_rap'],
  ['Grime', 'grime'],
  ['Mixtape Era', 'mixtape_era'],
];

const PRESET_LABELS = [
  'Analog Reel Deck',
  'MPC 16-Pad Grid',
  'Cyberpunk Neon Street',
  'Obsidian Liquid Aura',
  'G-Funk West Coast Gold',
];

const clickLabel = (label: string) => {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`No button for label "${label}"`);
  fireEvent.click(button);
  return button;
};

describe('CoverArtGenerator era selection', () => {
  it('reports { era, theme } for every era cartridge', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={base} onChange={onChange} />);

    for (const [label, eraId] of ERA_LABELS) {
      onChange.mockClear();
      clickLabel(label);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ era: eraId, theme: eraId }));
    }
  });

  it('maps legacy themes to eras when options.era is omitted', () => {
    const cases: Array<[string, string]> = [
      ['cyberpunk', 'Trap'],
      ['gold_analog', 'Golden Era'],
      ['acid_retro', 'G-Funk'],
      ['minimal', 'Vinyl Press'],
      ['obsidian', 'Drill'],
      ['totally-unknown', 'Boom Bap'],
    ];

    for (const [theme, activeLabel] of cases) {
      const { unmount } = render(
        <CoverArtGenerator options={{ ...base, era: undefined, theme }} onChange={vi.fn()} />
      );
      const button = screen.getByText(activeLabel).closest('button') as HTMLButtonElement;
      expect(button.className).toContain('bg-orange-500');
      unmount();
    }
  });

  it('honours an explicit options.era without consulting theme', () => {
    render(<CoverArtGenerator options={{ ...base, era: 'drill', theme: 'minimal' }} onChange={vi.fn()} />);
    const button = screen.getByText('Drill').closest('button') as HTMLButtonElement;
    expect(button.className).toContain('bg-orange-500');
  });
});

describe('CoverArtGenerator reroll + picture presets', () => {
  it('reroll emits a numeric seedOverride', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={base} onChange={onChange} />);
    clickLabel('Reroll Seed');
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0] as CoverArtOptions;
    expect(typeof patch.seedOverride).toBe('number');
  });

  it('selects each picture-art preset and clears the custom image', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={{ ...base, customImageUrl: 'data:image/png;base64,AAAA' }} onChange={onChange} />);

    for (const label of PRESET_LABELS) {
      onChange.mockClear();
      clickLabel(label);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ selectedPicturePreset: expect.any(String), customImageUrl: undefined })
      );
    }
  });

  it('the Default button clears preset and image', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={{ ...base, selectedPicturePreset: 'tape_reel' }} onChange={onChange} />);
    clickLabel('Default');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedPicturePreset: undefined, customImageUrl: undefined })
    );
  });

  it('renders each valid preset id and an unknown preset id', () => {
    for (const id of ['tape_reel', 'mpc_drum_pad', 'cyber_neon_city', 'obsidian_fluid', 'g_funk_sunset']) {
      const { unmount } = render(
        <CoverArtGenerator options={{ ...base, selectedPicturePreset: id }} onChange={vi.fn()} />
      );
      unmount();
    }
    render(<CoverArtGenerator options={{ ...base, selectedPicturePreset: 'does-not-exist' }} onChange={vi.fn()} />);
  });

  it('opens the file picker from both upload buttons', () => {
    render(<CoverArtGenerator options={base} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Upload Custom Image'));
    fireEvent.click(screen.getByText('Upload Picture').closest('button') as HTMLButtonElement);
    expect(screen.getByTitle('Upload Custom Image')).toBeDefined();
  });
});

describe('CoverArtGenerator texture + fields', () => {
  it('reports overlayTexture for each texture button', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={base} onChange={onChange} />);
    const textures: Array<[string, string]> = [
      ['Clean', 'none'],
      ['Vinyl Grooves', 'vinyl'],
      ['Cyber Grid', 'grid'],
      ['Foil Glaze', 'foil'],
    ];
    for (const [label, id] of textures) {
      onChange.mockClear();
      clickLabel(label);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ overlayTexture: id }));
    }
  });

  it('renders each texture overlay branch', () => {
    for (const id of ['vinyl', 'grid', 'foil', 'none']) {
      const { unmount } = render(
        <CoverArtGenerator options={{ ...base, overlayTexture: id }} onChange={vi.fn()} />
      );
      unmount();
    }
  });

  it('reports accent colour changes', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={base} onChange={onChange} />);
    const color = document.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(color, { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ accentColor: '#123456' }));
  });

  it('reports changes to each text field', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={base} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. OBSIDIAN 808 VAULT'), { target: { value: 'MY KIT' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ title: 'MY KIT' }));

    fireEvent.change(screen.getByPlaceholderText('e.g. SONIK AUDIO LABS'), { target: { value: 'LAB' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ producer: 'LAB' }));

    fireEvent.change(screen.getByPlaceholderText('e.g. 50+ Analog Kicks & Sub 808s'), { target: { value: 'SPECS' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ subtitle: 'SPECS' }));

    fireEvent.change(screen.getByPlaceholderText('e.g. 100% ROYALTY FREE'), { target: { value: 'LIMITED' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ badgeText: 'LIMITED' }));
  });

  it('shows the remove-custom-photo banner and clears the image', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={{ ...base, customImageUrl: 'data:image/png;base64,AAAA' }} onChange={onChange} />);
    expect(screen.getByText('Active Uploaded Photo Attached')).toBeDefined();
    clickLabel('Remove Custom Photo');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ customImageUrl: undefined }));
  });
});

describe('CoverArtGenerator export + import', () => {
  it('invokes onExportDataUrl during the canvas effect', () => {
    const onExportDataUrl = vi.fn();
    render(<CoverArtGenerator options={base} onChange={vi.fn()} onExportDataUrl={onExportDataUrl} />);
    expect(onExportDataUrl).toHaveBeenCalled();
    expect(typeof onExportDataUrl.mock.calls[0][0]).toBe('string');
  });

  it('reads an uploaded image into customImageUrl', async () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={base} onChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image-bytes'], 'cover.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'custom', customImageUrl: expect.any(String) })
      )
    );
  });

  it('ignores a file change with no selected file', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={base} onChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses fallbacks for empty title, subtitle and accent colour', () => {
    const onExportDataUrl = vi.fn();
    render(
      <CoverArtGenerator
        options={{ ...base, title: '', subtitle: '', accentColor: '', badgeText: '' }}
        onChange={vi.fn()}
        onExportDataUrl={onExportDataUrl}
      />
    );
    expect(onExportDataUrl).toHaveBeenCalled();
  });

  it('imports a URL from Drive when the hook resolves', async () => {
    const onChange = vi.fn();
    const onImportFromDrive = vi.fn(async () => 'https://drive.example/cover.png');
    render(<CoverArtGenerator options={base} onChange={onChange} onImportFromDrive={onImportFromDrive} />);
    fireEvent.click(screen.getByTitle('Import from Drive'));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ customImageUrl: 'https://drive.example/cover.png' })
      )
    );
  });

  it('does not change options when the Drive hook resolves null', async () => {
    const onChange = vi.fn();
    const onImportFromDrive = vi.fn(async () => null);
    render(<CoverArtGenerator options={base} onChange={onChange} onImportFromDrive={onImportFromDrive} />);
    fireEvent.click(screen.getByTitle('Import from Drive'));
    await waitFor(() => expect(onImportFromDrive).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an error when the Drive hook rejects', async () => {
    const onImportFromDrive = vi.fn(async () => {
      throw new Error('network down');
    });
    render(<CoverArtGenerator options={base} onChange={vi.fn()} onImportFromDrive={onImportFromDrive} />);
    fireEvent.click(screen.getByTitle('Import from Drive'));
    await screen.findByText(/Import failed\./);
  });

  it('disables the Drive button with a lock icon when no hook is provided', () => {
    render(<CoverArtGenerator options={base} onChange={vi.fn()} />);
    const button = screen.getByTitle('Drive import not connected') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.querySelector('svg')).not.toBeNull();
  });
});

describe('CoverArtGenerator custom image canvas paths', () => {
  it('draws overlays after the image loads', async () => {
    class LoadImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: ((e?: unknown) => void) | null = null;
      private _src = '';
      set src(value: string) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
    }
    (window as unknown as { Image: unknown }).Image = LoadImage;

    const onExportDataUrl = vi.fn();
    render(
      <CoverArtGenerator
        options={{ ...base, customImageUrl: 'data:image/png;base64,AAAA' }}
        onChange={vi.fn()}
        onExportDataUrl={onExportDataUrl}
      />
    );
    await waitFor(() => expect(onExportDataUrl).toHaveBeenCalled());
  });

  it('falls back to the era background when the image errors', async () => {
    class BrokenImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: ((e?: unknown) => void) | null = null;
      private _src = '';
      set src(value: string) {
        this._src = value;
        queueMicrotask(() => this.onerror?.(new Error('x')));
      }
      get src() {
        return this._src;
      }
    }
    (window as unknown as { Image: unknown }).Image = BrokenImage;

    const onExportDataUrl = vi.fn();
    render(
      <CoverArtGenerator
        options={{ ...base, customImageUrl: 'data:image/png;base64,AAAA' }}
        onChange={vi.fn()}
        onExportDataUrl={onExportDataUrl}
      />
    );
    await waitFor(() => expect(onExportDataUrl).toHaveBeenCalled());
  });
});

describe('CoverArtGenerator layout branches', () => {
  it('exercises title anchors, line breaks and badge positions across eras/seeds', () => {
    const title = 'OBSIDIAN 808 VAULT DELUXE EDITION';
    for (const [, eraId] of ERA_LABELS) {
      for (let seed = 0; seed < 6; seed++) {
        const { unmount } = render(
          <CoverArtGenerator
            options={{
              ...base,
              era: eraId as CoverArtOptions['era'],
              theme: eraId,
              title,
              badgeText: 'LIMITED',
              seedOverride: seed,
              overlayTexture: seed % 2 === 0 ? 'grid' : 'vinyl',
            }}
            onChange={vi.fn()}
          />
        );
        unmount();
      }
    }

    const short = render(
      <CoverArtGenerator options={{ ...base, title: 'KIT', badgeText: 'FREE' }} onChange={vi.fn()} />
    );
    short.unmount();
    render(<CoverArtGenerator options={{ ...base, title: 'TWO WORDS', badgeText: 'FREE' }} onChange={vi.fn()} />);
  });
});
