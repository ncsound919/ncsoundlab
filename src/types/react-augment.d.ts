/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * React's DOM typings omit the non-standard directory-picker attributes that
 * Chromium/Firefox honour on `<input type="file">`. Declaring them here lets
 * FolderUploadModal set them directly instead of suppressing a type error.
 */

import 'react';

declare module 'react' {
  interface InputHTMLAttributes<T> {
    /** Chromium/WebKit: treat the picker as a directory chooser. */
    webkitdirectory?: string;
    /** Legacy Firefox spelling of the same attribute. */
    directory?: string;
  }
}
