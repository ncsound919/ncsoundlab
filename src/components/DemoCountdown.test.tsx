/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { DemoSessionProvider } from '../demo/DemoSessionContext';
import { DemoCountdown } from './DemoCountdown';
import { PURCHASE_URL } from '../lib/demoConfig';

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

function renderCountdown() {
  return render(
    <DemoSessionProvider>
      <DemoCountdown />
    </DemoSessionProvider>,
  );
}

describe('DemoCountdown', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
  });

  it('renders nothing before the demo session is started', () => {
    renderCountdown();
    expect(screen.queryByRole('button', { name: /Demo/i })).toBeNull();
  });

  it('renders nothing after purchase', () => {
    localStorage.setItem('ncs_demo_status', 'purchased');
    renderCountdown();
    expect(screen.queryByRole('button', { name: /Demo/i })).toBeNull();
  });

  it('shows the ticking countdown during an active session', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now()));
    renderCountdown();
    const pill = screen.getByRole('button', { name: /Demo/i });
    expect(pill.textContent).toMatch(/\d+:\d{2}/);
  });

  it('opens the upgrade dialog from the countdown pill', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now()));
    renderCountdown();
    fireEvent.click(screen.getByRole('button', { name: /Demo/i }));
    expect(screen.getByRole('dialog', { name: 'Upgrade to the full app' })).toBeDefined();
    const link = screen.getByRole('link', { name: /Get the full app/i });
    expect(link.getAttribute('href')).toBe(PURCHASE_URL);
  });

  it('closes the upgrade dialog via the "Keep demoing" button', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now()));
    renderCountdown();
    fireEvent.click(screen.getByRole('button', { name: /Demo/i }));
    fireEvent.click(screen.getByRole('button', { name: /Keep demoing/i }));
    expect(screen.queryByRole('dialog', { name: 'Upgrade to the full app' })).toBeNull();
  });

  it('closes the upgrade dialog when clicking the backdrop', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now()));
    renderCountdown();
    fireEvent.click(screen.getByRole('button', { name: /Demo/i }));
    const dialog = screen.getByRole('dialog', { name: 'Upgrade to the full app' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Upgrade to the full app' })).toBeNull();
  });

  it('keeps the dialog open when clicking inside it (stopPropagation)', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now()));
    renderCountdown();
    fireEvent.click(screen.getByRole('button', { name: /Demo/i }));
    const dialog = screen.getByRole('dialog', { name: 'Upgrade to the full app' });
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog', { name: 'Upgrade to the full app' })).toBeDefined();
  });
});
