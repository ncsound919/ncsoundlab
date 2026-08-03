/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * File I/O for `.nsl` project documents (Phase 0.2).
 *
 * Browser-friendly export/import helpers:
 *   - `exportProjectFile(doc, filename?)` downloads a self-contained `.nsl`
 *     (JSON + base64 sample audio) to the user's downloads folder.
 *   - `importProjectFile()` opens a file picker and returns the parsed
 *     raw `ProjectDocument`. The caller hands it to `deserializeProject` to
 *     rehydrate audio buffers.
 *   - File System Access API (`showSaveFilePicker` / `showOpenFilePicker`) is
 *     preferred when available so users can pick a target path; otherwise we
 *     fall back to the legacy `<a download>` + `<input type=file>` flow.
 */

import {
  type ProjectDocument,
  PROJECT_FILE_EXTENSION,
  stringifyProject,
  isProjectDocument,
  migrate,
} from './projectFormat';

const FILE_ACCEPT = '.nsl,application/json';

const sanitizeFilename = (raw: string): string => {
  const trimmed = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  const withExt = trimmed.toLowerCase().endsWith(PROJECT_FILE_EXTENSION) ? trimmed : `${trimmed}${PROJECT_FILE_EXTENSION}`;
  return withExt.length > 1 ? withExt : `project${PROJECT_FILE_EXTENSION}`;
};

const isFileSystemAccessSupported = (): boolean => {
  return typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function';
};

/**
 * Download a `.nsl` file containing the project document.
 *
 * When the File System Access API is available the user picks a destination
 * path; otherwise the file is written via a temporary `<a download>` link.
 */
export const exportProjectFile = async (doc: ProjectDocument, filename?: string): Promise<void> => {
  const json = stringifyProject(doc);
  const blob = new Blob([json], { type: 'application/json' });
  const finalName = sanitizeFilename(filename ?? doc.title ?? 'project');

  const w = window as any;
  if (isFileSystemAccessSupported()) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: finalName,
        types: [
          {
            description: 'NC Sound Lab Project',
            accept: { 'application/json': ['.nsl'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: any) {
      // User cancelled or API unavailable — fall through to legacy download.
      if (err && err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
};

const isOpenFilePickerSupported = (): boolean => {
  return typeof window !== 'undefined' && typeof (window as any).showOpenFilePicker === 'function';
};

/**
 * Open a file picker and return the parsed project document. Throws if the
 * file cannot be parsed as a project document.
 */
export const importProjectFile = async (): Promise<ProjectDocument> => {
  const w = window as any;
  if (isOpenFilePickerSupported()) {
    try {
      const [handle] = await w.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'NC Sound Lab Project',
            accept: { 'application/json': ['.nsl'] },
          },
        ],
      });
      const file = await handle.getFile();
      const text = await file.text();
      return parseProjectText(text);
    } catch (err: any) {
      if (err && err.name === 'AbortError') {
        throw new Error('Project import cancelled.');
      }
      throw err;
    }
  }

  return new Promise<ProjectDocument>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = FILE_ACCEPT;
    input.style.display = 'none';
    const cleanup = () => {
      input.remove();
    };
    input.onchange = async () => {
      cleanup();
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected.'));
        return;
      }
      try {
        const text = await file.text();
        resolve(parseProjectText(text));
      } catch (err) {
        reject(err);
      }
    };
    document.body.appendChild(input);
    input.click();
  });
};

export const parseProjectText = (text: string): ProjectDocument => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Selected file is not a valid JSON project document.');
  }
  if (!isProjectDocument(parsed)) {
    throw new Error('Selected file is not a recognized NC Sound Lab project (.nsl).');
  }
  return migrate(parsed);
};

export const PROJECT_FILE_ACCEPT = FILE_ACCEPT;
