/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI egress transport (Phase 3.1).
 *
 * Every outbound request from the AI layer goes through an `HttpTransport`.
 * On the desktop build the transport is Rust-backed (the `http_request` Tauri
 * command), because:
 *
 *   - the Keywire vault sends no CORS headers, and a request carrying an
 *     `Authorization` header is not a CORS-simple request — the webview fetch
 *     would be blocked at preflight;
 *   - CSP `connect-src` is static, while the LLM base URL is user-configurable,
 *     so arbitrary provider origins cannot be pre-listed.
 *
 * Making the call from Rust removes both problems and keeps provider secrets
 * out of the renderer's network stack. The web build falls back to a plain
 * `fetch` transport, which is subject to normal CORS/CSP rules — callers must
 * degrade honestly rather than assume it works.
 *
 * The transport is injectable so the whole AI layer is unit-testable with no
 * network and no Tauri runtime.
 */

import { invoke } from '@tauri-apps/api/core';

export type HttpMethod = 'GET' | 'POST';

export interface HttpRequestInit {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  /** Abort the request after this many ms. Defaults to 20s. */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

export interface HttpTransport {
  readonly id: string;
  /** True when requests leave through the Rust core (no CORS/CSP limits). */
  readonly rustBacked: boolean;
  request(url: string, init?: HttpRequestInit): Promise<HttpResponse>;
}

export const DEFAULT_TIMEOUT_MS = 20_000;

/** Shape returned by the Rust `http_request` command. */
interface RustHttpResponse {
  status: number;
  body: string;
}

/**
 * Rust-backed transport. Used on the desktop build. The command enforces its
 * own URL policy (https anywhere; http only on loopback).
 */
export function createInvokeTransport(): HttpTransport {
  return {
    id: 'tauri-invoke',
    rustBacked: true,
    async request(url, init = {}) {
      const res = await invoke<RustHttpResponse>('http_request', {
        url,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
        body: init.body ?? null,
      });
      return { status: res.status, ok: res.status >= 200 && res.status < 300, body: res.body };
    },
  };
}

/** Plain fetch transport. Subject to CORS/CSP; used on the web build. */
export function createFetchTransport(fetchImpl: typeof fetch = fetch): HttpTransport {
  return {
    id: 'fetch',
    rustBacked: false,
    async request(url, init = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetchImpl(url, {
          method: init.method ?? 'GET',
          headers: init.headers,
          body: init.body,
          signal: controller.signal,
        });
        return { status: res.status, ok: res.ok, body: await res.text() };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** True when running inside the Tauri desktop shell. */
export const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Pick the transport for the current runtime. */
export function createDefaultTransport(): HttpTransport {
  return isTauriRuntime() ? createInvokeTransport() : createFetchTransport();
}
