/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { DemoSessionProvider } from '../demo/DemoSessionContext';
import { DemoGateModal } from './DemoGateModal';
import { PURCHASE_URL, DOWNLOAD_URL } from '../lib/demoConfig';

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

function renderGate() {
  return render(
    <DemoSessionProvider>
      <DemoGateModal />
    </DemoSessionProvider>,
  );
}

describe('DemoGateModal', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
  });

  it('shows the welcome dialog to a fresh visitor with the buy link', () => {
    renderGate();
    expect(screen.getByRole('dialog', { name: 'Welcome to NC Sound Lab' })).toBeDefined();
    const buy = screen.getByRole('link', { name: /Get the full app/i });
    expect(buy.getAttribute('href')).toBe(PURCHASE_URL);
  });

  it('starts the timed session from the welcome dialog', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /Start my 20-minute demo/i }));
    expect(localStorage.getItem('ncs_demo_status')).toBe('active');
    expect(screen.queryByRole('dialog', { name: 'Welcome to NC Sound Lab' })).toBeNull();
  });

  it('shows the paywall once the session has expired', () => {
    localStorage.setItem('ncs_demo_status', 'expired');
    renderGate();
    expect(screen.getByRole('dialog', { name: 'Free demo session ended' })).toBeDefined();
    const buy = screen.getByRole('link', { name: /Get NC Sound Lab Desktop/i });
    expect(buy.getAttribute('href')).toBe(PURCHASE_URL);
    const installer = screen.getByRole('link', { name: /Download Windows installer/i });
    expect(installer.getAttribute('href')).toBe(DOWNLOAD_URL);
  });

  it('unlocks permanently from the paywall', () => {
    localStorage.setItem('ncs_demo_status', 'expired');
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /Already purchased/i }));
    expect(localStorage.getItem('ncs_demo_status')).toBe('purchased');
    expect(screen.queryByRole('dialog', { name: 'Free demo session ended' })).toBeNull();
  });

  it('renders nothing after purchase', () => {
    localStorage.setItem('ncs_demo_status', 'purchased');
    renderGate();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
