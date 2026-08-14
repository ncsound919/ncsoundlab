/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { DemoSessionProvider } from '../demo/DemoSessionContext';
import { SoundKitCatalog } from './SoundKitCatalog';
import { PURCHASE_URL, DEMO_PRICE_DISPLAY, DEMO_PRODUCT_NAME, KIT_PURCHASE_URLS } from '../lib/demoConfig';
import type { SoundKit } from '../types';

vi.mock('../lib/db', () => ({
  fetchSoundKits: vi.fn(async () => []),
  fetchUserFavorites: vi.fn(async () => []),
  toggleFavorite: vi.fn(async () => undefined),
}));

const paidKit: SoundKit = {
  id: 'test-paid-1',
  title: 'TEST PREMIUM KIT',
  producer: 'TEST LABS',
  description: 'A paid kit for gate testing.',
  genre: 'Test',
  tags: ['test'],
  price: 19.0,
  isPublished: true,
  samples: [],
  createdAt: new Date().toISOString(),
  coverArt: {
    theme: 'cyberpunk',
    title: 'TEST PREMIUM KIT',
    subtitle: 'Paid',
    producer: 'TEST LABS',
    overlayTexture: 'grid',
    badgeText: '$19.00 PREMIUM',
    accentColor: '#F27D26',
  },
};

const freeKit: SoundKit = {
  id: 'test-free-1',
  title: 'TEST FREE KIT',
  producer: 'TEST LABS',
  description: 'A free kit for gate testing.',
  genre: 'Test',
  tags: ['test'],
  price: 0,
  isPublished: true,
  samples: [],
  createdAt: new Date().toISOString(),
  coverArt: {
    theme: 'gold_analog',
    title: 'TEST FREE KIT',
    subtitle: 'Free',
    producer: 'TEST LABS',
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
    expect(screen.getByText(new RegExp(`Included Audio Samples`, 'i'))).toBeDefined();
  });
}

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

describe('SoundKitCatalog purchase gate', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now()));
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
  });

  it('opens the purchase gate for a paid kit during an active demo', async () => {
    renderCatalog([paidKit]);
    await selectKit('TEST PREMIUM KIT');
    await waitFor(() => expect(screen.getByRole('button', { name: /Unlock Kit/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Unlock Kit/i }));
    expect(screen.getByRole('dialog', { name: /is a paid kit/ })).toBeDefined();
    const buy = screen.getByRole('link', { name: new RegExp(`Get ${DEMO_PRODUCT_NAME}`) });
    expect(buy.getAttribute('href')).toBe(PURCHASE_URL);
  });

  it('shows the unlock label instead of download for a locked paid kit', async () => {
    renderCatalog([paidKit]);
    await selectKit('TEST PREMIUM KIT');
    await waitFor(() => expect(screen.getByRole('button', { name: /Unlock Kit — \$19\.00/ })).toBeDefined());
  });

  it('unlocked purchasers can download paid kits directly', async () => {
    localStorage.setItem('ncs_demo_status', 'purchased');
    renderCatalog([paidKit]);
    await selectKit('TEST PREMIUM KIT');
    await waitFor(() => expect(screen.getByRole('button', { name: /Download Kit \(\.zip\)/ })).toBeDefined());
  });

  it('free kits always show a direct download', async () => {
    renderCatalog([freeKit]);
    await selectKit('TEST FREE KIT');
    await waitFor(() => expect(screen.getByRole('button', { name: /Download Free Kit/i })).toBeDefined());
  });

  it('offers a direct per-kit purchase link when configured', async () => {
    renderCatalog([paidKit]);
    await selectKit('TEST PREMIUM KIT');
    await waitFor(() => expect(screen.getByRole('button', { name: /Unlock Kit/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Unlock Kit/i }));
    const kitUrl = KIT_PURCHASE_URLS['factory-1'];
    if (kitUrl) {
      const buyKit = screen.getByRole('link', { name: /Buy this kit/i });
      expect(buyKit.getAttribute('href')).toBe(kitUrl);
    }
    const buyApp = screen.getByRole('link', { name: new RegExp(`Get ${DEMO_PRODUCT_NAME}`) });
    expect(buyApp.getAttribute('href')).toBe(PURCHASE_URL);
  });
});
