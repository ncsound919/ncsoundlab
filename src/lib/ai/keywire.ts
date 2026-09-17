/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Keywire vault client (Phase 3.1).
 *
 * Keywire (`C:\Users\User\Downloads\Uplift\Keywire`) is the secrets authority:
 * envelope-encrypted, RBAC-scoped, and it audit-logs every unmasked read
 * (`secret.read`). SoundLab never stores a provider key itself — it fetches one
 * at runtime and holds it in memory.
 *
 * Endpoint used:
 *   GET {baseUrl}/api/v1/projects/{projectId}/envs/{envSlug}/secrets?unmask=true
 *   Authorization: Bearer <service token>
 * Returns an array of secrets; the matching entry's `value` is the plaintext.
 *
 * Security notes:
 *   - Never log, throw, or return the secret value inside an error message.
 *   - Callers must not persist the value (no Dexie, no localStorage, no .nsl).
 */

import type { HttpTransport } from './transport';
import { DEFAULT_TIMEOUT_MS } from './transport';

export interface KeywireConfig {
  /** e.g. http://127.0.0.1:3000 */
  baseUrl: string;
  projectId: string;
  envSlug: string;
}

export interface KeywireSecretRow {
  id?: string;
  key: string;
  value?: string;
}

export class KeywireError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'KeywireError';
    this.status = status;
  }
}

/** Build the vault URL. Exported for testing. */
export function keywireSecretsUrl(config: KeywireConfig, unmask = true): string {
  const root = (config.baseUrl || '').replace(/\/+$/, '');
  const project = encodeURIComponent(config.projectId);
  const env = encodeURIComponent(config.envSlug);
  return `${root}/api/v1/projects/${project}/envs/${env}/secrets${unmask ? '?unmask=true' : ''}`;
}

/** Find a secret by key in a Keywire list response. Exported for testing. */
export function pickSecret(rows: unknown, keyName: string): string | null {
  if (!Array.isArray(rows)) return null;
  for (const row of rows as KeywireSecretRow[]) {
    if (row && row.key === keyName && typeof row.value === 'string') return row.value;
  }
  return null;
}

/**
 * Fetch one secret's plaintext from Keywire.
 *
 * Throws `KeywireError` with a message that never contains the secret value or
 * the service token.
 */
export async function fetchKeywireSecret(
  transport: HttpTransport,
  config: KeywireConfig,
  token: string,
  keyName: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string | null> {
  if (!config.baseUrl) throw new KeywireError('Keywire base URL is not configured');
  if (!token) throw new KeywireError('Keywire service token is not set for this session');

  let res;
  try {
    res = await transport.request(keywireSecretsUrl(config), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeoutMs,
    });
  } catch (err) {
    throw new KeywireError(`Could not reach Keywire: ${(err as Error)?.message ?? 'request failed'}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new KeywireError('Keywire rejected the service token (401/403)', res.status);
  }
  if (res.status === 404) {
    throw new KeywireError('Keywire project or environment not found (404)', res.status);
  }
  if (!res.ok) {
    throw new KeywireError(`Keywire request failed with HTTP ${res.status}`, res.status);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new KeywireError('Keywire returned a non-JSON response');
  }

  const value = pickSecret(parsed, keyName);
  if (value === null) {
    throw new KeywireError(`Keywire has no readable secret named "${keyName}" in this environment`);
  }
  return value;
}
