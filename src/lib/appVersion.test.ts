/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './appVersion';

describe('APP_VERSION', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version: string };

    expect(APP_VERSION).toBe(pkg.version);
  });
});
