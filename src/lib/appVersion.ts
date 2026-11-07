/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single source for the version written into exported and autosaved session
 * metadata. Keep it in step with package.json; appVersion.test.ts fails if the
 * two drift apart.
 */
export const APP_VERSION = '1.1.1';
