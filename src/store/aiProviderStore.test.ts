/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_CONFIG_VERSION,
  AI_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  loadPersistedAiConfig,
  persistAiConfig,
  sanitizeAiConfig,
  useAiProviderStore,
} from './aiProviderStore';

beforeEach(() => {
  localStorage.clear();
  useAiProviderStore.getState().reset();
});

describe('defaults', () => {
  it('AI is off by default and never requires a service', () => {
    expect(DEFAULT_AI_CONFIG.enabled).toBe(false);
    expect(DEFAULT_AI_CONFIG.secretSource).toBe('manual');
    expect(DEFAULT_AI_CONFIG.keywire.baseUrl).toBe('http://127.0.0.1:3000');
  });
});

describe('sanitizeAiConfig', () => {
  it('returns defaults for junk or a mismatched version', () => {
    expect(sanitizeAiConfig(null)).toEqual(DEFAULT_AI_CONFIG);
    expect(sanitizeAiConfig('nope')).toEqual(DEFAULT_AI_CONFIG);
    expect(sanitizeAiConfig({ version: 99 })).toEqual(DEFAULT_AI_CONFIG);
  });

  it('keeps a valid config and coerces field types', () => {
    const out = sanitizeAiConfig({
      version: AI_CONFIG_VERSION,
      enabled: true,
      secretSource: 'keywire',
      keywire: { baseUrl: 'http://x', projectId: 'p', envSlug: 'e', keyName: 'K' },
      llm: { baseUrl: 'https://y/v1', model: 'm' },
    });
    expect(out.enabled).toBe(true);
    expect(out.secretSource).toBe('keywire');
    expect(out.llm).toEqual({ baseUrl: 'https://y/v1', model: 'm' });
  });

  it('falls back field-by-field for malformed input', () => {
    const out = sanitizeAiConfig({ version: AI_CONFIG_VERSION, enabled: 'yes', secretSource: 'bogus' });
    expect(out.enabled).toBe(false);
    expect(out.secretSource).toBe(DEFAULT_AI_CONFIG.secretSource);
    expect(out.keywire).toEqual(DEFAULT_AI_CONFIG.keywire);
    expect(out.llm).toEqual(DEFAULT_AI_CONFIG.llm);
  });
});

describe('persistence', () => {
  it('round-trips through localStorage', () => {
    persistAiConfig({ ...DEFAULT_AI_CONFIG, enabled: true, llm: { baseUrl: 'https://a/v1', model: 'm' } });
    const loaded = loadPersistedAiConfig();
    expect(loaded.enabled).toBe(true);
    expect(loaded.llm.model).toBe('m');
  });

  it('returns defaults when nothing is stored or the payload is corrupt', () => {
    expect(loadPersistedAiConfig()).toEqual(DEFAULT_AI_CONFIG);
    localStorage.setItem(AI_STORAGE_KEY, '{not json');
    expect(loadPersistedAiConfig()).toEqual(DEFAULT_AI_CONFIG);
  });

  it('persists only non-secret coordinates — never a token or key value', () => {
    persistAiConfig({ ...DEFAULT_AI_CONFIG, enabled: true });
    const raw = localStorage.getItem(AI_STORAGE_KEY) as string;
    const parsed = JSON.parse(raw);

    // Exactly the non-secret config shape, nothing more.
    expect(Object.keys(parsed).sort()).toEqual(['enabled', 'keywire', 'llm', 'secretSource', 'version']);
    expect(Object.keys(parsed.keywire).sort()).toEqual(['baseUrl', 'envSlug', 'keyName', 'projectId']);
    // No credential material of any kind.
    expect(raw).not.toMatch(/bearer|sk-|x-api-secret|Authorization/i);
  });
});

describe('store actions', () => {
  it('updates and persists each config branch', () => {
    const s = useAiProviderStore.getState();
    s.setEnabled(true);
    s.setSecretSource('keywire');
    s.setKeywire({ projectId: 'soundlab', keyName: 'MY_KEY' });
    s.setLlm({ model: 'qwen', baseUrl: 'http://localhost:11434/v1' });

    const stored = JSON.parse(localStorage.getItem(AI_STORAGE_KEY) as string);
    expect(stored.enabled).toBe(true);
    expect(stored.secretSource).toBe('keywire');
    expect(stored.keywire.keyName).toBe('MY_KEY');
    expect(stored.llm.model).toBe('qwen');

    const live = useAiProviderStore.getState();
    expect(live.enabled).toBe(true);
    expect(live.keywire.keyName).toBe('MY_KEY');
  });

  it('merges partial keywire/llm patches', () => {
    const s = useAiProviderStore.getState();
    s.setKeywire({ envSlug: 'prod' });
    expect(useAiProviderStore.getState().keywire.envSlug).toBe('prod');
    expect(useAiProviderStore.getState().keywire.baseUrl).toBe(DEFAULT_AI_CONFIG.keywire.baseUrl);
  });

  it('reset restores defaults on disk and in memory', () => {
    const s = useAiProviderStore.getState();
    s.setEnabled(true);
    s.reset();
    expect(useAiProviderStore.getState().enabled).toBe(false);
    expect(JSON.parse(localStorage.getItem(AI_STORAGE_KEY) as string).enabled).toBe(false);
  });
});
