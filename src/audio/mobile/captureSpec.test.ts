/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ANDROID_CAPTURE_PERMISSIONS,
  ANDROID_FOREGROUND_SERVICE_TYPES,
  classifyDevice,
  describePlan,
  estimateTakeBytes,
  planCapture,
  type CaptureCapabilities,
} from './captureSpec';

const MB = 1024 * 1024;

const baseCapabilities = (overrides: Partial<CaptureCapabilities> = {}): CaptureCapabilities => ({
  unprocessedSupported: true,
  floatCaptureSupported: true,
  nativeSampleRates: [44100, 48000],
  freeBytes: 4096 * MB,
  permissionGranted: true,
  batteryPct: 80,
  device: { id: 'builtin', kind: 'builtin', isMicrophone: true },
  ...overrides,
});

describe('planCapture', () => {
  it('prefers the unprocessed source and 48 kHz mono float', () => {
    const plan = planCapture(baseCapabilities(), { preferredSampleRate: 48000 });
    expect(plan.canStart).toBe(true);
    expect(plan.config.sourceType).toBe('UNPROCESSED');
    expect(plan.config.sampleRateHz).toBe(48000);
    expect(plan.config.channels).toBe(1);
    expect(plan.config.format).toBe('float32');
    expect(plan.config.bytesPerSecond).toBe(192000);
    expect(plan.issues).toHaveLength(0);
  });

  it('falls back to MIC with a warning when the device has no unprocessed source', () => {
    const plan = planCapture(baseCapabilities({ unprocessedSupported: false }));
    expect(plan.config.sourceType).toBe('MIC');
    expect(plan.canStart).toBe(true);
    expect(plan.issues.some((i) => i.code === 'UNPROCESSED_UNAVAILABLE' && i.severity === 'warn')).toBe(true);
  });

  it('refuses a Bluetooth microphone', () => {
    const plan = planCapture(
      baseCapabilities({ device: { id: 'bt', kind: 'bluetooth', isMicrophone: true } })
    );
    expect(plan.canStart).toBe(false);
    expect(plan.issues.some((i) => i.code === 'BLUETOOTH_MIC')).toBe(true);
  });

  it('allows a USB interface but flags its latency', () => {
    const plan = planCapture(baseCapabilities({ device: { id: 'usb', kind: 'usb', isMicrophone: true } }));
    expect(plan.canStart).toBe(true);
    expect(plan.issues.some((i) => i.code === 'USB_MIC_LATENCY' && i.severity === 'info')).toBe(true);
  });

  it('blocks an output-only device', () => {
    expect(classifyDevice({ id: 'spk', kind: 'builtin', isMicrophone: false }).usable).toBe(false);
    const plan = planCapture(baseCapabilities({ device: { id: 'spk', kind: 'builtin', isMicrophone: false } }));
    expect(plan.canStart).toBe(false);
  });

  it('notes when the native layer reports no device', () => {
    const plan = planCapture(baseCapabilities({ device: undefined }));
    expect(plan.issues.some((i) => i.code === 'NO_DEVICE_INFO')).toBe(true);
    expect(plan.canStart).toBe(true);
  });

  it('substitutes an unsupported sample rate', () => {
    const plan = planCapture(baseCapabilities({ nativeSampleRates: [44100] }), {
      preferredSampleRate: 48000,
    });
    expect(plan.config.sampleRateHz).toBe(44100);
    expect(plan.issues.some((i) => i.code === 'SAMPLE_RATE_SUBSTITUTED')).toBe(true);
  });

  it('keeps the requested rate when the device does not advertise any', () => {
    const plan = planCapture(baseCapabilities({ nativeSampleRates: [] }), { preferredSampleRate: 96000 });
    expect(plan.config.sampleRateHz).toBe(96000);
  });

  it('drops float capture when the device cannot do it', () => {
    const plan = planCapture(baseCapabilities({ floatCaptureSupported: false }));
    expect(plan.config.format).toBe('int24');
    expect(plan.issues.some((i) => i.code === 'FLOAT_UNSUPPORTED')).toBe(true);
  });

  it('blocks without RECORD_AUDIO', () => {
    const plan = planCapture(baseCapabilities({ permissionGranted: false }));
    expect(plan.canStart).toBe(false);
    expect(plan.issues.some((i) => i.code === 'PERMISSION_MISSING')).toBe(true);
  });

  it('blocks when storage cannot hold an after-margin take', () => {
    const plan = planCapture(baseCapabilities({ freeBytes: 100 * MB }));
    expect(plan.canStart).toBe(false);
    expect(plan.issues.some((i) => i.code === 'LOW_STORAGE' && i.severity === 'block')).toBe(true);
  });

  it('warns when storage holds minutes, not hours', () => {
    // 300 MB free: 250 MB safety margin leaves ~52 MB ≈ 4.5 minutes at 192 kB/s.
    const plan = planCapture(baseCapabilities({ freeBytes: 300 * MB }));
    const storageIssue = plan.issues.find((i) => i.code === 'LOW_STORAGE');
    expect(storageIssue?.severity).toBe('warn');
    expect(plan.maxSeconds).toBeGreaterThan(60);
  });

  it('warns on low battery', () => {
    const plan = planCapture(baseCapabilities({ batteryPct: 8 }));
    expect(plan.issues.some((i) => i.code === 'LOW_BATTERY')).toBe(true);
  });

  it('declares the Android 14 service types and permissions', () => {
    const plan = planCapture(baseCapabilities());
    expect(plan.config.serviceTypes).toEqual([...ANDROID_FOREGROUND_SERVICE_TYPES]);
    expect(plan.config.serviceTypes).toContain('microphone');
    expect(plan.config.serviceTypes).toContain('dataSync');
    expect(plan.config.permissions).toEqual([...ANDROID_CAPTURE_PERMISSIONS]);
    expect(plan.config.permissions).toContain('android.permission.FOREGROUND_SERVICE_MICROPHONE');
  });

  it('reports unlimited capture time when free space is unknown', () => {
    const plan = planCapture(baseCapabilities({ freeBytes: undefined }));
    expect(plan.maxSeconds).toBe(Infinity);
  });
});

describe('estimates and descriptions', () => {
  it('sizes a take', () => {
    const plan = planCapture(baseCapabilities());
    // 60 s at 192 kB/s = 11.52 MB + header.
    expect(estimateTakeBytes(60, plan.config)).toBe(44 + 60 * 192000);
  });

  it('describes the plan for the capture screen', () => {
    const plan = planCapture(baseCapabilities());
    expect(describePlan(plan.config)).toBe('48.0 kHz · mono · 32-bit float · UNPROCESSED');
  });
});
