/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { UserManualModal } from './UserManualModal';

const mockNode = () => ({
  frequency: { value: 440, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
});

class RichAudioContextMock {
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createOscillator() {
    return { type: 'sine', ...mockNode() };
  }
  createGain() {
    return { ...mockNode() };
  }
  createBiquadFilter() {
    return { type: 'lowpass', frequency: mockNode().frequency, connect: vi.fn() };
  }
  createBuffer() {
    const data = new Float32Array(1000);
    return { getChannelData: () => data, duration: 0.1 };
  }
  createBufferSource() {
    return { buffer: null, connect: vi.fn(), start: vi.fn() };
  }
}

const CHAPTERS = [
  ['1. Quick Start & Architecture', 'How to Make Epic Sounds in 3 Easy Steps'],
  ['2. Layering like LEGOs', 'How Professional Producers Layer Sounds'],
  ['3. Transient Attack Punch', 'Understanding Transient Attack Punch'],
  ['4. Oscillators & 3D Unison', 'Dual Oscillators & 7-Voice Super Unison Engine'],
  ['5. Filters, Drive & LFO', 'Resonant Filters, Tube Drive & LFO Wobble'],
  ['6. Master Studio Rack', 'Master Studio Rack & Precision Peak Meter'],
  ['7. Sound Kits & Cloud Sync', 'Creating, Exporting & Cloud Syncing Sound Kits'],
  ['8. 3D Spatial Canvas', 'Full-Screen 3D Spatial Room & Schroeder Reverb Engine'],
  ['9. A/B Compare & Macros', 'A/B Snapshots, Quick Copy FX & Performance Macros'],
  ['10. Evolution Engine Stage 04', 'Stage 04 Evolution Engine & Mutant Variations'],
  ['11. Smart Selective Randomizer', 'Smart Selective Randomizer & Section Locks'],
  ['12. Producer Cookbook Recipes', 'Producer Sound Cookbook Recipes'],
  ['13. Beat Studio & Sequencer', 'Beat Studio & Sequencer — MPC Pads, Step Grid & Piano Roll'],
  ['14. Console Mixer & Sends', 'Console Mixer & Sends — Faders, Channel Strips & Busses'],
  ['15. Sampling & Recording', 'Sampling & Recording — Library, Chop Editor, Takes & Waveform DSP'],
  ['16. Stems, AAF & Pro Tools', 'Stems, AAF & Pro Tools — Round-Trip With Your DAW'],
  ['17. Projects & Autosave', 'Projects & Autosave — Save Everything, Lose Nothing'],
  ['18. Web Demo & Purchase', 'Web Demo & Purchase — 20 Minutes, Then One-Time $5'],
  ['19. Keyboard Hotkey Index', 'Studio Hotkeys & Command Reference'],
] as const;

function renderModal(onClose = vi.fn()) {
  return {
    onClose,
    ...render(<UserManualModal isOpen onClose={onClose} />),
  };
}

describe('UserManualModal', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', RichAudioContextMock);
    vi.stubGlobal('webkitAudioContext', RichAudioContextMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<UserManualModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the welcome chapter by default', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Studio User Manual' })).toBeDefined();
    expect(screen.getByText('How to Make Epic Sounds in 3 Easy Steps')).toBeDefined();
  });

  it('navigates through every chapter', async () => {
    renderModal();
    for (const [title, content] of CHAPTERS) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
      await screen.findByText(content, undefined, { timeout: 15000 });
    }
  }, 60000);

  it('switches between punchy and flat transient demos and auditions them', () => {
    const createOsc = vi.spyOn(RichAudioContextMock.prototype, 'createOscillator');
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /3\. Transient Attack Punch/i }));

    fireEvent.click(screen.getByRole('button', { name: /Punchy Transient/i }));
    fireEvent.click(screen.getByRole('button', { name: /Audition Demo/i }));
    expect(createOsc).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Soft \/ Flat/i }));
    fireEvent.click(screen.getByRole('button', { name: /Audition Demo/i }));
    expect(createOsc).toHaveBeenCalledTimes(2);
  });

  it('auditions the unison lead and filter sweep demos', () => {
    const createOsc = vi.spyOn(RichAudioContextMock.prototype, 'createOscillator');
    const createFilter = vi.spyOn(RichAudioContextMock.prototype, 'createBiquadFilter');
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /4\. Oscillators & 3D Unison/i }));
    fireEvent.click(screen.getByRole('button', { name: /Audition 7-Voice Super-Unison Lead/i }));
    expect(createOsc).toHaveBeenCalledTimes(6);

    fireEvent.click(screen.getByRole('button', { name: /5\. Filters, Drive & LFO/i }));
    fireEvent.click(screen.getByRole('button', { name: /Audition Resonant Filter Sweep/i }));
    expect(createFilter).toHaveBeenCalledTimes(1);
  });

  it('auditions all four cookbook sounds', () => {
    const createOsc = vi.spyOn(RichAudioContextMock.prototype, 'createOscillator');
    const createBuffer = vi.spyOn(RichAudioContextMock.prototype, 'createBuffer');
    const createBufferSource = vi.spyOn(RichAudioContextMock.prototype, 'createBufferSource');
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /12\. Producer Cookbook Recipes/i }));
    const testButtons = screen.getAllByRole('button', { name: /Test Sound/i });
    expect(testButtons).toHaveLength(4);
    for (const btn of testButtons) {
      fireEvent.click(btn);
    }
    expect(createOsc).toHaveBeenCalledTimes(4);
    expect(createBuffer).toHaveBeenCalledTimes(1);
    expect(createBufferSource).toHaveBeenCalledTimes(1);
  });

  it('filters the hotkey list by search', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /19\. Keyboard Hotkey Index/i }));
    expect(screen.getByText('Spacebar')).toBeDefined();
    expect(screen.getAllByRole('button')).toBeDefined();

    const search = screen.getByPlaceholderText(/Search hotkeys/i) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'solo' } });
    expect(screen.getByText('S')).toBeDefined();
    expect(screen.queryByText('Spacebar')).toBeNull();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/No shortcuts found matching "zzz"/)).toBeDefined();

    fireEvent.change(search, { target: { value: 'space' } });
    expect(screen.getByText('Spacebar')).toBeDefined();
    expect(screen.getByText('Shift + Space')).toBeDefined();
  });

  it('closes via the header and footer buttons', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTitle('Close Manual'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Back to Studio/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('gracefully no-ops when audio audition fails to construct a context', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('AudioContext', class {
      constructor() {
        throw new Error('audio unavailable');
      }
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /3\. Transient Attack Punch/i }));
    fireEvent.click(screen.getByRole('button', { name: /Audition Demo/i }));
    // The shared-context helper swallows context-construction failures and
    // returns null (audition silently no-ops) instead of throwing.
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
