/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Folder linking for the soundbank.
 *
 * A browser can't read a path like `E:\drums` directly — the File System
 * Access API requires the user to grant access to a directory once
 * (`showDirectoryPicker`). This module scans that directory RECURSIVELY and
 * mirrors its subfolder tree into the library's folders, importing every audio
 * file into the matching folder. The directory handle is persisted in
 * IndexedDB so the bank can be re-scanned later without re-picking.
 */

export interface DirectoryLike {
  kind: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, DirectoryEntryLike]>;
}

export interface FileLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export type DirectoryEntryLike = DirectoryLike | FileLike;

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.aif', '.aiff', '.ogg', '.oga', '.flac', '.m4a', '.webm', '.aac', '.opus'];

export function isAudioFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Strip the extension for a display name. */
export function sampleNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export interface FolderScanDeps {
  /** Create a library folder row; returns its id. */
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  /** Persist one decoded sample into a folder. */
  saveSample: (input: { name: string; fileName: string; folderId: string; audioBuffer: AudioBuffer; sizeBytes: number }) => Promise<string>;
  /** Decode a file to an AudioBuffer. */
  decode: (file: File) => Promise<AudioBuffer>;
  /** File names already in a folder (so a re-scan doesn't duplicate). */
  existingFileNames: (folderId: string) => Promise<Set<string>>;
}

export interface FolderScanResult {
  rootFolderId: string;
  folders: number;
  samples: number;
  skipped: string[];
}

export interface FolderScanOptions {
  parentFolderId?: string | null;
  /** When set, scan into this existing folder instead of creating a root. */
  rootFolderId?: string;
  /** Restrict the root's immediate child folders to these names. */
  selectedSubfolders?: string[];
  onProgress?: (info: { folders: number; samples: number; current: string }) => void;
}

/**
 * Recursively scan `dir` into the sample library. Subdirectories become library
 * folders (mirroring the tree); audio files are decoded and saved into their
 * containing folder. Re-scans skip files that already exist in the folder.
 */
export async function scanDirectoryToLibrary(
  dir: DirectoryLike,
  deps: FolderScanDeps,
  options: FolderScanOptions = {}
): Promise<FolderScanResult> {
  const rootFolderId = options.rootFolderId ?? (await deps.createFolder(dir.name, options.parentFolderId ?? null));
  let folders = options.rootFolderId ? 0 : 1;
  let samples = 0;
  const skipped: string[] = [];

  const walk = async (handle: DirectoryLike, folderId: string, depth: number): Promise<void> => {
    const existing = await deps.existingFileNames(folderId);
    for await (const [, entry] of handle.entries()) {
      if (!entry) continue;
      if (entry.kind === 'directory') {
        if (depth === 0 && options.selectedSubfolders && !options.selectedSubfolders.includes(entry.name)) continue;
        const childId = await deps.createFolder(entry.name, folderId);
        folders += 1;
        await walk(entry, childId, depth + 1);
      } else if (entry.kind === 'file' && isAudioFileName(entry.name)) {
        if (existing.has(entry.name)) continue;
        try {
          const file = await entry.getFile();
          const audioBuffer = await deps.decode(file);
          await deps.saveSample({
            name: sampleNameFromFile(entry.name),
            fileName: entry.name,
            folderId,
            audioBuffer,
            sizeBytes: file.size,
          });
          samples += 1;
          options.onProgress?.({ folders, samples, current: entry.name });
        } catch {
          skipped.push(entry.name);
        }
      }
    }
  };

  await walk(dir, rootFolderId, 0);
  return { rootFolderId, folders, samples, skipped };
}

export interface SubfolderInfo {
  name: string;
  handle: DirectoryLike;
  audioCount: number;
}

/** List the immediate child folders of `dir` with their recursive audio counts. */
export async function listSubfolders(dir: DirectoryLike): Promise<SubfolderInfo[]> {
  const out: SubfolderInfo[] = [];
  for await (const [, entry] of dir.entries()) {
    if (entry && entry.kind === 'directory') {
      out.push({ name: entry.name, handle: entry, audioCount: await countAudioFiles(entry) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** True when the browser exposes the File System Access directory picker. */
export function isFolderLinkSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

/** Recursively count audio files so the UI can warn before a huge import. */
export async function countAudioFiles(dir: DirectoryLike): Promise<number> {
  let count = 0;
  for await (const [, entry] of dir.entries()) {
    if (!entry) continue;
    if (entry.kind === 'directory') count += await countAudioFiles(entry);
    else if (entry.kind === 'file' && isAudioFileName(entry.name)) count += 1;
  }
  return count;
}

/** Prompt for a directory. Returns null when unsupported or the user cancels. */
export async function pickDirectory(): Promise<DirectoryLike | null> {
  if (!isFolderLinkSupported()) return null;
  try {
    const picker = (window as unknown as { showDirectoryPicker: (opts?: unknown) => Promise<DirectoryLike> }).showDirectoryPicker;
    return await picker({ mode: 'read' });
  } catch {
    return null; // user dismissed the picker
  }
}

interface PermissionCapable {
  queryPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
}

/** Re-grant read access to a previously picked directory handle. */
export async function ensureReadPermission(handle: DirectoryLike, request = false): Promise<boolean> {
  const capable = handle as DirectoryLike & PermissionCapable;
  try {
    if (capable.queryPermission && (await capable.queryPermission({ mode: 'read' })) === 'granted') return true;
    if (request && capable.requestPermission) {
      return (await capable.requestPermission({ mode: 'read' })) === 'granted';
    }
  } catch {
    return false;
  }
  return false;
}
