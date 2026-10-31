/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldWaveform from './FieldWaveform';
import SliceEditor from './SliceEditor';
import VariantGridTouch from './VariantGridTouch';
import FieldAssistantModal from './FieldAssistantModal';
import FieldPadSampler from './FieldPadSampler';
import MicCalibrationPanel from './MicCalibrationPanel';
import { makeGenome } from '../../lib/mobile/genome';
import { createFieldKit, makeSliceEntry, addSlice } from '../../lib/mobile/fieldKit';
import { createGrid, spawnRound } from '../../lib/mobile/variantGrid';
import { DEFAULT_CLEANUP } from '../../audio/mobile/dspCleanup';

describe('FieldWaveform', () => {
  it('renders canvas with correct dimensions and slice count label', () => {
    const samples = new Float32Array(4800);
    const { container } = render(
      <FieldWaveform samples={samples} sampleRate={48000} height={96} />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(screen.getByText(/0.10s · 0 slices/)).toBeTruthy();
  });
});

describe('SliceEditor', () => {
  it('renders pitch analysis, tuning button, and cleanup controls', () => {
    const samples = new Float32Array(4800).fill(0.1);
    const onUpdateCleanup = vi.fn();
    const onApplyCleanup = vi.fn();
    const onApplyTuning = vi.fn();
    const onInjectSubLayer = vi.fn();

    render(
      <SliceEditor
        slice={null}
        samples={samples}
        sampleRate={48000}
        kitRootHz={220}
        cleanup={DEFAULT_CLEANUP}
        onUpdateCleanup={onUpdateCleanup}
        onApplyCleanup={onApplyCleanup}
        onApplyTuning={onApplyTuning}
        onInjectSubLayer={onInjectSubLayer}
        lastReport={null}
      />
    );

    expect(screen.getByText(/Pitch & Tonic Lock/i)).toBeTruthy();
    expect(screen.getByText(/Cleanup DSP/i)).toBeTruthy();
    expect(screen.getByText(/Apply Cleanup & Audition/i)).toBeTruthy();

    fireEvent.click(screen.getByText(/Apply Cleanup & Audition/i));
    expect(onApplyCleanup).toHaveBeenCalled();
  });
});

describe('VariantGridTouch', () => {
  it('renders mutation controls, evolution targets, gene locks, and handles interactions', () => {
    const parent = makeGenome(123);
    const baseGrid = createGrid(parent, { slots: 8 });
    const { grid } = spawnRound(baseGrid);
    const onAudition = vi.fn();
    const onKeep = vi.fn();
    const onTrash = vi.fn();
    const onSelectTarget = vi.fn();
    const onToggleLock = vi.fn();
    const onBreedPool = vi.fn();

    const { rerender } = render(
      <VariantGridTouch
        grid={grid}
        slots={grid.slots}
        renders={{}}
        mutationStrength={0.35}
        onUpdateStrength={vi.fn()}
        onAudition={onAudition}
        onKeep={onKeep}
        onTrash={onTrash}
        onBreed={vi.fn()}
        onBreedPool={onBreedPool}
        onEvolve={vi.fn()}
        isBusy={false}
        evolutionTarget="balanced"
        onSelectTarget={onSelectTarget}
        locks={{ filter: false }}
        onToggleLock={onToggleLock}
      />
    );

    expect(screen.getByText(/Evolution Objective/i)).toBeTruthy();
    expect(screen.getByText(/Sub Bass/i)).toBeTruthy();
    expect(screen.getByText(/Gene Freezes/i)).toBeTruthy();
    expect(screen.getByText(/Mutation Strength/i)).toBeTruthy();
    expect(screen.getByText(/Evolve 8 Sound Design Variants/i)).toBeTruthy();
    expect(screen.getAllByText(/Keep/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Trash/i).length).toBeGreaterThan(0);

    // Select evolution target
    fireEvent.click(screen.getByText(/Sub Bass/i));
    expect(onSelectTarget).toHaveBeenCalledWith('sub-bass');

    // Toggle gene freezes drawer and click lock
    fireEvent.click(screen.getByText(/Show Freezes/i));
    expect(screen.getByText(/Filter/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/Filter/i));
    expect(onToggleLock).toHaveBeenCalledWith('filter');

    // Rerender with kept variants to verify pool breeding button
    const keptGrid = {
      ...grid,
      kept: [grid.slots[0].genome.id, grid.slots[1].genome.id],
      slots: grid.slots.map((s, idx) => (idx < 2 ? { ...s, status: 'kept' as const } : s)),
    };

    rerender(
      <VariantGridTouch
        grid={keptGrid}
        slots={keptGrid.slots}
        renders={{}}
        mutationStrength={0.35}
        onUpdateStrength={vi.fn()}
        onAudition={onAudition}
        onKeep={onKeep}
        onTrash={onTrash}
        onBreed={vi.fn()}
        onBreedPool={onBreedPool}
        onEvolve={vi.fn()}
        isBusy={false}
        evolutionTarget="sub-bass"
        onSelectTarget={onSelectTarget}
        locks={{ filter: true }}
        onToggleLock={onToggleLock}
      />
    );

    const breedPoolBtn = screen.getByText(/Pool Breed/i);
    expect(breedPoolBtn).toBeTruthy();
    fireEvent.click(breedPoolBtn);
    expect(onBreedPool).toHaveBeenCalled();
  });
});

describe('FieldAssistantModal', () => {
  it('renders presets and handles prompt selection', () => {
    const genome = makeGenome(456);
    const workingAudio = new Float32Array(2400);
    const playAudio = vi.fn();
    const onApplyGenome = vi.fn();

    render(
      <FieldAssistantModal
        isOpen={true}
        onClose={vi.fn()}
        currentGenome={genome}
        workingAudio={workingAudio}
        sampleRate={48000}
        onApplyGenome={onApplyGenome}
        playAudio={playAudio}
      />
    );

    expect(screen.getByText(/Sound Design Assistant/i)).toBeTruthy();
    const kickPreset = screen.getByText(/Punchy 808 Sub Kick/i);
    expect(kickPreset).toBeTruthy();

    fireEvent.click(kickPreset);
    expect(playAudio).toHaveBeenCalled();
    expect(screen.getByText(/Resulting Sound Architecture/i)).toBeTruthy();
  });
});

describe('FieldPadSampler', () => {
  it('renders 8 touch performance pads and handles pad hit', () => {
    let kit = createFieldKit({ id: 'k1', name: 'Test Kit', createdAt: '2026-10-27T12:00:00Z' });
    const g = makeGenome(789);
    kit = addSlice(kit, makeSliceEntry({ id: 's1', name: 'Field Clang', sourceId: 'take-1', genome: g }));
    const renders: Record<string, Float32Array> = { [g.id]: new Float32Array(2400).fill(0.2) };
    const playAudio = vi.fn();

    render(
      <FieldPadSampler
        kit={kit}
        renders={renders}
        sampleRate={48000}
        playAudio={playAudio}
      />
    );

    expect(screen.getByText(/Sampler Pads/i)).toBeTruthy();
    expect(screen.getByText(/Field Clang/i)).toBeTruthy();

    const pad1 = screen.getByText(/Field Clang/i);
    fireEvent.pointerDown(pad1, { clientY: 50 });
    expect(playAudio).toHaveBeenCalled();
  });
});

describe('MicCalibrationPanel', () => {
  it('renders hardware microphone profiles and gain controls', () => {
    const onSelectProfile = vi.fn();
    const onChangeInputGain = vi.fn();
    const onToggleSoftLimiter = vi.fn();

    render(
      <MicCalibrationPanel
        selectedProfile="phone-builtin"
        onSelectProfile={onSelectProfile}
        inputGainDb={3.5}
        onChangeInputGain={onChangeInputGain}
        softLimiterEnabled={true}
        onToggleSoftLimiter={onToggleSoftLimiter}
      />
    );

    expect(screen.getByText(/Hardware Calibration/i)).toBeTruthy();
    expect(screen.getByText(/Smartphone Internal Mic/i)).toBeTruthy();
    expect(screen.getByText(/\+3.5 dB/i)).toBeTruthy();

    const lavalierBtn = screen.getByText(/Wired Lavalier/i);
    fireEvent.click(lavalierBtn);
    expect(onSelectProfile).toHaveBeenCalledWith('lavalier');
  });
});
