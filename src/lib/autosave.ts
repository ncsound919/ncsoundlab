/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Autosave + crash recovery (Phase 0.4).
 *
 * Persists the current session as a versioned `ProjectDocument` to IndexedDB
 * with a debounce + `visibilitychange`/`beforeunload` flush. Crash recovery
 * reads the latest snapshot on app start and offers to restore it.
 *
 * Sample audio is embedded as base64 WAV (via the projectFormat serializer)
 * so the recovered session is audibly complete — unlike the legacy
 * `sonik_auto_save_backup` localStorage blob which stripped audioBuffers.
 */

import { saveProjectDocument, fetchProjectDocument, deleteProjectDocument } from './db';
import { serializeProject, type ProjectDocument, type SerializeProjectInput } from './projectFormat';

const AUTOSAVE_DOC_ID = '__autosave__';
const AUTOSAVE_TITLE = 'Autosave Recovery';
const AUTOSAVE_DEBOUNCE_MS = 2000;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let beforeUnloadHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let latestPayload: SerializeProjectInput | null = null;
let latestAppVersion = 'unknown';

const buildDoc = async (input: SerializeProjectInput): Promise<ProjectDocument> => {
  return await serializeProject({
    ...input,
    id: AUTOSAVE_DOC_ID,
    title: input.title || AUTOSAVE_TITLE,
    appVersion: latestAppVersion,
  });
};

/**
 * Schedule a debounced autosave. Repeated calls within the debounce window
 * coalesce — only the latest payload is persisted when the timer fires.
 */
export const scheduleAutosave = (input: SerializeProjectInput, appVersion: string): void => {
  latestPayload = input;
  latestAppVersion = appVersion;
  if (typeof window === 'undefined') return;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void flushAutosave();
  }, AUTOSAVE_DEBOUNCE_MS);
};

/**
 * Force-flush the latest payload to IndexedDB. Called on `beforeunload` and
 * `visibilitychange → hidden` so the snapshot survives a tab close / crash.
 */
export const flushAutosave = async (): Promise<void> => {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (!latestPayload) return;
  try {
    const doc = await buildDoc(latestPayload);
    await saveProjectDocument(doc);
  } catch (err) {
    console.warn('Autosave flush failed (offline/unsupported):', err);
  }
};

/**
 * Install `beforeunload` / `visibilitychange` handlers so the autosave
 * snapshot is flushed even if the user closes the tab without idle.
 */
export const installAutosaveFlushHandlers = (): void => {
  if (typeof window === 'undefined') return;
  if (!beforeUnloadHandler) {
    beforeUnloadHandler = () => {
      void flushAutosave();
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
  }
  if (!visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        void flushAutosave();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }
};

export const uninstallAutosaveFlushHandlers = (): void => {
  if (typeof window === 'undefined') return;
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadHandler = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
};

/**
 * Read the latest autosave snapshot (if any) for crash recovery.
 * Returns `null` when no snapshot is stored.
 */
export const readAutosaveDocument = async (): Promise<ProjectDocument | null> => {
  try {
    const doc = await fetchProjectDocument(AUTOSAVE_DOC_ID);
    return doc ?? null;
  } catch (err) {
    console.warn('Autosave recovery read failed (offline/unsupported):', err);
    return null;
  }
};

/**
 * Discard the autosave snapshot (e.g. user chose to discard the recovery
 * offer or after a successful restore-to-state).
 */
export const clearAutosave = async (): Promise<void> => {
  try {
    await deleteProjectDocument(AUTOSAVE_DOC_ID);
  } catch (err) {
    console.warn('Autosave clear failed (offline/unsupported):', err);
  }
};

export const AUTOSAVE_DEBOUNCE_MS_EXPORT = AUTOSAVE_DEBOUNCE_MS;
export const AUTOSAVE_DOCUMENT_ID = AUTOSAVE_DOC_ID;
