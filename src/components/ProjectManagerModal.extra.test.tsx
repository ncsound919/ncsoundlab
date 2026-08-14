/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProjectManagerModal } from './ProjectManagerModal';

const { dbFns } = vi.hoisted(() => ({
  dbFns: {
    saveProject: vi.fn(),
    fetchUserProjects: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

vi.mock('../lib/db', () => dbFns);

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();

const projects = [
  {
    id: 'p1',
    title: 'Heavy Kick',
    ownerId: 'local',
    layers: [{ type: 'synth' }, { type: 'synth' }, { type: 'sample' }],
    updatedAt: new Date(now - 10 * SEC).toISOString(),
    description: 'Dark banger for the club',
    tags: ['dark', '808'],
  },
  {
    id: 'p2',
    title: 'Ambient Pad',
    ownerId: 'local',
    layers: [{ type: 'sample' }],
    updatedAt: new Date(now - 5 * MIN).toISOString(),
    description: '',
    tags: [],
  },
  {
    id: 'p3',
    title: 'Empty Stack',
    ownerId: 'local',
    layers: [],
    updatedAt: new Date(now - 5 * HOUR).toISOString(),
  },
  {
    id: 'p4',
    title: 'Old Mix',
    ownerId: 'local',
    layers: [{ type: 'synth' }],
    updatedAt: new Date(now - 5 * DAY).toISOString(),
  },
  {
    id: 'p5',
    title: 'Ancient Vault',
    ownerId: 'local',
    layers: [{ type: 'sample' }],
    updatedAt: new Date(now - 30 * DAY).toISOString(),
  },
  {
    id: 'p6',
    title: 'Broken Date',
    ownerId: 'local',
    layers: [],
    updatedAt: 'not-a-real-date',
  },
];

const layer = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  name: '808 Kick (Sub)',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 },
  fx: { distortion: 40, distortionEnabled: true },
  ...over,
});

function renderModal(props: Record<string, unknown> = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    layers: [layer()],
    onLoadProject: vi.fn(),
    onAddToast: vi.fn(),
    snapshotA: null,
    snapshotB: null,
    onLoadSnapshot: vi.fn(),
    onStoreSnapshot: vi.fn(),
  };
  const merged = { ...defaultProps, ...props };
  return {
    props: merged,
    ...render(
      <ProjectManagerModal
        isOpen={merged.isOpen as boolean}
        onClose={merged.onClose as () => void}
        layers={merged.layers as never[]}
        onLoadProject={merged.onLoadProject as (layers: never[], title: string) => void}
        onAddToast={merged.onAddToast as (message: string, type: 'success' | 'info' | 'warn') => void}
        snapshotA={merged.snapshotA as never[] | null}
        snapshotB={merged.snapshotB as never[] | null}
        onLoadSnapshot={merged.onLoadSnapshot as (slot: 'A' | 'B') => void}
        onStoreSnapshot={merged.onStoreSnapshot as (slot: 'A' | 'B') => void}
      />
    ),
  };
}

describe('ProjectManagerModal', () => {
  beforeEach(() => {
    localStorage.clear();
    dbFns.saveProject.mockReset().mockResolvedValue('p-new');
    dbFns.fetchUserProjects.mockReset().mockResolvedValue(projects);
    dbFns.deleteProject.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const { props } = renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('renders the project list when open', async () => {
    const { props } = renderModal();
    expect(screen.getByRole('dialog', { name: 'Project Manager' })).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: /Browse Project Stacks \(6\)/ })).toBeDefined();
    expect(screen.getByText('2 Synths, 1 Sample')).toBeDefined();
    expect(screen.getByText('Dark banger for the club')).toBeDefined();
    expect(screen.getByText('#dark')).toBeDefined();
    expect(screen.getByText('#808')).toBeDefined();
    expect(screen.getByText('Just now')).toBeDefined();
    expect(screen.getByText('5m ago')).toBeDefined();
    expect(screen.getByText('5h ago')).toBeDefined();
    expect(screen.getByText('5d ago')).toBeDefined();
    expect(screen.getAllByText('Empty').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Invalid Date')).toBeDefined();
    expect(props.onAddToast).not.toHaveBeenCalled();
  });

  it('prefills the save title from the first layer name', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /Backup Current Setup/i }));
    expect((screen.getByPlaceholderText('e.g. Heavy Analog Kick Layer, Cinematic Brass Stack') as HTMLInputElement).value).toBe(
      '808 Kick Stack'
    );
  });

  it('defaults title to New Sound Stack when there are no layers', async () => {
    renderModal({ layers: [] });
    fireEvent.click(screen.getByRole('button', { name: /Backup Current Setup/i }));
    expect((screen.getByPlaceholderText('e.g. Heavy Analog Kick Layer, Cinematic Brass Stack') as HTMLInputElement).value).toBe(
      'New Sound Stack'
    );
  });

  it('filters projects by search term', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    const search = screen.getByPlaceholderText(/Search saved stacks/i) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'ambient' } });
    expect(screen.getByText('Ambient Pad')).toBeDefined();
    expect(screen.queryByText('Heavy Kick')).toBeNull();
  });

  it('shows the empty state and jumps to the save tab', async () => {
    dbFns.fetchUserProjects.mockResolvedValue([]);
    const { props } = renderModal();
    await waitFor(() => {
      expect(screen.getByText('No Project Stacks Found')).toBeDefined();
    });
    expect(props.onAddToast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Back Up Current State Now/i }));
    expect(screen.getByText(/Save Entire Layer Configuration/i)).toBeDefined();
  });

  it('shows search-specific empty state', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    fireEvent.change(screen.getByPlaceholderText(/Search saved stacks/i), { target: { value: 'zzz' } });
    expect(screen.getByText('No Project Stacks Found')).toBeDefined();
    expect(screen.getByText(/No projects match your search term/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Back Up Current State Now/i })).toBeNull();
  });

  it('loads a project stack and closes', async () => {
    const onLoadProject = vi.fn();
    const onClose = vi.fn();
    renderModal({ onLoadProject, onClose });
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Load Stack/i })[0]);
    expect(onLoadProject).toHaveBeenCalledWith(
      projects[0].layers,
      'Heavy Kick'
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('handles the delete confirmation flow', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button', { name: /delete from list/i })[0]);
    expect(screen.getByText('Delete permanently?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByText('Delete permanently?')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /delete from list/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    await waitFor(() => {
      expect(dbFns.deleteProject).toHaveBeenCalledWith('p1');
    });
    expect(screen.queryByText('Heavy Kick')).toBeNull();
  });

  it('shows a warn toast when delete fails', async () => {
    dbFns.deleteProject.mockRejectedValue(new Error('nope'));
    const onAddToast = vi.fn();
    renderModal({ onAddToast });
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button', { name: /delete from list/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    await waitFor(() => {
      expect(onAddToast).toHaveBeenCalledWith('Failed to delete project.', 'warn');
    });
  });

  it('refreshes the list from the refresh button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    dbFns.fetchUserProjects.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /sync from local library/i }));
    await waitFor(() => {
      expect(dbFns.fetchUserProjects).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back to cached projects when the fetch fails', async () => {
    const cached = [projects[1]];
    localStorage.setItem('sonik_projects_cache', JSON.stringify(cached));
    dbFns.fetchUserProjects.mockRejectedValue(new Error('offline'));
    const onAddToast = vi.fn();
    renderModal({ onAddToast });
    await waitFor(() => {
      expect(screen.getByText('Ambient Pad')).toBeDefined();
    });
    expect(onAddToast).toHaveBeenCalledWith('Could not load projects. Using cached list.', 'info');
  });

  it('tracks online/offline status', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Heavy Kick')).toBeDefined();
    });
    expect(screen.getByText('Local Library active')).toBeDefined();
    fireEvent(window, new Event('offline'));
    expect(screen.getByText('Offline Cache Storage active')).toBeDefined();
    fireEvent(window, new Event('online'));
    expect(screen.getByText('Local Library active')).toBeDefined();
  });

  it('warns when saving without a title', async () => {
    const onAddToast = vi.fn();
    renderModal({ onAddToast });
    fireEvent.click(screen.getByRole('button', { name: /Backup Current Setup/i }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Heavy Analog Kick Layer, Cinematic Brass Stack'), {
      target: { value: '' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Store Local Backup/i }).closest('form')!);
    await waitFor(() => {
      expect(onAddToast).toHaveBeenCalledWith('Please enter a project title', 'warn');
    });
  });

  it('saves a project with tags and reloads the list', async () => {
    renderModal({ layers: [] });
    fireEvent.click(screen.getByRole('button', { name: /Backup Current Setup/i }));
    const titleInput = screen.getByPlaceholderText('e.g. Heavy Analog Kick Layer, Cinematic Brass Stack');
    fireEvent.change(titleInput, { target: { value: 'My Stack' } });
    const desc = screen.getByPlaceholderText(/Write a brief note/i);
    fireEvent.change(desc, { target: { value: 'A nice stack' } });
    const tagInput = screen.getByPlaceholderText('e.g. 808, lofi, dark');
    fireEvent.change(tagInput, { target: { value: 'lofi' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.change(tagInput, { target: { value: 'dark' } });
    fireEvent.keyDown(tagInput, { key: ',' });
    expect(screen.getByText('#lofi')).toBeDefined();
    expect(screen.getByText('#dark')).toBeDefined();
    fireEvent.click(screen.getByText('#lofi').querySelector('button')!);
    expect(screen.queryByText('#lofi')).toBeNull();

    fireEvent.submit(screen.getByRole('button', { name: /Store Local Backup/i }).closest('form')!);
    await waitFor(() => {
      expect(dbFns.saveProject).toHaveBeenCalledTimes(1);
    });
    const [, title, savedLayers, descArg, tagsArg] = dbFns.saveProject.mock.calls[0] as [
      string,
      string,
      unknown[],
      string,
      string[]
    ];
    expect(title).toBe('My Stack');
    expect(descArg).toBe('A nice stack');
    expect(tagsArg).toEqual(['dark']);
    expect(Array.isArray(savedLayers)).toBe(true);
    expect(screen.getByPlaceholderText(/Search saved stacks/i)).toBeDefined();
  });

  it('keeps unsaved projects in the local cache when save fails', async () => {
    dbFns.saveProject.mockRejectedValue(new Error('db full'));
    const onAddToast = vi.fn();
    renderModal({ layers: [layer({ audioBuffer: {} as AudioBuffer })], onAddToast });
    fireEvent.click(screen.getByRole('button', { name: /Backup Current Setup/i }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Heavy Analog Kick Layer, Cinematic Brass Stack'), {
      target: { value: 'Offline Stack' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Store Local Backup/i }).closest('form')!);
    await waitFor(() => {
      expect(onAddToast).toHaveBeenCalledWith('Failed to save project locally.', 'warn');
    });
    const cache = JSON.parse(localStorage.getItem('sonik_projects_cache') || '[]');
    expect(cache.some((p: { title: string }) => p.title === 'Offline Stack')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Browse Project Stacks/i }));
    expect(screen.getByText('Offline Stack')).toBeDefined();
  });

  it('renders snapshot slots and stores snapshots', async () => {
    const onStoreSnapshot = vi.fn();
    const onAddToast = vi.fn();
    renderModal({ onStoreSnapshot, onAddToast });
    fireEvent.click(screen.getByRole('button', { name: /Volatile Snapshots/i }));
    expect(screen.getByText('Snapshot A Slot')).toBeDefined();
    expect(screen.getByText('Snapshot B Slot')).toBeDefined();
    expect(screen.getAllByText('No Saved Setup')).toHaveLength(2);
    const storeButtons = screen.getAllByRole('button', { name: /Store Current/i });
    fireEvent.click(storeButtons[0]);
    fireEvent.click(storeButtons[1]);
    expect(onStoreSnapshot).toHaveBeenCalledWith('A');
    expect(onStoreSnapshot).toHaveBeenCalledWith('B');
    const loadButtons = screen.getAllByRole('button', { name: /Load/i });
    expect((loadButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((loadButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('loads populated snapshots', async () => {
    const onLoadSnapshot = vi.fn();
    const onClose = vi.fn();
    renderModal({ snapshotA: [layer()], snapshotB: [layer(), layer()], onLoadSnapshot, onClose });
    fireEvent.click(screen.getByRole('button', { name: /Volatile Snapshots/i }));
    expect(screen.getByText('1 Saved Layer Stack')).toBeDefined();
    expect(screen.getByText('2 Saved Layer Stack')).toBeDefined();
    const loadButtons = screen.getAllByRole('button', { name: /Load/i });
    fireEvent.click(loadButtons[0]);
    expect(onLoadSnapshot).toHaveBeenCalledWith('A');
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(loadButtons[1]);
    expect(onLoadSnapshot).toHaveBeenCalledWith('B');
  });
});
