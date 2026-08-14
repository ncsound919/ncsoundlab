/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { DemoSessionProvider, useDemoSession } from './DemoSessionContext';
import { DEMO_SESSION_MS } from '../lib/demoConfig';

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

function Probe() {
  const s = useDemoSession();
  return (
    <div>
      <span data-testid="status">{s.status}</span>
      <span data-testid="remaining">{s.remaining}</span>
      <span data-testid="countdown">{s.countdown}</span>
      <span data-testid="locked">{String(s.locked)}</span>
      <span data-testid="welcome">{String(s.showWelcome)}</span>
      <button onClick={s.start}>start</button>
      <button onClick={s.unlock}>unlock</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <DemoSessionProvider>
      <Probe />
    </DemoSessionProvider>,
  );
}

describe('DemoSessionContext', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
    vi.useRealTimers();
  });

  it('starts a fresh visitor with the full session and a visible welcome', () => {
    renderProvider();
    expect(screen.getByTestId('status').textContent).toBe('fresh');
    expect(screen.getByTestId('remaining').textContent).toBe(String(DEMO_SESSION_MS));
    expect(screen.getByTestId('countdown').textContent).toBe('20:00');
    expect(screen.getByTestId('welcome').textContent).toBe('true');
    expect(screen.getByTestId('locked').textContent).toBe('false');
  });

  it('starts the session from the welcome state', () => {
    renderProvider();
    act(() => screen.getByText('start').click());
    expect(screen.getByTestId('status').textContent).toBe('active');
    expect(screen.getByTestId('remaining').textContent).toBe(String(DEMO_SESSION_MS));
    expect(screen.getByTestId('welcome').textContent).toBe('false');
  });

  it('ticks the remaining time down while active', () => {
    vi.useFakeTimers();
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now() - 5000));
    renderProvider();
    const before = Number(screen.getByTestId('remaining').textContent);
    act(() => vi.advanceTimersByTime(2000));
    const after = Number(screen.getByTestId('remaining').textContent);
    expect(after).toBe(before - 2000);
  });

  it('locks immediately when a stored session has already elapsed', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now() - DEMO_SESSION_MS - 1000));
    renderProvider();
    expect(screen.getByTestId('status').textContent).toBe('expired');
    expect(screen.getByTestId('locked').textContent).toBe('true');
    expect(screen.getByTestId('remaining').textContent).toBe('0');
    expect(localStorage.getItem('ncs_demo_status')).toBe('expired');
  });

  it('expires immediately when an active session has no stored start', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    renderProvider();
    expect(screen.getByTestId('status').textContent).toBe('expired');
    expect(screen.getByTestId('locked').textContent).toBe('true');
    expect(localStorage.getItem('ncs_demo_status')).toBe('expired');
  });

  it('unlocks a purchaser and hides the gate', () => {
    localStorage.setItem('ncs_demo_status', 'expired');
    renderProvider();
    act(() => screen.getByText('unlock').click());
    expect(screen.getByTestId('status').textContent).toBe('purchased');
    expect(screen.getByTestId('locked').textContent).toBe('false');
    expect(screen.getByTestId('welcome').textContent).toBe('false');
  });
});

describe('useDemoSession', () => {
  it('throws when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useDemoSession must be used within a DemoSessionProvider');
  });
});
