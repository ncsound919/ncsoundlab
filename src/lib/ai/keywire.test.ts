/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { KeywireError, fetchKeywireSecret, keywireSecretsUrl, pickSecret } from './keywire';
import type { HttpTransport, HttpResponse } from './transport';

const transportReturning = (res: Partial<HttpResponse>): HttpTransport => ({
  id: 'fake',
  rustBacked: true,
  request: vi.fn(async () => ({ status: 200, ok: true, body: '[]', ...res }) as HttpResponse),
});

const config = { baseUrl: 'http://127.0.0.1:3000', projectId: 'soundlab', envSlug: 'dev' };

describe('keywireSecretsUrl', () => {
  it('builds the unmasked secrets URL and tolerates a trailing slash', () => {
    expect(keywireSecretsUrl(config)).toBe(
      'http://127.0.0.1:3000/api/v1/projects/soundlab/envs/dev/secrets?unmask=true'
    );
    expect(keywireSecretsUrl({ ...config, baseUrl: 'http://127.0.0.1:3000/' })).toContain('/secrets?unmask=true');
  });

  it('omits the unmask flag when masked', () => {
    expect(keywireSecretsUrl(config, false)).toMatch(/\/secrets$/);
  });

  it('encodes project and env segments', () => {
    const url = keywireSecretsUrl({ ...config, projectId: 'a/b', envSlug: 'e nv' });
    expect(url).toContain('/projects/a%2Fb/envs/e%20nv/secrets');
  });
});

describe('pickSecret', () => {
  it('returns the matching value', () => {
    expect(pickSecret([{ key: 'X', value: 'v1' }, { key: 'Y', value: 'v2' }], 'Y')).toBe('v2');
  });

  it('returns null for non-arrays, absent keys, and non-string values', () => {
    expect(pickSecret(null, 'X')).toBeNull();
    expect(pickSecret({}, 'X')).toBeNull();
    expect(pickSecret([{ key: 'X' }], 'X')).toBeNull();
    expect(pickSecret([{ key: 'X', value: 42 }], 'X')).toBeNull();
    expect(pickSecret([null], 'X')).toBeNull();
  });
});

describe('fetchKeywireSecret', () => {
  it('returns the plaintext for a matching secret', async () => {
    const t = transportReturning({ body: JSON.stringify([{ key: 'K', value: 'sk-test' }]) });
    await expect(fetchKeywireSecret(t, config, 'tok', 'K')).resolves.toBe('sk-test');
  });

  it('sends a bearer token and hits the documented endpoint', async () => {
    const t = transportReturning({ body: JSON.stringify([{ key: 'K', value: 'v' }]) });
    await fetchKeywireSecret(t, config, 'tok', 'K');
    expect(t.request).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/v1/projects/soundlab/envs/dev/secrets?unmask=true',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      })
    );
  });

  it('rejects an unusable configuration', async () => {
    await expect(fetchKeywireSecret(transportReturning({}), { ...config, baseUrl: '' }, 'tok', 'K')).rejects.toThrow(
      /base URL is not configured/
    );
    await expect(fetchKeywireSecret(transportReturning({}), config, '', 'K')).rejects.toThrow(
      /service token is not set/
    );
  });

  it('maps auth and missing-resource statuses to typed errors', async () => {
    await expect(
      fetchKeywireSecret(transportReturning({ status: 401, ok: false }), config, 'tok', 'K')
    ).rejects.toBeInstanceOf(KeywireError);
    await expect(
      fetchKeywireSecret(transportReturning({ status: 403, ok: false }), config, 'tok', 'K')
    ).rejects.toThrow(/rejected the service token/);
    await expect(
      fetchKeywireSecret(transportReturning({ status: 404, ok: false }), config, 'tok', 'K')
    ).rejects.toThrow(/not found/);
    await expect(
      fetchKeywireSecret(transportReturning({ status: 500, ok: false }), config, 'tok', 'K')
    ).rejects.toThrow(/HTTP 500/);
  });

  it('rejects a non-JSON body', async () => {
    await expect(fetchKeywireSecret(transportReturning({ body: '<html>' }), config, 'tok', 'K')).rejects.toThrow(
      /non-JSON/
    );
  });

  it('reports a missing secret without leaking the token', async () => {
    const t = transportReturning({ body: JSON.stringify([{ key: 'OTHER', value: 'x' }]) });
    await expect(fetchKeywireSecret(t, config, 'super-secret-token', 'K')).rejects.toThrow(
      /no readable secret named "K"/
    );
    await expect(
      fetchKeywireSecret(t, config, 'super-secret-token', 'K').catch((e: Error) => e.message)
    ).resolves.not.toContain('super-secret-token');
  });

  it('wraps transport failures', async () => {
    const failing: HttpTransport = {
      id: 'x',
      rustBacked: true,
      request: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    await expect(fetchKeywireSecret(failing, config, 'tok', 'K')).rejects.toThrow(
      /Could not reach Keywire: network down/
    );
  });
});
