/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Secret providers (Phase 3.1).
 *
 * A `SecretProvider` is how the AI layer obtains a provider API key. Two
 * implementations exist and the choice is explicit:
 *
 *   - `keywire`  — desktop only. Reads the key from the local Keywire vault at
 *                  runtime; SoundLab stores nothing. Requires a service token
 *                  held in session memory.
 *   - `manual`   — every platform. The user pastes the key; it is held in module
 *                  memory for the session only and never written to disk.
 *
 * `persistent` is `false` for both: no provider key is ever persisted by
 * SoundLab. Nothing here writes to Dexie, `localStorage`, or a project file.
 */

import { fetchKeywireSecret, type KeywireConfig } from './keywire';
import type { HttpTransport } from './transport';

export type SecretProviderId = 'keywire' | 'manual' | 'none';

export interface SecretProvider {
  readonly id: SecretProviderId;
  /** True only if the secret survives a reload. Always false for SoundLab. */
  readonly persistent: boolean;
  /** Human-facing description for the settings UI. */
  readonly description: string;
  getSecret(name: string): Promise<string | null>;
}

/** Session-only secret store. Module memory; cleared on reload. */
const sessionSecrets = new Map<string, string>();

/** Set a session secret (manual entry). */
export const setSessionSecret = (name: string, value: string): void => {
  if (value) sessionSecrets.set(name, value);
  else sessionSecrets.delete(name);
};

/** Read a session secret. */
export const getSessionSecret = (name: string): string | null => sessionSecrets.get(name) ?? null;

/** Drop every session secret. */
export const clearSessionSecrets = (): void => {
  sessionSecrets.clear();
};

/** True when a session secret is present (drives UI state, never the value). */
export const hasSessionSecret = (name: string): boolean => sessionSecrets.has(name);

/** A provider that holds keys in memory for this session only. */
export function createManualSecretProvider(): SecretProvider {
  return {
    id: 'manual',
    persistent: false,
    description: 'Paste a key for this session; it is never saved to disk.',
    async getSecret(name) {
      return getSessionSecret(name);
    },
  };
}

/** A provider that never yields a secret — used when AI is disabled. */
export function createNoneSecretProvider(): SecretProvider {
  return {
    id: 'none',
    persistent: false,
    description: 'No secret source configured.',
    async getSecret() {
      return null;
    },
  };
}

export interface KeywireSecretProviderOptions {
  transport: HttpTransport;
  config: KeywireConfig;
  /** Service token getter — read from session memory at call time. */
  getToken: () => string | null;
  /** Vault key name to read, e.g. "SOUNDLAB_LLM_API_KEY". */
  keyName: string;
}

/** A provider backed by the local Keywire vault (desktop). */
export function createKeywireSecretProvider(opts: KeywireSecretProviderOptions): SecretProvider {
  return {
    id: 'keywire',
    persistent: false,
    description: 'Reads the key from your local Keywire vault at runtime.',
    async getSecret(name) {
      const token = opts.getToken();
      if (!token) return null;
      const vaultKey = name || opts.keyName;
      return fetchKeywireSecret(opts.transport, opts.config, token, vaultKey);
    },
  };
}
