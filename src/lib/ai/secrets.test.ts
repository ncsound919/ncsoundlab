/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSessionSecrets,
  createKeywireSecretProvider,
  createManualSecretProvider,
  createNoneSecretProvider,
  getSessionSecret,
  hasSessionSecret,
  setSessionSecret,
} from './secrets';
import type { HttpTransport, HttpResponse } from './transport';

const okTransport = (body: string): HttpTransport => ({
  id: 'fake',
  rustBacked: true,
  request: vi.fn(async () => ({ status: 200, ok: true, body }) as HttpResponse),
});

beforeEach(() => {
  clearSessionSecrets();
});

describe('session secret helpers', () => {
  it('set, get, has and clear', () => {
    expect(hasSessionSecret('K')).toBe(false);
    setSessionSecret('K', 'v');
    expect(getSessionSecret('K')).toBe('v');
    expect(hasSessionSecret('K')).toBe(true);
    clearSessionSecrets();
    expect(getSessionSecret('K')).toBeNull();
  });

  it('setting an empty value removes the entry', () => {
    setSessionSecret('K', 'v');
    setSessionSecret('K', '');
    expect(hasSessionSecret('K')).toBe(false);
  });
});

describe('manual secret provider', () => {
  it('is session-only and returns what was set', async () => {
    const p = createManualSecretProvider();
    expect(p.id).toBe('manual');
    expect(p.persistent).toBe(false);
    expect(await p.getSecret('K')).toBeNull();
    setSessionSecret('K', 'sk-manual');
    expect(await p.getSecret('K')).toBe('sk-manual');
  });
});

describe('none secret provider', () => {
  it('never yields a secret', async () => {
    const p = createNoneSecretProvider();
    expect(p.id).toBe('none');
    expect(await p.getSecret('K')).toBeNull();
  });
});

describe('keywire secret provider', () => {
  const config = { baseUrl: 'http://127.0.0.1:3000', projectId: 'soundlab', envSlug: 'dev' };

  it('returns null without a session token (does not call the vault)', async () => {
    const transport = okTransport('[]');
    const p = createKeywireSecretProvider({ transport, config, getToken: () => null, keyName: 'SOUNDLAB_LLM_API_KEY' });
    expect(await p.getSecret('SOUNDLAB_LLM_API_KEY')).toBeNull();
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('reads the named secret when a token is present', async () => {
    const transport = okTransport(JSON.stringify([{ key: 'SOUNDLAB_LLM_API_KEY', value: 'sk-vault' }]));
    const p = createKeywireSecretProvider({
      transport,
      config,
      getToken: () => 'tok',
      keyName: 'SOUNDLAB_LLM_API_KEY',
    });
    expect(p.id).toBe('keywire');
    expect(p.persistent).toBe(false);
    expect(await p.getSecret('SOUNDLAB_LLM_API_KEY')).toBe('sk-vault');
  });

  it('falls back to the configured vault key name when none is passed', async () => {
    const transport = okTransport(JSON.stringify([{ key: 'FALLBACK', value: 'v' }]));
    const p = createKeywireSecretProvider({ transport, config, getToken: () => 'tok', keyName: 'FALLBACK' });
    expect(await p.getSecret('')).toBe('v');
  });
});
