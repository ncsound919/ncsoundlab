import { describe, it, expect } from 'vitest';
import { audioEngine } from './audioEngine';

describe('audioEngine public surface', () => {
  it('exposes the shared AudioContext', () => {
    const ctx = audioEngine.getContext();
    expect(ctx).toBeInstanceOf(AudioContext);
  });

  it('exposes masterRackInput as a GainNode', () => {
    const node = audioEngine.getMasterRackInput();
    expect(node).toBeInstanceOf(GainNode);
  });

  it('exposes masterRackOutput as a GainNode', () => {
    const node = audioEngine.getMasterRackOutput();
    expect(node).toBeInstanceOf(GainNode);
  });
});
