/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { SystemCohesionDeck } from './SystemCohesionDeck';
import { audioEngine } from '../lib/audioEngine';

const makeLayer = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 5,
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 },
  fx: { distortion: 40, distortionEnabled: true },
  macroGrit: 50,
  macroPunch: 50,
  macroSpace: 30,
  macroDepth: 20,
  subDesign: { enabled: true },
  ...over,
});

function Harness({
  layers: initialLayers,
  onUpdateLayer,
  onAddToast,
  setActiveTab,
  bpm = 120,
  selectedLayerId,
}: {
  layers: any[];
  onUpdateLayer: (id: string, updates: any) => void;
  onAddToast: (message: string, type: 'success' | 'info' | 'warn') => void;
  setActiveTab: (tab: any) => void;
  bpm?: number;
  selectedLayerId: string | null;
}) {
  const [layers, setLayers] = useState<any[]>(initialLayers);
  const handleUpdate = (id: string, updates: any) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    onUpdateLayer(id, updates);
  };
  return (
    <SystemCohesionDeck
      layers={layers}
      selectedLayerId={selectedLayerId}
      onUpdateLayer={handleUpdate}
      onAddToast={onAddToast}
      activeTab="soundlab"
      setActiveTab={setActiveTab}
      bpm={bpm}
    />
  );
}

const openDeck = () => {
  fireEvent.click(screen.getByText(/System Cohesion Dashboard/i));
};

const getPad = () =>
  document.querySelector('div[class*="cursor-crosshair"]') as HTMLDivElement;

function dispatchWindowEventWithTouches(name: string, touches: { clientX: number; clientY: number }[]) {
  const evt = new Event(name, { bubbles: true });
  Object.defineProperty(evt, 'touches', { value: touches });
  fireEvent(window, evt);
}

describe('SystemCohesionDeck', () => {
  let onUpdateLayer: any;
  let onAddToast: any;
  let setActiveTab: any;

  beforeEach(() => {
    onUpdateLayer = vi.fn();
    onAddToast = vi.fn();
    setActiveTab = vi.fn();
    (audioEngine.playLayer as unknown as ReturnType<typeof vi.fn>).mockClear();
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect
    );
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders collapsed by default and expands on header click', () => {
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    expect(screen.getByText('5 Advanced Upgrades')).toBeDefined();
    expect(screen.queryByText('01. Signal Routing Matrix')).toBeNull();
    openDeck();
    expect(screen.getByText('01. Signal Routing Matrix')).toBeDefined();
    expect(screen.getByText('Selected:')).toBeDefined();
    expect(screen.getByText('Kick')).toBeDefined();
    openDeck();
    expect(screen.queryByText('01. Signal Routing Matrix')).toBeNull();
  });

  it('routing tab: flows to editor tabs and toggles insert FX', () => {
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/01\. Signal Routing Matrix/i));
    fireEvent.click(screen.getByText('Generator'));
    expect(setActiveTab).toHaveBeenCalledWith('soundlab');
    fireEvent.click(screen.getByText('ADSR Amp'));
    expect(setActiveTab).toHaveBeenCalledWith('tweaking');
    fireEvent.click(screen.getByText('Insert FX'));
    expect(setActiveTab).toHaveBeenCalledWith('tweaking');
    fireEvent.click(screen.getByText('3D Space'));
    expect(setActiveTab).toHaveBeenCalledWith('spatial');
    fireEvent.click(screen.getByText('Console Out'));
    expect(setActiveTab).toHaveBeenCalledWith('mixer');

    const fxCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(fxCheckbox.checked).toBe(true);
    fireEvent.click(fxCheckbox);
    expect(onUpdateLayer).toHaveBeenCalledWith('l1', {
      fx: { distortion: 40, distortionEnabled: false },
    });
  });

  it('performance tab: XY pad updates macros and plays audio', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/02\. XY Macro Matrix/i));
    const pad = getPad();
    expect(pad).toBeDefined();

    fireEvent.mouseDown(pad, { clientX: 25, clientY: 25 });
    expect(onUpdateLayer).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ macroGrit: 25, macroPunch: 75 })
    );
    expect(audioEngine.playLayer).toHaveBeenCalled();

    // Dragging while mouse down keeps updating.
    fireEvent(window, new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
    expect(onUpdateLayer).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ macroGrit: 50, macroPunch: 50 })
    );
    fireEvent(window, new MouseEvent('mouseup', {}));
  });

  it('performance tab: XY pad touch interaction and sliders', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/02\. XY Macro Matrix/i));
    const pad = getPad();
    fireEvent.touchStart(pad, { touches: [{ clientX: 10, clientY: 10 }] });
    expect(onUpdateLayer).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ macroGrit: 10, macroPunch: 90 })
    );
    dispatchWindowEventWithTouches('touchmove', [{ clientX: 30, clientY: 30 }]);
    expect(onUpdateLayer).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ macroGrit: 30, macroPunch: 70 })
    );
    dispatchWindowEventWithTouches('touchend', []);
    expect(audioEngine.playLayer).not.toHaveBeenCalled();

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '80' } });
    expect(onUpdateLayer).toHaveBeenCalledWith('l1', { macroGrit: 80 });
    fireEvent.change(sliders[1], { target: { value: '20' } });
    expect(onUpdateLayer).toHaveBeenCalledWith('l1', { macroPunch: 20 });
  });

  it('performance tab: XY pad is a no-op without a selected layer', () => {
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId={null}
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/02\. XY Macro Matrix/i));
    fireEvent.mouseDown(getPad(), { clientX: 25, clientY: 25 });
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  it('mirror tab: copies settings from the selected layer', () => {
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/03\. Params Sync & Link/i));
    expect(screen.getByText('Cache Empty (Click Copy to Load Settings)')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Copy Selected Layer/i }));
    expect(screen.getByText('Copied Cache Active:')).toBeDefined();
    expect(screen.getByText(/Attack: 0\.01s/i)).toBeDefined();
    expect(onAddToast).toHaveBeenCalledWith('Copied sound & FX settings from Kick', 'success');
  });

  it('mirror tab: links and unlinks layers and mirrors params when master active', () => {
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick'), makeLayer('l2', 'Snare')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/03\. Params Sync & Link/i));

    // Clicking the master layer itself is a no-op.
    fireEvent.click(screen.getByText('Kick (Master)'));
    expect(onUpdateLayer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Snare'));
    expect(screen.getAllByText('LINKED')).toHaveLength(1);
    fireEvent.click(screen.getByText('Snare'));
    expect(screen.queryAllByText('LINKED')).toHaveLength(0);
    fireEvent.click(screen.getByText('Snare'));

    // Enable link master, then move the selected layer macros -> syncs to target.
    const masterToggle = screen.getAllByRole('checkbox')[0];
    fireEvent.click(masterToggle);
    fireEvent.click(screen.getByText(/02\. XY Macro Matrix/i));
    fireEvent.mouseDown(getPad(), { clientX: 10, clientY: 10 });
    expect(onUpdateLayer).toHaveBeenCalledWith(
      'l2',
      expect.objectContaining({ macroPunch: expect.any(Number), macroGrit: expect.any(Number) })
    );
  });

  it('arpeggiator tab: toggles steps, runs and stops the arp', () => {
    vi.useFakeTimers();
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/04\. Sequencer Audition/i));

    // Toggle the first step off, then back on.
    const stepButtons = screen.getAllByRole('button', { name: /^0[1-8]$/ });
    fireEvent.click(stepButtons[0]);
    fireEvent.click(stepButtons[0]);

    fireEvent.click(screen.getByRole('button', { name: /Run Arpeggio/i }));
    expect(screen.getByText('Stop Arpeggio')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(audioEngine.playLayer).toHaveBeenCalled();

    const rate = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(rate, { target: { value: '1/16' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.change(rate, { target: { value: '1/8t' } });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    fireEvent.click(screen.getByRole('button', { name: /Stop Arpeggio/i }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
  });

  it('distro tab: analyzes the selected layer key and exports to kit creator', () => {
    vi.useFakeTimers();
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId="l1"
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/05\. Sound Kit Bridge/i));

    fireEvent.click(screen.getByTitle('Analyze Key and Spectrum'));
    expect(screen.getByText('ANALYZING...')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('F Minor')).toBeDefined();
    expect(onAddToast).toHaveBeenCalledWith(
      expect.stringContaining('Waveform analyzed!'),
      'success'
    );

    const tag = screen.getByPlaceholderText(/e\.g\. Sub-Heavy/i) as HTMLInputElement;
    fireEvent.change(tag, { target: { value: 'Heavy' } });

    fireEvent.click(screen.getByRole('button', { name: /Push to Sample Kit Creator/i }));
    expect(onAddToast).toHaveBeenCalledWith(
      'Added "Kick" to Sound Kit Creator Pack list!',
      'success'
    );
    expect(screen.getByText('Ready Kit Bundle (1 items)')).toBeDefined();
    expect(screen.getByText('Heavy')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Configure Kit Pack & Publish/i }));
    expect(setActiveTab).toHaveBeenCalledWith('kitcreator');
    expect(onAddToast).toHaveBeenCalledWith(
      'Bridge complete! Configure artwork and package your sounds.',
      'info'
    );
  });

  it('distro tab: analysis and export are inert without a selected layer', () => {
    render(
      <Harness
        layers={[makeLayer('l1', 'Kick')] as never[]}
        selectedLayerId={null}
        onUpdateLayer={onUpdateLayer}
        onAddToast={onAddToast}
        setActiveTab={setActiveTab}
      />
    );
    openDeck();
    fireEvent.click(screen.getByText(/05\. Sound Kit Bridge/i));
    const analyze = screen.getByTitle('Analyze Key and Spectrum') as HTMLButtonElement;
    expect(analyze.disabled).toBe(true);
    const push = screen.getByRole('button', { name: /Push to Sample Kit Creator/i }) as HTMLButtonElement;
    expect(push.disabled).toBe(true);
    fireEvent.click(push);
    expect(onAddToast).not.toHaveBeenCalled();
    expect(screen.getByText('No samples compiled yet. Push sound layers on the left.')).toBeDefined();
  });
});
