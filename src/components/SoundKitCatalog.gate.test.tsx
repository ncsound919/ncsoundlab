/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { DemoSessionProvider } from '../demo/DemoSessionContext';
import { SoundKitCatalog } from './SoundKitCatalog';
import type { SoundKit } from '../types';

vi.mock('../lib/db', () => ({
  fetchSoundKits: vi.fn(async () => []),
  fetchUserFavorites: vi.fn(async () => []),
  toggleFavorite: vi.fn(async () => undefined),
}));

const factoryKit: SoundKit = {
  id: 'factory-1',
  title: 'TEST FACTORY KIT',
  producer: 'TEST LABS',
  description: 'A bundled demo kit.',
  genre: 'Test',
  tags: ['test'],
  price: 0,
  isPublished: true,
  samples: [],
  createdAt: new Date().toISOString(),
  coverArt: {
    theme: 'cyberpunk',
    title: 'TEST FACTORY KIT',
    subtitle: 'Free Demo',
    producer: 'TEST LABS',
    overlayTexture: 'grid',
    badgeText: 'FREE DEMO',
    accentColor: '#F27D26',
  },
};

const userKit: SoundKit = {
  id: 'user-1',
  title: 'USER BUILT KIT',
  producer: 'A PRODUCER',
  description: 'A kit built by another producer.',
  genre: 'Test',
  tags: ['test'],
  price: 0,
  isPublished: true,
  samples: [],
  createdAt: new Date().toISOString(),
  coverArt: {
    theme: 'gold_analog',
    title: 'USER BUILT KIT',
    subtitle: 'Community',
    producer: 'A PRODUCER',
    overlayTexture: 'vinyl',
    badgeText: 'FREE DOWNLOAD',
    accentColor: '#D97706',
  },
};

function renderCatalog(kits: SoundKit[]) {
  return render(
    <DemoSessionProvider>
      <SoundKitCatalog customKits={kits} />
    </DemoSessionProvider>,
  );
}

async function selectKit(title: string) {
  const heading = screen.getAllByText(title).find((el) => el.tagName === 'H4' || el.tagName === 'H3');
  if (!heading) throw new Error(`kit heading not found: ${title}`);
  fireEvent.click(heading);
  await waitFor(() => {
    expect(screen.getByText(/Included Audio Samples/i)).toBeDefined();
  });
}

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

describe('SoundKitCatalog community model', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now()));
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
  });

  it('all bundled factory kits download freely during an active demo', async () => {
    renderCatalog([factoryKit]);
    await selectKit('TEST FACTORY KIT');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Download Kit \(\.zip\)/ })).toBeDefined()
    );
  });

  it('community-built kits are free to download (kit builder is a free tool)', async () => {
    renderCatalog([userKit]);
    await selectKit('USER BUILT KIT');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Download Kit \(\.zip\)/ })).toBeDefined()
    );
  });

  it('does not show any purchase gate for kits', async () => {
    renderCatalog([factoryKit, userKit]);
    await selectKit('TEST FACTORY KIT');
    fireEvent.click(screen.getByRole('button', { name: /Download Kit/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /is a paid kit/ })).toBeNull();
    });
  });

  it('keeps the Export for External Sale flow so producers sell their own kits', async () => {
    renderCatalog([factoryKit]);
    await selectKit('TEST FACTORY KIT');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Export for External Sale/i })).toBeDefined()
    );
  });
});
