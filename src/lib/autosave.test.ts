/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/autosave.ts` — debounced autosave, beforeunload /
 * visibilitychange flush, crash recovery read, and snapshot discard.
 * `db` + `projectFormat` are mocked so no IndexedDB / real serialization is
 * required. The module keeps module-level state (latestPayload/pendingTimer),
 * so each test re-imports it fresh via `vi.resetModules()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./db', () => ({
  saveProjectDocument: vi.fn(async () => {}),
  fetchProjectDocument: vi.fn(async () => null),
  deleteProjectDocument: vi.fn(async () => {}),
}));

vi.mock('./projectFormat', () => ({
  serializeProject: vi.fn(async (input: any) => ({
    id: input.id,
    title: input.title,
    appVersion: input.appVersion,
    version: 3,
  })),
}));

type Autosave = typeof import('./autosave');
type Db = typeof import('./db');
type Fmt = typeof import('./projectFormat');

const payload = { title: 'My Beat', layers: [] } as never;

describe('autosave', () => {
  let api: Autosave;
  let db: Db;
  let fmt: Fmt;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    api = await import('./autosave');
    db = await import('./db');
    fmt = await import('./projectFormat');
    vi.mocked(db.saveProjectDocument).mockClear();
    vi.mocked(db.fetchProjectDocument).mockClear();
    vi.mocked(db.deleteProjectDocument).mockClear();
    vi.mocked(fmt.serializeProject).mockClear();
  });

  afterEach(() => {
    api?.uninstallAutosaveFlushHandlers();
    vi.useRealTimers();
  });

  it('flushes a debounced autosave to the DB', async () => {
    api.scheduleAutosave(payload, '1.0.0');
    vi.advanceTimersByTime(2500);
    await Promise.resolve();
    await Promise.resolve();
    expect(fmt.serializeProject).toHaveBeenCalledTimes(1);
    expect(db.saveProjectDocument).toHaveBeenCalledTimes(1);
  });

  it('coalesces repeated schedules within the debounce window', async () => {
    api.scheduleAutosave(payload, '1.0.0');
    api.scheduleAutosave(payload, '1.0.0');
    api.scheduleAutosave(payload, '1.0.0');
    vi.advanceTimersByTime(2500);
    await Promise.resolve();
    await Promise.resolve();
    expect(db.saveProjectDocument).toHaveBeenCalledTimes(1);
  });

  it('flushAutosave is a no-op when nothing was scheduled', async () => {
    await api.flushAutosave();
    expect(db.saveProjectDocument).not.toHaveBeenCalled();
  });

  it('flushAutosave warns and swallows a DB failure', async () => {
    vi.mocked(db.saveProjectDocument).mockRejectedValueOnce(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.scheduleAutosave(payload, '1.0.0');
    await api.flushAutosave();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('flushes on beforeunload once handlers are installed', async () => {
    api.installAutosaveFlushHandlers();
    api.scheduleAutosave(payload, '1.0.0');
    window.dispatchEvent(new Event('beforeunload'));
    await Promise.resolve();
    await Promise.resolve();
    expect(db.saveProjectDocument).toHaveBeenCalledTimes(1);
  });

  it('flushes on visibilitychange when the tab hides', async () => {
    api.installAutosaveFlushHandlers();
    api.scheduleAutosave(payload, '1.0.0');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
    expect(db.saveProjectDocument).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('does not re-install duplicate handlers', async () => {
    api.installAutosaveFlushHandlers();
    api.installAutosaveFlushHandlers();
    api.scheduleAutosave(payload, '1.0.0');
    window.dispatchEvent(new Event('beforeunload'));
    await Promise.resolve();
    await Promise.resolve();
    expect(db.saveProjectDocument).toHaveBeenCalledTimes(1);
  });

  it('uninstallAutosaveFlushHandlers detaches the flush handlers', async () => {
    api.installAutosaveFlushHandlers();
    api.uninstallAutosaveFlushHandlers();
    api.scheduleAutosave(payload, '1.0.0');
    window.dispatchEvent(new Event('beforeunload'));
    vi.advanceTimersByTime(2500);
    await Promise.resolve();
    await Promise.resolve();
    expect(db.saveProjectDocument).toHaveBeenCalledTimes(1);
  });

  it('readAutosaveDocument returns the stored doc or null', async () => {
    vi.mocked(db.fetchProjectDocument).mockResolvedValueOnce({ id: '__autosave__' } as never);
    expect(await api.readAutosaveDocument()).toEqual({ id: '__autosave__' });
    expect(await api.readAutosaveDocument()).toBeNull();
  });

  it('readAutosaveDocument warns and returns null on failure', async () => {
    vi.mocked(db.fetchProjectDocument).mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await api.readAutosaveDocument()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('clearAutosave deletes the snapshot and swallows failures', async () => {
    await api.clearAutosave();
    expect(db.deleteProjectDocument).toHaveBeenCalledWith('__autosave__');
    vi.mocked(db.deleteProjectDocument).mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await api.clearAutosave();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
