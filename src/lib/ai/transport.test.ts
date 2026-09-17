/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import {
  DEFAULT_TIMEOUT_MS,
  createDefaultTransport,
  createFetchTransport,
  createInvokeTransport,
  isTauriRuntime,
} from './transport';

afterEach(() => {
  invokeMock.mockReset();
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('isTauriRuntime', () => {
  it('detects the Tauri shell via __TAURI_INTERNALS__', () => {
    expect(isTauriRuntime()).toBe(false);
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    expect(isTauriRuntime()).toBe(true);
  });
});

describe('createDefaultTransport', () => {
  it('picks the Rust-backed transport on desktop and fetch elsewhere', () => {
    const onWeb = createDefaultTransport();
    expect(onWeb.id).toBe('fetch');
    expect(onWeb.rustBacked).toBe(false);

    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const onDesktop = createDefaultTransport();
    expect(onDesktop.id).toBe('tauri-invoke');
    expect(onDesktop.rustBacked).toBe(true);
  });
});

describe('createFetchTransport', () => {
  const okFetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'body' })) as unknown as typeof fetch;

  it('returns status, ok and the body text', async () => {
    const t = createFetchTransport(okFetch);
    await expect(t.request('https://x/y')).resolves.toEqual({ status: 200, ok: true, body: 'body' });
  });

  it('surfaces a non-2xx response without throwing', async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' })) as unknown as typeof fetch;
    await expect(createFetchTransport(failing).request('https://x')).resolves.toEqual({
      status: 503,
      ok: false,
      body: 'down',
    });
  });

  it('forwards method, headers and body', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })) as unknown as typeof fetch;
    await createFetchTransport(spy).request('https://x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
    expect(spy).toHaveBeenCalledWith(
      'https://x',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"a":1}',
      })
    );
  });

  it('aborts after the timeout', async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    await expect(createFetchTransport(hang).request('https://slow', { timeoutMs: 10 })).rejects.toThrow(/aborted/);
  });

  it('defaults the timeout to the documented value', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(20_000);
  });
});

describe('createInvokeTransport', () => {
  it('calls the Rust http_request command and normalises the response', async () => {
    invokeMock.mockResolvedValue({ status: 200, body: '[]' });
    const t = createInvokeTransport();
    await expect(t.request('http://127.0.0.1:3000/api/v1/x')).resolves.toEqual({
      status: 200,
      ok: true,
      body: '[]',
    });
    expect(invokeMock).toHaveBeenCalledWith('http_request', {
      url: 'http://127.0.0.1:3000/api/v1/x',
      method: 'GET',
      headers: {},
      body: null,
    });
  });

  it('passes method, headers and body through, and marks non-2xx as not ok', async () => {
    invokeMock.mockResolvedValue({ status: 401, body: '{"error":"unauthorized"}' });
    const t = createInvokeTransport();
    const res = await t.request('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
      body: '{}',
    });
    expect(res).toEqual({ status: 401, ok: false, body: '{"error":"unauthorized"}' });
    expect(invokeMock).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer x' }, body: '{}' })
    );
  });
});
