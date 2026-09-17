/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI provider configuration store (Phase 3.1).
 *
 * Persisted, versioned, and **non-secret**. The only things written to disk are
 * the enable flag, which secret source to use, the Keywire coordinates, and the
 * LLM base URL + model. The Keywire service token and the provider API key are
 * never persisted — they live in session memory (see `lib/ai/secrets.ts`).
 */

import { create } from 'zustand';
import { OLLAMA_BASE_URL } from '../lib/ai/openaiCompatible';
import type { KeywireConfig } from '../lib/ai/keywire';
import type { SecretProviderId } from '../lib/ai/secrets';

export const AI_STORAGE_KEY = 'ncs-ai-provider-v1';
export const AI_CONFIG_VERSION = 1;

export type SecretSource = SecretProviderId;

export interface AiLlmConfig {
  baseUrl: string;
  model: string;
}

export interface AiProviderConfig {
  version: number;
  /** Off by default — the app is fully usable with no AI configured. */
  enabled: boolean;
  secretSource: SecretSource;
  keywire: KeywireConfig & { keyName: string };
  llm: AiLlmConfig;
}

export const DEFAULT_AI_CONFIG: AiProviderConfig = {
  version: AI_CONFIG_VERSION,
  enabled: false,
  secretSource: 'manual',
  keywire: {
    baseUrl: 'http://127.0.0.1:3000',
    projectId: 'soundlab',
    envSlug: 'dev',
    keyName: 'SOUNDLAB_LLM_API_KEY',
  },
  llm: {
    baseUrl: OLLAMA_BASE_URL,
    model: '',
  },
};

/** Coerce unknown persisted data into a valid config. Never throws. */
export function sanitizeAiConfig(raw: unknown): AiProviderConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_CONFIG };
  const r = raw as Partial<AiProviderConfig>;
  if (r.version !== AI_CONFIG_VERSION) return { ...DEFAULT_AI_CONFIG };

  const secretSource: SecretSource =
    r.secretSource === 'keywire' || r.secretSource === 'manual' || r.secretSource === 'none'
      ? r.secretSource
      : DEFAULT_AI_CONFIG.secretSource;

  const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

  return {
    version: AI_CONFIG_VERSION,
    enabled: r.enabled === true,
    secretSource,
    keywire: {
      baseUrl: str(r.keywire?.baseUrl, DEFAULT_AI_CONFIG.keywire.baseUrl),
      projectId: str(r.keywire?.projectId, DEFAULT_AI_CONFIG.keywire.projectId),
      envSlug: str(r.keywire?.envSlug, DEFAULT_AI_CONFIG.keywire.envSlug),
      keyName: str(r.keywire?.keyName, DEFAULT_AI_CONFIG.keywire.keyName),
    },
    llm: {
      baseUrl: str(r.llm?.baseUrl, DEFAULT_AI_CONFIG.llm.baseUrl),
      model: str(r.llm?.model, DEFAULT_AI_CONFIG.llm.model),
    },
  };
}

/** Read persisted config. Safe in any environment. */
export function loadPersistedAiConfig(): AiProviderConfig {
  try {
    const raw = globalThis.localStorage?.getItem(AI_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_CONFIG };
    return sanitizeAiConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

/** Write config to disk. Never throws (private browsing / quota). */
export function persistAiConfig(config: AiProviderConfig): void {
  try {
    globalThis.localStorage?.setItem(AI_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* non-fatal */
  }
}

interface AiProviderStore extends AiProviderConfig {
  setEnabled: (enabled: boolean) => void;
  setSecretSource: (source: SecretSource) => void;
  setKeywire: (patch: Partial<AiProviderConfig['keywire']>) => void;
  setLlm: (patch: Partial<AiLlmConfig>) => void;
  reset: () => void;
}

const initial = loadPersistedAiConfig();

export const useAiProviderStore = create<AiProviderStore>((set, get) => {
  const commit = (patch: Partial<AiProviderConfig>) => {
    set(patch as never);
    persistAiConfig({
      version: get().version,
      enabled: get().enabled,
      secretSource: get().secretSource,
      keywire: get().keywire,
      llm: get().llm,
    });
  };

  return {
    ...initial,
    setEnabled: (enabled) => commit({ enabled }),
    setSecretSource: (secretSource) => commit({ secretSource }),
    setKeywire: (patch) => commit({ keywire: { ...get().keywire, ...patch } }),
    setLlm: (patch) => commit({ llm: { ...get().llm, ...patch } }),
    reset: () => {
      set({ ...DEFAULT_AI_CONFIG } as never);
      persistAiConfig({ ...DEFAULT_AI_CONFIG });
    },
  };
});
