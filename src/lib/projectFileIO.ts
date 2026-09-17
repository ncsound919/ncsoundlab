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

/**
 * Minimal structural types for the File System Access API (not in the default
 * DOM lib). Typing the surface we use removes the previous `window as any`.
 */
interface FilePickerType {
  description: string;
  accept: Record<string, string[]>;
}
interface WritableFileStreamLike {
  write(data: BlobPart): Promise<void>;
  close(): Promise<void>;
}
interface FileHandleLike {
  createWritable(): Promise<WritableFileStreamLike>;
  getFile(): Promise<File>;
}
interface FileSystemAccessWindow {
  showSaveFilePicker?: (options: { suggestedName?: string; types?: FilePickerType[] }) => Promise<FileHandleLike>;
  showOpenFilePicker?: (options: { multiple?: boolean; types?: FilePickerType[] }) => Promise<FileHandleLike[]>;
}

const fileSystemAccess = (): FileSystemAccessWindow => window as unknown as FileSystemAccessWindow;

const isAbortError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';

const PROJECT_PICKER_TYPES: FilePickerType[] = [
  { description: 'NC Sound Lab Project', accept: { 'application/json': ['.nsl'] } },
];

const sanitizeFilename = (raw: string): string => {
  const trimmed = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  const withExt = trimmed.toLowerCase().endsWith(PROJECT_FILE_EXTENSION) ? trimmed : `${trimmed}${PROJECT_FILE_EXTENSION}`;
  return withExt.length > 1 ? withExt : `project${PROJECT_FILE_EXTENSION}`;
};

const isFileSystemAccessSupported = (): boolean => {
  return typeof window !== 'undefined' && typeof fileSystemAccess().showSaveFilePicker === 'function';
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

  const w = fileSystemAccess();
  if (isFileSystemAccessSupported() && w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: finalName,
        types: PROJECT_PICKER_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled or API unavailable — fall through to legacy download.
      if (isAbortError(err)) return;
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
  return typeof window !== 'undefined' && typeof fileSystemAccess().showOpenFilePicker === 'function';
};

/**
 * Open a file picker and return the parsed project document. Throws if the
 * file cannot be parsed as a project document.
 */
export const importProjectFile = async (): Promise<ProjectDocument> => {
  const w = fileSystemAccess();
  if (isOpenFilePickerSupported() && w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        multiple: false,
        types: PROJECT_PICKER_TYPES,
      });
      const file = await handle.getFile();
      const text = await file.text();
      return parseProjectText(text);
    } catch (err) {
      if (isAbortError(err)) {
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
