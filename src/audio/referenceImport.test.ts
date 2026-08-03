/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for reference-track import (Phase 4.3).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertAudioFileAccepted,
  buildReferenceTrackMeta,
  describeAudioFile,
  formatReferenceQuality,
} from './referenceImport';

class FakeFile {
  constructor(public name: string, public size: number, public type: string) {}
}

const fakeFile = (name: string, type = 'audio/wav', size = 1024): File =>
  new FakeFile(name, size, type) as unknown as File;

describe('referenceImport — describeAudioFile', () => {
  it('maps known MIME types', () => {
    expect(describeAudioFile(fakeFile('a.wav', 'audio/wav'))).toBe('WAV');
    expect(describeAudioFile(fakeFile('a.mp3', 'audio/mpeg'))).toBe('MP3');
    expect(describeAudioFile(fakeFile('a.m4a', 'audio/mp4'))).toBe('AAC (.m4a)');
    expect(describeAudioFile(fakeFile('a.flac', 'audio/flac'))).toBe('FLAC');
  });

  it('falls back to extension when MIME is empty', () => {
    expect(describeAudioFile(fakeFile('a.wav', ''))).toBe('WAV');
    expect(describeAudioFile(fakeFile('a.m4a', ''))).toBe('AAC (.m4a)');
    expect(describeAudioFile(fakeFile('a.aac', ''))).toBe('AAC (.aac)');
  });

  it('reports unknown for unsupported files', () => {
    expect(describeAudioFile(fakeFile('a.xyz', ''))).toBe('Unknown (.xyz)');
    expect(describeAudioFile(fakeFile('noext', ''))).toBe('Unknown audio');
  });
});

describe('referenceImport — assertAudioFileAccepted', () => {
  it('accepts files with audio/* MIME', () => {
    expect(() => assertAudioFileAccepted(fakeFile('a.wav', 'audio/wav'))).not.toThrow();
    expect(() => assertAudioFileAccepted(fakeFile('a.mp3', 'audio/mpeg'))).not.toThrow();
  });

  it('accepts files with a known audio extension when MIME is empty', () => {
    expect(() => assertAudioFileAccepted(fakeFile('a.m4a', ''))).not.toThrow();
    expect(() => assertAudioFileAccepted(fakeFile('a.aac', ''))).not.toThrow();
    expect(() => assertAudioFileAccepted(fakeFile('a.flac', ''))).not.toThrow();
  });

  it('throws for unsupported files', () => {
    expect(() => assertAudioFileAccepted(fakeFile('a.txt', 'text/plain'))).toThrow();
    expect(() => assertAudioFileAccepted(fakeFile('a.xyz', ''))).toThrow();
  });
});

describe('referenceImport — buildReferenceTrackMeta', () => {
  it('captures buffer + file metadata', () => {
    const file = fakeFile('track.wav', 'audio/wav', 2048);
    const buffer = {
      sampleRate: 44100,
      duration: 3.5,
      numberOfChannels: 2,
    } as unknown as AudioBuffer;
    const meta = buildReferenceTrackMeta(file, buffer, '2026-08-03T12:00:00Z');
    expect(meta.name).toBe('track.wav');
    expect(meta.sourceSampleRate).toBe(44100);
    expect(meta.durationSec).toBe(3.5);
    expect(meta.channels).toBe(2);
    expect(meta.sizeBytes).toBe(2048);
    expect(meta.importedAt).toBe('2026-08-03T12:00:00Z');
    expect(meta.formatLabel).toBe('WAV');
  });
});

describe('referenceImport — formatReferenceQuality', () => {
  it('renders sample rate + channel layout + format label', () => {
    const meta = {
      name: 'x',
      sourceSampleRate: 48000,
      durationSec: 1,
      channels: 2,
      sizeBytes: 0,
      importedAt: '',
      formatLabel: 'AAC (.m4a)',
    };
    expect(formatReferenceQuality(meta)).toBe('48.0 kHz · stereo · AAC (.m4a)');
  });

  it('renders mono for 1-channel audio', () => {
    const meta = {
      name: 'x',
      sourceSampleRate: 44100,
      durationSec: 1,
      channels: 1,
      sizeBytes: 0,
      importedAt: '',
      formatLabel: 'WAV',
    };
    expect(formatReferenceQuality(meta)).toBe('44.1 kHz · mono · WAV');
  });
});

describe('referenceImport — referenceTrackStore', () => {
  beforeEach(() => {
    // dynamic import to keep this section isolated from the top-level
    // side-effect import.
  });

  it('starts empty with default gain', async () => {
    const mod = await import('../store/referenceTrackStore');
    mod.useReferenceTrackStore.getState().clear();
    const s = mod.useReferenceTrackStore.getState();
    expect(s.buffer).toBeNull();
    expect(s.gain).toBe(0.8);
    expect(s.playing).toBe(false);
  });
});
