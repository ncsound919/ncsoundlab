/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `DemoGateModal` — album links, the optional email
 * capture POST (success + network failure), storage failures, blank-email
 * submits and the post-submit email-field state. `demoConfig` is stubbed so
 * the capture URL + album URLs are set (defaults leave them empty).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { DemoSessionProvider } from '../demo/DemoSessionContext';
import { DemoGateModal } from './DemoGateModal';
import { PURCHASE_URL, EMAIL_CAPTURE_URL, ALBUM_1, ALBUM_2 } from '../lib/demoConfig';

vi.mock('../lib/demoConfig', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    EMAIL_CAPTURE_URL: 'https://example.com/capture',
    ALBUM_1: { title: 'Im Different', url: 'https://example.com/album1' },
    ALBUM_2: { title: 'Free Lunch', url: 'https://example.com/album2' },
  };
});

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

function renderGate() {
  return render(
    <DemoSessionProvider>
      <DemoGateModal />
    </DemoSessionProvider>,
  );
}

describe('DemoGateModal coverage', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }) as unknown as Response),
    );
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exposes the stubbed capture URL and album links', () => {
    expect(EMAIL_CAPTURE_URL).toBe('https://example.com/capture');
    expect(ALBUM_1.url).toContain('album1');
    expect(ALBUM_2.url).toContain('album2');
    expect(PURCHASE_URL).toBeTruthy();
  });

  it('shows the countdown inside the welcome dialog', () => {
    renderGate();
    expect(screen.getByRole('dialog', { name: 'Welcome to NC Sound Lab' })).toBeDefined();
    // formatCountdown renders e.g. "20:00" for a fresh session.
    expect(screen.getByText('20:00')).toBeDefined();
  });

  it('shows founder album links on the locked paywall', () => {
    localStorage.setItem('ncs_demo_status', 'expired');
    renderGate();
    expect(screen.getByText(/Hear the founder's music/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /Im Different/i }).getAttribute('href')).toBe(
      'https://example.com/album1',
    );
    expect(screen.getByRole('link', { name: /Free Lunch/i }).getAttribute('href')).toBe(
      'https://example.com/album2',
    );
  });

  it('POSTs the email to the capture endpoint on submit', async () => {
    renderGate();
    fireEvent.change(screen.getByRole('textbox', { name: /Email address/i }), {
      target: { value: '  producer@example.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start my 20-minute demo/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://example.com/capture');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).mode).toBe('no-cors');
    const body = (init as { body: FormData }).body;
    expect(body.get('email')).toBe('producer@example.com');
    expect(body.get('source')).toBe('nc-soundlab-welcome');
    expect(localStorage.getItem('ncs_email')).toBe('producer@example.com');
  });

  it('hides the email field after a captured submit', () => {
    renderGate();
    fireEvent.change(screen.getByRole('textbox', { name: /Email address/i }), {
      target: { value: 'a@b.co' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start my 20-minute demo/i }));
    expect(screen.queryByRole('textbox', { name: /Email address/i })).toBeNull();
  });

  it('still starts the demo when the capture POST rejects', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    renderGate();
    fireEvent.change(screen.getByRole('textbox', { name: /Email address/i }), {
      target: { value: 'a@b.co' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start my 20-minute demo/i }));
    await waitFor(() => expect(localStorage.getItem('ncs_demo_status')).toBe('active'));
  });

  it('treats a whitespace-only email as no email', () => {
    renderGate();
    fireEvent.change(screen.getByRole('textbox', { name: /Email address/i }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start my 20-minute demo/i }));
    expect(localStorage.getItem('ncs_demo_status')).toBe('active');
    expect(localStorage.getItem('ncs_email')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts the demo when persisting the email throws', () => {
    const realSet = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === 'ncs_email') throw new Error('denied');
      realSet(k, v);
    });
    renderGate();
    fireEvent.change(screen.getByRole('textbox', { name: /Email address/i }), {
      target: { value: 'a@b.co' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start my 20-minute demo/i }));
    expect(localStorage.getItem('ncs_demo_status')).toBe('active');
  });

  it('renders with an empty email when reading stored email throws', () => {
    const realGet = window.localStorage.getItem.bind(window.localStorage);
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation((k: string) => {
      if (k === 'ncs_email') throw new Error('denied');
      return realGet(k);
    });
    renderGate();
    expect(
      (screen.getByRole('textbox', { name: /Email address/i }) as HTMLInputElement).value,
    ).toBe('');
    spy.mockRestore();
  });
});
